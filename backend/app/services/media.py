"""Shop photos: checked, re-encoded and stored under ``settings.uploads_dir/shops``.

Every upload is opened with Pillow and saved again as a fresh JPEG (at most 1600 px on the long
side). That proves the file really is a photo, turns phone pictures the right way up, and drops
the EXIF data, including the GPS position some phones write into every picture.
"""

from __future__ import annotations

import io
import re
import secrets
import shutil
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings
from app.errors import BadRequest

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_EDGE = 1600
MIN_EDGE = 200
READABLE_FORMATS = frozenset({"JPEG", "PNG", "WEBP", "MPO"})  # MPO: some phone cameras' JPEGs
PHOTO_NAME = re.compile(r"^[A-Za-z0-9_-]{16,64}\.jpg$")
DEMO_PHOTO_NAME = "demo-shop-raj-local-mart.jpg"
DEMO_PHOTO_SOURCE = Path(__file__).resolve().parent.parent / "assets" / "demo-shop.jpg"

PHOTO_TOO_LARGE = "This photo is too large. Use one under 8 MB."
NOT_A_PHOTO = "This file isn't a photo we can read. Use a JPG, PNG or WebP photo."


def shop_photos_dir() -> Path:
    folder = settings.uploads_dir / "shops"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def photo_url(name: str | None) -> str | None:
    return f"/api/media/shops/{name}" if name else None


def photo_path(name: str) -> Path | None:
    """The stored file for a photo name from a URL, or None (never a path outside the folder)."""
    if not PHOTO_NAME.fullmatch(name):
        return None
    path = shop_photos_dir() / name
    return path if path.is_file() else None


def save_shop_photo(raw: bytes) -> str:
    """Validate and store an uploaded shop photo; returns its new file name."""
    if not raw:
        raise BadRequest("Choose a photo of your shop.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise BadRequest(PHOTO_TOO_LARGE)
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in READABLE_FORMATS:
                raise BadRequest(NOT_A_PHOTO)
            if source.width * source.height > MAX_PIXELS:
                raise BadRequest("This photo has too many pixels. Use a smaller one.")
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise BadRequest(NOT_A_PHOTO) from exc
    if min(image.size) < MIN_EDGE:
        raise BadRequest(f"This photo is too small. Use one at least {MIN_EDGE} pixels on each side.")
    image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    name = f"{secrets.token_urlsafe(18)}.jpg"
    image.save(shop_photos_dir() / name, "JPEG", quality=84, optimize=True, progressive=True)
    return name


def delete_shop_photo(name: str | None) -> None:
    if name and name != DEMO_PHOTO_NAME and PHOTO_NAME.fullmatch(name):
        (shop_photos_dir() / name).unlink(missing_ok=True)


def install_demo_photo() -> str:
    """Copies the demo shop's illustrated shopfront into the uploads folder (once)."""
    target = shop_photos_dir() / DEMO_PHOTO_NAME
    if not target.exists():
        shutil.copyfile(DEMO_PHOTO_SOURCE, target)
    return DEMO_PHOTO_NAME
