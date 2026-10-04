"""ORM rows (plus precomputed aggregates) → response schemas from ``app.schemas``.

Callers are responsible for eager-loading the relationships used here (see the
``*_OPTIONS`` tuples in the services) so list endpoints never issue N+1 queries.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app import models, schemas
from app.domain import (
    CustomerStats,
    SupplierStats,
    is_low_stock,
    is_overdue,
    margin_percent,
    next_statuses,
    payment_status,
    promise_overdue,
    supplier_outstanding,
)
from app.money import multiply_paise, optional_rupees, round_qty, to_rupees
from app.timeutil import now_utc


def shop_out(shop: models.Shop) -> schemas.Shop:
    return schemas.Shop(
        id=shop.id,
        name=shop.name,
        owner_name=shop.owner_name,
        phone=shop.phone,
        email=shop.email,
        address=shop.address,
        city=shop.city,
        segment=shop.segment,
        plan=shop.plan,  # type: ignore[arg-type]  # stored values are always a valid Plan
        upi_id=shop.upi_id,
        created_at=shop.created_at,
    )


def user_out(user: models.User) -> schemas.User:
    return schemas.User(
        id=user.id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        role=user.role,  # type: ignore[arg-type]
        is_active=user.is_active,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


def session_out(user: models.User, shop: models.Shop, permissions: list[str]) -> schemas.Session:
    return schemas.Session(
        user=user_out(user),
        shop=shop_out(shop),
        permissions=permissions,  # type: ignore[arg-type]
    )


def auth_response(
    user: models.User, shop: models.Shop, permissions: list[str], token: str
) -> schemas.AuthResponse:
    return schemas.AuthResponse(
        user=user_out(user),
        shop=shop_out(shop),
        permissions=permissions,  # type: ignore[arg-type]
        token=token,
    )


# ---------------------------------------------------------------------------
# Orders and payments
# ---------------------------------------------------------------------------


def order_item_out(item: models.OrderItem) -> schemas.OrderItem:
    return schemas.OrderItem(
        id=item.id,
        product_id=item.product_id,
        name=item.name,
        unit=item.unit,
        quantity=round_qty(item.quantity),
        unit_price=to_rupees(item.unit_price_paise),
        discount=to_rupees(item.discount_paise),
        line_total=to_rupees(item.line_total_paise),
    )


def _order_fields(order: models.Order, now: datetime) -> dict[str, Any]:
    customer = order.customer
    items = list(order.items)
    return {
        "id": order.id,
        "number": order.number,
        "customer_id": order.customer_id,
        "customer_name": customer.name if customer else None,
        "customer_phone": customer.phone if customer else None,
        "status": order.status,
        "payment_status": payment_status(order.total_paise, order.paid_paise),
        "fulfillment": order.fulfillment,
        "channel": order.channel,
        "due_at": order.due_at,
        "is_overdue": is_overdue(order.due_at, order.status, now),
        "delivery_address": order.delivery_address,
        "notes": order.notes,
        "items": [order_item_out(item) for item in items],
        "item_count": len(items),
        "subtotal": to_rupees(order.subtotal_paise),
        "discount": to_rupees(order.discount_paise),
        "total": to_rupees(order.total_paise),
        "paid": to_rupees(order.paid_paise),
        "outstanding": to_rupees(max(order.total_paise - order.paid_paise, 0)),
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "completed_at": order.completed_at,
        "created_by_name": order.created_by.name if order.created_by else None,
    }


def order_out(order: models.Order, now: datetime | None = None) -> schemas.Order:
    return schemas.Order(**_order_fields(order, now or now_utc()))


def payment_out(payment: models.Payment) -> schemas.Payment:
    order = payment.order
    customer = order.customer if order else None
    return schemas.Payment(
        id=payment.id,
        order_id=payment.order_id,
        order_number=order.number if order else None,
        customer_id=order.customer_id if order else None,
        customer_name=customer.name if customer else None,
        amount=to_rupees(payment.amount_paise),
        method=payment.method,  # type: ignore[arg-type]
        note=payment.note,
        paid_at=payment.paid_at,
        received_by_name=payment.received_by.name if payment.received_by else None,
        batch_id=payment.batch_id,
    )


def order_detail_out(order: models.Order, now: datetime | None = None) -> schemas.OrderDetail:
    active_payments = [payment for payment in order.payments if payment.voided_at is None]
    return schemas.OrderDetail(
        **_order_fields(order, now or now_utc()),
        payments=[payment_out(payment) for payment in active_payments],
        next_statuses=next_statuses(order.status, order.fulfillment),  # type: ignore[arg-type]
        stock_deducted=order.stock_deducted,
    )


# ---------------------------------------------------------------------------
# Products and inventory
# ---------------------------------------------------------------------------


def product_out(product: models.Product, reserved_quantity: float = 0.0) -> schemas.Product:
    stock_value = multiply_paise(product.stock_quantity, product.purchase_price_paise)
    return schemas.Product(
        id=product.id,
        name=product.name,
        category=product.category,
        unit=product.unit,  # type: ignore[arg-type]
        sku=product.sku,
        stock_quantity=round_qty(product.stock_quantity),
        min_stock_level=round_qty(product.min_stock_level),
        reserved_quantity=round_qty(reserved_quantity),
        purchase_price=to_rupees(product.purchase_price_paise),
        selling_price=to_rupees(product.selling_price_paise),
        low_stock=is_low_stock(product.stock_quantity, product.min_stock_level, product.is_archived),
        stock_value=to_rupees(stock_value),
        margin_percent=margin_percent(product.selling_price_paise, product.purchase_price_paise),
        is_archived=product.is_archived,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


def inventory_tx_out(tx: models.InventoryTransaction) -> schemas.InventoryTransaction:
    return schemas.InventoryTransaction(
        id=tx.id,
        product_id=tx.product_id,
        product_name=tx.product.name,
        type=tx.type,  # type: ignore[arg-type]
        quantity_change=round_qty(tx.quantity_change),
        stock_after=round_qty(tx.stock_after),
        reason=tx.reason,  # type: ignore[arg-type]
        note=tx.note,
        order_id=tx.order_id,
        order_number=tx.order.number if tx.order else None,
        purchase_id=tx.purchase_id,
        created_by_name=tx.created_by.name if tx.created_by else None,
        created_at=tx.created_at,
    )


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------


def customer_out(customer: models.Customer, stats: CustomerStats, today: date) -> schemas.Customer:
    outstanding = stats.outstanding_paise
    return schemas.Customer(
        id=customer.id,
        name=customer.name,
        phone=customer.phone,
        address=customer.address,
        notes=customer.notes,
        preferred_products=list(customer.preferred_products or []),
        total_purchases=to_rupees(stats.purchases_paise),
        total_paid=to_rupees(stats.paid_paise),
        outstanding=to_rupees(outstanding),
        orders_count=stats.orders_count,
        last_order_at=stats.last_order_at,
        last_order_total=optional_rupees(stats.last_order_total_paise),
        promise_date=customer.promise_date,
        promise_amount=optional_rupees(customer.promise_amount_paise),
        promise_note=customer.promise_note,
        promise_overdue=promise_overdue(customer.promise_date, outstanding, today),
        created_at=customer.created_at,
    )


# ---------------------------------------------------------------------------
# Suppliers and purchases
# ---------------------------------------------------------------------------


def _supplier_fields(supplier: models.Supplier, stats: SupplierStats) -> dict[str, Any]:
    return {
        "id": supplier.id,
        "name": supplier.name,
        "phone": supplier.phone,
        "contact_person": supplier.contact_person,
        "address": supplier.address,
        "notes": supplier.notes,
        "supplies": supplier.supplies,
        "outstanding": to_rupees(supplier_outstanding(supplier.opening_balance_paise, stats)),
        "total_purchased": to_rupees(stats.purchased_paise),
        "total_paid": to_rupees(stats.paid_paise),
        "last_purchase_at": stats.last_purchase_at,
        "created_at": supplier.created_at,
    }


def supplier_out(supplier: models.Supplier, stats: SupplierStats) -> schemas.Supplier:
    return schemas.Supplier(**_supplier_fields(supplier, stats))


def purchase_out(purchase: models.Purchase) -> schemas.Purchase:
    return schemas.Purchase(
        id=purchase.id,
        supplier_id=purchase.supplier_id,
        supplier_name=purchase.supplier.name,
        items=[
            schemas.PurchaseItem(
                product_id=item.product_id,
                name=item.name,
                quantity=round_qty(item.quantity),
                unit_cost=to_rupees(item.unit_cost_paise),
                line_total=to_rupees(item.line_total_paise),
            )
            for item in purchase.items
        ],
        total=to_rupees(purchase.total_paise),
        note=purchase.note,
        purchased_at=purchase.purchased_at,
        created_by_name=purchase.created_by.name if purchase.created_by else None,
    )


def supplier_payment_out(payment: models.SupplierPayment) -> schemas.SupplierPayment:
    return schemas.SupplierPayment(
        id=payment.id,
        supplier_id=payment.supplier_id,
        amount=to_rupees(payment.amount_paise),
        method=payment.method,  # type: ignore[arg-type]
        note=payment.note,
        paid_at=payment.paid_at,
    )


def supplier_detail_out(
    supplier: models.Supplier,
    stats: SupplierStats,
    purchases: list[models.Purchase],
    payments: list[models.SupplierPayment],
) -> schemas.SupplierDetail:
    return schemas.SupplierDetail(
        **_supplier_fields(supplier, stats),
        purchases=[purchase_out(purchase) for purchase in purchases],
        payments=[supplier_payment_out(payment) for payment in payments],
    )


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------


def expense_out(expense: models.Expense) -> schemas.Expense:
    return schemas.Expense(
        id=expense.id,
        category=expense.category,  # type: ignore[arg-type]
        amount=to_rupees(expense.amount_paise),
        note=expense.note,
        spent_at=expense.spent_at,
        created_by_name=expense.created_by.name if expense.created_by else None,
    )
