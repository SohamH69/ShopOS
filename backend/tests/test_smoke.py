"""Smoke test: every endpoint in SPEC section 3, response keys checked against types.ts.

Reads run against the seeded demo shop. Writes create their own records in the demo shop
and tidy up after themselves (archive / cancel / restore) so the shared demo data keeps
looking like a busy shop for other test modules.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from conftest import TEST_PASSWORD, ShopAccount, StaffAccount, auth_headers, count_statements

# ---------------------------------------------------------------------------
# Expected keys, hand-copied from frontend/src/lib/types.ts
# ---------------------------------------------------------------------------

SHOP = {"id", "name", "owner_name", "phone", "email", "address", "city", "segment", "plan",
        "upi_id", "created_at"}
USER = {"id", "name", "email", "phone", "role", "is_active", "last_login_at", "created_at"}
SESSION = {"user", "shop", "permissions"}
AUTH_RESPONSE = SESSION | {"token"}
ROLE_PERMISSIONS = {"role", "permissions", "editable"}
CUSTOMER = {"id", "name", "phone", "address", "notes", "preferred_products", "total_purchases",
            "total_paid", "outstanding", "orders_count", "last_order_at", "last_order_total",
            "promise_date", "promise_amount", "promise_note", "promise_overdue", "created_at"}
LEDGER = {"customer_id", "entries", "outstanding"}
LEDGER_ENTRY = {"id", "date", "type", "description", "amount", "balance", "order_id",
                "order_number", "payment_id", "method"}
PAYMENT_ALLOCATION = {"order_id", "order_number", "amount"}
CUSTOMER_PAYMENT_RESULT = {"batch_id", "total", "allocations", "payments", "outstanding"}
PRODUCT = {"id", "name", "category", "unit", "sku", "stock_quantity", "min_stock_level",
           "reserved_quantity", "purchase_price", "selling_price", "low_stock", "stock_value",
           "margin_percent", "is_archived", "created_at", "updated_at"}
INVENTORY_TRANSACTION = {"id", "product_id", "product_name", "type", "quantity_change",
                         "stock_after", "reason", "note", "order_id", "order_number",
                         "purchase_id", "created_by_name", "created_at"}
ORDER_ITEM = {"id", "product_id", "name", "unit", "quantity", "unit_price", "discount",
              "line_total"}
ORDER = {"id", "number", "customer_id", "customer_name", "customer_phone", "status",
         "payment_status", "fulfillment", "channel", "due_at", "is_overdue", "delivery_address",
         "notes", "items", "item_count", "subtotal", "discount", "total", "paid", "outstanding",
         "created_at", "updated_at", "completed_at", "created_by_name"}
ORDER_DETAIL = ORDER | {"payments", "next_statuses", "stock_deducted"}
PAYMENT = {"id", "order_id", "order_number", "customer_id", "customer_name", "amount", "method",
           "note", "paid_at", "received_by_name", "batch_id"}
METHOD_TOTAL = {"method", "amount", "count"}
PAYMENT_SUMMARY = {"today", "week", "month", "by_method"}
SUPPLIER = {"id", "name", "phone", "contact_person", "address", "notes", "supplies",
            "outstanding", "total_purchased", "total_paid", "last_purchase_at", "created_at"}
SUPPLIER_DETAIL = SUPPLIER | {"purchases", "payments"}
PURCHASE_ITEM = {"product_id", "name", "quantity", "unit_cost", "line_total"}
PURCHASE = {"id", "supplier_id", "supplier_name", "items", "total", "note", "purchased_at",
            "created_by_name"}
SUPPLIER_PAYMENT = {"id", "supplier_id", "amount", "method", "note", "paid_at"}
EXPENSE = {"id", "category", "amount", "note", "spent_at", "created_by_name"}
CATEGORY_TOTAL = {"category", "amount", "count"}
EXPENSE_SUMMARY = {"total", "by_category"}
ATTENTION_ITEM = {"key", "label", "count", "amount", "detail", "severity", "href"}
DASHBOARD_METRICS = {"sales", "orders", "payments_received", "outstanding", "pending_pickups",
                     "pending_deliveries", "low_stock", "expenses", "yesterday_sales",
                     "yesterday_orders", "yesterday_payments"}
DAILY_POINT = {"date", "sales", "orders"}
SETUP_PROGRESS = {"has_products", "has_customers", "has_orders", "has_staff"}
DASHBOARD = {"date", "metrics", "attention", "pickups", "recent_orders", "low_stock", "sales_7d",
             "setup"}
REPORT_TOTALS = {"sales", "orders", "avg_order_value", "gross_profit", "payments_received",
                 "expenses", "net_profit"}
SERIES_POINT = {"label", "start", "sales", "orders"}
PRODUCT_SALES = {"product_id", "name", "category", "quantity", "sales", "profit"}
CATEGORY_SALES = {"category", "quantity", "sales"}
TOP_CUSTOMER = {"id", "name", "phone", "total", "orders"}
CUSTOMER_DUE = {"id", "name", "phone", "outstanding"}
PRODUCT_MOVEMENT = {"product_id", "name", "unit", "quantity", "stock_quantity"}
REPORT = {"range", "date_from", "date_to", "bucket", "totals", "previous", "series", "by_product",
          "by_category", "customers", "payments", "inventory", "expenses"}
REPORT_PREVIOUS = {"sales", "orders"}
REPORT_CUSTOMERS = {"top", "new_count", "repeat_count", "active_count", "with_dues"}
REPORT_PAYMENTS = {"received", "outstanding", "partial_orders", "by_method"}
REPORT_INVENTORY = {"fast_moving", "slow_moving", "low_stock"}
SEARCH_RESULTS = {"customers", "orders", "products"}
IMPORT_RESULT = {"created", "updated", "skipped", "errors"}
IMPORT_ERROR = {"row", "message"}
PAGINATED = {"items", "total", "limit", "offset"}
OK = {"ok"}
OK_WITH_TOKEN = {"ok", "token"}
ERROR = {"detail"}

# ---------------------------------------------------------------------------
# Shape helpers
# ---------------------------------------------------------------------------

_ISO_DATETIME_WITH_OFFSET = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$")


def assert_keys(obj: Any, expected: set[str], where: str) -> None:
    assert isinstance(obj, dict), f"{where}: expected an object, got {type(obj).__name__}"
    actual = set(obj)
    assert actual == expected, (
        f"{where}: missing {sorted(expected - actual)}, unexpected {sorted(actual - expected)}"
    )


def assert_each(items: Iterable[Any], expected: set[str], where: str) -> None:
    for index, item in enumerate(items):
        assert_keys(item, expected, f"{where}[{index}]")


def assert_datetime(value: Any, where: str) -> None:
    assert isinstance(value, str) and _ISO_DATETIME_WITH_OFFSET.match(value), (
        f"{where}: {value!r} is not an ISO datetime with offset"
    )


def check_order(order: Any, where: str, *, detail: bool = False) -> None:
    assert_keys(order, ORDER_DETAIL if detail else ORDER, where)
    assert_each(order["items"], ORDER_ITEM, f"{where}.items")
    assert order["item_count"] == len(order["items"])
    assert_datetime(order["created_at"], f"{where}.created_at")
    if detail:
        assert_each(order["payments"], PAYMENT, f"{where}.payments")


def check_orders(orders: Iterable[Any], where: str) -> None:
    for index, order in enumerate(orders):
        check_order(order, f"{where}[{index}]")


def check_supplier_detail(detail: Any, where: str) -> None:
    assert_keys(detail, SUPPLIER_DETAIL, where)
    for index, purchase in enumerate(detail["purchases"]):
        assert_keys(purchase, PURCHASE, f"{where}.purchases[{index}]")
        assert_each(purchase["items"], PURCHASE_ITEM, f"{where}.purchases[{index}].items")
    assert_each(detail["payments"], SUPPLIER_PAYMENT, f"{where}.payments")


def check_report(report: Any, where: str) -> None:
    assert_keys(report, REPORT, where)
    assert_keys(report["totals"], REPORT_TOTALS, f"{where}.totals")
    assert_keys(report["previous"], REPORT_PREVIOUS, f"{where}.previous")
    assert_each(report["series"], SERIES_POINT, f"{where}.series")
    assert_each(report["by_product"], PRODUCT_SALES, f"{where}.by_product")
    assert_each(report["by_category"], CATEGORY_SALES, f"{where}.by_category")
    customers = report["customers"]
    assert_keys(customers, REPORT_CUSTOMERS, f"{where}.customers")
    assert_each(customers["top"], TOP_CUSTOMER, f"{where}.customers.top")
    assert_each(customers["with_dues"], CUSTOMER_DUE, f"{where}.customers.with_dues")
    payments = report["payments"]
    assert_keys(payments, REPORT_PAYMENTS, f"{where}.payments")
    assert_each(payments["by_method"], METHOD_TOTAL, f"{where}.payments.by_method")
    inventory = report["inventory"]
    assert_keys(inventory, REPORT_INVENTORY, f"{where}.inventory")
    assert_each(inventory["fast_moving"], PRODUCT_MOVEMENT, f"{where}.inventory.fast_moving")
    assert_each(inventory["slow_moving"], PRODUCT_MOVEMENT, f"{where}.inventory.slow_moving")
    assert_each(inventory["low_stock"], PRODUCT, f"{where}.inventory.low_stock")
    assert_keys(report["expenses"], EXPENSE_SUMMARY, f"{where}.expenses")
    assert_each(report["expenses"]["by_category"], CATEGORY_TOTAL, f"{where}.expenses.by_category")


def ok(response: Any, status: int = 200) -> Any:
    assert response.status_code == status, f"{response.status_code}: {response.text}"
    return response.json()


def error(response: Any, status: int) -> str:
    assert response.status_code == status, f"{response.status_code}: {response.text}"
    body = response.json()
    assert_keys(body, ERROR, "error body")
    assert isinstance(body["detail"], str) and body["detail"].endswith(".")
    return str(body["detail"])


def first_product(client: TestClient, headers: dict[str, str]) -> dict[str, Any]:
    products = ok(client.get("/api/products", headers=headers, params={"low_stock": "false"}))
    return dict(products[0])


# ---------------------------------------------------------------------------
# Demo seed (private database, so other tests can't disturb it)
# ---------------------------------------------------------------------------


def test_demo_seed_looks_like_a_busy_shop() -> None:
    from collections import Counter

    from sqlalchemy import select
    from sqlalchemy.orm import Session

    from app import models
    from app.db import Base, create_db_engine
    from app.seed import seed_demo_shop
    from app.services.customers import dues_by_customer
    from app.services.dashboard import build_dashboard

    engine = create_db_engine("sqlite://")
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as db:
            shop = seed_demo_shop(db)
            dashboard = build_dashboard(db, shop.id)
            orders = db.scalars(select(models.Order).where(models.Order.shop_id == shop.id)).all()
            products = db.scalars(select(models.Product).where(models.Product.shop_id == shop.id)).all()
            customers = db.scalars(select(models.Customer).where(models.Customer.shop_id == shop.id)).all()
            payments = db.scalars(select(models.Payment).where(models.Payment.shop_id == shop.id)).all()
            dues = dues_by_customer(db, shop.id)
            users = db.scalars(select(models.User).where(models.User.shop_id == shop.id)).all()
    finally:
        engine.dispose()

    assert shop.name == "Raj Local Mart" and shop.plan == "basic" and shop.is_demo
    assert sorted(user.role for user in users) == ["accountant", "employee", "manager", "owner"]
    assert len(products) == 36 and len(customers) == 30
    assert 200 <= len(orders) <= 240
    channels = Counter(order.channel for order in orders)
    assert 0.45 <= channels["walk_in"] / len(orders) <= 0.62
    assert 0.15 <= sum(order.fulfillment == "delivery" for order in orders) / len(orders) <= 0.30
    assert sum(order.status == "cancelled" for order in orders) / len(orders) <= 0.05
    assert all(order.stock_deducted for order in orders if order.status in ("collected", "delivered"))
    upi_share = sum(payment.method == "upi" for payment in payments) / len(payments)
    assert 0.45 <= upi_share <= 0.65

    metrics = dashboard.metrics
    assert 25 <= metrics.orders <= 35
    assert metrics.pending_pickups >= 6 and metrics.pending_deliveries >= 2
    assert any(order.is_overdue for order in dashboard.pickups)
    assert 5 <= metrics.low_stock <= 6
    assert sum(product.stock_quantity == 0 for product in products) == 1
    assert 6 <= len(dues) <= 10
    promised = [customer for customer in customers if customer.promise_date is not None]
    assert len(promised) == 3
    attention = {item.key: item for item in dashboard.attention}
    assert attention["promises"].count == 1
    assert attention["supplier_dues"].count == 2
    assert {"pickups", "ready_unpaid", "customer_dues", "low_stock", "deliveries"} <= set(attention)


# ---------------------------------------------------------------------------
# Public endpoints and SPA serving
# ---------------------------------------------------------------------------


def test_health_and_unknown_api(client: TestClient) -> None:
    assert ok(client.get("/api/health")) == {"ok": True}
    assert error(client.get("/api/no-such-endpoint"), 404) == "Not found."
    assert error(client.get("/api/orders"), 401) == "Sign in to continue."
    response = client.get("/api/orders", headers=auth_headers("not-a-token"))
    assert error(response, 401) == "Sign in to continue."


def test_spa_serving(client: TestClient, frontend_dist: Path) -> None:
    index = client.get("/")
    assert index.status_code == 200 and "ShopOS" in index.text
    assert index.headers["cache-control"] == "no-cache"

    deep_link = client.get("/app/orders?order=12")
    assert deep_link.status_code == 200 and "<div id=root>" in deep_link.text

    worker = client.get("/sw.js")
    assert worker.status_code == 200
    assert worker.headers["cache-control"] == "no-cache"
    assert worker.headers["content-type"].startswith("text/javascript")

    asset = client.get("/assets/index-abc123.js")
    assert asset.status_code == 200
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"

    assert client.get("/manifest.webmanifest").headers["content-type"].startswith(
        "application/manifest+json"
    )
    assert client.get("/icons/icon-192.png").headers["content-type"] == "image/png"
    assert client.get("/assets/missing.js").status_code == 404
    traversal = client.get("/..%2F..%2Fconftest.py")
    assert traversal.status_code == 200 and "<div id=root>" in traversal.text


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def test_auth_endpoints(
    client: TestClient, signup_shop: Callable[..., ShopAccount], demo_auth: dict[str, Any]
) -> None:
    assert_keys(demo_auth, AUTH_RESPONSE, "demo")
    assert_keys(demo_auth["user"], USER, "demo.user")
    assert_keys(demo_auth["shop"], SHOP, "demo.shop")
    assert_datetime(demo_auth["shop"]["created_at"], "demo.shop.created_at")
    assert demo_auth["shop"]["name"] == "Raj Local Mart"
    assert demo_auth["user"]["email"] == "demo@shopos.app"
    assert set(demo_auth["permissions"]) >= {"dashboard", "settings", "staff"}

    account = signup_shop(shop_name="Smoke Test Stores")
    assert_keys(account.session, AUTH_RESPONSE, "signup")
    assert_keys(account.session["user"], USER, "signup.user")
    assert_keys(account.session["shop"], SHOP, "signup.shop")
    assert account.session["user"]["role"] == "owner"
    assert account.session["shop"]["plan"] == "free"

    login = ok(client.post("/api/auth/login", json={"identifier": account.email, "password": account.password}))
    assert_keys(login, AUTH_RESPONSE, "login")
    assert_keys(login["user"], USER, "login.user")
    assert_keys(login["shop"], SHOP, "login.shop")
    by_phone = ok(client.post("/api/auth/login", json={"identifier": f"+91 {account.phone}", "password": account.password}))
    assert by_phone["user"]["id"] == login["user"]["id"]

    me = ok(client.get("/api/auth/me", headers=auth_headers(login["token"])))
    assert_keys(me, SESSION, "me")
    assert_keys(me["user"], USER, "me.user")
    assert_keys(me["shop"], SHOP, "me.shop")

    wrong = client.post("/api/auth/login", json={"identifier": account.email, "password": "nope-nope"})
    assert error(wrong, 401) == "Phone/email or password is incorrect."

    changed = ok(
        client.post(
            "/api/auth/change-password",
            headers=account.headers,
            json={"current_password": account.password, "new_password": "brand-new-pass"},
        )
    )
    assert_keys(changed, OK_WITH_TOKEN, "change-password")
    assert changed["ok"] is True
    assert client.get("/api/auth/me", headers=account.headers).status_code == 401
    assert client.get("/api/auth/me", headers=auth_headers(changed["token"])).status_code == 200


def test_login_rate_limit(client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    account = signup_shop()
    for _ in range(5):
        response = client.post("/api/auth/login", json={"identifier": account.email, "password": "wrong-pass"})
        assert response.status_code == 401
    blocked = client.post(
        "/api/auth/login", json={"identifier": account.email.upper(), "password": account.password}
    )
    error(blocked, 429)


# ---------------------------------------------------------------------------
# Shop, staff and roles (demo shop, restored afterwards)
# ---------------------------------------------------------------------------


def test_shop_staff_and_roles(
    client: TestClient,
    demo_headers: dict[str, str],
    create_staff: Callable[..., StaffAccount],
    unique_phone: Callable[[], str],
) -> None:
    shop = ok(client.get("/api/shop", headers=demo_headers))
    assert_keys(shop, SHOP, "shop")
    assert shop["upi_id"] == "rajlocalmart@upi"
    patched = ok(client.patch("/api/shop", headers=demo_headers, json={"city": "Pune City"}))
    assert_keys(patched, SHOP, "shop patch")
    assert patched["city"] == "Pune City"
    ok(client.patch("/api/shop", headers=demo_headers, json={"city": shop["city"]}))

    users = ok(client.get("/api/users", headers=demo_headers))
    assert_each(users, USER, "users")
    assert users[0]["role"] == "owner"
    assert {"manager", "employee", "accountant"} <= {user["role"] for user in users}

    staff = create_staff(demo_headers, role="employee", phone=unique_phone())
    assert_keys(staff.user, USER, "users create")
    updated = ok(
        client.patch(
            f"/api/users/{staff.user['id']}",
            headers=demo_headers,
            json={"name": "Smoke Helper", "role": "employee"},
        )
    )
    assert_keys(updated, USER, "users patch")
    assert updated["name"] == "Smoke Helper"

    owner_id = users[0]["id"]
    error(client.patch(f"/api/users/{owner_id}", headers=demo_headers, json={"name": "X"}), 400)

    changed = ok(
        client.post(
            "/api/auth/change-password",
            headers=staff.headers,
            json={"current_password": TEST_PASSWORD, "new_password": "helper-pass-99"},
        )
    )
    assert_keys(changed, OK_WITH_TOKEN, "staff change-password")
    staff_headers = auth_headers(changed["token"])
    assert error(client.get("/api/expenses", headers=staff_headers), 403) == "You don't have access to expenses."
    assert ok(client.get("/api/search", headers=staff_headers, params={"q": "a"}))["products"] is not None

    roles = ok(client.get("/api/roles", headers=demo_headers))
    assert_each(roles, ROLE_PERMISSIONS, "roles")
    assert [role["role"] for role in roles] == ["owner", "manager", "employee", "accountant"]
    employee = next(role for role in roles if role["role"] == "employee")
    try:
        widened = ok(
            client.put(
                "/api/roles/employee",
                headers=demo_headers,
                json={"permissions": [*employee["permissions"], "expenses"]},
            )
        )
        assert_keys(widened, ROLE_PERMISSIONS, "roles put")
        assert "expenses" in widened["permissions"]
        assert client.get("/api/expenses", headers=staff_headers).status_code == 200
    finally:
        ok(client.put("/api/roles/employee", headers=demo_headers, json={"permissions": employee["permissions"]}))
    error(client.put("/api/roles/owner", headers=demo_headers, json={"permissions": []}), 400)

    turned_off = ok(client.patch(f"/api/users/{staff.user['id']}", headers=demo_headers, json={"is_active": False}))
    assert turned_off["is_active"] is False
    assert client.get("/api/auth/me", headers=staff_headers).status_code == 401
    denied = client.post("/api/auth/login", json={"identifier": staff.identifier, "password": "helper-pass-99"})
    assert error(denied, 403) == "This account is turned off. Ask the shop owner."


# ---------------------------------------------------------------------------
# Dashboard, attention, search, reports, exports (demo reads)
# ---------------------------------------------------------------------------


def test_dashboard_attention_and_search(client: TestClient, demo_headers: dict[str, str]) -> None:
    with count_statements() as statements:
        dashboard = ok(client.get("/api/dashboard", headers=demo_headers))
    assert statements.value <= 40, f"dashboard ran {statements.value} SQL statements"
    assert_keys(dashboard, DASHBOARD, "dashboard")
    assert_keys(dashboard["metrics"], DASHBOARD_METRICS, "dashboard.metrics")
    assert_each(dashboard["attention"], ATTENTION_ITEM, "dashboard.attention")
    check_orders(dashboard["pickups"], "dashboard.pickups")
    check_orders(dashboard["recent_orders"], "dashboard.recent_orders")
    assert_each(dashboard["low_stock"], PRODUCT, "dashboard.low_stock")
    assert_each(dashboard["sales_7d"], DAILY_POINT, "dashboard.sales_7d")
    assert_keys(dashboard["setup"], SETUP_PROGRESS, "dashboard.setup")

    # Seed realism is checked on a private database in test_demo_seed_looks_like_a_busy_shop;
    # here we only rely on facts other test modules can't plausibly undo.
    metrics = dashboard["metrics"]
    assert metrics["orders"] >= 1 and metrics["sales"] > 0
    assert metrics["pending_pickups"] >= 1 and metrics["low_stock"] >= 1
    assert len(dashboard["sales_7d"]) == 7
    assert dashboard["sales_7d"][-1]["date"] == dashboard["date"]
    assert len(dashboard["pickups"]) <= 6 and len(dashboard["recent_orders"]) <= 8
    assert len(dashboard["low_stock"]) <= 5
    assert all(dashboard["setup"].values())
    keys = [item["key"] for item in dashboard["attention"]]
    assert all(item["count"] > 0 for item in dashboard["attention"])
    severities = [item["severity"] for item in dashboard["attention"]]
    assert severities == sorted(severities, key=["high", "medium", "low"].index)

    attention = ok(client.get("/api/attention", headers=demo_headers))
    assert_each(attention, ATTENTION_ITEM, "attention")
    assert [item["key"] for item in attention] == keys

    results = ok(client.get("/api/search", headers=demo_headers, params={"q": "Rahul"}))
    assert_keys(results, SEARCH_RESULTS, "search")
    assert_each(results["customers"], CUSTOMER, "search.customers")
    check_orders(results["orders"], "search.orders")
    assert_each(results["products"], PRODUCT, "search.products")
    assert any(customer["name"] == "Rahul Sharma" for customer in results["customers"])
    number = dashboard["recent_orders"][0]["number"]
    by_number = ok(client.get("/api/search", headers=demo_headers, params={"q": f"#{number}"}))
    assert by_number["orders"][0]["number"] == number
    assert client.get("/api/search", headers=demo_headers, params={"q": ""}).status_code == 422


def test_reports_and_exports(client: TestClient, demo_headers: dict[str, str]) -> None:
    expected_points = {"7d": 7, "30d": 30}
    for range_ in ("7d", "30d", "90d", "12m"):
        report = ok(client.get("/api/reports", headers=demo_headers, params={"range": range_}))
        check_report(report, f"report {range_}")
        assert report["range"] == range_
        if range_ in expected_points:
            assert len(report["series"]) == expected_points[range_]
        if range_ == "12m":
            assert len(report["series"]) == 12 and report["bucket"] == "month"
        assert report["totals"]["sales"] == round(sum(point["sales"] for point in report["series"]), 2)
    assert client.get("/api/reports", headers=demo_headers, params={"range": "1y"}).status_code == 422

    for kind in ("orders", "customers", "products", "payments", "expenses"):
        response = client.get(f"/api/export/{kind}.csv", headers=demo_headers)
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/csv")
        disposition = response.headers["content-disposition"]
        assert re.fullmatch(rf'attachment; filename="shopos-{kind}-\d{{4}}-\d{{2}}-\d{{2}}\.csv"', disposition)
        lines = response.content.decode("utf-8-sig").strip().splitlines()
        assert len(lines) > 1
    assert client.get("/api/export/staff.csv", headers=demo_headers).status_code == 422


# ---------------------------------------------------------------------------
# Customers and khata
# ---------------------------------------------------------------------------


def test_customer_endpoints(
    client: TestClient, demo_headers: dict[str, str], unique_phone: Callable[[], str]
) -> None:
    customers = ok(client.get("/api/customers", headers=demo_headers))
    assert_each(customers, CUSTOMER, "customers")
    assert len(customers) >= 25
    dues = ok(client.get("/api/customers", headers=demo_headers, params={"filter": "dues", "sort": "outstanding"}))
    assert dues and all(customer["outstanding"] > 0 for customer in dues)
    assert [c["outstanding"] for c in dues] == sorted((c["outstanding"] for c in dues), reverse=True)
    promises = ok(client.get("/api/customers", headers=demo_headers, params={"filter": "promises"}))
    assert all(customer["promise_date"] is not None for customer in promises)
    assert client.get("/api/customers", headers=demo_headers, params={"filter": "vip"}).status_code == 422

    phone = unique_phone()
    created = ok(
        client.post(
            "/api/customers",
            headers=demo_headers,
            json={"name": "Smoke Customer", "phone": phone, "address": "Lane 1, Model Colony"},
        ),
        201,
    )
    assert_keys(created, CUSTOMER, "customer create")
    assert created["outstanding"] == 0 and created["orders_count"] == 0
    duplicate = client.post("/api/customers", headers=demo_headers, json={"name": "Dup", "phone": f"+91 {phone}"})
    assert error(duplicate, 409) == "A customer with this phone number already exists."
    customer_id = created["id"]

    fetched = ok(client.get(f"/api/customers/{customer_id}", headers=demo_headers))
    assert_keys(fetched, CUSTOMER, "customer get")
    patched = ok(client.patch(f"/api/customers/{customer_id}", headers=demo_headers,
                              json={"notes": "Prefers evening pickups.", "preferred_products": ["Sugar"]}))
    assert_keys(patched, CUSTOMER, "customer patch")
    assert patched["preferred_products"] == ["Sugar"]

    product = first_product(client, demo_headers)
    first = ok(client.post("/api/orders", headers=demo_headers, json={
        "customer_id": customer_id, "items": [{"product_id": product["id"], "quantity": 2}],
        "status": "collected", "payment": {"amount": 10, "method": "cash"},
    }), 201)
    second = ok(client.post("/api/orders", headers=demo_headers, json={
        "customer_id": customer_id, "items": [{"name": "Coriander bunch", "quantity": 1, "unit_price": 20}],
    }), 201)
    due = round(first["total"] - 10 + second["total"], 2)

    ledger = ok(client.get(f"/api/customers/{customer_id}/ledger", headers=demo_headers))
    assert_keys(ledger, LEDGER, "ledger")
    assert_each(ledger["entries"], LEDGER_ENTRY, "ledger.entries")
    assert ledger["outstanding"] == due
    assert [entry["type"] for entry in ledger["entries"]] == ["purchase", "payment", "purchase"]
    assert ledger["entries"][1]["amount"] == -10

    customer_orders = ok(client.get(f"/api/customers/{customer_id}/orders", headers=demo_headers))
    check_orders(customer_orders, "customer orders")
    assert [order["id"] for order in customer_orders] == [second["id"], first["id"]]
    customer_payments = ok(client.get(f"/api/customers/{customer_id}/payments", headers=demo_headers))
    assert_each(customer_payments, PAYMENT, "customer payments")
    assert len(customer_payments) == 1

    promise_date = (date.today() + timedelta(days=3)).isoformat()
    promised = ok(client.put(f"/api/customers/{customer_id}/promise", headers=demo_headers,
                             json={"date": promise_date, "amount": 5, "note": "Friday"}))
    assert_keys(promised, CUSTOMER, "promise put")
    assert promised["promise_date"] == promise_date and promised["promise_amount"] == 5
    cleared = ok(client.delete(f"/api/customers/{customer_id}/promise", headers=demo_headers))
    assert_keys(cleared, CUSTOMER, "promise delete")
    assert cleared["promise_date"] is None

    blocked = client.delete(f"/api/customers/{customer_id}", headers=demo_headers)
    error(blocked, 409)
    too_much = client.post(f"/api/customers/{customer_id}/payments", headers=demo_headers,
                           json={"amount": due + 1, "method": "upi"})
    error(too_much, 400)
    settled = ok(client.post(f"/api/customers/{customer_id}/payments", headers=demo_headers,
                             json={"amount": due, "method": "upi", "note": "Settled"}), 201)
    assert_keys(settled, CUSTOMER_PAYMENT_RESULT, "customer payment")
    assert_each(settled["allocations"], PAYMENT_ALLOCATION, "customer payment.allocations")
    assert_each(settled["payments"], PAYMENT, "customer payment.payments")
    assert [a["order_id"] for a in settled["allocations"]] == [first["id"], second["id"]]
    assert settled["outstanding"] == 0 and settled["total"] == due
    assert len({payment["batch_id"] for payment in settled["payments"]}) == 1

    ok(client.post(f"/api/orders/{second['id']}/status", headers=demo_headers, json={"status": "collected"}))
    assert ok(client.delete(f"/api/customers/{customer_id}", headers=demo_headers)) == {"ok": True}
    listed = ok(client.get("/api/customers", headers=demo_headers, params={"search": "Smoke Customer"}))
    assert listed == []


# ---------------------------------------------------------------------------
# Products and inventory
# ---------------------------------------------------------------------------


def test_product_endpoints(client: TestClient, demo_headers: dict[str, str]) -> None:
    products = ok(client.get("/api/products", headers=demo_headers))
    assert_each(products, PRODUCT, "products")
    names = [product["name"] for product in products]
    assert names == sorted(names, key=str.casefold)
    low = ok(client.get("/api/products", headers=demo_headers, params={"low_stock": "true"}))
    assert low and all(product["low_stock"] for product in low)
    categories = ok(client.get("/api/products/categories", headers=demo_headers))
    assert "Staples" in categories and categories == sorted(categories, key=str.casefold)

    created = ok(client.post("/api/products", headers=demo_headers, json={
        "name": "Smoke Test Peanuts", "category": "Snacks", "unit": "kg",
        "stock_quantity": 10, "min_stock_level": 2, "purchase_price": 100, "selling_price": 125,
    }), 201)
    assert_keys(created, PRODUCT, "product create")
    assert created["stock_value"] == 1000 and created["margin_percent"] == 20.0
    duplicate = client.post("/api/products", headers=demo_headers,
                            json={"name": "smoke test PEANUTS", "category": "Snacks", "selling_price": 1})
    assert error(duplicate, 409) == "A product with this name already exists."
    product_id = created["id"]

    assert_keys(ok(client.get(f"/api/products/{product_id}", headers=demo_headers)), PRODUCT, "product get")
    patched = ok(client.patch(f"/api/products/{product_id}", headers=demo_headers,
                              json={"selling_price": 130, "stock_quantity": 999}))
    assert_keys(patched, PRODUCT, "product patch")
    assert patched["selling_price"] == 130 and patched["stock_quantity"] == 10
    adjusted = ok(client.post(f"/api/products/{product_id}/adjust", headers=demo_headers,
                              json={"mode": "remove", "quantity": 1.5, "reason": "damage", "note": "Torn bag"}))
    assert_keys(adjusted, PRODUCT, "product adjust")
    assert adjusted["stock_quantity"] == 8.5
    transactions = ok(client.get(f"/api/products/{product_id}/transactions", headers=demo_headers))
    assert_each(transactions, INVENTORY_TRANSACTION, "transactions")
    assert [tx["type"] for tx in transactions] == ["adjustment", "opening"]
    assert transactions[0]["stock_after"] == 8.5 and transactions[0]["reason"] == "damage"

    assert ok(client.delete(f"/api/products/{product_id}", headers=demo_headers)) == {"ok": True}
    assert product_id not in {p["id"] for p in ok(client.get("/api/products", headers=demo_headers))}
    archived = ok(client.get("/api/products", headers=demo_headers, params={"include_archived": "true"}))
    assert product_id in {p["id"] for p in archived}


# ---------------------------------------------------------------------------
# Orders, pickups, deliveries and payments
# ---------------------------------------------------------------------------


def test_order_and_payment_endpoints(client: TestClient, demo_headers: dict[str, str]) -> None:
    page = ok(client.get("/api/orders", headers=demo_headers, params={"limit": 20}))
    assert_keys(page, PAGINATED, "orders page")
    check_orders(page["items"], "orders")
    assert page["limit"] == 20 and page["total"] >= 200 and len(page["items"]) == 20
    open_page = ok(client.get("/api/orders", headers=demo_headers, params={"status": "open", "limit": 200}))
    assert all(order["status"] in {"new", "preparing", "ready"} for order in open_page["items"])
    assert client.get("/api/orders", headers=demo_headers, params={"status": "lost"}).status_code == 422

    # A constant number of statements however many orders are listed (no N+1 queries).
    for path, params in (
        ("/api/orders", {"limit": 200}),
        ("/api/payments", {"limit": 200}),
        ("/api/customers", {}),
        ("/api/products", {}),
        ("/api/pickups", {}),
        ("/api/purchases", {}),
    ):
        with count_statements() as statements:
            ok(client.get(path, headers=demo_headers, params=params))
        assert statements.value <= 10, f"{path} ran {statements.value} SQL statements"
    big_page = ok(client.get("/api/orders", headers=demo_headers, params={"limit": 500}))
    assert big_page["limit"] == 200 and len(big_page["items"]) == 200

    pickups = ok(client.get("/api/pickups", headers=demo_headers))
    check_orders(pickups, "pickups")
    assert len(pickups) >= 6 and all(order["fulfillment"] == "pickup" for order in pickups)
    deliveries = ok(client.get("/api/deliveries", headers=demo_headers))
    check_orders(deliveries, "deliveries")
    assert len(deliveries) >= 2 and all(order["fulfillment"] == "delivery" for order in deliveries)

    customer = ok(client.get("/api/customers", headers=demo_headers, params={"search": "Priya"}))[0]
    product = first_product(client, demo_headers)
    due_at = (datetime.now().astimezone() + timedelta(hours=2)).isoformat()
    created = ok(client.post("/api/orders", headers=demo_headers, json={
        "customer_id": customer["id"],
        "items": [{"product_id": product["id"], "quantity": 2},
                  {"name": "Carry bag", "quantity": 1, "unit_price": 5}],
        "channel": "whatsapp", "fulfillment": "pickup", "due_at": due_at, "notes": "Smoke order",
        "payment": {"amount": 5, "method": "upi"},
    }), 201)
    check_order(created, "order create", detail=True)
    assert created["payment_status"] == "partial" and created["status"] == "new"
    assert created["next_statuses"] == ["preparing", "ready", "collected", "cancelled"]
    order_id = created["id"]

    fetched = ok(client.get(f"/api/orders/{order_id}", headers=demo_headers))
    check_order(fetched, "order get", detail=True)
    patched = ok(client.patch(f"/api/orders/{order_id}", headers=demo_headers,
                              json={"items": [{"product_id": product["id"], "quantity": 3}], "discount": 1}))
    check_order(patched, "order patch", detail=True)
    assert patched["item_count"] == 1 and patched["discount"] == 1

    ready = ok(client.post(f"/api/orders/{order_id}/status", headers=demo_headers, json={"status": "ready"}))
    check_order(ready, "order status", detail=True)
    backwards = client.post(f"/api/orders/{order_id}/status", headers=demo_headers, json={"status": "new"})
    assert error(backwards, 409) == "Can't move an order from Ready to New."
    paid = ok(client.post(f"/api/orders/{order_id}/payments", headers=demo_headers,
                          json={"amount": ready["outstanding"], "method": "cash", "note": "At pickup"}), 201)
    check_order(paid, "order payment", detail=True)
    assert paid["payment_status"] == "paid" and paid["outstanding"] == 0
    collected = ok(client.post(f"/api/orders/{order_id}/status", headers=demo_headers, json={"status": "collected"}))
    assert collected["stock_deducted"] is True and collected["completed_at"] is not None

    repeated = ok(client.post(f"/api/orders/{order_id}/repeat", headers=demo_headers), 201)
    check_order(repeated, "order repeat", detail=True)
    assert repeated["status"] == "new" and repeated["paid"] == 0
    assert repeated["customer_id"] == customer["id"] and repeated["channel"] == "whatsapp"
    ok(client.post(f"/api/orders/{repeated['id']}/status", headers=demo_headers, json={"status": "cancelled"}))

    payments = ok(client.get("/api/payments", headers=demo_headers, params={"limit": 5}))
    assert_keys(payments, PAGINATED, "payments page")
    assert_each(payments["items"], PAYMENT, "payments")
    filtered = ok(client.get("/api/payments", headers=demo_headers, params={"method": "upi", "customer_id": customer["id"]}))
    assert all(payment["method"] == "upi" for payment in filtered["items"])
    summary = ok(client.get("/api/payments/summary", headers=demo_headers))
    assert_keys(summary, PAYMENT_SUMMARY, "payments summary")
    assert_each(summary["by_method"], METHOD_TOTAL, "payments summary.by_method")
    assert summary["today"] <= summary["week"] and summary["today"] <= summary["month"]

    reopened = ok(client.post(f"/api/orders/{order_id}/status", headers=demo_headers, json={"status": "ready"}))
    assert reopened["stock_deducted"] is False
    blocked = client.post(f"/api/orders/{order_id}/status", headers=demo_headers, json={"status": "cancelled"})
    assert error(blocked, 409) == "Void this order's payments before cancelling it."
    for payment in reopened["payments"]:
        assert ok(client.delete(f"/api/payments/{payment['id']}", headers=demo_headers)) == {"ok": True}
    cancelled = ok(client.post(f"/api/orders/{order_id}/status", headers=demo_headers, json={"status": "cancelled"}))
    assert cancelled["status"] == "cancelled" and cancelled["paid"] == 0 and cancelled["payments"] == []
    assert error(client.delete(f"/api/payments/{reopened['payments'][0]['id']}", headers=demo_headers), 404)


def test_cross_shop_isolation(
    client: TestClient, demo_headers: dict[str, str], signup_shop: Callable[..., ShopAccount]
) -> None:
    other = signup_shop()
    demo_order = ok(client.get("/api/orders", headers=demo_headers, params={"limit": 1}))["items"][0]
    assert error(client.get(f"/api/orders/{demo_order['id']}", headers=other.headers), 404) == "Order not found."
    assert ok(client.get("/api/orders", headers=other.headers))["total"] == 0
    assert ok(client.get("/api/customers", headers=other.headers)) == []
    assert ok(client.get("/api/dashboard", headers=other.headers))["setup"]["has_orders"] is False


# ---------------------------------------------------------------------------
# Suppliers and purchases
# ---------------------------------------------------------------------------


def test_supplier_endpoints(client: TestClient, demo_headers: dict[str, str], unique_phone: Callable[[], str]) -> None:
    suppliers = ok(client.get("/api/suppliers", headers=demo_headers))
    assert_each(suppliers, SUPPLIER, "suppliers")
    assert len(suppliers) >= 4
    due = ok(client.get("/api/suppliers", headers=demo_headers, params={"filter": "due"}))
    assert all(supplier["outstanding"] > 0 for supplier in due)
    check_supplier_detail(ok(client.get(f"/api/suppliers/{suppliers[0]['id']}", headers=demo_headers)), "supplier get")

    created = ok(client.post("/api/suppliers", headers=demo_headers, json={
        "name": "Smoke Distributors", "phone": unique_phone(), "contact_person": "Mr Test",
        "supplies": "Snacks", "opening_balance": 100,
    }), 201)
    assert_keys(created, SUPPLIER, "supplier create")
    assert created["outstanding"] == 100
    supplier_id = created["id"]
    patched = ok(client.patch(f"/api/suppliers/{supplier_id}", headers=demo_headers, json={"notes": "Delivers Tuesdays."}))
    assert_keys(patched, SUPPLIER, "supplier patch")

    product = first_product(client, demo_headers)
    purchase = ok(client.post(f"/api/suppliers/{supplier_id}/purchases", headers=demo_headers, json={
        "items": [{"product_id": product["id"], "quantity": 4, "unit_cost": product["purchase_price"]}],
        "paid_amount": 50, "method": "cash", "note": "Smoke bill",
    }), 201)
    assert_keys(purchase, PURCHASE, "purchase create")
    assert_each(purchase["items"], PURCHASE_ITEM, "purchase create.items")
    restocked = ok(client.get(f"/api/products/{product['id']}", headers=demo_headers))
    assert restocked["stock_quantity"] == round(product["stock_quantity"] + 4, 3)

    payment = ok(client.post(f"/api/suppliers/{supplier_id}/payments", headers=demo_headers,
                             json={"amount": 25, "method": "upi"}), 201)
    assert_keys(payment, SUPPLIER_PAYMENT, "supplier payment")
    detail = ok(client.get(f"/api/suppliers/{supplier_id}", headers=demo_headers))
    check_supplier_detail(detail, "supplier detail")
    expected = round(100 + purchase["total"] - 50 - 25, 2)
    assert detail["outstanding"] == expected and len(detail["payments"]) == 2
    error(client.post(f"/api/suppliers/{supplier_id}/payments", headers=demo_headers,
                      json={"amount": expected + 1, "method": "upi"}), 400)

    purchases = ok(client.get("/api/purchases", headers=demo_headers))
    assert len(purchases) <= 100
    for index, row in enumerate(purchases):
        assert_keys(row, PURCHASE, f"purchases[{index}]")
        assert_each(row["items"], PURCHASE_ITEM, f"purchases[{index}].items")
    assert purchases[0]["id"] == purchase["id"]


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------


def test_expense_endpoints(client: TestClient, demo_headers: dict[str, str]) -> None:
    page = ok(client.get("/api/expenses", headers=demo_headers))
    assert_keys(page, PAGINATED, "expenses page")
    assert_each(page["items"], EXPENSE, "expenses")
    assert page["total"] >= 10
    rent = ok(client.get("/api/expenses", headers=demo_headers, params={"category": "rent"}))
    assert rent["items"] and all(expense["category"] == "rent" for expense in rent["items"])
    summary = ok(client.get("/api/expenses/summary", headers=demo_headers))
    assert_keys(summary, EXPENSE_SUMMARY, "expense summary")
    assert_each(summary["by_category"], CATEGORY_TOTAL, "expense summary.by_category")
    amounts = [row["amount"] for row in summary["by_category"]]
    assert amounts == sorted(amounts, reverse=True)

    created = ok(client.post("/api/expenses", headers=demo_headers,
                             json={"category": "miscellaneous", "amount": 120.5, "note": "Smoke tea"}), 201)
    assert_keys(created, EXPENSE, "expense create")
    assert created["amount"] == 120.5 and created["created_by_name"] == "Raj Deshmukh"
    patched = ok(client.patch(f"/api/expenses/{created['id']}", headers=demo_headers, json={"amount": 99}))
    assert_keys(patched, EXPENSE, "expense patch")
    assert patched["amount"] == 99
    error(client.post("/api/expenses", headers=demo_headers, json={"category": "rent", "amount": 0}), 400)
    assert ok(client.delete(f"/api/expenses/{created['id']}", headers=demo_headers)) == {"ok": True}
    error(client.delete(f"/api/expenses/{created['id']}", headers=demo_headers), 404)


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------


def test_imports(client: TestClient, demo_headers: dict[str, str], unique_phone: Callable[[], str]) -> None:
    phone_a, phone_b = unique_phone(), unique_phone()
    csv_text = (
        "Name,Mobile,Address,Notes\n"
        f"Import One,{phone_a},Lane 9,First\n"
        f"Import Two,+91 {phone_b},,\n"
        "No Phone,,,\n"
        f"Import One Again,{phone_a},,Updated\n"
    )
    result = ok(client.post("/api/import/customers", headers=demo_headers, json={"csv": csv_text}))
    assert_keys(result, IMPORT_RESULT, "import customers")
    assert_each(result["errors"], IMPORT_ERROR, "import customers.errors")
    assert (result["created"], result["updated"], result["skipped"]) == (2, 1, 1)
    assert result["errors"][0]["row"] == 3

    products_csv = "name,category,unit,stock,selling price,purchase price\nSmoke Import Rice,Staples,kgs,12,70,55\nBad Row,Staples,crate,1,10,5\n"
    products = ok(client.post("/api/import/products", headers=demo_headers, json={"csv": products_csv}))
    assert_keys(products, IMPORT_RESULT, "import products")
    assert (products["created"], products["skipped"]) == (1, 1)
    error(client.post("/api/import/customers", headers=demo_headers, json={"csv": "foo,bar\n1,2\n"}), 400)
    assert client.post("/api/import/orders", headers=demo_headers, json={"csv": "a\n"}).status_code == 422

    # Tidy the shared demo shop.
    for customer in ok(client.get("/api/customers", headers=demo_headers, params={"search": "Import"})):
        ok(client.delete(f"/api/customers/{customer['id']}", headers=demo_headers))
    for product in ok(client.get("/api/products", headers=demo_headers, params={"search": "Smoke Import"})):
        ok(client.delete(f"/api/products/{product['id']}", headers=demo_headers))
