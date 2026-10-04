"""Auth: signup, login by email and phone, demo, /auth/me, tokens, password change, lockouts.

Derived from SPEC section 3 (auth rows) and the security notes in section 4.
"""

from __future__ import annotations

import base64
import json
import time
from collections.abc import Callable
from typing import Any

import httpx
import jwt
from fastapi.testclient import TestClient

from api_helpers import (
    ACCOUNT_OFF,
    ALL_PERMISSIONS,
    SIGN_IN,
    WRONG_LOGIN,
    Api,
    digits,
    error,
    ok,
    rejected,
)
from conftest import DEMO_PASSWORD, TEST_PASSWORD, ShopAccount, StaffAccount, auth_headers

TEST_SECRET = "shopos-test-secret-key"  # conftest sets SHOPOS_SECRET_KEY to this value


def login(client: TestClient, identifier: str, password: str) -> httpx.Response:
    return client.post("/api/auth/login", json={"identifier": identifier, "password": password})


def me(client: TestClient, token: str) -> httpx.Response:
    return client.get("/api/auth/me", headers=auth_headers(token))


# ---------------------------------------------------------------------------
# Signup
# ---------------------------------------------------------------------------


def test_signup_creates_a_shop_whose_owner_has_every_permission(
    client: TestClient, unique_phone: Callable[[], str], unique_email: Callable[[], str]
) -> None:
    phone, email = unique_phone(), unique_email()
    body = {
        "shop_name": "Sai Kirana Stores",
        "owner_name": "Sai Patil",
        "phone": phone,
        "email": email,
        "password": TEST_PASSWORD,
        "city": "Nashik",
        "segment": "Grocery",
    }
    session = ok(client.post("/api/auth/signup", json=body), 201)

    assert set(session) == {"token", "user", "shop", "permissions"}
    user, shop = session["user"], session["shop"]
    assert user["role"] == "owner" and user["is_active"] is True
    assert user["name"] == "Sai Patil" and user["email"] == email
    assert digits(user["phone"]).endswith(phone)
    assert shop["name"] == "Sai Kirana Stores" and shop["owner_name"] == "Sai Patil"
    assert shop["city"] == "Nashik" and shop["segment"] == "Grocery"
    assert digits(shop["phone"]).endswith(phone)
    assert shop["plan"] in {"free", "basic", "pro", "business"}
    assert set(session["permissions"]) == ALL_PERMISSIONS

    current = ok(me(client, session["token"]))
    assert current["user"]["id"] == user["id"] and current["shop"]["id"] == shop["id"]


def test_signup_without_email_is_allowed(client: TestClient, unique_phone: Callable[[], str]) -> None:
    phone = unique_phone()
    session = ok(
        client.post(
            "/api/auth/signup",
            json={"shop_name": "No Mail Mart", "owner_name": "Anil", "phone": phone, "password": TEST_PASSWORD},
        ),
        201,
    )
    assert session["user"]["email"] is None
    assert ok(login(client, phone, TEST_PASSWORD))["user"]["id"] == session["user"]["id"]


def test_signup_rejects_a_phone_or_email_that_is_already_registered(
    client: TestClient,
    signup_shop: Callable[..., ShopAccount],
    unique_phone: Callable[[], str],
    unique_email: Callable[[], str],
) -> None:
    existing = signup_shop()
    base = {"shop_name": "Copy Cat", "owner_name": "Copy", "password": TEST_PASSWORD}

    same_phone = client.post("/api/auth/signup", json={**base, "phone": existing.phone, "email": unique_email()})
    error(same_phone, 409)
    same_email = client.post("/api/auth/signup", json={**base, "phone": unique_phone(), "email": existing.email})
    error(same_email, 409)


def test_signup_validates_password_length_and_required_fields(
    client: TestClient, unique_phone: Callable[[], str]
) -> None:
    phone = unique_phone()
    short = client.post(
        "/api/auth/signup",
        json={"shop_name": "Short", "owner_name": "Short", "phone": phone, "password": "1234567"},
    )
    rejected(short, 400, 422)
    # Nothing was created, so the phone can't sign in.
    error(login(client, phone, "1234567"), 401)

    missing_name = client.post(
        "/api/auth/signup", json={"owner_name": "X", "phone": unique_phone(), "password": TEST_PASSWORD}
    )
    assert missing_name.status_code == 422
    blank_name = client.post(
        "/api/auth/signup",
        json={"shop_name": "   ", "owner_name": "X", "phone": unique_phone(), "password": TEST_PASSWORD},
    )
    rejected(blank_name, 400, 422)


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


def test_login_with_email_and_with_phone(client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    account = signup_shop()

    by_email = ok(login(client, account.email, account.password))
    by_phone = ok(login(client, account.phone, account.password))

    assert set(by_email) == {"token", "user", "shop", "permissions"}
    assert by_email["user"]["id"] == by_phone["user"]["id"] == account.user["id"]
    assert by_email["shop"]["id"] == by_phone["shop"]["id"] == account.shop_id
    assert by_phone["user"]["last_login_at"] is not None
    for session in (by_email, by_phone):
        assert ok(me(client, session["token"]))["user"]["id"] == account.user["id"]


def test_demo_owner_signs_in_with_the_documented_phone_number(client: TestClient) -> None:
    session = ok(login(client, "9876500001", DEMO_PASSWORD))
    assert session["user"]["email"] == "demo@shopos.app"
    assert session["user"]["role"] == "owner"
    assert session["shop"]["name"] == "Raj Local Mart"


def test_demo_staff_accounts_have_their_roles(client: TestClient) -> None:
    expected = {
        "sunita@shopos.app": ("Sunita Joshi", "manager"),
        "arjun@shopos.app": ("Arjun Pawar", "employee"),
        "meera@shopos.app": ("Meera Iyer", "accountant"),
    }
    for email, (name, role) in expected.items():
        session = ok(login(client, email, DEMO_PASSWORD))
        assert (session["user"]["name"], session["user"]["role"]) == (name, role)
        assert session["shop"]["name"] == "Raj Local Mart"


def test_wrong_password_and_unknown_identifier_get_the_same_401(
    client: TestClient, signup_shop: Callable[..., ShopAccount]
) -> None:
    account = signup_shop()
    assert error(login(client, account.email, "not-the-password"), 401) == WRONG_LOGIN
    assert error(login(client, account.phone, "not-the-password"), 401) == WRONG_LOGIN
    assert error(login(client, "nobody-here@example.com", TEST_PASSWORD), 401) == WRONG_LOGIN
    assert error(login(client, "6000000000", TEST_PASSWORD), 401) == WRONG_LOGIN


def test_turned_off_staff_cannot_sign_in_or_keep_using_old_tokens(
    client: TestClient,
    signup_shop: Callable[..., ShopAccount],
    create_staff: Callable[..., StaffAccount],
) -> None:
    owner = signup_shop()
    staff = create_staff(owner.headers, "employee")
    assert ok(me(client, staff.token))["user"]["id"] == staff.user["id"]

    turned_off = ok(
        client.patch(f"/api/users/{staff.user['id']}", headers=owner.headers, json={"is_active": False})
    )
    assert turned_off["is_active"] is False

    assert error(login(client, staff.identifier, staff.password), 403) == ACCOUNT_OFF
    assert me(client, staff.token).status_code in (401, 403)
    assert client.get("/api/orders", headers=staff.headers).status_code in (401, 403)

    ok(client.patch(f"/api/users/{staff.user['id']}", headers=owner.headers, json={"is_active": True}))
    assert ok(login(client, staff.identifier, staff.password))["user"]["is_active"] is True


def test_five_failed_logins_lock_that_identifier_for_a_while(
    client: TestClient, signup_shop: Callable[..., ShopAccount]
) -> None:
    account = signup_shop()
    bystander = signup_shop()

    for _ in range(5):
        assert error(login(client, account.email, "wrong-password"), 401) == WRONG_LOGIN

    # Even the right password is refused while the identifier is locked.
    error(login(client, account.email, account.password), 429)
    error(login(client, account.email, "wrong-password"), 429)
    # Other identifiers are not affected.
    assert ok(login(client, bystander.email, bystander.password))["user"]["id"] == bystander.user["id"]


def test_four_failures_do_not_lock(client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    account = signup_shop()
    for _ in range(4):
        error(login(client, account.phone, "wrong-password"), 401)
    ok(login(client, account.phone, account.password))


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------


def test_demo_login_returns_the_seeded_owner_and_shop(client: TestClient) -> None:
    first = ok(client.post("/api/auth/demo"))
    user, shop = first["user"], first["shop"]

    assert (user["name"], user["role"], user["email"]) == ("Raj Deshmukh", "owner", "demo@shopos.app")
    assert shop["name"] == "Raj Local Mart"
    assert shop["owner_name"] == "Raj Deshmukh"
    assert shop["city"] == "Pune" and shop["segment"] == "Grocery" and shop["plan"] == "basic"
    assert shop["phone"] == "+91 98765 00001"
    assert shop["upi_id"] == "rajlocalmart@upi"
    assert shop["address"] == "Shop 4, Lane 3, Model Colony, Pune 411016"
    assert set(first["permissions"]) == ALL_PERMISSIONS
    assert ok(me(client, first["token"]))["shop"]["id"] == shop["id"]

    # Signing in to the demo again reuses the same shop instead of creating another.
    again = ok(client.post("/api/auth/demo"))
    assert again["shop"]["id"] == shop["id"] and again["user"]["id"] == user["id"]


# ---------------------------------------------------------------------------
# /auth/me and tokens
# ---------------------------------------------------------------------------


def test_me_returns_the_session_without_a_token(client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    account = signup_shop()
    session = ok(me(client, account.token))
    assert set(session) == {"user", "shop", "permissions"}
    assert session["user"]["id"] == account.user["id"]
    assert session["shop"]["id"] == account.shop_id
    assert set(session["permissions"]) == ALL_PERMISSIONS


def test_missing_or_malformed_credentials_get_401(client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    account = signup_shop()
    assert error(client.get("/api/auth/me"), 401) == SIGN_IN
    for header in ("Bearer", "Bearer ", f"Token {account.token}", account.token, "Bearer not.a.jwt"):
        response = client.get("/api/auth/me", headers={"Authorization": header})
        assert error(response, 401) == SIGN_IN, header


def _unsigned(claims: dict[str, Any]) -> str:
    def b64(data: dict[str, Any]) -> str:
        raw = json.dumps(data, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64(claims)}."


def test_forged_expired_and_unsigned_tokens_are_rejected(
    client: TestClient, signup_shop: Callable[..., ShopAccount]
) -> None:
    account = signup_shop()
    claims = jwt.decode(account.token, options={"verify_signature": False})
    assert {"sub", "shop", "ver", "iat", "exp"} <= set(claims)

    # Sanity check: the same claims re-signed with the server's key are accepted.
    resigned = jwt.encode(claims, TEST_SECRET, algorithm="HS256")
    assert me(client, resigned).status_code == 200

    now = int(time.time())
    expired = jwt.encode({**claims, "iat": now - 7200, "exp": now - 60}, TEST_SECRET, algorithm="HS256")
    wrong_key = jwt.encode(claims, "not-the-server-secret-key-at-all", algorithm="HS256")
    stale_version = jwt.encode({**claims, "ver": claims["ver"] + 1}, TEST_SECRET, algorithm="HS256")
    for token in (expired, wrong_key, _unsigned(claims), stale_version):
        assert error(me(client, token), 401) == SIGN_IN


def test_a_token_cannot_be_pointed_at_another_shop(
    client: TestClient, signup_shop: Callable[..., ShopAccount]
) -> None:
    mine, theirs = signup_shop(), signup_shop()
    their_api = Api(client, theirs.headers)
    their_customer = their_api.create_customer(name="Their Private Customer")

    claims = jwt.decode(mine.token, options={"verify_signature": False})
    hijack = jwt.encode({**claims, "shop": theirs.shop_id}, TEST_SECRET, algorithm="HS256")
    response = client.get("/api/customers", headers=auth_headers(hijack))
    if response.status_code == 200:
        assert all(c["id"] != their_customer["id"] for c in response.json())
        assert client.get(f"/api/customers/{their_customer['id']}", headers=auth_headers(hijack)).status_code == 404
    else:
        assert error(response, 401) == SIGN_IN


# ---------------------------------------------------------------------------
# Change password
# ---------------------------------------------------------------------------


def test_change_password_signs_out_every_older_token(
    client: TestClient, signup_shop: Callable[..., ShopAccount]
) -> None:
    account = signup_shop()
    other_device = ok(login(client, account.email, account.password))["token"]

    result = ok(
        client.post(
            "/api/auth/change-password",
            headers=account.headers,
            json={"current_password": account.password, "new_password": "fresh-pass-5678"},
        )
    )
    assert set(result) == {"ok", "token"} and result["ok"] is True

    assert error(me(client, account.token), 401) == SIGN_IN
    assert error(me(client, other_device), 401) == SIGN_IN
    assert ok(me(client, result["token"]))["user"]["id"] == account.user["id"]

    assert error(login(client, account.email, account.password), 401) == WRONG_LOGIN
    assert ok(login(client, account.phone, "fresh-pass-5678"))["user"]["id"] == account.user["id"]


def test_change_password_with_a_wrong_current_password_keeps_the_user_signed_in(
    client: TestClient, signup_shop: Callable[..., ShopAccount]
) -> None:
    account = signup_shop()
    wrong = client.post(
        "/api/auth/change-password",
        headers=account.headers,
        json={"current_password": "not-my-password", "new_password": "fresh-pass-5678"},
    )
    # 400, not 401: the web client signs the user out on any 401, and a typo must not do that.
    error(wrong, 400)
    short = client.post(
        "/api/auth/change-password",
        headers=account.headers,
        json={"current_password": account.password, "new_password": "short"},
    )
    rejected(short, 400, 422)

    assert me(client, account.token).status_code == 200
    ok(login(client, account.email, account.password))


def test_change_password_needs_a_signed_in_user(client: TestClient) -> None:
    response = client.post(
        "/api/auth/change-password", json={"current_password": "whatever1", "new_password": "whatever2"}
    )
    assert error(response, 401) == SIGN_IN


# ---------------------------------------------------------------------------
# Identifier normalisation
# ---------------------------------------------------------------------------


def test_email_sign_in_ignores_letter_case_and_spaces(client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    account = signup_shop()
    session = ok(login(client, f"  {account.email.upper()} ", account.password))
    assert session["user"]["id"] == account.user["id"]


def test_signup_treats_differently_cased_emails_as_the_same(
    client: TestClient, signup_shop: Callable[..., ShopAccount], unique_phone: Callable[[], str]
) -> None:
    existing = signup_shop()
    response = client.post(
        "/api/auth/signup",
        json={"shop_name": "Case Copy", "owner_name": "Copy", "phone": unique_phone(), "email": existing.email.upper(), "password": TEST_PASSWORD},
    )
    error(response, 409)


def test_phone_formats_share_one_lockout(client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    account = signup_shop()
    formatted = f"+91 {account.phone[:5]} {account.phone[5:]}"
    for identifier in (formatted, account.phone, f"0{account.phone}", formatted, account.phone):
        error(login(client, identifier, "wrong-password"), 401)
    # Re-typing the number another way does not get around the limit.
    error(login(client, account.phone, account.password), 429)
    error(login(client, f"91{account.phone}", account.password), 429)


def test_owner_password_reset_signs_the_staff_member_out(
    client: TestClient, signup_shop: Callable[..., ShopAccount], create_staff: Callable[..., StaffAccount]
) -> None:
    owner = signup_shop()
    staff = create_staff(owner.headers, "employee")
    ok(client.patch(f"/api/users/{staff.user['id']}", headers=owner.headers, json={"password": "owner-reset-1"}))
    assert error(me(client, staff.token), 401) == SIGN_IN
    error(login(client, staff.identifier, staff.password), 401)
    assert ok(login(client, staff.identifier, "owner-reset-1"))["user"]["id"] == staff.user["id"]
