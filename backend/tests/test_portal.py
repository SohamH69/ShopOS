"""The customer side: khata links shared on WhatsApp, what customers see, and orders they send."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api_helpers import Api, line
from conftest import ShopAccount
from app.security import portal_order_limiter

LINK_NOT_VALID = "This khata link doesn't work any more. Ask the shop to send you a new one."


@pytest.fixture(autouse=True)
def _reset_order_limits() -> Iterator[None]:
    portal_order_limiter.clear()
    yield
    portal_order_limiter.clear()


def link(api: Api, customer_id: int) -> dict[str, Any]:
    return api.get(f"/api/customers/{customer_id}/portal-link")


def portal(client: TestClient, token: str, suffix: str = "") -> Any:
    return client.get(f"/api/portal/{token}{suffix}")


def place(client: TestClient, token: str, body: dict[str, Any]) -> Any:
    return client.post(f"/api/portal/{token}/orders", json=body)


@pytest.fixture
def shop(api: Api) -> dict[str, Any]:
    """A shop with two products, a customer with dues, and that customer's link token."""
    rice = api.create_product(name="Basmati Rice", unit="kg", stock_quantity=20, selling_price=90)
    soap = api.create_product(name="Bath Soap", unit="pcs", stock_quantity=0, selling_price=30)
    customer = api.create_customer(name="Asha Pawar", address="Flat 3, Lake View")
    order = api.create_order([line(rice, 2)], customer_id=customer["id"])
    api.pay_order(order["id"], 50, method="upi")
    return {"rice": rice, "soap": soap, "customer": customer, "order": order,
            "token": link(api, customer["id"])["token"]}


def test_the_same_link_until_it_is_reset(client: TestClient, api: Api, shop: dict[str, Any]) -> None:
    customer_id = shop["customer"]["id"]
    first = link(api, customer_id)
    assert first == link(api, customer_id)
    assert first["path"] == f"/c/{first['token']}"
    assert first["last_seen_at"] is None

    fresh = api.post(f"/api/customers/{customer_id}/portal-link/reset")
    assert fresh["token"] != first["token"]
    old = portal(client, first["token"])
    assert old.status_code == 404
    assert old.json()["detail"] == LINK_NOT_VALID
    assert portal(client, fresh["token"]).status_code == 200


def test_customer_sees_their_shop_khata_and_orders(client: TestClient, api: Api, shop: dict[str, Any]) -> None:
    view = portal(client, shop["token"]).json()
    assert set(view) == {"shop", "customer", "ledger", "orders"}
    shop_info = view["shop"]
    assert shop_info["name"] == "Test Kirana"
    assert shop_info["photo_url"] and shop_info["latitude"] is not None
    assert shop_info["catalog_enabled"] is True and shop_info["orders_enabled"] is True
    assert "id" not in shop_info  # only the public shop ID

    shop_side = api.customer(shop["customer"]["id"])
    assert view["customer"]["name"] == "Asha Pawar"
    assert view["customer"]["outstanding"] == shop_side["outstanding"] == 130
    assert [entry["type"] for entry in view["ledger"]] == ["purchase", "payment"]

    (order,) = view["orders"]
    assert order["number"] == shop["order"]["number"]
    assert order["total"] == 180 and order["paid"] == 50 and order["outstanding"] == 130
    assert order["payment_status"] == "partial"
    assert order["items"][0]["name"] == "Basmati Rice"


def test_opening_the_link_is_noted_for_the_shopkeeper(client: TestClient, api: Api, shop: dict[str, Any]) -> None:
    portal(client, shop["token"])
    first = link(api, shop["customer"]["id"])["last_seen_at"]
    assert first is not None
    portal(client, shop["token"])  # again within a few minutes: no new write
    assert link(api, shop["customer"]["id"])["last_seen_at"] == first


def test_a_busy_database_never_breaks_the_page(
    client: TestClient, shop: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from sqlalchemy.exc import OperationalError

    from app.services import portal as portal_service

    def locked() -> Any:
        raise OperationalError("UPDATE customers", {}, Exception("database is locked"))

    monkeypatch.setattr(portal_service, "_write_session", locked)
    assert portal(client, shop["token"]).status_code == 200


def test_forged_and_unknown_links_are_refused(client: TestClient, api: Api, shop: dict[str, Any]) -> None:
    customer_id, version, signature = shop["token"].split(".")
    other = api.create_customer(name="Someone Else")
    for token in (
        f"{other['id']}.{version}.{signature}",  # someone else's id, this customer's signature
        f"{customer_id}.{int(version) + 1}.{signature}",
        f"{customer_id}.{version}.{signature[:-1]}A",
        "not-a-token",
        "99999999.0.AAAAAAAAAAAAAAAAAAAAAAAA",
    ):
        response = portal(client, token)
        assert response.status_code in (404, 422), token
    assert place(client, f"{other['id']}.{version}.{signature}", {"items": []}).status_code in (404, 422)


def test_archived_customer_link_stops_working(client: TestClient, api: Api) -> None:
    customer = api.create_customer(name="Moved Away")
    token = link(api, customer["id"])["token"]
    api.delete(f"/api/customers/{customer['id']}")
    assert portal(client, token).status_code == 404


def test_other_shops_cannot_make_links_for_your_customers(
    api: Api, shop: dict[str, Any], signup_shop: Callable[..., ShopAccount], client: TestClient
) -> None:
    stranger = Api(client, signup_shop().headers)
    stranger.get(f"/api/customers/{shop['customer']['id']}/portal-link", status=404)


def test_products_with_prices_and_stock(client: TestClient, api: Api, shop: dict[str, Any]) -> None:
    products = {product["name"]: product for product in portal(client, shop["token"], "/products").json()}
    assert products["Basmati Rice"] == {
        "id": shop["rice"]["id"], "name": "Basmati Rice", "category": products["Basmati Rice"]["category"],
        "unit": "kg", "price": 90, "in_stock": True,
    }
    assert products["Bath Soap"]["in_stock"] is False
    assert "stock_quantity" not in products["Basmati Rice"]  # exact stock stays private

    api.patch("/api/shop", {"portal_catalog": False})
    hidden = portal(client, shop["token"], "/products")
    assert hidden.status_code == 403
    assert portal(client, shop["token"]).json()["shop"]["catalog_enabled"] is False


def test_customer_places_an_order(client: TestClient, api: Api, shop: dict[str, Any]) -> None:
    rice = shop["rice"]
    response = place(client, shop["token"], {
        "items": [{"product_id": rice["id"], "quantity": 1}, {"product_id": rice["id"], "quantity": 2}],
        "fulfillment": "pickup",
        "notes": "Will come at 6",
    })
    assert response.status_code == 201, response.text
    placed = response.json()
    assert placed["status"] == "new" and placed["payment_status"] == "unpaid"
    assert placed["channel"] == "online"
    assert placed["items"] == [
        {"name": "Basmati Rice", "unit": "kg", "quantity": 3, "unit_price": 90, "line_total": 270}
    ]

    shop_side = api.order(placed["id"])
    assert shop_side["customer_id"] == shop["customer"]["id"]
    assert shop_side["channel"] == "online"
    assert shop_side["notes"] == "Will come at 6"
    assert shop_side["created_by_name"] is None
    assert api.product(rice["id"])["reserved_quantity"] == 5  # 2 from the first order + 3

    online = api.get("/api/orders", params={"channel": "online"})
    assert [order["id"] for order in online["items"]] == [placed["id"]]
    assert portal(client, shop["token"]).json()["orders"][0]["id"] == placed["id"]

    attention = {item["key"]: item for item in api.dashboard()["attention"]}
    assert attention["online_orders"]["count"] == 1
    assert attention["online_orders"]["href"] == "/app/orders?status=open&channel=online"


def test_order_rules(client: TestClient, api: Api, shop: dict[str, Any]) -> None:
    token, rice, soap = shop["token"], shop["rice"], shop["soap"]
    out = place(client, token, {"items": [{"product_id": soap["id"], "quantity": 1}]})
    assert out.status_code == 400 and out.json()["detail"] == "Bath Soap is out of stock."

    too_many = place(client, token, {"items": [{"product_id": rice["id"], "quantity": 19}]})
    assert too_many.status_code == 400
    assert too_many.json()["detail"] == "Only 18 kg of Basmati Rice is left."  # 20 in stock, 2 reserved

    assert place(client, token, {"items": [{"product_id": rice["id"], "quantity": 0}]}).status_code == 400
    assert place(client, token, {"items": []}).status_code == 422

    other_shop_product = api.create_product(name="Archived Thing", stock_quantity=5, selling_price=10)
    api.delete(f"/api/products/{other_shop_product['id']}")
    gone = place(client, token, {"items": [{"product_id": other_shop_product["id"], "quantity": 1}]})
    assert gone.status_code == 400

    delivery = place(client, token, {"items": [{"product_id": rice["id"], "quantity": 1}], "fulfillment": "delivery"})
    assert delivery.status_code == 201
    assert api.order(delivery.json()["id"])["delivery_address"] == "Flat 3, Lake View"


def test_delivery_needs_an_address(client: TestClient, api: Api, shop: dict[str, Any]) -> None:
    customer = api.create_customer(name="No Address")
    token = link(api, customer["id"])["token"]
    body = {"items": [{"product_id": shop["rice"]["id"], "quantity": 1}], "fulfillment": "delivery"}
    assert place(client, token, body).status_code == 400
    body["delivery_address"] = "Gate 2, Sunrise Society"
    assert place(client, token, body).status_code == 201


def test_shop_can_stop_taking_orders(client: TestClient, api: Api, shop: dict[str, Any]) -> None:
    api.patch("/api/shop", {"portal_orders": False})
    refused = place(client, shop["token"], {"items": [{"product_id": shop["rice"]["id"], "quantity": 1}]})
    assert refused.status_code == 403
    assert portal(client, shop["token"]).json()["shop"]["orders_enabled"] is False


def test_orders_per_hour_are_limited(client: TestClient, api: Api, shop: dict[str, Any]) -> None:
    body = {"items": [{"product_id": shop["rice"]["id"], "quantity": 0.1}]}
    for _ in range(10):
        assert place(client, shop["token"], body).status_code == 201
    assert place(client, shop["token"], body).status_code == 429
