"""Orders: numbering, money maths, walk-in credit, status machine, stock, edits, repeat, lists.

Derived from SPEC section 2 ("Orders", "Products / inventory") and the order rows of section 3.
"""

from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api_helpers import (
    VOID_FIRST,
    WALK_IN_CREDIT,
    Api,
    custom_item,
    error,
    line,
    now_ist,
    parse_dt,
    rejected,
    today_ist,
)
from conftest import ShopAccount

COMPLETED = {"pickup": "collected", "delivery": "delivered"}


def next_statuses(fulfillment: str, status: str) -> set[str]:
    """SPEC section 2, "Allowed transitions"."""
    done = COMPLETED[fulfillment]
    table = {
        "new": {"preparing", "ready", done, "cancelled"},
        "preparing": {"new", "ready", done, "cancelled"},
        "ready": {"preparing", done, "cancelled"},
        done: {"ready"},
        "cancelled": {"new"},
    }
    return table[status]


@pytest.fixture(scope="module")
def regular(module_api: Api) -> dict[str, Any]:
    """A customer of the module-wide shop, so orders may be left unpaid."""
    return module_api.create_customer(name="Regular Ramesh")


def order_in(
    api: Api,
    customer_id: int,
    fulfillment: str,
    status: str,
    *,
    items: list[dict[str, Any]] | None = None,
    **fields: Any,
) -> dict[str, Any]:
    """Create an order (₹40 custom item unless ``items`` is given) and bring it to ``status``."""
    lines = items or [custom_item(40)]
    extra: dict[str, Any] = {"delivery_address": "Flat 2, Baner"} if fulfillment == "delivery" else {}
    extra.update(fields)
    if status == "cancelled":
        order = api.create_order(lines, customer_id=customer_id, fulfillment=fulfillment, **extra)
        return api.set_status(order["id"], "cancelled")
    return api.create_order(lines, customer_id=customer_id, fulfillment=fulfillment, status=status, **extra)


# ---------------------------------------------------------------------------
# Numbering and money
# ---------------------------------------------------------------------------


def test_order_numbers_are_sequential_per_shop_from_1001(
    api: Api, client: TestClient, signup_shop: Callable[..., ShopAccount]
) -> None:
    customer = api.create_customer()
    first = api.create_order([custom_item(10)], customer_id=customer["id"])
    second = api.create_order([custom_item(10)], customer_id=customer["id"])
    assert (first["number"], second["number"]) == (1001, 1002)

    api.set_status(second["id"], "cancelled")
    walk_in = api.create_order([custom_item(5)], payment={"amount": 5, "method": "cash"})
    assert walk_in["number"] == 1003

    neighbour = Api(client, signup_shop().headers)
    assert neighbour.create_order([custom_item(5)], payment={"amount": 5, "method": "upi"})["number"] == 1001


def test_totals_apply_line_and_order_discounts_with_paise_rounding(api: Api, owner: ShopAccount) -> None:
    dal = api.create_product(name="Toor Dal", unit="kg", selling_price=45.50, purchase_price=40)
    tea = api.create_product(name="Tea 250 g", selling_price=19.99)
    customer = api.create_customer(name="Sunil Kale")

    order = api.create_order(
        [line(dal, 1.25, discount=0.88), line(tea, 3), custom_item(5, name="Carry bag")],
        customer_id=customer["id"],
        discount=0.97,
    )

    first, second, third = order["items"]
    # round(1.25 × ₹45.50 = ₹56.875) = ₹56.88, minus the ₹0.88 line discount
    assert (first["name"], first["unit"], first["quantity"], first["unit_price"]) == ("Toor Dal", "kg", 1.25, 45.5)
    assert (first["discount"], first["line_total"]) == (0.88, 56.0)
    assert first["product_id"] == dal["id"]
    assert (second["quantity"], second["unit_price"], second["line_total"]) == (3, 19.99, 59.97)
    assert (third["product_id"], third["name"], third["line_total"]) == (None, "Carry bag", 5.0)
    assert order["subtotal"] == 120.97
    assert order["discount"] == 0.97
    assert order["total"] == 120.0
    assert order["item_count"] == 3
    assert (order["paid"], order["outstanding"], order["payment_status"]) == (0, 120.0, "unpaid")
    assert (order["customer_id"], order["customer_name"]) == (customer["id"], "Sunil Kale")
    assert order["customer_phone"] == customer["phone"]
    assert order["created_by_name"] == owner.user["name"]
    assert (order["status"], order["fulfillment"], order["channel"]) == ("new", "pickup", "walk_in")
    assert order["stock_deducted"] is False and order["completed_at"] is None
    assert parse_dt(order["created_at"]) and parse_dt(order["updated_at"])
    assert api.order(order["id"]) == order


@pytest.mark.parametrize(
    "quantity, unit_price, quantity_saved, line_total",
    [
        (0.5, 0.05, 0.5, 0.03),  # 2.5 paise rounds half-up to 3 (not to even)
        (1.5, 0.03, 1.5, 0.05),  # 4.5 paise -> 5
        (0.125, 0.10, 0.125, 0.01),  # 1.25 paise -> 1
        (2.675, 1, 2.675, 2.68),  # 267.5 paise -> 268 (binary floats would say 267.4999...)
        (0.3333, 30, 0.333, 9.99),  # quantity is rounded to 3 decimals first
    ],
)
def test_line_totals_round_half_up_to_the_paise(
    module_api: Api, regular: dict[str, Any], quantity: float, unit_price: float, quantity_saved: float, line_total: float
) -> None:
    order = module_api.create_order([custom_item(unit_price, quantity)], customer_id=regular["id"])
    item = order["items"][0]
    assert item["quantity"] == quantity_saved
    assert item["line_total"] == line_total
    assert order["total"] == line_total


def test_unit_price_defaults_to_the_selling_price_and_can_be_overridden(module_api: Api, regular: dict[str, Any]) -> None:
    ghee = module_api.create_product(name="Amul Ghee 1 l", unit="l", selling_price=610)
    order = module_api.create_order([line(ghee, 1), line(ghee, 2, unit_price=600)], customer_id=regular["id"])
    assert [i["unit_price"] for i in order["items"]] == [610, 600]
    assert [i["line_total"] for i in order["items"]] == [610, 1200]
    assert order["total"] == 1810


def test_discounts_cannot_exceed_what_they_discount(api: Api) -> None:
    tea = api.create_product(selling_price=20)
    customer = api.create_customer()
    too_big_line = api.raw("POST", "/api/orders", json={"customer_id": customer["id"], "items": [line(tea, 1, discount=20.01)]})
    error(too_big_line, 400)
    too_big_order = api.raw("POST", "/api/orders", json={"customer_id": customer["id"], "items": [line(tea, 2)], "discount": 40.01})
    error(too_big_order, 400)
    negative = api.raw("POST", "/api/orders", json={"customer_id": customer["id"], "items": [line(tea, 1)], "discount": -1})
    rejected(negative, 400, 422)
    assert api.get("/api/orders")["total"] == 0

    free = api.create_order([line(tea, 2, discount=40)], customer_id=customer["id"])
    assert (free["total"], free["payment_status"]) == (0, "paid")  # a ₹0 order counts as paid
    order_discount = api.create_order([line(tea, 2)], customer_id=customer["id"], discount=40)
    assert (order_discount["subtotal"], order_discount["total"]) == (40, 0)


def test_order_items_are_validated(api: Api) -> None:
    customer = api.create_customer()
    product = api.create_product()
    bad_items: list[list[dict[str, Any]]] = [
        [],
        [line(product, 0)],
        [line(product, -1)],
        [{"quantity": 1, "unit_price": 10}],  # custom item without a name
        [{"name": "Loose item", "quantity": 1}],  # custom item without a price
        [{"product_id": 999_999, "quantity": 1}],
    ]
    for items in bad_items:
        response = api.raw("POST", "/api/orders", json={"customer_id": customer["id"], "items": items})
        rejected(response, 400, 404, 422)
    rejected(api.raw("POST", "/api/orders", json={"customer_id": 999_999, "items": [custom_item(5)]}), 400, 404)
    rejected(api.raw("POST", "/api/orders", json={"customer_id": customer["id"], "items": [custom_item(5)], "channel": "telegram"}), 422)
    assert api.get("/api/orders")["total"] == 0


# ---------------------------------------------------------------------------
# Walk-in (no customer) orders
# ---------------------------------------------------------------------------


def test_walk_in_orders_must_be_paid_in_full(api: Api) -> None:
    unpaid = api.raw("POST", "/api/orders", json={"items": [custom_item(100)]})
    assert error(unpaid, 400) == WALK_IN_CREDIT
    partial = api.raw("POST", "/api/orders", json={"items": [custom_item(100)], "payment": {"amount": 60, "method": "cash"}})
    assert error(partial, 400) == WALK_IN_CREDIT
    assert api.get("/api/orders")["total"] == 0

    paid = api.create_order([custom_item(100)], payment={"amount": 100, "method": "upi"}, status="collected")
    assert (paid["customer_id"], paid["customer_name"], paid["customer_phone"]) == (None, None, None)
    assert (paid["paid"], paid["outstanding"], paid["payment_status"]) == (100, 0, "paid")
    assert len(paid["payments"]) == 1 and paid["payments"][0]["method"] == "upi"

    free = api.create_order([custom_item(30)], discount=30)
    assert (free["total"], free["payment_status"]) == (0, "paid")


def test_walk_in_edits_cannot_leave_money_owed(api: Api) -> None:
    order = api.create_order([custom_item(100)], payment={"amount": 100, "method": "cash"})
    rejected(api.raw("PATCH", f"/api/orders/{order['id']}", json={"items": [custom_item(150)]}), 400, 409)
    assert api.order(order["id"])["total"] == 100

    customer = api.create_customer()
    on_credit = api.create_order([custom_item(80)], customer_id=customer["id"])
    rejected(api.raw("PATCH", f"/api/orders/{on_credit['id']}", json={"customer_id": None}), 400, 409)
    assert api.order(on_credit["id"])["customer_id"] == customer["id"]

    # Moving a fully paid order to walk-in is fine: nothing is owed.
    paid = api.create_order([custom_item(50)], customer_id=customer["id"], payment={"amount": 50, "method": "cash"})
    moved = api.patch(f"/api/orders/{paid['id']}", {"customer_id": None})
    assert moved["customer_id"] is None and moved["outstanding"] == 0


# ---------------------------------------------------------------------------
# Status machine
# ---------------------------------------------------------------------------

ALLOWED_MOVES = [
    (fulfillment, start, target)
    for fulfillment in ("pickup", "delivery")
    for start in ("new", "preparing", "ready", COMPLETED[fulfillment], "cancelled")
    for target in sorted(next_statuses(fulfillment, start))
]


@pytest.mark.parametrize("fulfillment, start, target", ALLOWED_MOVES)
def test_every_allowed_status_move(
    module_api: Api, regular: dict[str, Any], fulfillment: str, start: str, target: str
) -> None:
    order = order_in(module_api, regular["id"], fulfillment, start)
    assert order["status"] == start
    assert set(order["next_statuses"]) == next_statuses(fulfillment, start)

    moved = module_api.set_status(order["id"], target)

    assert moved["status"] == target
    assert set(moved["next_statuses"]) == next_statuses(fulfillment, target)
    completed = target == COMPLETED[fulfillment]
    assert (moved["completed_at"] is not None) is completed
    assert module_api.order(order["id"])["status"] == target


DISALLOWED_MOVES = [
    ("pickup", "ready", "new"),
    ("pickup", "collected", "new"),
    ("pickup", "collected", "preparing"),
    ("pickup", "collected", "cancelled"),
    ("pickup", "cancelled", "preparing"),
    ("pickup", "cancelled", "ready"),
    ("pickup", "cancelled", "collected"),
    ("pickup", "new", "delivered"),
    ("pickup", "ready", "delivered"),
    ("pickup", "collected", "delivered"),
    ("delivery", "ready", "new"),
    ("delivery", "new", "collected"),
    ("delivery", "ready", "collected"),
    ("delivery", "delivered", "collected"),
    ("delivery", "delivered", "cancelled"),
]


@pytest.mark.parametrize("fulfillment, start, target", DISALLOWED_MOVES)
def test_disallowed_status_moves_are_409(
    module_api: Api, regular: dict[str, Any], fulfillment: str, start: str, target: str
) -> None:
    order = order_in(module_api, regular["id"], fulfillment, start)
    response = module_api.raw("POST", f"/api/orders/{order['id']}/status", json={"status": target})
    error(response, 409)
    assert module_api.order(order["id"])["status"] == start


def test_disallowed_move_message_names_both_statuses(module_api: Api, regular: dict[str, Any]) -> None:
    ready = order_in(module_api, regular["id"], "pickup", "ready")
    response = module_api.raw("POST", f"/api/orders/{ready['id']}/status", json={"status": "new"})
    assert error(response, 409) == "Can't move an order from Ready to New."
    done = order_in(module_api, regular["id"], "delivery", "delivered")
    response = module_api.raw("POST", f"/api/orders/{done['id']}/status", json={"status": "preparing"})
    assert error(response, 409) == "Can't move an order from Delivered to Preparing."
    unknown = module_api.raw("POST", f"/api/orders/{ready['id']}/status", json={"status": "done"})
    assert unknown.status_code == 422


def test_completed_status_at_creation_must_match_fulfillment(module_api: Api, regular: dict[str, Any]) -> None:
    before = module_api.get("/api/orders")["total"]
    for fulfillment, status in (("pickup", "delivered"), ("delivery", "collected")):
        response = module_api.raw(
            "POST",
            "/api/orders",
            json={"customer_id": regular["id"], "items": [custom_item(10)], "fulfillment": fulfillment, "status": status},
        )
        rejected(response, 400, 409, 422)
    cancelled = module_api.raw(
        "POST", "/api/orders", json={"customer_id": regular["id"], "items": [custom_item(10)], "status": "cancelled"}
    )
    assert cancelled.status_code == 422
    assert module_api.get("/api/orders")["total"] == before


def test_switching_fulfillment_keeps_statuses_consistent(module_api: Api, regular: dict[str, Any]) -> None:
    open_order = order_in(module_api, regular["id"], "pickup", "ready")
    switched = module_api.patch(f"/api/orders/{open_order['id']}", {"fulfillment": "delivery", "delivery_address": "B-4, Wakad"})
    assert switched["fulfillment"] == "delivery" and switched["delivery_address"] == "B-4, Wakad"
    assert set(switched["next_statuses"]) == next_statuses("delivery", "ready")
    error(module_api.raw("POST", f"/api/orders/{open_order['id']}/status", json={"status": "collected"}), 409)
    assert module_api.set_status(open_order["id"], "delivered")["status"] == "delivered"

    # A completed pickup must never become a "collected" delivery order.
    collected = order_in(module_api, regular["id"], "pickup", "collected")
    response = module_api.raw("PATCH", f"/api/orders/{collected['id']}", json={"fulfillment": "delivery"})
    current = module_api.order(collected["id"])
    if response.status_code == 200:
        assert (current["fulfillment"], current["status"]) != ("delivery", "collected")
    else:
        rejected(response, 400, 409)
        assert (current["fulfillment"], current["status"]) == ("pickup", "collected")


def test_overdue_means_past_due_and_still_open(module_api: Api, regular: dict[str, Any]) -> None:
    past = (now_ist() - timedelta(hours=1)).isoformat()
    future = (now_ist() + timedelta(hours=1)).isoformat()

    late = order_in(module_api, regular["id"], "pickup", "new", due_at=past)
    assert late["is_overdue"] is True
    assert abs(parse_dt(late["due_at"]) - parse_dt(past)) < timedelta(seconds=1)
    assert order_in(module_api, regular["id"], "pickup", "ready", due_at=future)["is_overdue"] is False
    assert order_in(module_api, regular["id"], "pickup", "new")["is_overdue"] is False
    assert order_in(module_api, regular["id"], "pickup", "collected", due_at=past)["is_overdue"] is False

    assert module_api.set_status(late["id"], "collected")["is_overdue"] is False
    assert module_api.set_status(late["id"], "ready")["is_overdue"] is True
    assert module_api.set_status(late["id"], "cancelled")["is_overdue"] is False


# ---------------------------------------------------------------------------
# Stock
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("fulfillment", ["pickup", "delivery"])
def test_stock_is_deducted_once_on_completion_and_restored_on_undo(api: Api, fulfillment: str) -> None:
    done = COMPLETED[fulfillment]
    rice = api.create_product(name="Sona Masoori Rice", unit="kg", stock_quantity=10, selling_price=60)
    customer = api.create_customer()
    order = order_in(api, customer["id"], fulfillment, "new", items=[line(rice, 3)])

    assert order["stock_deducted"] is False
    product = api.product(rice["id"])
    assert (product["stock_quantity"], product["reserved_quantity"]) == (10, 3)
    api.set_status(order["id"], "ready")
    assert api.product(rice["id"])["stock_quantity"] == 10

    completed = api.set_status(order["id"], done)
    assert completed["stock_deducted"] is True
    product = api.product(rice["id"])
    assert (product["stock_quantity"], product["reserved_quantity"]) == (7, 0)
    sale, opening = api.transactions(rice["id"])
    assert (opening["type"], opening["quantity_change"], opening["stock_after"]) == ("opening", 10, 10)
    assert (sale["type"], sale["quantity_change"], sale["stock_after"]) == ("sale", -3, 7)
    assert (sale["order_id"], sale["order_number"]) == (order["id"], order["number"])
    assert (sale["product_id"], sale["product_name"], sale["reason"]) == (rice["id"], "Sona Masoori Rice", None)

    # Sending the completed status again must not deduct a second time.
    repeat = api.raw("POST", f"/api/orders/{order['id']}/status", json={"status": done})
    assert repeat.status_code in (200, 409), repeat.text
    assert api.product(rice["id"])["stock_quantity"] == 7
    assert len(api.transactions(rice["id"])) == 2

    undone = api.set_status(order["id"], "ready")
    assert undone["stock_deducted"] is False and undone["completed_at"] is None
    product = api.product(rice["id"])
    assert (product["stock_quantity"], product["reserved_quantity"]) == (10, 3)
    reversal = api.transactions(rice["id"])[0]
    assert (reversal["type"], reversal["quantity_change"], reversal["stock_after"]) == ("sale_reversal", 3, 10)
    assert reversal["order_id"] == order["id"]

    api.set_status(order["id"], done)
    assert api.product(rice["id"])["stock_quantity"] == 7
    assert [t["type"] for t in api.transactions(rice["id"])] == ["sale", "sale_reversal", "sale", "opening"]


def test_counter_sale_deducts_at_once_and_custom_items_never_touch_stock(api: Api) -> None:
    oil = api.create_product(name="Fortune Oil 1 l", unit="l", stock_quantity=5, selling_price=150)
    sale = api.create_order(
        [line(oil, 2), custom_item(10, name="Carry bag")],
        status="collected",
        payment={"amount": 310, "method": "cash"},
    )
    assert sale["stock_deducted"] is True and sale["completed_at"] is not None
    assert api.product(oil["id"])["stock_quantity"] == 3
    assert [(t["type"], t["quantity_change"], t["stock_after"]) for t in api.transactions(oil["id"])] == [
        ("sale", -2, 3),
        ("opening", 5, 5),
    ]


def test_each_product_line_gets_its_own_sale_transaction(api: Api) -> None:
    soap = api.create_product(stock_quantity=10)
    customer = api.create_customer()
    api.create_order([line(soap, 1), line(soap, 2)], customer_id=customer["id"], status="collected")
    sales = [t for t in api.transactions(soap["id"]) if t["type"] == "sale"]
    assert sorted(t["quantity_change"] for t in sales) == [-2, -1]
    assert min(t["stock_after"] for t in sales) == 7
    assert api.product(soap["id"])["stock_quantity"] == 7


def test_loose_quantities_and_negative_stock(api: Api) -> None:
    sugar = api.create_product(name="Sugar", unit="kg", stock_quantity=5, min_stock_level=1, selling_price=44)
    customer = api.create_customer()
    api.create_order([line(sugar, 1.25)], customer_id=customer["id"], status="collected")
    assert api.product(sugar["id"])["stock_quantity"] == 3.75

    # Selling more than is in stock is allowed; stock simply goes negative.
    api.create_order([line(sugar, 4)], customer_id=customer["id"], status="collected")
    product = api.product(sugar["id"])
    assert product["stock_quantity"] == -0.25 and product["low_stock"] is True
    assert api.transactions(sugar["id"])[0]["stock_after"] == -0.25


def test_repeated_undo_does_not_drift(api: Api) -> None:
    jeera = api.create_product(unit="kg", stock_quantity=1, selling_price=400)
    customer = api.create_customer()
    order = api.create_order([line(jeera, 0.7)], customer_id=customer["id"])
    for _ in range(3):
        api.set_status(order["id"], "collected")
        assert api.product(jeera["id"])["stock_quantity"] == 0.3
        api.set_status(order["id"], "ready")
        assert api.product(jeera["id"])["stock_quantity"] == 1
    assert all(t["stock_after"] in (0.3, 1) for t in api.transactions(jeera["id"]))


def test_reserved_quantity_counts_only_open_orders(api: Api) -> None:
    flour = api.create_product(unit="kg", stock_quantity=50)
    customer = api.create_customer()
    api.create_order([line(flour, 2)], customer_id=customer["id"])
    api.create_order([line(flour, 1.5)], customer_id=customer["id"], status="preparing")
    api.create_order([line(flour, 1)], customer_id=customer["id"], status="ready")
    api.create_order([line(flour, 4)], customer_id=customer["id"], status="collected")
    cancelled = api.create_order([line(flour, 8)], customer_id=customer["id"])
    api.set_status(cancelled["id"], "cancelled")
    product = api.product(flour["id"])
    assert product["reserved_quantity"] == 4.5
    assert product["stock_quantity"] == 46


def test_archived_products_cannot_be_ordered(api: Api) -> None:
    product = api.create_product(stock_quantity=3)
    customer = api.create_customer()
    open_order = api.create_order([line(product, 1)], customer_id=customer["id"])
    api.delete(f"/api/products/{product['id']}")

    response = api.raw("POST", "/api/orders", json={"customer_id": customer["id"], "items": [line(product, 1)]})
    rejected(response, 400, 404, 409)
    assert api.get("/api/orders")["total"] == 1
    # An order that already had it can still be completed.
    assert api.set_status(open_order["id"], "collected")["stock_deducted"] is True


# ---------------------------------------------------------------------------
# Cancel and edit rules
# ---------------------------------------------------------------------------


def test_cancel_needs_payments_voided_first(api: Api) -> None:
    customer = api.create_customer()
    order = api.create_order([custom_item(100)], customer_id=customer["id"], payment={"amount": 50, "method": "cash"})

    response = api.raw("POST", f"/api/orders/{order['id']}/status", json={"status": "cancelled"})
    assert error(response, 409) == VOID_FIRST
    assert api.order(order["id"])["status"] == "new"

    api.delete(f"/api/payments/{order['payments'][0]['id']}")
    cancelled = api.set_status(order["id"], "cancelled")
    assert (cancelled["status"], cancelled["paid"], cancelled["payment_status"]) == ("cancelled", 0, "unpaid")
    customer_now = api.customer(customer["id"])
    assert (customer_now["outstanding"], customer_now["orders_count"], customer_now["total_purchases"]) == (0, 0, 0)


def test_open_orders_can_be_edited_and_totals_recomputed(api: Api) -> None:
    rice = api.create_product(selling_price=60, stock_quantity=20)
    dal = api.create_product(selling_price=120, stock_quantity=20)
    first, second = api.create_customer(), api.create_customer()
    order = api.create_order([line(rice, 1)], customer_id=first["id"], status="preparing")
    due = (now_ist() + timedelta(hours=3)).replace(microsecond=0)

    edited = api.patch(
        f"/api/orders/{order['id']}",
        {
            "items": [line(rice, 2), line(dal, 0.5, discount=10)],
            "discount": 5,
            "customer_id": second["id"],
            "channel": "whatsapp",
            "notes": "Ring the bell",
            "due_at": due.isoformat(),
        },
    )
    assert [(i["product_id"], i["quantity"], i["line_total"]) for i in edited["items"]] == [
        (rice["id"], 2, 120),
        (dal["id"], 0.5, 50),
    ]
    assert (edited["subtotal"], edited["discount"], edited["total"]) == (170, 5, 165)
    assert (edited["customer_id"], edited["channel"], edited["notes"]) == (second["id"], "whatsapp", "Ring the bell")
    assert parse_dt(edited["due_at"]) == due
    assert edited["status"] == "preparing" and edited["number"] == order["number"]
    assert api.customer(first["id"])["outstanding"] == 0
    assert api.customer(second["id"])["outstanding"] == 165
    assert api.product(dal["id"])["reserved_quantity"] == 0.5

    cleared = api.patch(f"/api/orders/{order['id']}", {"due_at": None})
    assert cleared["due_at"] is None and cleared["total"] == 165


@pytest.mark.parametrize("final_status", ["collected", "cancelled"])
def test_items_discount_and_customer_are_locked_after_completion_or_cancel(api: Api, final_status: str) -> None:
    customer, other = api.create_customer(), api.create_customer()
    order = api.create_order([custom_item(100)], customer_id=customer["id"])
    api.set_status(order["id"], final_status)
    for body in ({"items": [custom_item(80)]}, {"discount": 10}, {"customer_id": other["id"]}):
        rejected(api.raw("PATCH", f"/api/orders/{order['id']}", json=body), 400, 409)
    current = api.order(order["id"])
    assert (current["total"], current["discount"], current["customer_id"]) == (100, 0, customer["id"])


def test_new_total_cannot_drop_below_what_was_paid(api: Api) -> None:
    customer = api.create_customer()
    order = api.create_order([custom_item(100)], customer_id=customer["id"], payment={"amount": 80, "method": "upi"})
    error(api.raw("PATCH", f"/api/orders/{order['id']}", json={"discount": 30}), 409)
    error(api.raw("PATCH", f"/api/orders/{order['id']}", json={"items": [custom_item(70)]}), 409)
    assert api.order(order["id"])["total"] == 100

    exact = api.patch(f"/api/orders/{order['id']}", {"discount": 20})
    assert (exact["total"], exact["outstanding"], exact["payment_status"]) == (80, 0, "paid")


def test_repeat_order_uses_current_prices(api: Api) -> None:
    atta = api.create_product(name="Aashirvaad Atta 5 kg", selling_price=250, stock_quantity=20)
    customer = api.create_customer()
    original = api.create_order(
        [line(atta, 2), custom_item(20, name="Home delivery")],
        customer_id=customer["id"],
        fulfillment="delivery",
        channel="whatsapp",
        delivery_address="Flat 3, Kothrud",
        status="delivered",
        payment={"amount": 520, "method": "upi"},
    )
    api.patch(f"/api/products/{atta['id']}", {"selling_price": 265})

    repeat = api.post(f"/api/orders/{original['id']}/repeat", status=201)

    assert repeat["id"] != original["id"] and repeat["number"] == original["number"] + 1
    assert (repeat["status"], repeat["paid"], repeat["payment_status"], repeat["payments"]) == ("new", 0, "unpaid", [])
    assert (repeat["customer_id"], repeat["fulfillment"], repeat["channel"]) == (customer["id"], "delivery", "whatsapp")
    assert repeat["stock_deducted"] is False
    items = {i["name"]: i for i in repeat["items"]}
    assert (items["Aashirvaad Atta 5 kg"]["unit_price"], items["Aashirvaad Atta 5 kg"]["quantity"]) == (265, 2)
    assert items["Aashirvaad Atta 5 kg"]["line_total"] == 530
    assert items["Home delivery"]["unit_price"] == 20 and items["Home delivery"]["product_id"] is None
    assert repeat["total"] == 550
    assert api.order(original["id"])["total"] == 520
    assert api.customer(customer["id"])["outstanding"] == 550


# ---------------------------------------------------------------------------
# Lists
# ---------------------------------------------------------------------------


def test_order_list_filters_search_and_pagination(api: Api) -> None:
    besan = api.create_product(name="Rajdhani Besan", selling_price=90, stock_quantity=10)
    asha, bala = api.create_customer(name="Asha Kulkarni"), api.create_customer(name="Bala Shinde")
    a = api.create_order([custom_item(100)], customer_id=asha["id"])
    b = api.create_order([custom_item(100)], customer_id=asha["id"], fulfillment="delivery", channel="phone", status="ready", payment={"amount": 30, "method": "cash"})
    c = api.create_order([line(besan, 1)], customer_id=bala["id"], channel="whatsapp", status="collected", payment={"amount": 90, "method": "upi"})
    d = api.create_order([custom_item(10)], customer_id=bala["id"])
    api.set_status(d["id"], "cancelled")

    def ids(**params: Any) -> list[int]:
        page = api.get("/api/orders", params=params)
        assert page["total"] == len(page["items"]) or "limit" in params
        return [o["id"] for o in page["items"]]

    assert ids() == [d["id"], c["id"], b["id"], a["id"]]  # newest first
    assert ids(status="open") == [b["id"], a["id"]]
    assert ids(status="completed") == [c["id"]]
    assert ids(status="cancelled") == [d["id"]]
    assert ids(status="ready") == [b["id"]]
    assert ids(payment_status="partial") == [b["id"]]
    assert ids(payment_status="paid") == [c["id"]]
    assert ids(fulfillment="delivery") == [b["id"]]
    assert ids(channel="whatsapp") == [c["id"]]
    assert ids(customer_id=asha["id"]) == [b["id"], a["id"]]
    assert ids(search=str(c["number"])) == [c["id"]]
    assert ids(search="Kulkarni") == [b["id"], a["id"]]
    assert ids(search=asha["phone"][-6:]) == [b["id"], a["id"]]
    assert ids(search="besan") == [c["id"]]
    today = today_ist().isoformat()
    yesterday = (today_ist() - timedelta(days=1)).isoformat()
    assert len(ids(date_from=today, date_to=today)) == 4
    assert ids(date_to=yesterday) == []

    page = api.get("/api/orders", params={"limit": 2, "offset": 1})
    assert (page["total"], page["limit"], page["offset"]) == (4, 2, 1)
    assert [o["id"] for o in page["items"]] == [c["id"], b["id"]]
    capped = api.raw("GET", "/api/orders", params={"limit": 500})
    if capped.status_code == 200:
        assert capped.json()["limit"] <= 200
    else:
        assert capped.status_code == 422
    assert api.raw("GET", "/api/orders", params={"status": "lost"}).status_code == 422


def test_pickups_and_deliveries_queues_are_sorted(api: Api) -> None:
    customer = api.create_customer()
    soon = lambda hours: (now_ist() + timedelta(hours=hours)).isoformat()  # noqa: E731

    new_late = order_in(api, customer["id"], "pickup", "new", due_at=soon(3))
    new_undated = order_in(api, customer["id"], "pickup", "new")
    new_soon = order_in(api, customer["id"], "pickup", "new", due_at=soon(1))
    preparing = order_in(api, customer["id"], "pickup", "preparing", due_at=soon(5))
    ready_undated = order_in(api, customer["id"], "pickup", "ready")
    ready_soon = order_in(api, customer["id"], "pickup", "ready", due_at=soon(2))
    order_in(api, customer["id"], "pickup", "collected")
    order_in(api, customer["id"], "pickup", "cancelled")
    delivery_new = order_in(api, customer["id"], "delivery", "new")
    delivery_ready = order_in(api, customer["id"], "delivery", "ready")
    order_in(api, customer["id"], "delivery", "delivered")

    assert [o["id"] for o in api.get("/api/pickups")] == [
        ready_soon["id"],
        ready_undated["id"],
        preparing["id"],
        new_soon["id"],
        new_late["id"],
        new_undated["id"],
    ]
    assert [o["id"] for o in api.get("/api/deliveries")] == [delivery_ready["id"], delivery_new["id"]]


# ---------------------------------------------------------------------------
# Calendar edges (never a 500)
# ---------------------------------------------------------------------------

EDGE_FILTERS = [
    {"date_from": "0001-01-01"},
    {"date_to": "9999-12-31"},
    {"date_from": "0001-01-01", "date_to": "9999-12-31"},
]


@pytest.mark.parametrize("params", EDGE_FILTERS)
def test_calendar_edge_dates_in_order_filters_cover_everything(api: Api, params: dict[str, str]) -> None:
    customer = api.create_customer()
    order = api.create_order([custom_item(10)], customer_id=customer["id"])
    page = api.get("/api/orders", params=params)
    assert [o["id"] for o in page["items"]] == [order["id"]]


@pytest.mark.parametrize("due_at", ["0001-01-01T01:00:00+05:30", "0001-01-01T00:00:00", "9999-12-31T23:59:59+00:00"])
def test_due_times_at_the_edge_of_the_calendar_never_break_the_shop(api: Api, due_at: str) -> None:
    customer = api.create_customer()
    response = api.raw("POST", "/api/orders", json={"customer_id": customer["id"], "items": [custom_item(10)], "due_at": due_at})
    if response.status_code == 201:
        assert api.raw("GET", "/api/orders").status_code == 200
        assert api.raw("GET", "/api/pickups").status_code == 200
        assert api.raw("GET", "/api/dashboard").status_code == 200
        assert api.raw("GET", "/api/export/orders.csv").status_code == 200
    else:
        rejected(response, 400, 422)
        assert api.get("/api/orders")["total"] == 0


# ---------------------------------------------------------------------------
# Snapshots, repeat edge cases, reopen and concurrency
# ---------------------------------------------------------------------------


def test_order_lines_keep_the_name_unit_and_price_from_order_time(api: Api) -> None:
    product = api.create_product(name="Amul Taaza 500 ml", unit="pack", selling_price=27, stock_quantity=10)
    customer = api.create_customer()
    order = api.create_order([line(product, 2)], customer_id=customer["id"])
    api.patch(f"/api/products/{product['id']}", {"name": "Amul Taaza Toned Milk", "unit": "l", "selling_price": 30})
    item = api.order(order["id"])["items"][0]
    assert (item["name"], item["unit"], item["unit_price"], item["line_total"]) == ("Amul Taaza 500 ml", "pack", 27, 54)


def test_editing_after_an_undo_deducts_the_new_quantities(api: Api) -> None:
    product = api.create_product(stock_quantity=10)
    customer = api.create_customer()
    order = api.create_order([line(product, 3)], customer_id=customer["id"], status="collected")
    assert api.product(product["id"])["stock_quantity"] == 7
    api.set_status(order["id"], "ready")
    api.patch(f"/api/orders/{order['id']}", {"items": [line(product, 5)]})
    api.set_status(order["id"], "collected")
    assert api.product(product["id"])["stock_quantity"] == 5
    assert [(t["type"], t["quantity_change"], t["stock_after"]) for t in api.transactions(product["id"])] == [
        ("sale", -5, 5),
        ("sale_reversal", 3, 10),
        ("sale", -3, 7),
        ("opening", 10, 10),
    ]


def test_cancelled_orders_take_no_payments_until_reopened(api: Api) -> None:
    customer = api.create_customer()
    order = api.create_order([custom_item(60)], customer_id=customer["id"])
    api.set_status(order["id"], "cancelled")
    rejected(api.raw("POST", f"/api/orders/{order['id']}/payments", json={"amount": 10, "method": "cash"}), 400, 409)
    assert api.get("/api/payments")["total"] == 0
    assert api.customer(customer["id"])["total_paid"] == 0

    reopened = api.set_status(order["id"], "new")
    assert (reopened["status"], reopened["outstanding"]) == ("new", 60)
    assert api.customer(customer["id"])["outstanding"] == 60
    assert api.pay_order(order["id"], 60)["payment_status"] == "paid"


def test_repeat_never_adds_archived_products(api: Api) -> None:
    kept = api.create_product(name="Kept Item", selling_price=10, stock_quantity=10)
    gone = api.create_product(name="Gone Item", selling_price=20, stock_quantity=10)
    customer = api.create_customer()
    original = api.create_order([line(kept, 1), line(gone, 1)], customer_id=customer["id"])
    only_gone = api.create_order([line(gone, 2)], customer_id=customer["id"])
    api.delete(f"/api/products/{gone['id']}")

    response = api.raw("POST", f"/api/orders/{original['id']}/repeat")
    if response.status_code == 201:
        assert [i["product_id"] for i in response.json()["items"]] == [kept["id"]]
    else:
        rejected(response, 400, 409)
    rejected(api.raw("POST", f"/api/orders/{only_gone['id']}/repeat"), 400, 409)


def test_repeating_a_walk_in_sale_needs_a_customer(api: Api) -> None:
    sale = api.create_order([custom_item(50)], status="collected", payment={"amount": 50, "method": "cash"})
    before = api.get("/api/orders")["total"]
    assert rejected(api.raw("POST", f"/api/orders/{sale['id']}/repeat"), 400) == 400
    assert api.get("/api/orders")["total"] == before


def test_unpaid_filter_leaves_out_free_orders(api: Api) -> None:
    customer = api.create_customer()
    owed = api.create_order([custom_item(30)], customer_id=customer["id"])
    api.create_order([custom_item(30)], customer_id=customer["id"], discount=30)
    assert [o["id"] for o in api.get("/api/orders", params={"payment_status": "unpaid"})["items"]] == [owed["id"]]


def test_concurrent_orders_get_unique_consecutive_numbers(api: Api) -> None:
    customer = api.create_customer()

    def create(_: int) -> int:
        response = api.raw("POST", "/api/orders", json={"customer_id": customer["id"], "items": [custom_item(5)]})
        assert response.status_code == 201, response.text
        return int(response.json()["number"])

    with ThreadPoolExecutor(max_workers=6) as pool:
        numbers = sorted(pool.map(create, range(12)))
    assert numbers == list(range(1001, 1013))


def test_completing_one_order_twice_at_once_deducts_stock_once(api: Api) -> None:
    product = api.create_product(stock_quantity=10)
    customer = api.create_customer()
    order = api.create_order([line(product, 4)], customer_id=customer["id"], status="ready")

    def complete(_: int) -> int:
        return api.raw("POST", f"/api/orders/{order['id']}/status", json={"status": "collected"}).status_code

    with ThreadPoolExecutor(max_workers=4) as pool:
        statuses = list(pool.map(complete, range(4)))
    assert all(code in (200, 409) for code in statuses) and 200 in statuses
    assert api.product(product["id"])["stock_quantity"] == 6
    assert [t["type"] for t in api.transactions(product["id"])] == ["sale", "opening"]

