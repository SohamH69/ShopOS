"""Payments: order payments, overpayment, voids, khata (FIFO) settlement, summary and lists.

Derived from SPEC section 2 ("Payments") and the payment rows of section 3.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient

from api_helpers import (
    Api,
    at_ist,
    backdate,
    custom_item,
    error,
    ok,
    parse_dt,
    rejected,
    today_ist,
)
from conftest import ShopAccount, StaffAccount

PAYMENT_KEYS = {
    "id", "order_id", "order_number", "customer_id", "customer_name", "amount", "method",
    "note", "paid_at", "received_by_name", "batch_id",
}


def over_due_message(amount: str) -> re.Pattern[str]:
    return re.compile(rf"Amount is more than the ₹{amount}(\.00)? due on this order\.")


def test_order_payments_move_the_payment_status(api: Api, owner: ShopAccount) -> None:
    customer = api.create_customer(name="Geeta Pawar")
    order = api.create_order([custom_item(100)], customer_id=customer["id"])

    partial = api.pay_order(order["id"], 60, "cash", note="Advance")
    assert (partial["paid"], partial["outstanding"], partial["payment_status"]) == (60, 40, "partial")
    payment = partial["payments"][0]
    assert set(payment) == PAYMENT_KEYS
    assert (payment["amount"], payment["method"], payment["note"]) == (60, "cash", "Advance")
    assert (payment["order_id"], payment["order_number"]) == (order["id"], order["number"])
    assert (payment["customer_id"], payment["customer_name"]) == (customer["id"], "Geeta Pawar")
    assert payment["received_by_name"] == owner.user["name"]
    assert payment["batch_id"] is None
    parse_dt(payment["paid_at"])

    paid = api.pay_order(order["id"], 40, "upi")
    assert (paid["paid"], paid["outstanding"], paid["payment_status"]) == (100, 0, "paid")
    assert [(p["amount"], p["method"]) for p in paid["payments"]] == [(60, "cash"), (40, "upi")]  # oldest first
    assert api.customer(customer["id"])["outstanding"] == 0
    assert api.customer(customer["id"])["total_paid"] == 100


def test_payment_above_the_due_amount_is_rejected(api: Api) -> None:
    customer = api.create_customer()
    order = api.create_order([custom_item(100)], customer_id=customer["id"], payment={"amount": 60, "method": "cash"})

    detail = error(api.raw("POST", f"/api/orders/{order['id']}/payments", json={"amount": 50, "method": "upi"}), 400)
    assert over_due_message("40").fullmatch(detail), detail
    error(api.raw("POST", f"/api/orders/{order['id']}/payments", json={"amount": 40.01, "method": "upi"}), 400)
    for amount in (0, -5):
        rejected(api.raw("POST", f"/api/orders/{order['id']}/payments", json={"amount": amount, "method": "cash"}), 400, 422)
    assert api.raw("POST", f"/api/orders/{order['id']}/payments", json={"amount": 5, "method": "credit"}).status_code == 422
    assert api.order(order["id"])["paid"] == 60

    api.pay_order(order["id"], 40)
    detail = error(api.raw("POST", f"/api/orders/{order['id']}/payments", json={"amount": 1, "method": "cash"}), 400)
    # With nothing due, a clearer sentence than "more than the ₹0 due" is acceptable.
    assert over_due_message("0").fullmatch(detail) or detail == "This order is already paid in full.", detail


def test_payment_at_order_creation_cannot_exceed_the_total(api: Api) -> None:
    customer = api.create_customer()
    response = api.raw(
        "POST",
        "/api/orders",
        json={"customer_id": customer["id"], "items": [custom_item(50)], "payment": {"amount": 60, "method": "cash"}},
    )
    rejected(response, 400)
    assert api.get("/api/orders")["total"] == 0


def test_voiding_a_payment_restores_dues_and_payment_status(api: Api) -> None:
    customer = api.create_customer()
    order = api.create_order([custom_item(100)], customer_id=customer["id"])
    first = api.pay_order(order["id"], 60, "cash")["payments"][0]
    second = api.pay_order(order["id"], 40, "upi")["payments"][1]
    assert api.customer(customer["id"])["outstanding"] == 0

    assert api.delete(f"/api/payments/{second['id']}") == {"ok": True}
    after_one = api.order(order["id"])
    assert (after_one["paid"], after_one["outstanding"], after_one["payment_status"]) == (60, 40, "partial")
    assert [p["id"] for p in after_one["payments"]] == [first["id"]]

    api.delete(f"/api/payments/{first['id']}")
    after_both = api.order(order["id"])
    assert (after_both["paid"], after_both["outstanding"], after_both["payment_status"]) == (0, 100, "unpaid")
    assert after_both["payments"] == []

    customer_now = api.customer(customer["id"])
    assert (customer_now["outstanding"], customer_now["total_paid"]) == (100, 0)
    listed = api.get("/api/payments")
    assert (listed["items"], listed["total"]) == ([], 0)
    assert api.get(f"/api/customers/{customer['id']}/payments") == []
    assert [e["type"] for e in api.get(f"/api/customers/{customer['id']}/ledger")["entries"]] == ["purchase"]
    assert api.get("/api/payments/summary")["today"] == 0

    # A voided payment is gone for good.
    assert error(api.raw("DELETE", f"/api/payments/{first['id']}"), 404).endswith("not found.")
    assert error(api.raw("DELETE", "/api/payments/999999"), 404).endswith("not found.")


def test_voiding_needs_the_payments_permission(
    client: TestClient, owner: ShopAccount, create_staff: Callable[..., StaffAccount]
) -> None:
    api = Api(client, owner.headers)
    customer = api.create_customer()
    order = api.create_order([custom_item(100)], customer_id=customer["id"], payment={"amount": 100, "method": "cash"})
    payment_id = order["payments"][0]["id"]
    employee = create_staff(owner.headers, "employee")
    accountant = create_staff(owner.headers, "accountant")

    detail = error(client.delete(f"/api/payments/{payment_id}", headers=employee.headers), 403)
    assert detail == "You don't have access to payments."
    assert api.order(order["id"])["paid"] == 100
    assert ok(client.delete(f"/api/payments/{payment_id}", headers=accountant.headers)) == {"ok": True}
    assert api.order(order["id"])["paid"] == 0


def test_khata_payment_settles_the_oldest_orders_first(api: Api) -> None:
    customer, neighbour = api.create_customer(name="Kiran Jadhav"), api.create_customer()
    cancelled = api.create_order([custom_item(500)], customer_id=customer["id"])
    api.set_status(cancelled["id"], "cancelled")
    first = api.create_order([custom_item(100)], customer_id=customer["id"], payment={"amount": 40, "method": "cash"})
    second = api.create_order([custom_item(200)], customer_id=customer["id"], status="collected")
    third = api.create_order([custom_item(300)], customer_id=customer["id"])
    theirs = api.create_order([custom_item(50)], customer_id=neighbour["id"])
    assert api.customer(customer["id"])["outstanding"] == 560

    result = api.post(f"/api/customers/{customer['id']}/payments", {"amount": 300, "method": "upi", "note": "Khata"}, status=201)

    assert set(result) == {"batch_id", "total", "allocations", "payments", "outstanding"}
    assert (result["total"], result["outstanding"]) == (300, 260)
    assert result["allocations"] == [
        {"order_id": first["id"], "order_number": first["number"], "amount": 60},
        {"order_id": second["id"], "order_number": second["number"], "amount": 200},
        {"order_id": third["id"], "order_number": third["number"], "amount": 40},
    ]
    batch_id = result["batch_id"]
    assert re.fullmatch(r"[0-9a-f]{32}", batch_id) and uuid.UUID(hex=batch_id).version == 4
    payments = result["payments"]
    assert len(payments) == 3 and all(set(p) == PAYMENT_KEYS for p in payments)
    assert {p["batch_id"] for p in payments} == {batch_id}
    assert sorted((p["order_id"], p["amount"]) for p in payments) == sorted(
        [(first["id"], 60), (second["id"], 200), (third["id"], 40)]
    )
    assert all(p["method"] == "upi" and p["note"] == "Khata" and p["customer_id"] == customer["id"] for p in payments)

    assert api.order(first["id"])["payment_status"] == "paid"
    assert api.order(second["id"])["payment_status"] == "paid"
    third_now = api.order(third["id"])
    assert (third_now["paid"], third_now["payment_status"]) == (40, "partial")
    assert api.order(cancelled["id"])["paid"] == 0
    assert api.order(theirs["id"])["paid"] == 0
    assert api.customer(customer["id"])["outstanding"] == 260
    assert api.customer(neighbour["id"])["outstanding"] == 50
    batch_rows = [p for p in api.get("/api/payments", params={"customer_id": customer["id"]})["items"] if p["batch_id"]]
    assert sorted(p["id"] for p in batch_rows) == sorted(p["id"] for p in payments)

    detail = error(api.raw("POST", f"/api/customers/{customer['id']}/payments", json={"amount": 260.01, "method": "cash"}), 400)
    assert detail
    settled = api.post(f"/api/customers/{customer['id']}/payments", {"amount": 260, "method": "cash"}, status=201)
    assert settled["outstanding"] == 0
    assert settled["allocations"] == [{"order_id": third["id"], "order_number": third["number"], "amount": 260}]
    assert settled["batch_id"] != batch_id
    # Nothing left to settle.
    error(api.raw("POST", f"/api/customers/{customer['id']}/payments", json={"amount": 1, "method": "cash"}), 400)
    rejected(api.raw("POST", f"/api/customers/{neighbour['id']}/payments", json={"amount": 0, "method": "cash"}), 400, 422)


def test_khata_payment_with_paise_spreads_exactly(api: Api) -> None:
    customer = api.create_customer()
    a = api.create_order([custom_item(33.33)], customer_id=customer["id"])
    b = api.create_order([custom_item(66.67)], customer_id=customer["id"])
    result = api.post(f"/api/customers/{customer['id']}/payments", {"amount": 50.05, "method": "card"}, status=201)
    assert [(x["order_id"], x["amount"]) for x in result["allocations"]] == [(a["id"], 33.33), (b["id"], 16.72)]
    assert result["outstanding"] == 49.95
    assert api.order(b["id"])["outstanding"] == 49.95


def test_voiding_one_payment_of_a_batch_only_reopens_that_order(api: Api) -> None:
    customer = api.create_customer()
    a = api.create_order([custom_item(100)], customer_id=customer["id"])
    b = api.create_order([custom_item(100)], customer_id=customer["id"])
    result = api.post(f"/api/customers/{customer['id']}/payments", {"amount": 200, "method": "upi"}, status=201)
    for_b = next(p for p in result["payments"] if p["order_id"] == b["id"])
    api.delete(f"/api/payments/{for_b['id']}")
    assert api.order(a["id"])["payment_status"] == "paid"
    assert api.order(b["id"])["payment_status"] == "unpaid"
    assert api.customer(customer["id"])["outstanding"] == 100


def test_payment_list_filters_and_pagination(api: Api) -> None:
    asha, bala = api.create_customer(name="Asha"), api.create_customer(name="Bala")
    first = api.create_order([custom_item(10)], customer_id=asha["id"], payment={"amount": 10, "method": "cash"})
    second = api.create_order([custom_item(20)], customer_id=asha["id"], payment={"amount": 20, "method": "upi"})
    third = api.create_order([custom_item(30)], customer_id=bala["id"], payment={"amount": 30, "method": "card"})
    walk_in = api.create_order([custom_item(5)], payment={"amount": 5, "method": "bank_transfer"})

    def amounts(**params: Any) -> list[float]:
        return [p["amount"] for p in api.get("/api/payments", params=params)["items"]]

    assert amounts() == [5, 30, 20, 10]  # newest first
    assert amounts(method="upi") == [20]
    assert amounts(customer_id=asha["id"]) == [20, 10]
    today, yesterday = today_ist(), today_ist() - timedelta(days=1)
    assert amounts(date_from=today.isoformat(), date_to=today.isoformat()) == [5, 30, 20, 10]
    assert amounts(date_to=yesterday.isoformat()) == []
    page = api.get("/api/payments", params={"limit": 2, "offset": 2})
    assert (page["total"], page["limit"], page["offset"]) == (4, 2, 2)
    assert [p["amount"] for p in page["items"]] == [20, 10]
    walk_in_row = api.get("/api/payments", params={"method": "bank_transfer"})["items"][0]
    assert (walk_in_row["customer_id"], walk_in_row["customer_name"]) == (None, None)
    assert walk_in_row["order_number"] == walk_in["number"]
    assert {first["number"], second["number"], third["number"]} <= {p["order_number"] for p in api.get("/api/payments")["items"]}
    assert api.raw("GET", "/api/payments", params={"method": "credit"}).status_code == 422


def test_payment_date_filters_use_ist_days(api: Api) -> None:
    customer = api.create_customer()
    today = today_ist()
    yesterday = today - timedelta(days=1)
    late_last_night = api.create_order([custom_item(11)], customer_id=customer["id"], payment={"amount": 11, "method": "cash"})
    just_after_midnight = api.create_order([custom_item(22)], customer_id=customer["id"], payment={"amount": 22, "method": "cash"})
    backdate("Payment", late_last_night["payments"][0]["id"], paid_at=at_ist(yesterday, 23, 59, 30))
    backdate("Payment", just_after_midnight["payments"][0]["id"], paid_at=at_ist(today, 0, 0, 30))

    def amounts(day: Any) -> list[float]:
        page = api.get("/api/payments", params={"date_from": day.isoformat(), "date_to": day.isoformat()})
        return [p["amount"] for p in page["items"]]

    assert amounts(today) == [22]
    assert amounts(yesterday) == [11]


def test_payment_summary_by_period_and_method(api: Api) -> None:
    customer = api.create_customer()
    today = today_ist()
    for amount, method in ((100, "cash"), (50, "upi"), (25, "upi")):
        api.create_order([custom_item(amount)], customer_id=customer["id"], payment={"amount": amount, "method": method})
    six_days_ago = api.create_order([custom_item(7)], customer_id=customer["id"], payment={"amount": 7, "method": "card"})
    backdate("Payment", six_days_ago["payments"][0]["id"], paid_at=at_ist(today - timedelta(days=6), 9))
    week_ago = api.create_order([custom_item(1000)], customer_id=customer["id"], payment={"amount": 1000, "method": "bank_transfer"})
    backdate("Payment", week_ago["payments"][0]["id"], paid_at=at_ist(today - timedelta(days=7), 23, 59, 59))
    voided = api.create_order([custom_item(500)], customer_id=customer["id"], payment={"amount": 500, "method": "cash"})
    api.delete(f"/api/payments/{voided['payments'][0]['id']}")

    summary = api.get("/api/payments/summary")
    assert set(summary) == {"today", "week", "month", "by_method"}
    assert summary["today"] == 175
    assert summary["week"] == 182  # last 7 days including today
    month_start = today.replace(day=1)
    expected_month = 175 + (7 if today - timedelta(days=6) >= month_start else 0)
    expected_month += 1000 if today - timedelta(days=7) >= month_start else 0
    assert summary["month"] == expected_month
    by_method = {m["method"]: (m["amount"], m["count"]) for m in summary["by_method"]}
    assert by_method["cash"] == (100, 1)
    assert by_method["upi"] == (75, 2)
    assert sum(amount for amount, _ in by_method.values()) == expected_month


def test_calendar_edge_dates_in_payment_filters_cover_everything(api: Api) -> None:
    customer = api.create_customer()
    api.create_order([custom_item(10)], customer_id=customer["id"], payment={"amount": 10, "method": "cash"})
    for params in ({"date_from": "0001-01-01"}, {"date_to": "9999-12-31"}, {"date_from": "0001-01-01", "date_to": "9999-12-31"}):
        assert [p["amount"] for p in api.get("/api/payments", params=params)["items"]] == [10], params


# ---------------------------------------------------------------------------
# Concurrency: money must stay right when several counters record at once
# ---------------------------------------------------------------------------


def test_concurrent_payments_never_exceed_the_order_total(api: Api) -> None:
    customer = api.create_customer()
    order = api.create_order([custom_item(100)], customer_id=customer["id"])

    def pay(_: int) -> int:
        return api.raw("POST", f"/api/orders/{order['id']}/payments", json={"amount": 30, "method": "cash"}).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = sorted(pool.map(pay, range(8)))
    assert statuses == [201, 201, 201, 400, 400, 400, 400, 400]
    final = api.order(order["id"])
    assert (final["paid"], final["outstanding"], len(final["payments"])) == (90, 10, 3)
    assert api.customer(customer["id"])["outstanding"] == 10


def test_concurrent_khata_settlements_collect_the_dues_once(api: Api) -> None:
    customer = api.create_customer()
    api.create_order([custom_item(120)], customer_id=customer["id"])
    api.create_order([custom_item(180)], customer_id=customer["id"], status="collected")

    def settle(_: int) -> int:
        return api.raw("POST", f"/api/customers/{customer['id']}/payments", json={"amount": 300, "method": "upi"}).status_code

    with ThreadPoolExecutor(max_workers=5) as pool:
        statuses = sorted(pool.map(settle, range(5)))
    assert statuses == [201, 400, 400, 400, 400]
    settled = api.customer(customer["id"])
    assert (settled["outstanding"], settled["total_paid"]) == (0, 300)
    assert api.get("/api/payments")["total"] == 2


def test_concurrent_void_and_cancel_keep_the_order_consistent(api: Api) -> None:
    customer = api.create_customer()
    order = api.create_order([custom_item(80)], customer_id=customer["id"], payment={"amount": 80, "method": "cash"})
    payment_id = order["payments"][0]["id"]

    def void(_: int) -> int:
        return api.raw("DELETE", f"/api/payments/{payment_id}").status_code

    with ThreadPoolExecutor(max_workers=4) as pool:
        statuses = sorted(pool.map(void, range(4)))
    assert statuses == [200, 404, 404, 404]
    final = api.order(order["id"])
    assert (final["paid"], final["payment_status"], final["payments"]) == (0, "unpaid", [])

