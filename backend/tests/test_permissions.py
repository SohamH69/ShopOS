"""Roles, permissions, staff management and cross-shop isolation.

Derived from SPEC section 2 ("Roles & permissions") and section 3 (permission column,
"every query is scoped to the caller's shop_id — another shop's id must 404").
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api_helpers import (
    ALL_PERMISSIONS,
    DEFAULT_PERMISSIONS,
    Api,
    custom_item,
    customer_phone,
    error,
    line,
    ok,
    rejected,
)
from conftest import TEST_PASSWORD, ShopAccount, StaffAccount

STAFF_ROLES = ("manager", "employee", "accountant")


@dataclass
class Team:
    owner: ShopAccount
    api: Api
    staff: dict[str, StaffAccount]
    ids: dict[str, int]

    def headers(self, role: str) -> dict[str, str]:
        return self.owner.headers if role == "owner" else self.staff[role].headers


@pytest.fixture(scope="module")
def team(
    client: TestClient,
    signup_shop: Callable[..., ShopAccount],
    create_staff: Callable[..., StaffAccount],
) -> Team:
    """A shop with default roles, one staff member per role and a few records to probe."""
    owner = signup_shop()
    api = Api(client, owner.headers)
    product = api.create_product(stock_quantity=10, selling_price=25)
    customer = api.create_customer()
    order = api.create_order([line(product, 2)], customer_id=customer["id"])
    staff = {role: create_staff(owner.headers, role=role) for role in STAFF_ROLES}
    return Team(owner, api, staff, {"product": product["id"], "customer": customer["id"], "order": order["id"]})


# (permission, method, path) — read-only probes guarded by exactly one permission.
SINGLE_PERMISSION_PROBES = [
    ("dashboard", "GET", "/api/dashboard"),
    ("dashboard", "GET", "/api/attention"),
    ("orders", "GET", "/api/orders"),
    ("orders", "GET", "/api/orders/{order}"),
    ("orders", "GET", "/api/pickups"),
    ("orders", "GET", "/api/deliveries"),
    ("customers", "GET", "/api/customers/{customer}/ledger"),
    ("customers", "GET", "/api/customers/{customer}/orders"),
    ("customers", "GET", "/api/customers/{customer}/payments"),
    ("payments", "GET", "/api/payments"),
    ("payments", "GET", "/api/payments/summary"),
    ("inventory", "GET", "/api/products/{product}"),
    ("inventory", "GET", "/api/products/{product}/transactions"),
    ("suppliers", "GET", "/api/suppliers"),
    ("suppliers", "GET", "/api/purchases"),
    ("expenses", "GET", "/api/expenses"),
    ("expenses", "GET", "/api/expenses/summary"),
    ("reports", "GET", "/api/reports"),
    ("staff", "GET", "/api/users"),
    ("staff", "GET", "/api/roles"),
    ("settings", "GET", "/api/export/customers.csv"),
    ("settings", "GET", "/api/export/products.csv"),
    ("settings", "GET", "/api/export/expenses.csv"),
]

# (any of these permissions, method, path) — the read helpers from SPEC section 2.
ANY_OF_PROBES = [
    ({"orders", "customers", "payments"}, "GET", "/api/customers"),
    ({"orders", "customers", "payments"}, "GET", "/api/customers/{customer}"),
    ({"orders", "inventory", "suppliers"}, "GET", "/api/products"),
    ({"orders", "inventory", "suppliers"}, "GET", "/api/products/categories"),
    ({"settings", "reports"}, "GET", "/api/export/orders.csv"),
    ({"settings", "reports"}, "GET", "/api/export/payments.csv"),
    (set(), "GET", "/api/shop"),
    (set(), "GET", "/api/auth/me"),
    (set(), "GET", "/api/search?q=a"),
]


def _expect(team: Team, role: str, method: str, path: str, allowed: bool) -> None:
    response = team.api.client.request(method, path.format(**team.ids), headers=team.headers(role))
    if allowed:
        assert response.status_code == 200, f"{role} {method} {path}: {response.status_code} {response.text}"
    else:
        detail = error(response, 403)
        assert detail.startswith("You don't have access to "), detail


@pytest.mark.parametrize("role", ["owner", *STAFF_ROLES])
def test_default_role_can_reach_exactly_its_modules(team: Team, role: str) -> None:
    granted = DEFAULT_PERMISSIONS[role]
    for permission, method, path in SINGLE_PERMISSION_PROBES:
        _expect(team, role, method, path, permission in granted)


@pytest.mark.parametrize("role", ["owner", *STAFF_ROLES])
def test_read_helpers_accept_any_listed_permission(team: Team, role: str) -> None:
    granted = DEFAULT_PERMISSIONS[role]
    for needs_any, method, path in ANY_OF_PROBES:
        _expect(team, role, method, path, not needs_any or bool(needs_any & granted))


@pytest.mark.parametrize("role", STAFF_ROLES)
def test_me_reports_the_default_permissions_of_each_role(client: TestClient, team: Team, role: str) -> None:
    session = ok(client.get("/api/auth/me", headers=team.headers(role)))
    assert session["user"]["role"] == role
    assert set(session["permissions"]) == DEFAULT_PERMISSIONS[role]


def test_write_endpoints_check_permissions_before_changing_anything(client: TestClient, team: Team) -> None:
    customer, product = team.ids["customer"], team.ids["product"]
    employee, accountant, manager = (team.headers(r) for r in ("employee", "accountant", "manager"))

    def denied(headers: dict[str, str], method: str, path: str, body: Any) -> None:
        response = client.request(method, path, headers=headers, json=body)
        assert error(response, 403).startswith("You don't have access to "), (method, path)

    # Accountants handle money, not counters or stock.
    denied(accountant, "POST", "/api/customers", {"name": "Nope", "phone": customer_phone()})
    denied(accountant, "PATCH", f"/api/customers/{customer}", {"notes": "nope"})
    denied(accountant, "POST", f"/api/customers/{customer}/payments", {"amount": 1, "method": "cash"})
    denied(accountant, "POST", "/api/orders", {"customer_id": customer, "items": [custom_item(5)]})
    # Employees can't touch stock, expenses or money reports.
    denied(employee, "POST", "/api/products", {"name": "Nope", "category": "X", "selling_price": 1})
    denied(employee, "POST", f"/api/products/{product}/adjust", {"mode": "add", "quantity": 1, "reason": "restock"})
    denied(employee, "POST", "/api/expenses", {"category": "rent", "amount": 10})
    denied(manager, "POST", "/api/expenses", {"category": "rent", "amount": 10})
    # Only the owner (settings / staff) changes the shop, imports data or manages people.
    for headers in (manager, employee, accountant):
        denied(headers, "PATCH", "/api/shop", {"name": "Taken over"})
        denied(headers, "POST", "/api/import/customers", {"csv": "name,phone\nX,9800000000\n"})
        denied(headers, "POST", "/api/users", {"name": "X", "email": "x@example.com", "role": "employee", "password": TEST_PASSWORD})
        denied(headers, "PUT", "/api/roles/employee", {"permissions": sorted(ALL_PERMISSIONS)})

    # Nothing changed.
    assert team.api.product(product)["stock_quantity"] == 10
    assert team.api.get("/api/expenses")["total"] == 0
    assert team.api.get("/api/shop")["name"] == team.owner.session["shop"]["name"]
    assert len(team.api.get("/api/users")) == 4

    # The same writes succeed for roles that hold the permission.
    ok(client.post("/api/customers", headers=employee, json={"name": "Walk-up", "phone": customer_phone()}), 201)
    ok(client.post("/api/expenses", headers=accountant, json={"category": "rent", "amount": 10}), 201)
    ok(client.post("/api/products", headers=manager, json={"name": "Manager item", "category": "X", "selling_price": 1}), 201)


def test_search_only_returns_groups_the_user_can_read(client: TestClient, team: Team) -> None:
    order = team.api.order(team.ids["order"])
    product = team.api.product(team.ids["product"])
    term = product["name"]
    owner_results = ok(client.get("/api/search", params={"q": term}, headers=team.headers("owner")))
    assert [p["id"] for p in owner_results["products"]] == [product["id"]]

    accountant = ok(client.get("/api/search", params={"q": str(order["number"])}, headers=team.headers("accountant")))
    assert accountant["orders"] == [] and accountant["products"] == []
    accountant_products = ok(client.get("/api/search", params={"q": term}, headers=team.headers("accountant")))
    assert accountant_products["products"] == []

    employee = ok(client.get("/api/search", params={"q": str(order["number"])}, headers=team.headers("employee")))
    assert order["id"] in [o["id"] for o in employee["orders"]]
    employee_products = ok(client.get("/api/search", params={"q": term}, headers=team.headers("employee")))
    assert [p["id"] for p in employee_products["products"]] == [product["id"]]


# ---------------------------------------------------------------------------
# Role matrix
# ---------------------------------------------------------------------------


def test_roles_list_starts_with_the_spec_defaults(client: TestClient, owner: ShopAccount) -> None:
    roles = ok(client.get("/api/roles", headers=owner.headers))
    assert [r["role"] for r in roles] == ["owner", "manager", "employee", "accountant"]
    for entry in roles:
        assert set(entry) == {"role", "permissions", "editable"}
        assert set(entry["permissions"]) == DEFAULT_PERMISSIONS[entry["role"]]
        assert entry["editable"] is (entry["role"] != "owner")


def test_edited_role_takes_effect_immediately_and_only_in_that_shop(
    client: TestClient,
    signup_shop: Callable[..., ShopAccount],
    create_staff: Callable[..., StaffAccount],
) -> None:
    owner, neighbour = signup_shop(), signup_shop()
    employee = create_staff(owner.headers, "employee")
    neighbour_employee = create_staff(neighbour.headers, "employee")
    assert client.get("/api/expenses", headers=employee.headers).status_code == 403

    new_set = {"dashboard", "customers", "expenses"}
    updated = ok(client.put("/api/roles/employee", headers=owner.headers, json={"permissions": sorted(new_set)}))
    assert updated == {"role": "employee", "permissions": updated["permissions"], "editable": True}
    assert set(updated["permissions"]) == new_set

    # The employee's existing token picks up the change on the next request.
    assert client.get("/api/expenses", headers=employee.headers).status_code == 200
    assert error(client.get("/api/orders", headers=employee.headers), 403).startswith("You don't have access to ")
    assert set(ok(client.get("/api/auth/me", headers=employee.headers))["permissions"]) == new_set
    roles = {r["role"]: r for r in ok(client.get("/api/roles", headers=owner.headers))}
    assert set(roles["employee"]["permissions"]) == new_set
    assert set(roles["owner"]["permissions"]) == ALL_PERMISSIONS

    # Another shop's employees keep the defaults.
    assert client.get("/api/orders", headers=neighbour_employee.headers).status_code == 200
    assert client.get("/api/expenses", headers=neighbour_employee.headers).status_code == 403

    # Taking everything away leaves only signed-in basics.
    ok(client.put("/api/roles/employee", headers=owner.headers, json={"permissions": []}))
    assert client.get("/api/dashboard", headers=employee.headers).status_code == 403
    assert client.get("/api/shop", headers=employee.headers).status_code == 200
    assert ok(client.get("/api/auth/me", headers=employee.headers))["permissions"] == []


def test_owner_role_cannot_be_edited_and_bad_input_is_rejected(client: TestClient, owner: ShopAccount) -> None:
    error(client.put("/api/roles/owner", headers=owner.headers, json={"permissions": ["dashboard"]}), 400)
    roles = {r["role"]: r for r in ok(client.get("/api/roles", headers=owner.headers))}
    assert set(roles["owner"]["permissions"]) == ALL_PERMISSIONS
    assert set(ok(client.get("/api/auth/me", headers=owner.headers))["permissions"]) == ALL_PERMISSIONS

    assert client.put("/api/roles/cashier", headers=owner.headers, json={"permissions": []}).status_code == 422
    assert client.put("/api/roles/manager", headers=owner.headers, json={"permissions": ["dashboard", "everything"]}).status_code == 422
    roles = {r["role"]: r for r in ok(client.get("/api/roles", headers=owner.headers))}
    assert set(roles["manager"]["permissions"]) == DEFAULT_PERMISSIONS["manager"]


def test_changing_a_staff_role_changes_their_permissions(
    client: TestClient, owner: ShopAccount, create_staff: Callable[..., StaffAccount]
) -> None:
    staff = create_staff(owner.headers, "employee")
    updated = ok(client.patch(f"/api/users/{staff.user['id']}", headers=owner.headers, json={"role": "accountant"}))
    assert updated["role"] == "accountant"
    assert set(ok(client.get("/api/auth/me", headers=staff.headers))["permissions"]) == DEFAULT_PERMISSIONS["accountant"]
    assert client.get("/api/expenses", headers=staff.headers).status_code == 200
    assert client.get("/api/orders", headers=staff.headers).status_code == 403


# ---------------------------------------------------------------------------
# Staff management
# ---------------------------------------------------------------------------


def test_staff_cannot_change_the_owner_or_turn_themselves_off(
    client: TestClient, owner: ShopAccount, create_staff: Callable[..., StaffAccount]
) -> None:
    manager_permissions = sorted(DEFAULT_PERMISSIONS["manager"] | {"staff"})
    ok(client.put("/api/roles/manager", headers=owner.headers, json={"permissions": manager_permissions}))
    manager = create_staff(owner.headers, "manager")
    employee = create_staff(owner.headers, "employee")
    owner_id = owner.user["id"]

    for body in ({"is_active": False}, {"name": "Someone Else"}, {"role": "employee"}, {"password": "taken-over-1"}):
        rejected(client.patch(f"/api/users/{owner_id}", headers=manager.headers, json=body), 400, 403, 409, 422)
    rejected(client.patch(f"/api/users/{manager.user['id']}", headers=manager.headers, json={"is_active": False}), 400, 403, 409)
    rejected(client.patch(f"/api/users/{owner_id}", headers=owner.headers, json={"is_active": False}), 400, 403, 409)

    users = {u["id"]: u for u in ok(client.get("/api/users", headers=owner.headers))}
    assert users[owner_id]["is_active"] is True and users[owner_id]["role"] == "owner"
    assert users[owner_id]["name"] == owner.user["name"]
    assert users[manager.user["id"]]["is_active"] is True
    ok(client.post("/api/auth/login", json={"identifier": owner.email, "password": owner.password}))

    # A manager trusted with staff access can manage other staff members.
    changed = ok(client.patch(f"/api/users/{employee.user['id']}", headers=manager.headers, json={"is_active": False}))
    assert changed["is_active"] is False


def test_new_staff_need_a_unique_login_and_a_staff_role(
    client: TestClient,
    signup_shop: Callable[..., ShopAccount],
    unique_email: Callable[[], str],
    unique_phone: Callable[[], str],
) -> None:
    first, second = signup_shop(), signup_shop()
    base = {"name": "New Helper", "role": "employee", "password": TEST_PASSWORD}

    error(client.post("/api/users", headers=second.headers, json={**base, "email": first.email}), 409)
    error(client.post("/api/users", headers=second.headers, json={**base, "phone": first.phone}), 409)
    error(client.post("/api/users", headers=second.headers, json={**base, "phone": f"+91 {first.phone}"}), 409)
    rejected(client.post("/api/users", headers=second.headers, json=base), 400, 422)
    assert client.post("/api/users", headers=second.headers, json={**base, "email": unique_email(), "role": "owner"}).status_code == 422
    rejected(client.post("/api/users", headers=second.headers, json={**base, "email": unique_email(), "password": "short"}), 400, 422)

    phone = unique_phone()
    created = ok(client.post("/api/users", headers=second.headers, json={**base, "phone": phone, "email": None}), 201)
    assert created["role"] == "employee" and created["is_active"] is True and created["email"] is None
    assert created["last_login_at"] is None
    listed = {u["id"]: u for u in ok(client.get("/api/users", headers=second.headers))}
    assert created["id"] in listed and second.user["id"] in listed
    # The phone is now taken everywhere, including by signups.
    error(client.post("/api/users", headers=first.headers, json={**base, "phone": phone}), 409)

    # The owner can reset a staff password.
    ok(client.patch(f"/api/users/{created['id']}", headers=second.headers, json={"password": "reset-pass-99"}))
    session = ok(client.post("/api/auth/login", json={"identifier": phone, "password": "reset-pass-99"}))
    assert session["user"]["id"] == created["id"]
    assert set(session["permissions"]) == DEFAULT_PERMISSIONS["employee"]


def test_shop_profile_is_readable_by_staff_but_only_settings_can_change_it(
    client: TestClient, owner: ShopAccount, create_staff: Callable[..., StaffAccount]
) -> None:
    manager = create_staff(owner.headers, "manager")
    shop = ok(client.get("/api/shop", headers=manager.headers))
    assert shop["id"] == owner.shop_id

    error(client.patch("/api/shop", headers=manager.headers, json={"name": "Hijacked"}), 403)
    updated = ok(
        client.patch(
            "/api/shop",
            headers=owner.headers,
            json={"name": "Renamed Kirana", "upi_id": "renamed@upi", "address": "Lane 5, Aundh", "segment": "Pharmacy"},
        )
    )
    assert (updated["name"], updated["upi_id"], updated["address"], updated["segment"]) == (
        "Renamed Kirana", "renamed@upi", "Lane 5, Aundh", "Pharmacy",
    )
    assert updated["id"] == owner.shop_id and updated["city"] == shop["city"]
    cleared = ok(client.patch("/api/shop", headers=owner.headers, json={"upi_id": None}))
    assert cleared["upi_id"] is None and cleared["name"] == "Renamed Kirana"
    for bad in ({"name": "   "}, {"upi_id": "not a upi id"}, {"email": "not-an-email"}, {"phone": "12345"}):
        rejected(client.patch("/api/shop", headers=owner.headers, json=bad), 400, 422)
    assert ok(client.get("/api/shop", headers=owner.headers))["name"] == "Renamed Kirana"
    assert ok(client.get("/api/auth/me", headers=manager.headers))["shop"]["name"] == "Renamed Kirana"


# ---------------------------------------------------------------------------
# Cross-shop isolation
# ---------------------------------------------------------------------------


@dataclass
class TwoShops:
    mine: Api
    theirs: Api
    their: dict[str, int]
    my_product: int
    my_supplier: int
    my_order: int


@pytest.fixture(scope="module")
def two_shops(
    client: TestClient,
    signup_shop: Callable[..., ShopAccount],
    create_staff: Callable[..., StaffAccount],
) -> TwoShops:
    their_account, my_account = signup_shop(), signup_shop()
    theirs, mine = Api(client, their_account.headers), Api(client, my_account.headers)

    product = theirs.create_product(name="Their Basmati", stock_quantity=10, selling_price=100)
    customer = theirs.create_customer(name="Their Customer Kavita")
    order = theirs.create_order(
        [line(product, 1)], customer_id=customer["id"], payment={"amount": 40, "method": "cash"}
    )
    supplier = theirs.create_supplier(opening_balance=500)
    expense = theirs.create_expense(category="rent", amount=1000)
    staff = create_staff(their_account.headers, "employee")
    their = {
        "product": product["id"],
        "customer": customer["id"],
        "order": order["id"],
        "payment": order["payments"][0]["id"],
        "supplier": supplier["id"],
        "expense": expense["id"],
        "user": staff.user["id"],
    }

    my_product = mine.create_product(stock_quantity=5)
    my_customer = mine.create_customer()
    my_order = mine.create_order([line(my_product, 1)], customer_id=my_customer["id"])
    my_supplier = mine.create_supplier()
    return TwoShops(mine, theirs, their, my_product["id"], my_supplier["id"], my_order["id"])


FOREIGN_ID_REQUESTS: list[tuple[str, str, Callable[[TwoShops], Any]]] = [
    ("GET", "/api/customers/{customer}", lambda s: None),
    ("PATCH", "/api/customers/{customer}", lambda s: {"name": "Renamed"}),
    ("DELETE", "/api/customers/{customer}", lambda s: None),
    ("GET", "/api/customers/{customer}/ledger", lambda s: None),
    ("GET", "/api/customers/{customer}/orders", lambda s: None),
    ("GET", "/api/customers/{customer}/payments", lambda s: None),
    ("POST", "/api/customers/{customer}/payments", lambda s: {"amount": 1, "method": "cash"}),
    ("PUT", "/api/customers/{customer}/promise", lambda s: {"date": "2030-01-01", "amount": 10}),
    ("DELETE", "/api/customers/{customer}/promise", lambda s: None),
    ("GET", "/api/orders/{order}", lambda s: None),
    ("PATCH", "/api/orders/{order}", lambda s: {"notes": "hello"}),
    ("POST", "/api/orders/{order}/status", lambda s: {"status": "preparing"}),
    ("POST", "/api/orders/{order}/payments", lambda s: {"amount": 1, "method": "cash"}),
    ("POST", "/api/orders/{order}/repeat", lambda s: None),
    ("GET", "/api/products/{product}", lambda s: None),
    ("PATCH", "/api/products/{product}", lambda s: {"selling_price": 1}),
    ("DELETE", "/api/products/{product}", lambda s: None),
    ("POST", "/api/products/{product}/adjust", lambda s: {"mode": "add", "quantity": 1, "reason": "restock"}),
    ("GET", "/api/products/{product}/transactions", lambda s: None),
    ("GET", "/api/suppliers/{supplier}", lambda s: None),
    ("PATCH", "/api/suppliers/{supplier}", lambda s: {"name": "Renamed"}),
    ("POST", "/api/suppliers/{supplier}/purchases", lambda s: {"items": [{"product_id": s.my_product, "quantity": 1, "unit_cost": 1}]}),
    ("POST", "/api/suppliers/{supplier}/payments", lambda s: {"amount": 1, "method": "cash"}),
    ("PATCH", "/api/expenses/{expense}", lambda s: {"amount": 1}),
    ("DELETE", "/api/expenses/{expense}", lambda s: None),
    ("DELETE", "/api/payments/{payment}", lambda s: None),
    ("PATCH", "/api/users/{user}", lambda s: {"is_active": False}),
]


@pytest.mark.parametrize(
    "method, path, body", FOREIGN_ID_REQUESTS, ids=[f"{m} {p}" for m, p, _ in FOREIGN_ID_REQUESTS]
)
def test_another_shops_ids_are_not_found(two_shops: TwoShops, method: str, path: str, body: Callable[[TwoShops], Any]) -> None:
    response = two_shops.mine.raw(method, path.format(**two_shops.their), json=body(two_shops))
    assert error(response, 404).endswith("not found.")


IMPOSSIBLE_IDS = [0, -1, 2**63, 99_999_999_999_999_999_999]


@pytest.mark.parametrize("impossible", IMPOSSIBLE_IDS)
@pytest.mark.parametrize(
    "method, path, body", FOREIGN_ID_REQUESTS, ids=[f"{m} {p}" for m, p, _ in FOREIGN_ID_REQUESTS]
)
def test_ids_that_cannot_exist_are_client_errors(
    two_shops: TwoShops, impossible: int, method: str, path: str, body: Callable[[TwoShops], Any]
) -> None:
    # Ids beyond SQLite's 64-bit range must not crash the driver (a 500); they are simply
    # not found (404) or rejected as out of range (422).
    ids = {key: impossible for key in two_shops.their}
    response = two_shops.mine.raw(method, path.format(**ids), json=body(two_shops))
    assert response.status_code in (404, 422), response.text


@pytest.mark.parametrize("impossible", IMPOSSIBLE_IDS)
def test_impossible_ids_in_bodies_and_filters_are_client_errors(two_shops: TwoShops, impossible: int) -> None:
    mine = two_shops.mine
    requests: list[tuple[str, str, Any, dict[str, Any] | None]] = [
        ("POST", "/api/orders", {"customer_id": impossible, "items": [custom_item(10)]}, None),
        ("POST", "/api/orders", {"items": [{"product_id": impossible, "quantity": 1}], "payment": {"amount": 10, "method": "cash"}}, None),
        ("PATCH", f"/api/orders/{two_shops.my_order}", {"customer_id": impossible}, None),
        ("PATCH", f"/api/orders/{two_shops.my_order}", {"items": [{"product_id": impossible, "quantity": 1}]}, None),
        ("POST", f"/api/suppliers/{two_shops.my_supplier}/purchases", {"items": [{"product_id": impossible, "quantity": 1, "unit_cost": 1}]}, None),
        ("GET", "/api/orders", None, {"customer_id": impossible}),
        ("GET", "/api/payments", None, {"customer_id": impossible}),
    ]
    for method, path, body, params in requests:
        response = mine.raw(method, path, json=body, params=params)
        if response.status_code == 200:
            assert method == "GET" and response.json()["items"] == [], (method, path, response.text)
        else:
            assert response.status_code in (400, 404, 422), (method, path, response.text)


@pytest.mark.parametrize("path", ["/api/orders", "/api/payments", "/api/expenses"])
def test_huge_offsets_are_client_errors_or_empty_pages(two_shops: TwoShops, path: str) -> None:
    response = two_shops.mine.raw("GET", path, params={"offset": 2**63})
    if response.status_code == 200:
        assert response.json()["items"] == []
    else:
        assert response.status_code == 422, response.text


def test_another_shops_records_cannot_be_referenced(two_shops: TwoShops) -> None:
    mine, their = two_shops.mine, two_shops.their
    orders_before = mine.get("/api/orders")["total"]

    with_their_product = mine.raw("POST", "/api/orders", json={"items": [{"product_id": their["product"], "quantity": 1}], "payment": {"amount": 100, "method": "cash"}})
    rejected(with_their_product, 400, 404)
    with_their_customer = mine.raw("POST", "/api/orders", json={"customer_id": their["customer"], "items": [custom_item(10)]})
    rejected(with_their_customer, 400, 404)
    reassign = mine.raw("PATCH", f"/api/orders/{two_shops.my_order}", json={"customer_id": their["customer"]})
    rejected(reassign, 400, 404)
    purchase = mine.raw(
        "POST",
        f"/api/suppliers/{two_shops.my_supplier}/purchases",
        json={"items": [{"product_id": their["product"], "quantity": 5, "unit_cost": 1}]},
    )
    rejected(purchase, 400, 404)

    assert mine.get("/api/orders")["total"] == orders_before
    assert mine.get("/api/orders", params={"customer_id": their["customer"]})["items"] == []


def test_lists_search_and_exports_never_show_another_shops_data(two_shops: TwoShops) -> None:
    mine, their = two_shops.mine, two_shops.their
    assert their["customer"] not in [c["id"] for c in mine.get("/api/customers")]
    assert their["product"] not in [p["id"] for p in mine.get("/api/products", params={"include_archived": "true"})]
    assert their["order"] not in [o["id"] for o in mine.get("/api/orders")["items"]]
    assert their["payment"] not in [p["id"] for p in mine.get("/api/payments")["items"]]
    assert their["supplier"] not in [s["id"] for s in mine.get("/api/suppliers")]
    assert their["expense"] not in [e["id"] for e in mine.get("/api/expenses")["items"]]
    assert their["user"] not in [u["id"] for u in mine.get("/api/users")]
    assert mine.get("/api/purchases") == []
    assert mine.get("/api/products/categories") == ["General"]

    results = mine.get("/api/search", params={"q": "Kavita"})
    assert results == {"customers": [], "orders": [], "products": []}
    assert mine.get("/api/search", params={"q": "Basmati"})["products"] == []
    export = mine.raw("GET", "/api/export/customers.csv")
    assert export.status_code == 200 and "Kavita" not in export.text
    # Only my own unpaid ₹10 order counts, never their ₹60 of dues.
    assert mine.get("/api/dashboard")["metrics"]["outstanding"] == 10


def test_rejected_cross_shop_requests_left_the_other_shop_untouched(two_shops: TwoShops) -> None:
    theirs, their = two_shops.theirs, two_shops.their
    product = theirs.product(their["product"])
    assert product["stock_quantity"] == 10 and product["selling_price"] == 100 and product["is_archived"] is False
    customer = theirs.customer(their["customer"])
    assert customer["name"] == "Their Customer Kavita" and customer["outstanding"] == 60
    assert customer["promise_date"] is None
    order = theirs.order(their["order"])
    assert order["status"] == "new" and order["paid"] == 40 and order["notes"] == ""
    supplier = theirs.supplier(their["supplier"])
    assert supplier["outstanding"] == 500 and supplier["purchases"] == [] and supplier["payments"] == []
    assert [e["amount"] for e in theirs.get("/api/expenses")["items"]] == [1000]
    staff = {u["id"]: u for u in theirs.get("/api/users")}
    assert staff[their["user"]]["is_active"] is True
