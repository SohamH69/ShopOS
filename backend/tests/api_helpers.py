"""Helpers shared by the black-box API test modules.

Everything here talks to the API over HTTP through the session ``TestClient``. The one
exception is ``backdate``: the API always stamps records with "now", so tests that need
records on either side of IST midnight (or weeks ago) rewrite the stored timestamp
directly through the ORM after creating the record through the API.
"""

from __future__ import annotations

import itertools
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import httpx
from fastapi.testclient import TestClient

IST = timezone(timedelta(hours=5, minutes=30))

ALL_PERMISSIONS = frozenset(
    {
        "dashboard",
        "orders",
        "customers",
        "payments",
        "inventory",
        "suppliers",
        "expenses",
        "reports",
        "staff",
        "settings",
    }
)

# SPEC section 2, "Roles & permissions".
DEFAULT_PERMISSIONS: dict[str, frozenset[str]] = {
    "owner": ALL_PERMISSIONS,
    "manager": frozenset(
        {"dashboard", "orders", "customers", "payments", "inventory", "suppliers", "reports"}
    ),
    "employee": frozenset({"dashboard", "orders", "customers"}),
    "accountant": frozenset({"dashboard", "payments", "expenses", "reports"}),
}

WRONG_LOGIN = "Phone/email or password is incorrect."
ACCOUNT_OFF = "This account is turned off. Ask the shop owner."
SIGN_IN = "Sign in to continue."
WALK_IN_CREDIT = "Add a customer to sell on credit."
VOID_FIRST = "Void this order's payments before cancelling it."

_ISO_WITH_OFFSET = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$")
_counter = itertools.count(1)


# ---------------------------------------------------------------------------
# Values
# ---------------------------------------------------------------------------


def unique(prefix: str) -> str:
    """A name that is unique within the test session."""
    return f"{prefix} {next(_counter)}"


def customer_phone() -> str:
    """A 10-digit Indian mobile number for a customer (unique within the session)."""
    return str(6_900_000_000 + next(_counter))


def digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def now_ist() -> datetime:
    return datetime.now(IST)


def today_ist() -> date:
    return now_ist().date()


def at_ist(day: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    """An aware datetime at the given IST wall-clock time."""
    return datetime.combine(day, time(hour, minute, second), tzinfo=IST)


def parse_dt(value: str) -> datetime:
    """Parse an API datetime, insisting on an explicit UTC offset (types.ts convention)."""
    assert isinstance(value, str) and _ISO_WITH_OFFSET.match(value), f"not ISO with offset: {value!r}"
    return datetime.fromisoformat(value)


def is_iso_datetime(value: Any) -> bool:
    return isinstance(value, str) and bool(_ISO_WITH_OFFSET.match(value))


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------


def ok(response: httpx.Response, status: int = 200) -> Any:
    """Assert the status code and return the JSON body."""
    assert response.status_code == status, f"expected {status}, got {response.status_code}: {response.text}"
    return response.json()


def error(response: httpx.Response, status: int) -> str:
    """Assert a ``{"detail": "<sentence>."}`` error body with this status; return the sentence."""
    assert response.status_code == status, f"expected {status}, got {response.status_code}: {response.text}"
    body = response.json()
    assert set(body) == {"detail"}, body
    detail = body["detail"]
    assert isinstance(detail, str) and detail.strip() and detail.endswith("."), body
    return detail


def rejected(response: httpx.Response, *statuses: int) -> int:
    """Assert the request failed with one of ``statuses`` (where the spec leaves the exact code open)."""
    assert response.status_code in statuses, (
        f"expected one of {statuses}, got {response.status_code}: {response.text}"
    )
    if response.status_code != 422:
        error(response, response.status_code)
    return response.status_code


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


def line(product: dict[str, Any], quantity: float, **extra: Any) -> dict[str, Any]:
    """An order line for an inventory product."""
    return {"product_id": product["id"], "quantity": quantity, **extra}


def custom_item(unit_price: float, quantity: float = 1, name: str = "Custom item", **extra: Any) -> dict[str, Any]:
    """An order line that is not an inventory product."""
    return {"name": name, "quantity": quantity, "unit_price": unit_price, **extra}


# ---------------------------------------------------------------------------
# API client bound to one signed-in user
# ---------------------------------------------------------------------------


@dataclass
class Api:
    client: TestClient
    headers: dict[str, str]

    # Raw HTTP -------------------------------------------------------------

    def raw(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: dict[str, Any] | None = None,
    ) -> httpx.Response:
        return self.client.request(method, path, json=json, params=params, headers=self.headers)

    def get(self, path: str, *, params: dict[str, Any] | None = None, status: int = 200) -> Any:
        return ok(self.raw("GET", path, params=params), status)

    def post(self, path: str, body: Any = None, *, status: int = 200) -> Any:
        return ok(self.raw("POST", path, json=body), status)

    def patch(self, path: str, body: Any, *, status: int = 200) -> Any:
        return ok(self.raw("PATCH", path, json=body), status)

    def put(self, path: str, body: Any, *, status: int = 200) -> Any:
        return ok(self.raw("PUT", path, json=body), status)

    def delete(self, path: str, *, status: int = 200) -> Any:
        return ok(self.raw("DELETE", path), status)

    # Builders -------------------------------------------------------------

    def create_product(self, **fields: Any) -> dict[str, Any]:
        body: dict[str, Any] = {
            "name": unique("Product"),
            "category": "General",
            "selling_price": 10,
        }
        body.update(fields)
        return dict(self.post("/api/products", body, status=201))

    def create_customer(self, **fields: Any) -> dict[str, Any]:
        body: dict[str, Any] = {"name": unique("Customer"), "phone": customer_phone()}
        body.update(fields)
        return dict(self.post("/api/customers", body, status=201))

    def create_order(self, items: list[dict[str, Any]], **fields: Any) -> dict[str, Any]:
        body: dict[str, Any] = {"items": items}
        body.update(fields)
        return dict(self.post("/api/orders", body, status=201))

    def create_supplier(self, **fields: Any) -> dict[str, Any]:
        body: dict[str, Any] = {"name": unique("Supplier"), "phone": customer_phone()}
        body.update(fields)
        return dict(self.post("/api/suppliers", body, status=201))

    def create_expense(self, **fields: Any) -> dict[str, Any]:
        body: dict[str, Any] = {"category": "miscellaneous", "amount": 100}
        body.update(fields)
        return dict(self.post("/api/expenses", body, status=201))

    # Shortcuts ------------------------------------------------------------

    def set_status(self, order_id: int, status: str) -> dict[str, Any]:
        return dict(self.post(f"/api/orders/{order_id}/status", {"status": status}))

    def pay_order(self, order_id: int, amount: float, method: str = "cash", **extra: Any) -> dict[str, Any]:
        body = {"amount": amount, "method": method, **extra}
        return dict(self.post(f"/api/orders/{order_id}/payments", body, status=201))

    def order(self, order_id: int) -> dict[str, Any]:
        return dict(self.get(f"/api/orders/{order_id}"))

    def product(self, product_id: int) -> dict[str, Any]:
        return dict(self.get(f"/api/products/{product_id}"))

    def customer(self, customer_id: int) -> dict[str, Any]:
        return dict(self.get(f"/api/customers/{customer_id}"))

    def supplier(self, supplier_id: int) -> dict[str, Any]:
        return dict(self.get(f"/api/suppliers/{supplier_id}"))

    def transactions(self, product_id: int) -> list[dict[str, Any]]:
        return list(self.get(f"/api/products/{product_id}/transactions"))

    def dashboard(self) -> dict[str, Any]:
        return dict(self.get("/api/dashboard"))


# ---------------------------------------------------------------------------
# Direct database access (timestamps only)
# ---------------------------------------------------------------------------


def backdate(model_name: str, row_id: int, **timestamps: datetime) -> None:
    """Overwrite timestamp columns of one stored row, e.g. ``backdate("Order", 5, created_at=dt)``.

    The API never accepts creation times, so this is how tests place orders and payments
    just before or after IST midnight. Values must be timezone-aware.
    """
    from app import models
    from app.db import SessionLocal

    model = getattr(models, model_name)
    with SessionLocal() as session:
        row = session.get(model, row_id)
        assert row is not None, f"{model_name} {row_id} not found"
        for column, value in timestamps.items():
            assert value.tzinfo is not None, "pass timezone-aware datetimes"
            assert hasattr(row, column), f"{model_name} has no column {column}"
            setattr(row, column, value.astimezone(timezone.utc))
        session.commit()


def move_promise_date(customer_id: int, day: date) -> None:
    """Set a stored payment-promise date directly.

    The API only accepts promises for today or later, so this is how tests get a promise
    whose date has already passed (an overdue promise).
    """
    from app import models
    from app.db import SessionLocal

    with SessionLocal() as session:
        customer = session.get(models.Customer, customer_id)
        assert customer is not None and customer.promise_date is not None, "set a promise through the API first"
        customer.promise_date = day
        session.commit()


def backdate_order(api: Api, order: dict[str, Any], when: datetime) -> None:
    """Move an order, its payments and completion time to ``when`` (payments a few seconds later)."""
    stamps: dict[str, datetime] = {"created_at": when, "updated_at": when}
    if order.get("completed_at"):
        stamps["completed_at"] = when
    backdate("Order", order["id"], **stamps)
    for offset, payment in enumerate(api.order(order["id"])["payments"], start=1):
        backdate("Payment", payment["id"], paid_at=when + timedelta(seconds=offset))
