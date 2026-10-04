"""Order lifecycle: creation, edits, status changes (with stock), repeat orders, listing.

Rules (SPEC section 2): line_total = round(qty * unit_price) - line discount; total =
subtotal - order discount; stock leaves the shelf when an order is collected/delivered
and comes back if it is moved out of that status; an order without a customer can never
be sold on credit.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import ColumnElement, String, case, cast, func, or_, select, update
from sqlalchemy.orm import Session, joinedload, selectinload

from app import schemas
from app.constants import COMPLETED_STATUSES, OPEN_STATUSES, ORDER_STATUS_LABEL
from app.domain import next_statuses
from app.errors import BadRequest, Conflict, NotFound
from app.models import Customer, Order, OrderItem, Payment, Product, Shop, User
from app.money import format_inr, multiply_paise, round_qty, to_paise, to_rupees
from app.services import customers as customers_service
from app.services import inventory as inventory_service
from app.services import payments as payments_service
from app.services.common import clean_line, clean_text, order_number_text, phone_search_digits
from app.timeutil import from_client, ist_range_bounds, now_utc

ORDER_NOT_FOUND = "Order not found."
CREDIT_NEEDS_CUSTOMER = "Add a customer to sell on credit."

ORDER_LIST_OPTIONS = (
    selectinload(Order.items),
    joinedload(Order.customer),
    joinedload(Order.created_by),
)
ORDER_DETAIL_OPTIONS = (
    *ORDER_LIST_OPTIONS,
    selectinload(Order.payments).joinedload(Payment.received_by),
)

# Fields that may only change while the order is still open (new/preparing/ready).
OPEN_ONLY_FIELDS = frozenset({"customer_id", "items", "discount", "fulfillment"})


def load_order(db: Session, shop_id: int, order_id: int, *, detail: bool = True) -> Order:
    options = ORDER_DETAIL_OPTIONS if detail else ORDER_LIST_OPTIONS
    order = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.shop_id == shop_id)
        .options(*options)
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise NotFound(ORDER_NOT_FOUND)
    return order


def get_order(db: Session, shop_id: int, order_id: int) -> Order:
    order = db.get(Order, order_id)
    if order is None or order.shop_id != shop_id:
        raise NotFound(ORDER_NOT_FOUND)
    return order


# ---------------------------------------------------------------------------
# Building order lines
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _Line:
    product_id: int | None
    name: str
    unit: str
    quantity: float
    unit_price_paise: int
    discount_paise: int
    unit_cost_paise: int

    @property
    def line_total_paise(self) -> int:
        return multiply_paise(self.quantity, self.unit_price_paise) - self.discount_paise

    def to_model(self, position: int) -> OrderItem:
        return OrderItem(
            position=position,
            product_id=self.product_id,
            name=self.name,
            unit=self.unit,
            quantity=self.quantity,
            unit_price_paise=self.unit_price_paise,
            discount_paise=self.discount_paise,
            line_total_paise=self.line_total_paise,
            unit_cost_paise=self.unit_cost_paise,
            line_cost_paise=multiply_paise(self.quantity, self.unit_cost_paise),
        )


def _build_lines(
    db: Session,
    shop_id: int,
    items: Sequence[schemas.OrderItemInput],
    existing: Iterable[OrderItem] = (),
) -> list[_Line]:
    """Validate item inputs. ``existing`` lines (when editing) keep their price/cost snapshot."""
    if not items:
        raise BadRequest("Add at least one item to the order.")
    product_ids = {item.product_id for item in items if item.product_id is not None}
    products: dict[int, Product] = {}
    if product_ids:
        products = {
            product.id: product
            for product in db.scalars(
                select(Product).where(Product.shop_id == shop_id, Product.id.in_(product_ids))
            )
        }
    previous: dict[int, OrderItem] = {}
    for line in existing:
        if line.product_id is not None:
            previous.setdefault(line.product_id, line)

    lines: list[_Line] = []
    for item in items:
        if item.product_id is not None:
            product = products.get(item.product_id)
            if product is None:
                raise NotFound(inventory_service.PRODUCT_NOT_FOUND)
            prior = previous.get(product.id)
            if product.is_archived and prior is None:
                raise BadRequest(f"{product.name} is archived and can't be added to orders.")
            name = prior.name if prior else product.name
            unit = prior.unit if prior else product.unit
            if item.unit_price is not None:
                unit_price = to_paise(item.unit_price)
            elif prior is not None:
                unit_price = prior.unit_price_paise
            else:
                unit_price = product.selling_price_paise
            unit_cost = prior.unit_cost_paise if prior else product.purchase_price_paise
        else:
            name = clean_line(item.name)
            if not name:
                raise BadRequest("Give each custom item a name.")
            if item.unit_price is None:
                raise BadRequest(f"Enter a price for {name}.")
            unit = "pcs"
            unit_price = to_paise(item.unit_price)
            unit_cost = 0

        quantity = round_qty(item.quantity)
        if quantity <= 0:
            raise BadRequest(f"Enter a quantity more than 0 for {name}.")
        if unit_price < 0:
            raise BadRequest(f"The price of {name} can't be negative.")
        discount = to_paise(item.discount or 0)
        if discount < 0:
            raise BadRequest(f"The discount on {name} can't be negative.")
        if discount > multiply_paise(quantity, unit_price):
            raise BadRequest(f"The discount on {name} is more than its amount.")
        lines.append(
            _Line(
                product_id=item.product_id,
                name=name,
                unit=unit,
                quantity=quantity,
                unit_price_paise=unit_price,
                discount_paise=discount,
                unit_cost_paise=unit_cost,
            )
        )
    return lines


def _order_discount(value: float | None, subtotal_paise: int) -> int:
    discount = to_paise(value or 0)
    if discount < 0:
        raise BadRequest("The order discount can't be negative.")
    if discount > subtotal_paise:
        raise BadRequest("The order discount is more than the subtotal.")
    return discount


def _resolve_customer(
    db: Session, shop_id: int, customer_id: int | None, *, current: Customer | None = None
) -> Customer | None:
    if customer_id is None:
        return None
    if current is not None and current.id == customer_id:
        return current  # keep an archived customer already on the order
    return customers_service.get_customer(db, shop_id, customer_id)


def _allocate_number(db: Session, shop_id: int) -> int:
    """Atomically take the shop's next order number (1001, 1002, ...)."""
    shops = Shop.__table__
    next_value = db.execute(
        update(shops)
        .where(shops.c.id == shop_id)
        .values(next_order_number=shops.c.next_order_number + 1)
        .returning(shops.c.next_order_number)
    ).scalar_one()
    return int(next_value) - 1


def _mismatch_message(status: str, fulfillment: str) -> str | None:
    if status == "delivered" and fulfillment == "pickup":
        return "Pickup orders are marked collected, not delivered."
    if status == "collected" and fulfillment == "delivery":
        return "Delivery orders are marked delivered, not collected."
    return None


# ---------------------------------------------------------------------------
# Create / edit / status
# ---------------------------------------------------------------------------


def create_order(
    db: Session,
    shop_id: int,
    user: User | None,
    data: schemas.OrderCreate,
    *,
    at: datetime | None = None,
) -> Order:
    at = at or now_utc()
    customer = _resolve_customer(db, shop_id, data.customer_id)
    lines = _build_lines(db, shop_id, data.items)
    subtotal = sum(line.line_total_paise for line in lines)
    discount = _order_discount(data.discount, subtotal)
    total = subtotal - discount

    mismatch = _mismatch_message(data.status, data.fulfillment)
    if mismatch:
        raise BadRequest(mismatch)

    payment_amount = 0
    if data.payment is not None:
        payment_amount = to_paise(data.payment.amount)
        if payment_amount < 0:
            raise BadRequest("Enter an amount more than ₹0.")
        if payment_amount > total:
            raise BadRequest(f"Amount is more than the {format_inr(total)} due on this order.")
    if customer is None and payment_amount < total:
        raise BadRequest(CREDIT_NEEDS_CUSTOMER)

    delivery_address = clean_text(data.delivery_address)
    if data.fulfillment == "delivery" and not delivery_address and customer is not None:
        delivery_address = customer.address

    order = Order(
        shop_id=shop_id,
        number=_allocate_number(db, shop_id),
        customer=customer,
        status=data.status,
        fulfillment=data.fulfillment,
        channel=data.channel,
        due_at=from_client(data.due_at),
        delivery_address=delivery_address,
        notes=clean_text(data.notes),
        subtotal_paise=subtotal,
        discount_paise=discount,
        total_paise=total,
        paid_paise=0,
        stock_deducted=False,
        created_by=user,
        created_at=at,
        updated_at=at,
    )
    order.items = [line.to_model(position) for position, line in enumerate(lines)]
    db.add(order)
    db.flush()

    if payment_amount > 0 and data.payment is not None:
        payments_service.record_order_payment(
            db, user, order, payment_amount, data.payment.method, at=at
        )
    if order.status in COMPLETED_STATUSES:
        inventory_service.deduct_order_stock(db, order, user, at)
        order.completed_at = at
    db.flush()
    return order


def _locked_message(status: str) -> str:
    if status == "cancelled":
        return "This order is cancelled. Reopen it before changing it."
    return (
        f"This order is already {ORDER_STATUS_LABEL[status].lower()}. "
        "Move it back to Ready before changing it."
    )


def update_order(
    db: Session,
    shop_id: int,
    user: User | None,
    order: Order,
    data: schemas.OrderUpdate,
    *,
    at: datetime | None = None,
) -> Order:
    at = at or now_utc()
    fields = data.model_fields_set
    if fields & OPEN_ONLY_FIELDS and order.status not in OPEN_STATUSES:
        raise Conflict(_locked_message(order.status))

    previous_customer = order.customer
    money_changed = False

    if "customer_id" in fields:
        order.customer = _resolve_customer(db, shop_id, data.customer_id, current=order.customer)
        money_changed = True
    if "items" in fields and data.items is not None:
        lines = _build_lines(db, shop_id, data.items, existing=list(order.items))
        order.items = [line.to_model(position) for position, line in enumerate(lines)]
        money_changed = True
    if "discount" in fields and data.discount is not None:
        money_changed = True

    if money_changed:
        subtotal = sum(item.line_total_paise for item in order.items)
        discount = (
            _order_discount(data.discount, subtotal)
            if "discount" in fields and data.discount is not None
            else _order_discount(to_rupees(order.discount_paise), subtotal)
        )
        total = subtotal - discount
        if total < order.paid_paise:
            raise Conflict(
                f"The new total {format_inr(total)} is less than the "
                f"{format_inr(order.paid_paise)} already paid. Void a payment first."
            )
        if order.customer is None and total > order.paid_paise:
            raise BadRequest(CREDIT_NEEDS_CUSTOMER)
        order.subtotal_paise = subtotal
        order.discount_paise = discount
        order.total_paise = total

    if "fulfillment" in fields and data.fulfillment is not None:
        order.fulfillment = data.fulfillment
        if (
            order.fulfillment == "delivery"
            and "delivery_address" not in fields
            and not order.delivery_address
            and order.customer is not None
        ):
            order.delivery_address = order.customer.address
    if "channel" in fields and data.channel is not None:
        order.channel = data.channel
    if "due_at" in fields:
        order.due_at = from_client(data.due_at)
    if "delivery_address" in fields:
        order.delivery_address = clean_text(data.delivery_address)
    if "notes" in fields:
        order.notes = clean_text(data.notes)

    order.updated_at = at
    db.flush()
    if money_changed:
        customers_service.refresh_promise(db, order.customer)
        if previous_customer is not None and previous_customer is not order.customer:
            customers_service.refresh_promise(db, previous_customer)
    return order


def change_status(
    db: Session,
    user: User | None,
    order: Order,
    status: str,
    *,
    at: datetime | None = None,
) -> Order:
    at = at or now_utc()
    current = order.status
    if status == current:
        return order
    mismatch = _mismatch_message(status, order.fulfillment)
    if mismatch:
        raise Conflict(mismatch)
    if status not in next_statuses(current, order.fulfillment):
        raise Conflict(
            f"Can't move an order from {ORDER_STATUS_LABEL[current]} to {ORDER_STATUS_LABEL[status]}."
        )
    if status == "cancelled" and order.paid_paise > 0:
        raise Conflict("Void this order's payments before cancelling it.")
    if (
        status in COMPLETED_STATUSES
        and order.customer_id is None
        and order.paid_paise < order.total_paise
    ):
        raise BadRequest(CREDIT_NEEDS_CUSTOMER)

    if current in COMPLETED_STATUSES:
        inventory_service.restore_order_stock(db, order, user, at)
        order.completed_at = None
    order.status = status
    if status in COMPLETED_STATUSES:
        inventory_service.deduct_order_stock(db, order, user, at)
        order.completed_at = at
    order.updated_at = at
    db.flush()
    if "cancelled" in (status, current):
        customers_service.refresh_promise(db, order.customer)
    return order


def repeat_order(
    db: Session, shop_id: int, user: User | None, source: Order, *, at: datetime | None = None
) -> Order:
    """Same customer, fulfillment, channel and items at today's prices; new and unpaid."""
    product_ids = {item.product_id for item in source.items if item.product_id is not None}
    products: dict[int, Product] = {}
    if product_ids:
        products = {
            product.id: product
            for product in db.scalars(
                select(Product).where(Product.shop_id == shop_id, Product.id.in_(product_ids))
            )
        }
    items: list[schemas.OrderItemInput] = []
    for item in source.items:
        if item.product_id is None:
            items.append(
                schemas.OrderItemInput(
                    name=item.name,
                    quantity=item.quantity,
                    unit_price=to_rupees(item.unit_price_paise),
                )
            )
            continue
        product = products.get(item.product_id)
        if product is not None and not product.is_archived:
            items.append(schemas.OrderItemInput(product_id=product.id, quantity=item.quantity))
    if not items:
        raise BadRequest("None of the items on this order can be sold any more.")
    data = schemas.OrderCreate(
        customer_id=source.customer_id,
        items=items,
        fulfillment=source.fulfillment,  # type: ignore[arg-type]
        channel=source.channel,  # type: ignore[arg-type]
        delivery_address=source.delivery_address if source.fulfillment == "delivery" else None,
    )
    return create_order(db, shop_id, user, data, at=at)


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OrderQuery:
    search: str | None = None
    status: str | None = None
    payment_status: str | None = None
    fulfillment: str | None = None
    channel: str | None = None
    customer_id: int | None = None
    date_from: date | None = None
    date_to: date | None = None
    limit: int = 50
    offset: int = 0


def _search_clause(term: str) -> ColumnElement[bool]:
    conditions: list[ColumnElement[bool]] = []
    number_text = order_number_text(term)
    if number_text is not None:
        conditions.append(cast(Order.number, String).startswith(number_text))
    customer_conditions: list[ColumnElement[bool]] = [Customer.name.icontains(term, autoescape=True)]
    digits = phone_search_digits(term)
    if len(digits) >= 5:
        customer_conditions.append(Customer.phone_key.contains(digits, autoescape=True))
    conditions.append(
        select(Customer.id)
        .where(Customer.id == Order.customer_id, or_(*customer_conditions))
        .exists()
    )
    conditions.append(
        select(OrderItem.id)
        .where(OrderItem.order_id == Order.id, OrderItem.name.icontains(term, autoescape=True))
        .exists()
    )
    return or_(*conditions)


def _query_conditions(shop_id: int, query: OrderQuery) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [Order.shop_id == shop_id]
    if query.status == "open":
        conditions.append(Order.status.in_(OPEN_STATUSES))
    elif query.status == "completed":
        conditions.append(Order.status.in_(COMPLETED_STATUSES))
    elif query.status:
        conditions.append(Order.status == query.status)

    if query.payment_status == "paid":
        conditions.append(Order.paid_paise >= Order.total_paise)
    elif query.payment_status == "unpaid":
        conditions.extend([Order.paid_paise <= 0, Order.total_paise > 0])
    elif query.payment_status == "partial":
        conditions.extend([Order.paid_paise > 0, Order.paid_paise < Order.total_paise])

    if query.fulfillment:
        conditions.append(Order.fulfillment == query.fulfillment)
    if query.channel:
        conditions.append(Order.channel == query.channel)
    if query.customer_id is not None:
        conditions.append(Order.customer_id == query.customer_id)
    start, end = ist_range_bounds(query.date_from, query.date_to)
    if start is not None:
        conditions.append(Order.created_at >= start)
    if end is not None:
        conditions.append(Order.created_at < end)
    term = clean_line(query.search)
    if term:
        conditions.append(_search_clause(term))
    return conditions


def list_orders(db: Session, shop_id: int, query: OrderQuery) -> tuple[list[Order], int]:
    conditions = _query_conditions(shop_id, query)
    total = db.scalar(select(func.count(Order.id)).where(*conditions)) or 0
    rows = db.scalars(
        select(Order)
        .where(*conditions)
        .options(*ORDER_LIST_OPTIONS)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(query.limit)
        .offset(query.offset)
    ).all()
    return list(rows), int(total)


def open_orders(db: Session, shop_id: int, fulfillment: str, *, limit: int | None = None) -> list[Order]:
    """Open orders: ready, then preparing, then new; then due time (no due time last)."""
    priority = case((Order.status == "ready", 0), (Order.status == "preparing", 1), else_=2)
    query = (
        select(Order)
        .where(
            Order.shop_id == shop_id,
            Order.fulfillment == fulfillment,
            Order.status.in_(OPEN_STATUSES),
        )
        .options(*ORDER_LIST_OPTIONS)
        .order_by(priority, Order.due_at.asc().nulls_last(), Order.created_at, Order.id)
    )
    if limit is not None:
        query = query.limit(limit)
    return list(db.scalars(query))


def recent_orders(db: Session, shop_id: int, *, limit: int) -> list[Order]:
    return list(
        db.scalars(
            select(Order)
            .where(Order.shop_id == shop_id)
            .options(*ORDER_LIST_OPTIONS)
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(limit)
        )
    )


def customer_orders(db: Session, customer: Customer) -> list[Order]:
    return list(
        db.scalars(
            select(Order)
            .where(Order.customer_id == customer.id)
            .options(*ORDER_LIST_OPTIONS)
            .order_by(Order.created_at.desc(), Order.id.desc())
        )
    )
