"""Customers and khata: create/validate, duplicates, archive, stats, ledger, promises, lists.

Derived from SPEC section 2 ("Customers", "Payments") and the customer rows of section 3.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta

from fastapi.testclient import TestClient

from api_helpers import (
    Api,
    at_ist,
    backdate,
    custom_item,
    customer_phone,
    digits,
    error,
    move_promise_date,
    parse_dt,
    rejected,
    today_ist,
)
from conftest import ShopAccount

DUPLICATE_PHONE = "A customer with this phone number already exists."
CUSTOMER_KEYS = {
    "id", "name", "phone", "address", "notes", "preferred_products", "total_purchases", "total_paid",
    "outstanding", "orders_count", "last_order_at", "last_order_total", "promise_date", "promise_amount",
    "promise_note", "promise_overdue", "created_at",
}


def test_new_customer_starts_with_a_clean_khata(api: Api) -> None:
    phone = customer_phone()
    created = api.post(
        "/api/customers",
        {"name": "Meena Gokhale", "phone": phone, "address": "Karve Nagar", "notes": "Prefers Amul", "preferred_products": ["Milk", "Bread"]},
        status=201,
    )
    assert set(created) == CUSTOMER_KEYS
    assert (created["name"], created["address"], created["notes"]) == ("Meena Gokhale", "Karve Nagar", "Prefers Amul")
    assert digits(created["phone"]).endswith(phone)
    assert created["preferred_products"] == ["Milk", "Bread"]
    assert (created["total_purchases"], created["total_paid"], created["outstanding"], created["orders_count"]) == (0, 0, 0, 0)
    assert (created["last_order_at"], created["last_order_total"]) == (None, None)
    assert (created["promise_date"], created["promise_amount"], created["promise_note"], created["promise_overdue"]) == (None, None, "", False)
    parse_dt(created["created_at"])
    assert api.customer(created["id"]) == created

    minimal = api.create_customer(name="Only Name And Phone")
    assert (minimal["address"], minimal["notes"], minimal["preferred_products"]) == ("", "", [])


def test_customer_needs_a_name_and_a_phone(api: Api) -> None:
    rejected(api.raw("POST", "/api/customers", json={"name": "No Phone"}), 422)
    rejected(api.raw("POST", "/api/customers", json={"name": "Blank Phone", "phone": "  "}), 400, 422)
    rejected(api.raw("POST", "/api/customers", json={"name": "  ", "phone": customer_phone()}), 400, 422)
    rejected(api.raw("POST", "/api/customers", json={"name": "Short Phone", "phone": "12345"}), 400, 422)
    rejected(api.raw("POST", "/api/customers", json={"name": "Letters", "phone": "call me"}), 400, 422)
    assert api.get("/api/customers") == []


def test_duplicate_phone_is_409_whatever_the_formatting(api: Api) -> None:
    phone = customer_phone()
    original = api.create_customer(name="Original", phone=phone)
    for variant in (phone, f"{phone[:5]} {phone[5:]}", f"{phone[:5]}-{phone[5:]}"):
        assert error(api.raw("POST", "/api/customers", json={"name": "Copy", "phone": variant}), 409) == DUPLICATE_PHONE

    other = api.create_customer(name="Other")
    assert error(api.raw("PATCH", f"/api/customers/{other['id']}", json={"phone": phone}), 409) == DUPLICATE_PHONE
    # Saving a customer with their own number is not a duplicate.
    assert api.patch(f"/api/customers/{original['id']}", {"phone": phone, "notes": "Same number"})["notes"] == "Same number"
    assert len(api.get("/api/customers")) == 2


def test_same_phone_is_fine_in_another_shop(api: Api, client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    phone = customer_phone()
    api.create_customer(phone=phone)
    neighbour = Api(client, signup_shop().headers)
    assert digits(neighbour.create_customer(phone=phone)["phone"]).endswith(phone)


def test_customer_can_be_edited(api: Api) -> None:
    customer = api.create_customer(name="Old Name")
    new_phone = customer_phone()
    updated = api.patch(
        f"/api/customers/{customer['id']}",
        {"name": "New Name", "phone": new_phone, "address": "Hadapsar", "preferred_products": ["Tea"]},
    )
    assert (updated["name"], updated["address"], updated["preferred_products"]) == ("New Name", "Hadapsar", ["Tea"])
    assert digits(updated["phone"]).endswith(new_phone)
    assert updated["notes"] == customer["notes"]
    rejected(api.raw("PATCH", f"/api/customers/{customer['id']}", json={"name": ""}), 400, 422)


def test_archive_needs_dues_cleared_and_hides_the_customer(api: Api) -> None:
    phone = customer_phone()
    customer = api.create_customer(name="Leaving Lata", phone=phone)
    order = api.create_order([custom_item(120)], customer_id=customer["id"], status="collected")

    error(api.raw("DELETE", f"/api/customers/{customer['id']}"), 409)
    assert customer["id"] in [c["id"] for c in api.get("/api/customers")]

    api.pay_order(order["id"], 120)
    assert api.delete(f"/api/customers/{customer['id']}") == {"ok": True}

    assert customer["id"] not in [c["id"] for c in api.get("/api/customers")]
    assert api.get("/api/search", params={"q": "Leaving"})["customers"] == []
    # Their orders stay.
    kept = api.order(order["id"])
    assert (kept["customer_id"], kept["customer_name"]) == (customer["id"], "Leaving Lata")
    assert [o["id"] for o in api.get("/api/orders")["items"]] == [order["id"]]
    # The phone number is free again for a new (non-archived) customer.
    assert api.create_customer(name="New Lata", phone=phone)["name"] == "New Lata"


def test_stats_ignore_cancelled_orders_and_voided_payments(api: Api) -> None:
    customer = api.create_customer()
    first = api.create_order([custom_item(100)], customer_id=customer["id"], payment={"amount": 30, "method": "cash"})
    second = api.create_order([custom_item(50)], customer_id=customer["id"], status="collected")
    cancelled = api.create_order([custom_item(70)], customer_id=customer["id"])
    api.set_status(cancelled["id"], "cancelled")
    voided = api.pay_order(second["id"], 20)["payments"][-1]
    api.delete(f"/api/payments/{voided['id']}")

    stats = api.customer(customer["id"])
    assert stats["total_purchases"] == 150
    assert stats["total_paid"] == 30
    assert stats["outstanding"] == 120
    assert stats["orders_count"] == 2
    assert stats["last_order_total"] == 50
    assert parse_dt(stats["last_order_at"]) == parse_dt(second["created_at"])
    assert first["id"] in [o["id"] for o in api.get(f"/api/customers/{customer['id']}/orders")]


def test_ledger_is_chronological_with_a_running_balance(api: Api) -> None:
    customer = api.create_customer(name="Ledger Lalita")
    first = api.create_order([custom_item(100)], customer_id=customer["id"], status="collected")
    api.pay_order(first["id"], 40, "upi")
    second = api.create_order([custom_item(50)], customer_id=customer["id"])
    cancelled = api.create_order([custom_item(70)], customer_id=customer["id"])
    api.set_status(cancelled["id"], "cancelled")
    voided = api.pay_order(second["id"], 10, "card")["payments"][-1]
    api.delete(f"/api/payments/{voided['id']}")
    settlement = api.post(f"/api/customers/{customer['id']}/payments", {"amount": 30, "method": "cash"}, status=201)

    ledger = api.get(f"/api/customers/{customer['id']}/ledger")
    assert set(ledger) == {"customer_id", "entries", "outstanding"}
    assert ledger["customer_id"] == customer["id"] and ledger["outstanding"] == 80
    entries = ledger["entries"]
    assert [(e["type"], e["amount"], e["balance"]) for e in entries] == [
        ("purchase", 100, 100),
        ("payment", -40, 60),
        ("purchase", 50, 110),
        ("payment", -30, 80),
    ]
    purchase, upi, _, cash = entries
    assert purchase["id"] == f"order-{first['id']}" and purchase["description"] == f"Order #{first['number']}"
    assert (purchase["order_id"], purchase["order_number"], purchase["payment_id"], purchase["method"]) == (first["id"], first["number"], None, None)
    assert upi["description"] == f"Payment · UPI · Order #{first['number']}"
    assert upi["id"] == f"payment-{upi['payment_id']}" and upi["method"] == "upi"
    assert (upi["order_id"], upi["order_number"]) == (first["id"], first["number"])
    assert cash["payment_id"] == settlement["payments"][0]["id"]
    assert cash["description"] == f"Payment · Cash · Order #{first['number']}"
    dates = [parse_dt(e["date"]) for e in entries]
    assert dates == sorted(dates)
    assert api.customer(customer["id"])["outstanding"] == ledger["outstanding"]


def test_customer_orders_and_payments_are_newest_first(api: Api) -> None:
    customer = api.create_customer()
    first = api.create_order([custom_item(10)], customer_id=customer["id"], payment={"amount": 10, "method": "cash"})
    second = api.create_order([custom_item(20)], customer_id=customer["id"], payment={"amount": 20, "method": "upi"})
    api.create_order([custom_item(30)], customer_id=api.create_customer()["id"])
    assert [o["id"] for o in api.get(f"/api/customers/{customer['id']}/orders")] == [second["id"], first["id"]]
    assert [p["amount"] for p in api.get(f"/api/customers/{customer['id']}/payments")] == [20, 10]


# ---------------------------------------------------------------------------
# Payment promises
# ---------------------------------------------------------------------------


def test_promise_is_overdue_only_after_its_date_while_dues_remain(api: Api) -> None:
    customer = api.create_customer()
    api.create_order([custom_item(500)], customer_id=customer["id"], status="collected")
    today = today_ist()

    promised = api.put(f"/api/customers/{customer['id']}/promise", {"date": today.isoformat(), "amount": 200, "note": "Salary day"})
    assert (promised["promise_date"], promised["promise_amount"], promised["promise_note"]) == (today.isoformat(), 200, "Salary day")
    assert promised["promise_overdue"] is False  # due today is not overdue yet

    # A day later the promise has lapsed while the dues remain.
    move_promise_date(customer["id"], today - timedelta(days=1))
    late = api.customer(customer["id"])
    assert (late["promise_date"], late["promise_amount"]) == ((today - timedelta(days=1)).isoformat(), 200)
    assert late["promise_overdue"] is True
    assert [c["id"] for c in api.get("/api/customers", params={"filter": "promises"})] == [customer["id"]]

    due_today = api.put(f"/api/customers/{customer['id']}/promise", {"date": today.isoformat()})
    assert (due_today["promise_date"], due_today["promise_amount"], due_today["promise_overdue"]) == (today.isoformat(), None, False)
    upcoming = api.put(f"/api/customers/{customer['id']}/promise", {"date": (today + timedelta(days=3)).isoformat(), "amount": 100})
    assert upcoming["promise_overdue"] is False

    cleared = api.delete(f"/api/customers/{customer['id']}/promise")
    assert (cleared["promise_date"], cleared["promise_amount"], cleared["promise_note"], cleared["promise_overdue"]) == (None, None, "", False)
    rejected(api.raw("PUT", f"/api/customers/{customer['id']}/promise", json={"date": "next friday"}), 400, 422)


def test_promise_clears_itself_when_a_khata_payment_settles_the_dues(api: Api) -> None:
    customer = api.create_customer()
    api.create_order([custom_item(300)], customer_id=customer["id"])
    api.put(f"/api/customers/{customer['id']}/promise", {"date": today_ist().isoformat(), "amount": 300})
    move_promise_date(customer["id"], today_ist() - timedelta(days=2))

    partly = api.post(f"/api/customers/{customer['id']}/payments", {"amount": 100, "method": "upi"}, status=201)
    assert partly["outstanding"] == 200
    still = api.customer(customer["id"])
    assert still["promise_date"] is not None and still["promise_overdue"] is True

    api.post(f"/api/customers/{customer['id']}/payments", {"amount": 200, "method": "upi"}, status=201)
    settled = api.customer(customer["id"])
    assert (settled["outstanding"], settled["promise_date"], settled["promise_amount"], settled["promise_overdue"]) == (0, None, None, False)


def test_promise_clears_itself_when_order_payments_settle_the_dues(api: Api) -> None:
    customer = api.create_customer()
    order = api.create_order([custom_item(80)], customer_id=customer["id"], status="ready")
    api.put(f"/api/customers/{customer['id']}/promise", {"date": (today_ist() + timedelta(days=1)).isoformat(), "note": "Tomorrow"})
    api.pay_order(order["id"], 80, "cash")
    settled = api.customer(customer["id"])
    assert (settled["promise_date"], settled["promise_note"], settled["promise_overdue"]) == (None, "", False)


# ---------------------------------------------------------------------------
# Lists
# ---------------------------------------------------------------------------


def test_customer_list_search_filters_and_sorting(api: Api) -> None:
    zoya = api.create_customer(name="Zoya Shaikh", phone="7020011111")
    amit = api.create_customer(name="amit Bhosale", phone="7020022222")
    kavya = api.create_customer(name="Kavya Nair", phone="7020033333")
    api.create_customer(name="Ravi Quiet", phone="7020044444")

    api.create_order([custom_item(50)], customer_id=amit["id"], status="collected")  # oldest order, ₹50 due
    api.create_order([custom_item(300)], customer_id=zoya["id"])  # ₹300 due
    api.create_order([custom_item(20)], customer_id=kavya["id"], payment={"amount": 20, "method": "cash"})  # newest, paid
    api.put(f"/api/customers/{amit['id']}/promise", {"date": (today_ist() + timedelta(days=2)).isoformat()})

    def names(**params: str) -> list[str]:
        return [c["name"] for c in api.get("/api/customers", params=params)]

    assert names() == ["amit Bhosale", "Kavya Nair", "Ravi Quiet", "Zoya Shaikh"]  # by name, case-insensitive
    assert names(sort="name") == names()
    assert names(sort="outstanding")[:2] == ["Zoya Shaikh", "amit Bhosale"]
    assert names(sort="recent")[:3] == ["Kavya Nair", "Zoya Shaikh", "amit Bhosale"]
    assert names(sort="recent")[-1] == "Ravi Quiet"
    assert names(filter="all") == names()
    assert names(filter="dues") == ["amit Bhosale", "Zoya Shaikh"]
    assert names(filter="promises") == ["amit Bhosale"]
    assert names(search="nair") == ["Kavya Nair"]
    assert names(search="0033333") == ["Kavya Nair"]
    assert names(search="nobody") == []
    assert api.raw("GET", "/api/customers", params={"filter": "vip"}).status_code == 422
    assert api.raw("GET", "/api/customers", params={"sort": "age"}).status_code == 422


def test_recent_sort_breaks_timestamp_ties_by_the_later_order(api: Api) -> None:
    # The server clock can tick coarsely (about 16 ms on Windows), so two orders created
    # back to back may share a timestamp; the later order must still count as more recent.
    # Names sort the opposite way, so a name-order fallback would give the wrong answer.
    zubin = api.create_customer(name="Zubin Later")
    aarti = api.create_customer(name="Aarti Earlier")
    older = api.create_order([custom_item(10)], customer_id=aarti["id"])
    newer = api.create_order([custom_item(10)], customer_id=zubin["id"])
    same_moment = at_ist(today_ist(), 10, 0, 0)
    backdate("Order", older["id"], created_at=same_moment)
    backdate("Order", newer["id"], created_at=same_moment)

    recent = [c["name"] for c in api.get("/api/customers", params={"sort": "recent"})]
    assert recent == ["Zubin Later", "Aarti Earlier"]



def test_search_finds_a_phone_typed_the_way_the_app_shows_it(api: Api) -> None:
    customer = api.create_customer(name="Display Dinesh", phone="9876543210")
    assert customer["phone"] == "+91 98765 43210"
    order = api.create_order([custom_item(10)], customer_id=customer["id"])
    for typed in ("+91 98765", "+91 98765 43210", "+919876543210", "98765 43210", "09876543210", "+91-98765"):
        assert [c["id"] for c in api.get("/api/customers", params={"search": typed})] == [customer["id"]], typed
        assert [c["id"] for c in api.get("/api/search", params={"q": typed})["customers"]] == [customer["id"]], typed
        assert [o["id"] for o in api.get("/api/orders", params={"search": typed})["items"]] == [order["id"]], typed
