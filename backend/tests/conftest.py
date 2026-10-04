"""Shared pytest fixtures for the ShopOS backend.

The whole test session runs against a throwaway SQLite database in a temporary folder.
Environment variables are set *before* the app is imported so the engine binds to that
database. Startup behaves like production: tables are created and the demo shop
("Raj Local Mart") is seeded, then shared by every test. Tests that need a clean slate
should sign up their own empty shop with ``signup_shop``; tests that use the demo shop
should create their own records rather than changing seeded ones (or restore them).

Fixtures
    client         Session-wide ``TestClient`` with startup run (tables + demo seed).
    demo_auth      AuthResponse JSON for the demo owner (``POST /api/auth/demo``).
    demo_headers   ``{"Authorization": "Bearer <token>"}`` for the demo owner.
    unique_phone   Factory ``unique_phone() -> str``: an unused 10-digit mobile number.
    unique_email   Factory ``unique_email() -> str``: an unused email address.
    signup_shop    Factory ``signup_shop(**overrides) -> ShopAccount``: signs up a brand-new,
                   empty shop (overrides go into the SignupRequest body).
    create_staff   Factory ``create_staff(owner_headers, role="employee", **overrides)
                   -> StaffAccount``: creates a staff user via ``POST /api/users`` and signs
                   them in (overrides go into the StaffCreate body).
    frontend_dist  Path to a small fake ``frontend/dist`` used by SPA-serving tests.
    owner          A brand-new, empty shop (``ShopAccount``) for one test.
    api            ``api_helpers.Api`` signed in as ``owner`` (fresh empty shop per test).
    module_api     ``api_helpers.Api`` for one empty shop shared by a whole test module.
    reset_demo     Module-scoped, opt-in: drops every table and reseeds the demo shop so a
                   module starts from pristine data (``pytestmark =
                   pytest.mark.usefixtures("reset_demo")``). The reseeded demo rows get the
                   same ids, so ``demo_headers`` stays valid; shops from ``signup_shop`` made
                   earlier are gone.

Helpers importable from tests: ``auth_headers(token)``, ``count_statements()`` (context
manager counting SQL statements, for N+1 checks), ``ShopAccount``, ``StaffAccount``,
``DEMO_PASSWORD``, ``TEST_PASSWORD``.
"""

from __future__ import annotations

import itertools
import os
import shutil
import sys
import tempfile
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DIR = Path(tempfile.mkdtemp(prefix="shopos-tests-"))
FRONTEND_DIST = TEST_DIR / "dist"

os.environ["SHOPOS_DATABASE_URL"] = f"sqlite:///{(TEST_DIR / 'shopos-test.db').as_posix()}"
os.environ["SHOPOS_SECRET_KEY"] = "shopos-test-secret-key"
os.environ["SHOPOS_SEED_DEMO"] = "1"
os.environ["SHOPOS_TOKEN_DAYS"] = "30"
os.environ["SHOPOS_FRONTEND_DIST"] = str(FRONTEND_DIST)
os.environ.pop("SHOPOS_CORS_ORIGINS", None)

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402

from api_helpers import Api  # noqa: E402
from app.main import app  # noqa: E402
from app.security import login_limiter  # noqa: E402

DEMO_PASSWORD = "demo1234"
TEST_PASSWORD = "test-pass-1234"

_phone_counter = itertools.count(1)


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@dataclass
class StatementCount:
    value: int = 0


@contextmanager
def count_statements() -> Iterator[StatementCount]:
    """Count SQL statements sent to the database inside the ``with`` block."""
    from sqlalchemy import event

    from app.db import engine

    counter = StatementCount()

    def on_execute(*_args: Any) -> None:
        counter.value += 1

    event.listen(engine, "before_cursor_execute", on_execute)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", on_execute)


@dataclass
class ShopAccount:
    """A freshly signed-up shop and its owner."""

    session: dict[str, Any]  # the AuthResponse JSON
    phone: str
    email: str
    password: str

    @property
    def token(self) -> str:
        return str(self.session["token"])

    @property
    def headers(self) -> dict[str, str]:
        return auth_headers(self.token)

    @property
    def shop_id(self) -> int:
        return int(self.session["shop"]["id"])

    @property
    def user(self) -> dict[str, Any]:
        return dict(self.session["user"])


@dataclass
class StaffAccount:
    """A staff member created by a shop owner, already signed in."""

    user: dict[str, Any]  # the User JSON returned by POST /api/users
    token: str
    identifier: str  # what they sign in with (email or phone)
    password: str

    @property
    def headers(self) -> dict[str, str]:
        return auth_headers(self.token)


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def demo_auth(client: TestClient) -> dict[str, Any]:
    response = client.post("/api/auth/demo")
    assert response.status_code == 200, response.text
    return dict(response.json())


@pytest.fixture(scope="session")
def demo_headers(demo_auth: dict[str, Any]) -> dict[str, str]:
    return auth_headers(str(demo_auth["token"]))


@pytest.fixture(scope="session")
def unique_phone() -> Callable[[], str]:
    # Numbers starting with 6 never clash with the demo seed (which uses 7/8/9).
    base = 6_000_000_000 + (os.getpid() % 9000) * 10_000

    def make() -> str:
        return str(base + next(_phone_counter))

    return make


@pytest.fixture(scope="session")
def unique_email() -> Callable[[], str]:
    def make() -> str:
        return f"test-{uuid.uuid4().hex[:12]}@example.com"

    return make


@pytest.fixture(scope="session")
def signup_shop(
    client: TestClient, unique_phone: Callable[[], str], unique_email: Callable[[], str]
) -> Callable[..., ShopAccount]:
    def make(**overrides: Any) -> ShopAccount:
        body: dict[str, Any] = {
            "shop_name": "Test Kirana",
            "owner_name": "Test Owner",
            "phone": unique_phone(),
            "email": unique_email(),
            "password": TEST_PASSWORD,
            "city": "Pune",
            "segment": "Grocery",
        }
        body.update(overrides)
        response = client.post("/api/auth/signup", json=body)
        assert response.status_code == 201, response.text
        return ShopAccount(
            session=dict(response.json()),
            phone=str(body["phone"]),
            email=str(body.get("email") or ""),
            password=str(body["password"]),
        )

    return make


@pytest.fixture(scope="session")
def create_staff(
    client: TestClient, unique_email: Callable[[], str]
) -> Callable[..., StaffAccount]:
    def make(owner_headers: dict[str, str], role: str = "employee", **overrides: Any) -> StaffAccount:
        body: dict[str, Any] = {
            "name": f"Test {role.title()}",
            "email": unique_email(),
            "role": role,
            "password": TEST_PASSWORD,
        }
        body.update(overrides)
        response = client.post("/api/users", json=body, headers=owner_headers)
        assert response.status_code == 201, response.text
        identifier = str(body.get("email") or body.get("phone"))
        login = client.post(
            "/api/auth/login", json={"identifier": identifier, "password": body["password"]}
        )
        assert login.status_code == 200, login.text
        return StaffAccount(
            user=dict(response.json()),
            token=str(login.json()["token"]),
            identifier=identifier,
            password=str(body["password"]),
        )

    return make


@pytest.fixture(scope="session")
def frontend_dist() -> Path:
    """A minimal built frontend at SHOPOS_FRONTEND_DIST for SPA-serving tests."""
    (FRONTEND_DIST / "assets").mkdir(parents=True, exist_ok=True)
    (FRONTEND_DIST / "icons").mkdir(parents=True, exist_ok=True)
    (FRONTEND_DIST / "index.html").write_text(
        "<!doctype html><title>ShopOS</title><div id=root></div>", encoding="utf-8"
    )
    (FRONTEND_DIST / "sw.js").write_text("self.addEventListener('fetch', () => {});", encoding="utf-8")
    (FRONTEND_DIST / "manifest.webmanifest").write_text('{"name": "ShopOS"}', encoding="utf-8")
    (FRONTEND_DIST / "assets" / "index-abc123.js").write_text("console.log('ok');", encoding="utf-8")
    (FRONTEND_DIST / "icons" / "icon-192.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    return FRONTEND_DIST


@pytest.fixture
def owner(signup_shop: Callable[..., ShopAccount]) -> ShopAccount:
    """A brand-new, empty shop and its owner, for one test."""
    return signup_shop()


@pytest.fixture
def api(client: TestClient, owner: ShopAccount) -> Api:
    """API client signed in as the owner of a brand-new, empty shop."""
    return Api(client, owner.headers)


@pytest.fixture(scope="module")
def module_api(client: TestClient, signup_shop: Callable[..., ShopAccount]) -> Api:
    """API client for one empty shop shared by every test in a module."""
    return Api(client, signup_shop().headers)


@pytest.fixture(scope="module")
def reset_demo(client: TestClient) -> None:
    """Pristine database for the requesting module: drop all tables, reseed the demo shop."""
    from app.db import SessionLocal, reset_database
    from app.seed import seed_demo_shop

    reset_database()
    with SessionLocal() as session:
        seed_demo_shop(session)
        session.commit()
    login_limiter.clear()


@pytest.fixture(autouse=True)
def _reset_login_rate_limits() -> Iterator[None]:
    """Failed sign-ins from one test must not lock out another test's account."""
    login_limiter.clear()
    yield


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    from app.db import engine

    engine.dispose()
    shutil.rmtree(TEST_DIR, ignore_errors=True)
