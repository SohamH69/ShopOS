"""Dashboard metrics, the attention queue and reports, on controlled fresh shops.

Derived from SPEC section 2 ("Dashboard metrics" table, "Time") and the Dashboard / Report
shapes in types.ts. Orders and payments that must sit on either side of IST midnight are
created through the API and then backdated (see ``api_helpers.backdate_order``).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api_helpers import (
    Api,
    at_ist,
    backdate_order,
    custom_item,
    line,
    move_promise_date,
    now_ist,
    today_ist,
)
from conftest import ShopAccount, StaffAccount

SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


def by_key(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {item["key"]: item for item in items}


def day_label(day: date) -> str:
    return f"{day.day} {day.strftime('%b')}"


# ---------------------------------------------------------------------------
# A busy day in a controlled shop
# ---------------------------------------------------------------------------


@dataclass
class BusyDay:
    api: Api
    orders: dict[str, dict[str, Any]]
    products: dict[str, dict[str, Any]]


@pytest.fixture
def busy_day(api: Api) -> BusyDay:
    today = today_ist()
    yesterday = today - timedelta(days=1)

    rice = api.create_product(name="Rice", stock_quantity=10, min_stock_level=2)
    sugar = api.create_product(name="Sugar", stock_quantity=1, min_stock_level=5)
    salt = api.create_product(name="Salt", stock_quantity=0, min_stock_level=0)
    old_soap = api.create_product(name="Old Soap", stock_quantity=0, min_stock_level=5)
    api.delete(f"/api/products/{old_soap['id']}")

    asha = api.create_customer(name="Asha")
    bala = api.create_customer(name="Bala")
    chitra = api.create_customer(name="Chitra")

    orders = {
        "ready_unpaid": api.create_order([custom_item(100)], customer_id=asha["id"], status="ready"),
        "late_pickup": api.create_order(
            [custom_item(50)],
            customer_id=bala["id"],
            due_at=(now_ist() - timedelta(hours=2)).isoformat(),
            payment={"amount": 50, "method": "cash"},
        ),
        "counter_sale": api.create_order([custom_item(30)], status="collected", payment={"amount": 30, "method": "upi"}),
        "delivery": api.create_order(
            [custom_item(70)],
            customer_id=chitra["id"],
            fulfillment="delivery",
            delivery_address="Lane 7, Aundh",
            status="preparing",
            payment={"amount": 20, "method": "upi"},
        ),
        "cancelled": api.create_order([custom_item(40)], customer_id=asha["id"]),
        "last_night": api.create_order(
            [custom_item(500)], customer_id=bala["id"], status="collected", payment={"amount": 200, "method": "card"}
        ),
        "after_midnight": api.create_order(
            [custom_item(60)], customer_id=chitra["id"], status="collected", payment={"amount": 60, "method": "cash"}
        ),
    }
    api.set_status(orders["cancelled"]["id"], "cancelled")
    backdate_order(api, orders["last_night"], at_ist(yesterday, 23, 59, 30))
    backdate_order(api, orders["after_midnight"], at_ist(today, 0, 0, 30))

    api.create_expense(category="rent", amount=120)
    api.create_expense(category="miscellaneous", amount=15, spent_at=at_ist(today, 0, 0, 30).isoformat())
    api.create_expense(category="miscellaneous", amount=999, spent_at=at_ist(yesterday, 23, 59, 30).isoformat())

    api.create_supplier(opening_balance=800)
    api.create_supplier(opening_balance=0)

    # Asha promised (no amount) and the date has passed; Bala promised ₹120, also passed;
    # Chitra's promise is for tomorrow.
    api.put(f"/api/customers/{asha['id']}/promise", {"date": today.isoformat()})
    move_promise_date(asha["id"], yesterday)
    api.put(f"/api/customers/{bala['id']}/promise", {"date": today.isoformat(), "amount": 120})
    move_promise_date(bala["id"], today - timedelta(days=3))
    api.put(f"/api/customers/{chitra['id']}/promise", {"date": (today + timedelta(days=1)).isoformat()})

    return BusyDay(api, orders, {"rice": rice, "sugar": sugar, "salt": salt})


def test_dashboard_metrics_add_up_with_ist_day_boundaries(busy_day: BusyDay) -> None:
    dashboard = busy_day.api.dashboard()
    assert dashboard["date"] == today_ist().isoformat()
    assert dashboard["metrics"] == {
        "sales": 310,  # 100 + 50 + 30 + 70 + 60 (00:00:30 IST today); cancelled and last night excluded
        "orders": 5,
        "payments_received": 160,  # 50 + 30 + 20 + 60
        "outstanding": 450,  # Asha 100, Bala 300, Chitra 50
        "pending_pickups": 2,
        "pending_deliveries": 1,
        "low_stock": 2,  # Sugar and Salt; the archived soap never counts
        "expenses": 135,  # 120 + 15 (00:00:30 IST today); 23:59:30 last night excluded
        "yesterday_sales": 500,
        "yesterday_orders": 1,
        "yesterday_payments": 200,
    }


def test_dashboard_attention_items_follow_the_spec_table(busy_day: BusyDay) -> None:
    attention = busy_day.api.dashboard()["attention"]
    items = by_key(attention)
    assert items == {
        "pickups": {
            "key": "pickups", "label": "orders waiting for pickup", "count": 2, "amount": None,
            "detail": "1 overdue", "severity": "high", "href": "/app/pickups",
        },
        "ready_unpaid": {
            "key": "ready_unpaid", "label": "ready order not yet paid", "count": 1, "amount": 100,
            "detail": None, "severity": "medium", "href": "/app/pickups",
        },
        "customer_dues": {
            "key": "customer_dues", "label": "customer dues", "count": 3, "amount": 450,
            "detail": "across 3 customers", "severity": "high", "href": "/app/customers?filter=dues",
        },
        "promises": {
            "key": "promises", "label": "payment promises overdue", "count": 2, "amount": 220,
            "detail": None, "severity": "high", "href": "/app/customers?filter=promises",
        },
        "low_stock": {
            "key": "low_stock", "label": "products running low", "count": 2, "amount": None,
            "detail": "1 out of stock", "severity": "medium", "href": "/app/products?filter=low",
        },
        "deliveries": {
            "key": "deliveries", "label": "delivery pending", "count": 1, "amount": None,
            "detail": None, "severity": "medium", "href": "/app/pickups?tab=deliveries",
        },
        "supplier_dues": {
            "key": "supplier_dues", "label": "supplier payment due", "count": 1, "amount": 800,
            "detail": None, "severity": "low", "href": "/app/suppliers?filter=due",
        },
    }
    ranks = [SEVERITY_RANK[item["severity"]] for item in attention]
    assert ranks == sorted(ranks)
    assert busy_day.api.get("/api/attention") == attention


def test_dashboard_lists_and_the_seven_day_series(busy_day: BusyDay) -> None:
    api, orders = busy_day.api, busy_day.orders
    dashboard = api.dashboard()

    assert [o["id"] for o in dashboard["pickups"]] == [orders["ready_unpaid"]["id"], orders["late_pickup"]["id"]]
    newest_first = [orders[k]["id"] for k in ("cancelled", "delivery", "counter_sale", "late_pickup", "ready_unpaid", "after_midnight", "last_night")]
    recent = [o["id"] for o in dashboard["recent_orders"]]
    assert recent in (newest_first, [i for i in newest_first if i != orders["cancelled"]["id"]])
    assert [p["id"] for p in dashboard["low_stock"]] == [busy_day.products["salt"]["id"], busy_day.products["sugar"]["id"]]

    series = dashboard["sales_7d"]
    today = today_ist()
    assert [p["date"] for p in series] == [(today - timedelta(days=6 - i)).isoformat() for i in range(7)]
    assert series[-1] == {"date": today.isoformat(), "sales": 310, "orders": 5}
    assert series[-2] == {"date": (today - timedelta(days=1)).isoformat(), "sales": 500, "orders": 1}
    assert all(p["sales"] == 0 and p["orders"] == 0 for p in series[:-2])
    assert dashboard["setup"] == {"has_products": True, "has_customers": True, "has_orders": True, "has_staff": False}

    # Reports bucket the same orders into the same IST days.
    report_series = api.get("/api/reports", params={"range": "7d"})["series"]
    assert [(p["start"], p["sales"], p["orders"]) for p in report_series[-2:]] == [
        ((today - timedelta(days=1)).isoformat(), 500, 1),
        (today.isoformat(), 310, 5),
    ]


def test_empty_shop_dashboard_is_all_zeroes(api: Api) -> None:
    dashboard = api.dashboard()
    assert set(dashboard["metrics"].values()) == {0}
    assert dashboard["attention"] == [] and api.get("/api/attention") == []
    assert (dashboard["pickups"], dashboard["recent_orders"], dashboard["low_stock"]) == ([], [], [])
    assert len(dashboard["sales_7d"]) == 7 and all(p["sales"] == 0 for p in dashboard["sales_7d"])
    assert dashboard["setup"] == {"has_products": False, "has_customers": False, "has_orders": False, "has_staff": False}


def test_setup_progress_tracks_first_records(
    client: TestClient, owner: ShopAccount, create_staff: Callable[..., StaffAccount]
) -> None:
    api = Api(client, owner.headers)
    api.create_product(stock_quantity=5)
    assert api.dashboard()["setup"] == {"has_products": True, "has_customers": False, "has_orders": False, "has_staff": False}
    customer = api.create_customer()
    api.create_order([custom_item(10)], customer_id=customer["id"])
    create_staff(owner.headers, "employee")
    assert api.dashboard()["setup"] == {"has_products": True, "has_customers": True, "has_orders": True, "has_staff": True}


def test_attention_labels_are_singular_for_one_and_severity_rules(api: Api) -> None:
    customer = api.create_customer()
    api.create_order([custom_item(10)], customer_id=customer["id"])  # new pickup, not overdue
    api.create_order(
        [custom_item(20)],
        customer_id=customer["id"],
        fulfillment="delivery",
        delivery_address="Plot 9",
        due_at=(now_ist() - timedelta(hours=1)).isoformat(),
    )
    api.create_product(stock_quantity=2, min_stock_level=5)
    api.create_supplier(opening_balance=100)
    api.create_supplier(opening_balance=250)
    api.put(f"/api/customers/{customer['id']}/promise", {"date": today_ist().isoformat(), "amount": 25})
    move_promise_date(customer["id"], today_ist() - timedelta(days=1))

    attention = api.get("/api/attention")
    items = by_key(attention)
    assert set(items) == {"pickups", "deliveries", "customer_dues", "promises", "low_stock", "supplier_dues"}
    assert (items["pickups"]["label"], items["pickups"]["count"], items["pickups"]["detail"], items["pickups"]["severity"]) == (
        "order waiting for pickup", 1, None, "medium",
    )
    assert (items["deliveries"]["label"], items["deliveries"]["detail"], items["deliveries"]["severity"]) == (
        "delivery pending", "1 overdue", "high",
    )
    assert (items["customer_dues"]["label"], items["customer_dues"]["count"], items["customer_dues"]["amount"]) == ("customer dues", 1, 30)
    assert items["customer_dues"]["detail"] == "across 1 customer"
    assert (items["promises"]["label"], items["promises"]["count"], items["promises"]["amount"]) == ("payment promise overdue", 1, 25)
    assert (items["low_stock"]["label"], items["low_stock"]["detail"]) == ("product running low", None)
    assert (items["supplier_dues"]["label"], items["supplier_dues"]["count"], items["supplier_dues"]["amount"]) == (
        "supplier payments due", 2, 350,
    )
    ranks = [SEVERITY_RANK[item["severity"]] for item in attention]
    assert ranks == sorted(ranks)


def test_a_ready_pickup_makes_the_pickup_item_urgent(api: Api) -> None:
    customer = api.create_customer()
    api.create_order([custom_item(10)], customer_id=customer["id"], status="ready", payment={"amount": 10, "method": "cash"})
    api.create_order([custom_item(10)], customer_id=customer["id"], status="preparing", payment={"amount": 10, "method": "cash"})
    items = by_key(api.get("/api/attention"))
    assert set(items) == {"pickups"}
    assert (items["pickups"]["count"], items["pickups"]["severity"], items["pickups"]["detail"]) == (2, "high", None)


def test_dashboard_lists_are_capped(api: Api) -> None:
    customer = api.create_customer()
    statuses = ["new", "new", "preparing", "ready", "new", "ready", "new", "preparing", "new"]
    created = [api.create_order([custom_item(10)], customer_id=customer["id"], status=s) for s in statuses]
    for i in range(6):
        api.create_product(name=f"Low {i}", stock_quantity=i, min_stock_level=10)

    dashboard = api.dashboard()
    pickups = dashboard["pickups"]
    assert len(pickups) == 6
    assert [o["status"] for o in pickups[:2]] == ["ready", "ready"]
    assert [o["id"] for o in dashboard["recent_orders"]] == [o["id"] for o in reversed(created)][:8]
    assert [p["name"] for p in dashboard["low_stock"]] == ["Low 0", "Low 1", "Low 2", "Low 3", "Low 4"]
    assert dashboard["metrics"]["low_stock"] == 6


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


@dataclass
class ReportShop:
    api: Api
    ids: dict[str, int]


@pytest.fixture
def report_shop(api: Api) -> ReportShop:
    today = today_ist()
    basmati = api.create_product(name="Basmati Rice", category="Staples", unit="kg", stock_quantity=100, purchase_price=40, selling_price=50)
    peanuts = api.create_product(name="Masala Peanuts", category="Snacks", stock_quantity=100, purchase_price=10, selling_price=15)
    slow = api.create_product(name="Slow Seller", category="Snacks", stock_quantity=10, purchase_price=5, selling_price=8)
    asha = api.create_customer(name="Asha Rao")
    bala = api.create_customer(name="Bala Iyer")

    api.create_order([line(basmati, 2), line(peanuts, 4)], customer_id=asha["id"], status="collected", payment={"amount": 160, "method": "cash"})
    api.create_order([line(basmati, 1, discount=5)], customer_id=bala["id"])
    cancelled = api.create_order([line(basmati, 10)], customer_id=asha["id"])
    api.set_status(cancelled["id"], "cancelled")
    api.create_order([custom_item(10, name="Carry bag")], status="collected", payment={"amount": 10, "method": "upi"})
    api.create_order([line(peanuts, 2)], customer_id=asha["id"], status="ready", payment={"amount": 10, "method": "card"})
    api.create_expense(category="rent", amount=20)
    # Ten days ago: outside the 7-day range, inside the 7 days before it and inside 30 days.
    older = api.create_order([custom_item(77)], customer_id=bala["id"], status="collected", payment={"amount": 77, "method": "cash"})
    backdate_order(api, older, at_ist(today - timedelta(days=10), 12))
    # Changing the cost price later must not rewrite the profit of past sales.
    api.patch(f"/api/products/{basmati['id']}", {"purchase_price": 45})
    return ReportShop(api, {"basmati": basmati["id"], "peanuts": peanuts["id"], "slow": slow["id"], "asha": asha["id"], "bala": bala["id"]})


def test_report_totals_profit_and_breakdowns(report_shop: ReportShop) -> None:
    api, ids = report_shop.api, report_shop.ids
    today = today_ist()
    report = api.get("/api/reports", params={"range": "7d"})

    assert (report["range"], report["bucket"]) == ("7d", "day")
    assert (report["date_from"], report["date_to"]) == ((today - timedelta(days=6)).isoformat(), today.isoformat())
    assert report["totals"] == {
        "sales": 245,  # 160 + 45 + 10 + 30
        "orders": 4,
        "avg_order_value": 61.25,
        "gross_profit": 65,  # (100-80) + (60-40) + (45-40) + 10 + (30-20), at order-time cost prices
        "payments_received": 180,
        "expenses": 20,
        "net_profit": 45,
    }
    assert report["previous"] == {"sales": 77, "orders": 1}

    products = [(p["product_id"], p["name"], p["quantity"], p["sales"], p["profit"]) for p in report["by_product"]]
    assert products == [
        (ids["basmati"], "Basmati Rice", 3, 145, 25),
        (ids["peanuts"], "Masala Peanuts", 6, 90, 30),
        (None, "Carry bag", 1, 10, 10),
    ]
    categories = {c["category"]: (c["quantity"], c["sales"]) for c in report["by_category"]}
    assert (categories["Staples"], categories["Snacks"]) == ((3, 145), (6, 90))
    assert [c["sales"] for c in report["by_category"]] == sorted((c["sales"] for c in report["by_category"]), reverse=True)

    customers = report["customers"]
    assert [(c["id"], c["total"], c["orders"]) for c in customers["top"]] == [(ids["asha"], 190, 2), (ids["bala"], 45, 1)]
    assert (customers["new_count"], customers["repeat_count"], customers["active_count"]) == (2, 1, 2)
    assert [(c["id"], c["outstanding"]) for c in customers["with_dues"]] == [(ids["bala"], 45), (ids["asha"], 20)]

    payments = report["payments"]
    assert (payments["received"], payments["outstanding"], payments["partial_orders"]) == (180, 65, 1)
    assert {m["method"]: (m["amount"], m["count"]) for m in payments["by_method"]} == {"cash": (160, 1), "upi": (10, 1), "card": (10, 1)}

    inventory = report["inventory"]
    assert [p["product_id"] for p in inventory["fast_moving"][:2]] == [ids["peanuts"], ids["basmati"]]
    assert (inventory["slow_moving"][0]["product_id"], inventory["slow_moving"][0]["quantity"]) == (ids["slow"], 0)
    assert inventory["low_stock"] == []
    assert report["expenses"] == {"total": 20, "by_category": [{"category": "rent", "amount": 20, "count": 1}]}


def test_report_30_days_includes_the_older_order(report_shop: ReportShop) -> None:
    report = report_shop.api.get("/api/reports", params={"range": "30d"})
    totals = report["totals"]
    assert (totals["sales"], totals["orders"], totals["gross_profit"], totals["payments_received"]) == (322, 5, 142, 257)
    assert totals["net_profit"] == 122
    assert report["previous"] == {"sales": 0, "orders": 0}
    assert report_shop.api.get("/api/reports") == report  # 30d is the default


def test_gross_profit_takes_order_discounts_off(api: Api) -> None:
    # types.ts describes gross profit per line; an order-level discount also comes off it so
    # that gross profit stays equal to sales minus the cost of the goods sold.
    dal = api.create_product(name="Chana Dal", stock_quantity=10, purchase_price=40, selling_price=50)
    customer = api.create_customer()
    api.create_order([line(dal, 2)], customer_id=customer["id"], discount=10)
    report = api.get("/api/reports", params={"range": "7d"})
    assert report["totals"]["sales"] == 90
    assert report["totals"]["gross_profit"] == 10  # 90 sales - 80 cost
    assert report["by_product"][0]["profit"] == 20  # per line: 100 - 80


@pytest.mark.parametrize(
    "range_, bucket, days",
    [("7d", "day", 7), ("30d", "day", 30), ("90d", "week", 90), ("12m", "month", None)],
)
def test_report_series_are_zero_filled_buckets(api: Api, range_: str, bucket: str, days: int | None) -> None:
    customer = api.create_customer()
    api.create_order([custom_item(25)], customer_id=customer["id"])
    report = api.get("/api/reports", params={"range": range_})
    series = report["series"]
    starts = [date.fromisoformat(p["start"]) for p in series]
    today = today_ist()

    assert report["bucket"] == bucket and report["date_to"] == today.isoformat()
    assert sum(p["sales"] for p in series) == report["totals"]["sales"] == 25
    assert sum(p["orders"] for p in series) == report["totals"]["orders"] == 1
    assert starts == sorted(starts)
    if bucket == "day":
        assert days is not None
        assert len(series) == days
        assert report["date_from"] == (today - timedelta(days=days - 1)).isoformat()
        assert starts == [today - timedelta(days=days - 1 - i) for i in range(days)]
        assert all(p["label"] == day_label(start) for p, start in zip(series, starts))
        assert series[-1]["sales"] == 25
    elif bucket == "week":
        date_from = date.fromisoformat(report["date_from"])
        assert date_from == today - timedelta(days=89)
        assert all(s.weekday() == 0 for s in starts)
        assert all(b - a == timedelta(days=7) for a, b in zip(starts, starts[1:]))
        assert starts[0] <= date_from < starts[0] + timedelta(days=7)
        assert starts[-1] <= today < starts[-1] + timedelta(days=7)
        assert len(series) in (13, 14)
        assert all(p["label"] == f"Week of {day_label(start)}" for p, start in zip(series, starts))
    else:
        assert len(series) == 12
        assert all(s.day == 1 for s in starts)
        assert starts[-1] == today.replace(day=1)
        months = [s.year * 12 + s.month for s in starts]
        assert months == list(range(months[0], months[0] + 12))
        assert all(p["label"] == start.strftime("%b %Y") for p, start in zip(series, starts))


def test_report_range_must_be_known(api: Api) -> None:
    assert api.raw("GET", "/api/reports", params={"range": "1y"}).status_code == 422


def test_month_buckets_follow_ist_midnight(api: Api) -> None:
    # 00:00:30 IST on the 1st is still the previous month in UTC (18:30 the day before).
    today = today_ist()
    first_of_month = today.replace(day=1)
    last_of_previous = first_of_month - timedelta(days=1)
    customer = api.create_customer()
    early = api.create_order([custom_item(11)], customer_id=customer["id"])
    late = api.create_order([custom_item(22)], customer_id=customer["id"])
    backdate_order(api, early, at_ist(first_of_month, 0, 0, 30))
    backdate_order(api, late, at_ist(last_of_previous, 23, 59, 30))

    series = {p["start"]: (p["sales"], p["orders"]) for p in api.get("/api/reports", params={"range": "12m"})["series"]}
    assert series[first_of_month.isoformat()] == (11, 1)
    assert series[last_of_previous.replace(day=1).isoformat()] == (22, 1)


def test_week_buckets_start_on_monday_ist(api: Api) -> None:
    today = today_ist()
    monday = today - timedelta(days=today.weekday())
    if monday == today:  # keep both moments in the past
        monday -= timedelta(days=7)
    sunday_before = monday - timedelta(days=1)
    customer = api.create_customer()
    monday_order = api.create_order([custom_item(33)], customer_id=customer["id"])
    sunday_order = api.create_order([custom_item(44)], customer_id=customer["id"])
    backdate_order(api, monday_order, at_ist(monday, 0, 0, 30))
    backdate_order(api, sunday_order, at_ist(sunday_before, 23, 59, 30))

    series = {p["start"]: (p["sales"], p["orders"]) for p in api.get("/api/reports", params={"range": "90d"})["series"]}
    assert series[monday.isoformat()] == (33, 1)
    assert series[(monday - timedelta(days=7)).isoformat()] == (44, 1)


def test_average_order_value_rounds_half_up_to_the_paise(api: Api) -> None:
    customer = api.create_customer()
    api.create_order([custom_item(5)], customer_id=customer["id"])
    api.create_order([custom_item(5.01)], customer_id=customer["id"])
    totals = api.get("/api/reports", params={"range": "7d"})["totals"]
    assert (totals["sales"], totals["orders"]) == (10.01, 2)
    assert totals["avg_order_value"] == 5.01  # 500.5 paise rounds up, not to even


def test_report_counts_only_the_callers_shop(api: Api, client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    neighbour = Api(client, signup_shop().headers)
    neighbour_customer = neighbour.create_customer()
    neighbour.create_order([custom_item(999)], customer_id=neighbour_customer["id"], payment={"amount": 999, "method": "upi"})
    neighbour.create_expense(category="rent", amount=5000)
    report = api.get("/api/reports", params={"range": "7d"})
    assert report["totals"] == {
        "sales": 0, "orders": 0, "avg_order_value": 0, "gross_profit": 0,
        "payments_received": 0, "expenses": 0, "net_profit": 0,
    }
    assert report["customers"]["top"] == [] and report["payments"]["outstanding"] == 0
    assert api.dashboard()["metrics"]["sales"] == 0


def test_report_lists_are_capped(api: Api) -> None:
    products = [api.create_product(name=f"Item {i:02d}", stock_quantity=100, selling_price=10 + i) for i in range(17)]
    customers = [api.create_customer(name=f"Buyer {i:02d}") for i in range(11)]
    for index, product in enumerate(products):
        api.create_order([line(product, 1)], customer_id=customers[index % len(customers)]["id"])

    report = api.get("/api/reports", params={"range": "7d"})
    assert len(report["by_product"]) == 15
    assert [p["name"] for p in report["by_product"][:2]] == ["Item 16", "Item 15"]  # sales desc
    assert len(report["customers"]["top"]) == 8
    assert len(report["customers"]["with_dues"]) == 10
    dues = [c["outstanding"] for c in report["customers"]["with_dues"]]
    assert dues == sorted(dues, reverse=True)
    assert len(report["inventory"]["fast_moving"]) == 8
    assert len(report["inventory"]["slow_moving"]) == 8
    assert report["customers"]["active_count"] == 11 and report["customers"]["repeat_count"] == 6
