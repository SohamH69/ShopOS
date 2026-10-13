"""Shop setup: the public shop ID, the shop photo, the map pin, and the gate in front of the app."""

from __future__ import annotations

import io
import re
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image

from conftest import ShopAccount, StaffAccount, auth_headers, complete_setup, photo_bytes

CODE = re.compile(r"^SO-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$")
SETUP_REQUIRED = "Add your shop's photo and location to continue."


def upload(client: TestClient, headers: dict[str, str], body: bytes, content_type: str = "image/jpeg") -> Any:
    return client.put("/api/shop/photo", content=body, headers={**headers, "Content-Type": content_type})


def test_signup_gives_every_shop_a_unique_public_id(signup_shop: Callable[..., ShopAccount]) -> None:
    codes = {signup_shop(setup=False).session["shop"]["code"] for _ in range(5)}
    assert len(codes) == 5
    assert all(CODE.fullmatch(code) for code in codes)


def test_a_new_shop_starts_at_the_setup_gate(client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    shop = signup_shop(setup=False)
    assert shop.session["shop"]["setup_complete"] is False
    assert shop.session["shop"]["photo_url"] is None

    blocked = client.get("/api/dashboard", headers=shop.headers)
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == SETUP_REQUIRED
    assert client.get("/api/orders", headers=shop.headers).status_code == 403

    # What the setup screen needs still works.
    assert client.get("/api/auth/me", headers=shop.headers).status_code == 200
    assert client.get("/api/shop", headers=shop.headers).status_code == 200

    complete_setup(client, shop.headers)
    assert client.get("/api/dashboard", headers=shop.headers).status_code == 200
    me = client.get("/api/auth/me", headers=shop.headers).json()
    assert me["shop"]["setup_complete"] is True


def test_setup_needs_photo_address_and_pin(client: TestClient, signup_shop: Callable[..., ShopAccount]) -> None:
    shop = signup_shop(setup=False)
    patched = client.patch(
        "/api/shop", json={"address": "1 Station Road", "latitude": 19.07, "longitude": 72.87}, headers=shop.headers
    ).json()
    assert patched["setup_complete"] is False  # no photo yet
    assert patched["latitude"] == 19.07 and patched["longitude"] == 72.87

    with_photo = upload(client, shop.headers, photo_bytes()).json()
    assert with_photo["setup_complete"] is True

    cleared = client.patch("/api/shop", json={"address": "  "}, headers=shop.headers).json()
    assert cleared["setup_complete"] is False


def test_location_must_be_a_real_pair(client: TestClient, owner: ShopAccount) -> None:
    half = client.patch("/api/shop", json={"latitude": None, "longitude": 72.8}, headers=owner.headers)
    assert half.status_code == 400
    assert client.patch("/api/shop", json={"latitude": 91, "longitude": 72.8}, headers=owner.headers).status_code == 422
    assert client.patch("/api/shop", json={"latitude": 18.5, "longitude": 181}, headers=owner.headers).status_code == 422
    precise = client.patch(
        "/api/shop", json={"latitude": 18.52345678, "longitude": 73.85612345}, headers=owner.headers
    ).json()
    assert precise["latitude"] == 18.523457 and precise["longitude"] == 73.856123


def test_photo_is_re_encoded_resized_and_served(client: TestClient, owner: ShopAccount) -> None:
    png = photo_bytes((2400, 1800), "PNG")
    shop = upload(client, owner.headers, png, "image/png").json()
    url = shop["photo_url"]
    assert url.startswith("/api/media/shops/") and url.endswith(".jpg")

    served = client.get(url)
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/jpeg"
    assert "immutable" in served.headers["cache-control"]
    image = Image.open(io.BytesIO(served.content))
    assert image.format == "JPEG"
    assert max(image.size) == 1600  # long side capped


def test_photo_loses_its_gps_exif(client: TestClient, owner: ShopAccount) -> None:
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # camera make
    exif[0x8825] = {1: "N", 2: (18.0, 31.0, 12.0), 3: "E", 4: (73.0, 50.0, 30.0)}  # GPS IFD
    buffer = io.BytesIO()
    Image.new("RGB", (600, 400), (200, 120, 40)).save(buffer, "JPEG", exif=exif)
    assert Image.open(io.BytesIO(buffer.getvalue())).getexif().get_ifd(0x8825)  # it really is there

    url = upload(client, owner.headers, buffer.getvalue()).json()["photo_url"]
    stored = Image.open(io.BytesIO(client.get(url).content))
    assert not stored.getexif().get_ifd(0x8825)
    assert 0x010F not in stored.getexif()


def test_replacing_the_photo_removes_the_old_file(client: TestClient, owner: ShopAccount) -> None:
    first = owner.session["shop"]["photo_url"]
    assert client.get(first).status_code == 200
    second = upload(client, owner.headers, photo_bytes((500, 500))).json()["photo_url"]
    assert second != first
    assert client.get(first).status_code == 404
    assert client.get(second).status_code == 200


def test_bad_uploads_are_refused(client: TestClient, owner: ShopAccount) -> None:
    not_a_photo = upload(client, owner.headers, b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml")
    assert not_a_photo.status_code == 400
    assert "isn't a photo" in not_a_photo.json()["detail"]

    tiny = upload(client, owner.headers, photo_bytes((120, 90)))
    assert tiny.status_code == 400
    assert "too small" in tiny.json()["detail"]

    empty = upload(client, owner.headers, b"")
    assert empty.status_code == 400

    huge = upload(client, owner.headers, b"\xff" * (8 * 1024 * 1024 + 1))
    assert huge.status_code == 400
    assert "too large" in huge.json()["detail"]

    gif = io.BytesIO()
    Image.new("RGB", (300, 300)).save(gif, "GIF")
    assert upload(client, owner.headers, gif.getvalue(), "image/gif").status_code == 400

    # Nothing above replaced the good photo.
    assert client.get(owner.session["shop"]["photo_url"]).status_code == 200


def test_photo_upload_needs_a_signed_in_shop_with_settings_access(
    client: TestClient, owner: ShopAccount, create_staff: Callable[..., StaffAccount]
) -> None:
    assert upload(client, {}, photo_bytes()).status_code == 401
    employee = create_staff(owner.headers, role="employee")
    refused = upload(client, employee.headers, photo_bytes())
    assert refused.status_code == 403
    assert client.patch("/api/shop", json={"latitude": 1, "longitude": 1}, headers=employee.headers).status_code == 403


def test_media_urls_cannot_reach_other_files(client: TestClient) -> None:
    for name in ("..%2F..%2Fsecret.key", "secret.key", "x.jpg", "../shopos-test.db", "a" * 70 + ".jpg"):
        assert client.get(f"/api/media/shops/{name}").status_code == 404


def test_staff_of_an_unfinished_shop_wait_at_the_gate(
    client: TestClient, signup_shop: Callable[..., ShopAccount]
) -> None:
    shop = signup_shop(setup=False)
    assert client.get("/api/users", headers=shop.headers).status_code == 403  # can't add staff yet
    me = client.get("/api/auth/me", headers=shop.headers).json()
    assert "settings" in me["permissions"]


def test_demo_shop_is_already_set_up(client: TestClient, demo_auth: dict[str, Any]) -> None:
    shop = demo_auth["shop"]
    assert shop["setup_complete"] is True
    assert CODE.fullmatch(shop["code"])
    assert client.get(shop["photo_url"]).status_code == 200
    headers = auth_headers(str(demo_auth["token"]))
    assert client.get("/api/dashboard", headers=headers).status_code == 200
