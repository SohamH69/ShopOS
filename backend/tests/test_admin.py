"""ShopOS admin: separate accounts and tokens, the shops list, stats, suspend/reactivate, plans."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api_helpers import Api
from conftest import TEST_PASSWORD, ShopAccount, auth_headers
from app import admin_cli

SUSPENDED = "This shop has been suspended by ShopOS. Contact ShopOS support to reopen it."


def make_admin(password: str = TEST_PASSWORD) -> str:
    email = f"admin-{uuid.uuid4().hex[:10]}@shopos.dev"
    assert admin_cli.main(["create", "--email", email, "--name", "Dev Admin", "--password", password]) == 0
    return email


@pytest.fixture(scope="module")
def admin_email() -> str:
    return make_admin()


@pytest.fixture
def admin(client: TestClient, admin_email: str) -> Api:
    response = client.post("/api/admin/auth/login", json={"email": admin_email, "password": TEST_PASSWORD})
    assert response.status_code == 200, response.text
    return Api(client, auth_headers(response.json()["token"]))


def test_admin_sign_in(client: TestClient, admin_email: str) -> None:
    wrong = client.post("/api/admin/auth/login", json={"email": admin_email, "password": "nope-nope-nope"})
    assert wrong.status_code == 401
    unknown = client.post("/api/admin/auth/login", json={"email": "nobody@x.dev", "password": TEST_PASSWORD})
    assert unknown.status_code == 401
    ok = client.post("/api/admin/auth/login", json={"email": admin_email.upper(), "password": TEST_PASSWORD})
    assert ok.status_code == 200
    body = ok.json()
    assert body["admin"]["email"] == admin_email
    me = client.get("/api/admin/me", headers=auth_headers(body["token"])).json()
    assert me["name"] == "Dev Admin" and me["last_login_at"] is not None


def test_admin_and_shop_tokens_never_cross(
    client: TestClient, admin: Api, demo_headers: dict[str, str]
) -> None:
    assert client.get("/api/admin/stats", headers=demo_headers).status_code == 401
    assert client.get("/api/admin/stats").status_code == 401
    assert client.get("/api/dashboard", headers=admin.headers).status_code == 401
    assert client.get("/api/auth/me", headers=admin.headers).status_code == 401


def test_admin_cli_refuses_duplicates_and_password_change_signs_out(client: TestClient) -> None:
    email = make_admin()
    assert admin_cli.main(["create", "--email", email, "--name", "Again", "--password", TEST_PASSWORD]) == 1
    token = client.post("/api/admin/auth/login", json={"email": email, "password": TEST_PASSWORD}).json()["token"]
    assert client.get("/api/admin/me", headers=auth_headers(token)).status_code == 200
    assert admin_cli.main(["password", "--email", email, "--password", "a-brand-new-pass"]) == 0
    assert client.get("/api/admin/me", headers=auth_headers(token)).status_code == 401
    assert admin_cli.main(["disable", "--email", email]) == 0
    refused = client.post("/api/admin/auth/login", json={"email": email, "password": "a-brand-new-pass"})
    assert refused.status_code == 401
    assert admin_cli.main(["password", "--email", "missing@x.dev", "--password", TEST_PASSWORD]) == 1


def test_shops_list_search_and_filters(
    admin: Api, signup_shop: Callable[..., ShopAccount], demo_auth: dict[str, Any]
) -> None:
    fresh = signup_shop(shop_name="Admin Search Stores")
    unfinished = signup_shop(shop_name="Half Done Mart", setup=False)

    by_code = admin.get("/api/admin/shops", params={"search": fresh.session["shop"]["code"]})
    assert by_code["total"] == 1
    row = by_code["items"][0]
    assert row["name"] == "Admin Search Stores" and row["setup_complete"] is True
    assert row["photo_url"] and row["latitude"] is not None
    assert row["orders_count"] == 0 and row["last_active_at"] is not None

    incomplete = admin.get("/api/admin/shops", params={"status": "setup_incomplete", "limit": 200})
    ids = {item["id"] for item in incomplete["items"]}
    assert unfinished.shop_id in ids and fresh.shop_id not in ids

    demo = admin.get("/api/admin/shops", params={"status": "demo"})
    assert [item["id"] for item in demo["items"]] == [demo_auth["shop"]["id"]]
    assert demo["items"][0]["orders_count"] > 100

    active = admin.get("/api/admin/shops", params={"status": "active", "limit": 200})
    assert demo_auth["shop"]["id"] not in {item["id"] for item in active["items"]}


def test_shop_detail(admin: Api, api: Api, owner: ShopAccount) -> None:
    customer = api.create_customer(name="Due Customer")
    product = api.create_product(name="Tea", stock_quantity=10, selling_price=100)
    api.create_order([{"product_id": product["id"], "quantity": 2}], customer_id=customer["id"])
    detail = admin.get(f"/api/admin/shops/{owner.shop_id}")
    assert detail["totals"] == {"sales_30d": 200, "orders_30d": 1, "outstanding": 200, "products": 1, "staff": 0}
    assert [user["role"] for user in detail["users"]] == ["owner"]
    assert detail["address"] == "12 Market Road"
    assert detail["is_suspended"] is False and detail["actions"] == []
    admin.get("/api/admin/shops/99999999", status=404)


def test_suspend_and_reactivate(
    client: TestClient, admin: Api, api: Api, owner: ShopAccount
) -> None:
    customer = api.create_customer(name="Link Holder")
    token = api.get(f"/api/customers/{customer['id']}/portal-link")["token"]

    assert admin.raw("POST", f"/api/admin/shops/{owner.shop_id}/suspend", json={"reason": "  "}).status_code == 400
    detail = admin.post(f"/api/admin/shops/{owner.shop_id}/suspend", {"reason": "Spam orders reported"})
    assert detail["is_suspended"] is True and detail["suspended_reason"] == "Spam orders reported"
    assert detail["actions"][0]["action"] == "suspend" and detail["actions"][0]["admin_name"] == "Dev Admin"

    signed_in = client.get("/api/dashboard", headers=owner.headers)
    assert signed_in.status_code == 401 and signed_in.json()["detail"] == SUSPENDED
    login = client.post("/api/auth/login", json={"identifier": owner.email, "password": owner.password})
    assert login.status_code == 403 and login.json()["detail"] == SUSPENDED
    assert client.get(f"/api/portal/{token}").status_code == 404
    assert admin.raw("POST", f"/api/admin/shops/{owner.shop_id}/suspend", json={"reason": "again"}).status_code == 409

    back = admin.post(f"/api/admin/shops/{owner.shop_id}/reactivate")
    assert back["is_suspended"] is False and back["suspended_reason"] == ""
    assert [action["action"] for action in back["actions"]] == ["reactivate", "suspend"]
    assert client.get("/api/dashboard", headers=owner.headers).status_code == 200
    assert client.get(f"/api/portal/{token}").status_code == 200


def test_demo_shop_cannot_be_suspended(admin: Api, demo_auth: dict[str, Any]) -> None:
    response = admin.raw("POST", f"/api/admin/shops/{demo_auth['shop']['id']}/suspend", json={"reason": "test"})
    assert response.status_code == 400


def test_change_plan(admin: Api, api: Api, owner: ShopAccount) -> None:
    detail = admin.patch(f"/api/admin/shops/{owner.shop_id}", {"plan": "pro"})
    assert detail["plan"] == "pro"
    assert detail["actions"][0]["detail"] == "free → pro"
    assert api.get("/api/shop")["plan"] == "pro"
    assert admin.raw("PATCH", f"/api/admin/shops/{owner.shop_id}", json={"plan": "platinum"}).status_code == 422


def test_stats_leave_the_demo_shop_out(admin: Api, signup_shop: Callable[..., ShopAccount]) -> None:
    before = admin.get("/api/admin/stats")
    signup_shop(setup=False)
    after = admin.get("/api/admin/stats")
    assert after["shops_total"] == before["shops_total"] + 1
    assert after["shops_new_30d"] == before["shops_new_30d"] + 1
    assert after["shops_setup_incomplete"] == before["shops_setup_incomplete"] + 1
    assert after["signups_30d"][-1]["count"] == before["signups_30d"][-1]["count"] + 1
    assert len(after["signups_30d"]) == 30
    assert [entry["plan"] for entry in after["by_plan"]] == ["free", "basic", "pro", "business"]
    # The demo shop is the only shop on the Basic plan, and it is not counted.
    assert dict((entry["plan"], entry["count"]) for entry in after["by_plan"])["basic"] == 0
