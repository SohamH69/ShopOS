"""Serving the built frontend (SPEC section 4, "SPA serving").

Uses the temporary dist folder from the ``frontend_dist`` fixture (SHOPOS_FRONTEND_DIST),
adds ``assets/x.js`` and plants secret files *outside* it to prove traversal is blocked.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from api_helpers import error

INDEX_MARKER = "<div id=root>"
IMMUTABLE = "public, max-age=31536000, immutable"


@pytest.fixture(scope="module")
def dist(frontend_dist: Path) -> Path:
    (frontend_dist / "assets" / "x.js").write_text("export const x = 1;", encoding="utf-8")
    return frontend_dist


@pytest.fixture(scope="module")
def secrets(dist: Path) -> dict[str, Path]:
    """Files next to (not inside) the dist folder that must never be served."""
    token = f"TOP-SECRET-{uuid.uuid4().hex}"
    outside = dist.parent / "secret.txt"
    outside.write_text(token, encoding="utf-8")
    sibling_dir = dist.parent / f"{dist.name}-private"  # shares the "dist" prefix
    sibling_dir.mkdir(exist_ok=True)
    sibling = sibling_dir / "secret.txt"
    sibling.write_text(token, encoding="utf-8")
    return {"token": Path(token), "outside": outside, "sibling": sibling}


def assert_index(response_text: str, status: int) -> None:
    assert status == 200 and INDEX_MARKER in response_text


def test_index_and_service_worker_are_never_cached(client: TestClient, dist: Path) -> None:
    for path in ("/", "/index.html"):
        response = client.get(path)
        assert_index(response.text, response.status_code)
        assert response.headers["content-type"].startswith("text/html")
        assert response.headers["cache-control"] == "no-cache"

    worker = client.get("/sw.js")
    assert worker.status_code == 200
    assert worker.text == (dist / "sw.js").read_text(encoding="utf-8")
    assert worker.headers["cache-control"] == "no-cache"
    assert "javascript" in worker.headers["content-type"]


def test_hashed_assets_are_cached_forever(client: TestClient, dist: Path) -> None:
    response = client.get("/assets/x.js")
    assert response.status_code == 200
    assert response.text == "export const x = 1;"
    assert response.headers["cache-control"] == IMMUTABLE
    assert "javascript" in response.headers["content-type"]


def test_other_root_files_are_served_as_they_are(client: TestClient, dist: Path) -> None:
    manifest = client.get("/manifest.webmanifest")
    assert manifest.status_code == 200 and manifest.json() == {"name": "ShopOS"}
    icon = client.get("/icons/icon-192.png")
    assert icon.status_code == 200 and icon.content == (dist / "icons" / "icon-192.png").read_bytes()
    assert icon.headers["content-type"] == "image/png"


@pytest.mark.parametrize(
    "path",
    ["/app", "/app/orders", "/app/customers/12?tab=ledger", "/download", "/login?next=%2Fapp", "/apiary", "/app/orders/5/receipt"],
)
def test_unknown_paths_fall_back_to_the_app_shell(client: TestClient, dist: Path, path: str) -> None:
    response = client.get(path)
    assert_index(response.text, response.status_code)
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("path", ["/api/unknown", "/api/orders/1/unknown", "/api/v2/health", "/api/"])
def test_unknown_api_paths_are_json_404s(client: TestClient, dist: Path, path: str) -> None:
    response = client.get(path)
    assert response.headers["content-type"].startswith("application/json")
    assert error(response, 404) == "Not found."


def test_unknown_api_writes_are_json_errors(client: TestClient, dist: Path) -> None:
    response = client.post("/api/unknown", json={})
    assert response.status_code in (404, 405)
    assert response.headers["content-type"].startswith("application/json")
    assert INDEX_MARKER not in response.text


def test_health_still_answers_with_a_frontend_present(client: TestClient, dist: Path) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200 and response.json() == {"ok": True}


TRAVERSALS = [
    "/..%2fsecret.txt",
    "/..%2Fsecret.txt",
    "/%2e%2e/secret.txt",
    "/%2e%2e%2fsecret.txt",
    "/assets/..%2f..%2fsecret.txt",
    "/assets/%2e%2e/%2e%2e/secret.txt",
    "/..%5csecret.txt",
    "/assets/..%5c..%5csecret.txt",
    "/..%2fdist-private%2fsecret.txt",
    "/%2e%2e/dist-private/secret.txt",
    "/....//secret.txt",
]


@pytest.mark.parametrize("path", TRAVERSALS)
def test_paths_outside_the_build_folder_are_never_served(
    client: TestClient, secrets: dict[str, Path], path: str
) -> None:
    response = client.get(path)
    assert str(secrets["token"]) not in response.text
    assert response.status_code in (200, 400, 404)
    if response.status_code == 200:
        assert INDEX_MARKER in response.text


def test_absolute_paths_are_never_served(client: TestClient, secrets: dict[str, Path]) -> None:
    for secret in (secrets["outside"], secrets["sibling"]):
        posix = secret.resolve().as_posix()  # e.g. C:/Users/.../secret.txt on Windows
        for path in (f"/{quote(posix)}", f"/{quote(posix, safe='')}", f"/assets/{quote(posix)}"):
            response = client.get(path)
            assert str(secrets["token"]) not in response.text, path


# ---------------------------------------------------------------------------
# CORS for the Vite dev / preview servers (SPEC section 4)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"],
)
def test_dev_and_preview_origins_may_call_the_api(client: TestClient, origin: str) -> None:
    preflight = client.options(
        "/api/orders",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"},
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == origin
    response = client.get("/api/health", headers={"Origin": origin})
    assert response.headers["access-control-allow-origin"] == origin
    assert "content-disposition" in response.headers.get("access-control-expose-headers", "").lower()


def test_other_origins_are_not_allowed(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers
    preflight = client.options(
        "/api/orders", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"}
    )
    assert preflight.headers.get("access-control-allow-origin") != "https://evil.example"
