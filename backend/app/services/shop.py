"""Shop profile updates, the public shop ID and the shop's photo and map location."""

from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.constants import DEFAULT_SEGMENT
from app.errors import BadRequest
from app.models import Shop
from app.services import media
from app.services.common import (
    clean_line,
    clean_text,
    normalize_email,
    normalize_phone,
    normalize_upi_id,
)


# No 0/O, 1/I/L: the ID is read out over the phone.
SHOP_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
SHOP_CODE_LENGTH = 6
SETUP_REQUIRED = "Add your shop's photo and location to continue."

# Raj Local Mart, Model Colony, Pune.
DEMO_LATITUDE = 18.5293
DEMO_LONGITUDE = 73.8402


def new_shop_code(db: Session) -> str:
    """A unique public ID such as ``SO-7K2Q9M``."""
    while True:
        code = "SO-" + "".join(secrets.choice(SHOP_CODE_ALPHABET) for _ in range(SHOP_CODE_LENGTH))
        if db.scalar(select(Shop.id).where(Shop.code == code).limit(1)) is None:
            return code


def set_photo(shop: Shop, photo_file: str) -> str | None:
    """Points the shop at a newly stored photo; returns the old file name to delete after commit."""
    previous = shop.photo_file
    shop.photo_file = photo_file
    return previous if previous != photo_file else None


def apply_demo_setup(shop: Shop) -> None:
    """The demo shop's photo, address and map pin, so its sign-in never stops at setup."""
    if not shop.photo_file:
        shop.photo_file = media.install_demo_photo()
    if shop.latitude is None or shop.longitude is None:
        shop.latitude, shop.longitude = DEMO_LATITUDE, DEMO_LONGITUDE
    if not shop.address.strip():
        shop.address = "Shop 4, Lane 3, Model Colony, Pune 411016"


def _apply_location(shop: Shop, data: schemas.ShopUpdate) -> None:
    fields = data.model_fields_set
    if "latitude" not in fields and "longitude" not in fields:
        return
    latitude = data.latitude if "latitude" in fields else shop.latitude
    longitude = data.longitude if "longitude" in fields else shop.longitude
    if (latitude is None) != (longitude is None):
        raise BadRequest("Set both the latitude and the longitude of your shop.")
    shop.latitude = None if latitude is None else round(latitude, 6)
    shop.longitude = None if longitude is None else round(longitude, 6)


def update_shop(shop: Shop, data: schemas.ShopUpdate) -> Shop:
    fields = data.model_fields_set
    if "name" in fields and data.name is not None:
        name = clean_line(data.name)
        if not name:
            raise BadRequest("Enter your shop's name.")
        shop.name = name
    if "owner_name" in fields and data.owner_name is not None:
        owner_name = clean_line(data.owner_name)
        if not owner_name:
            raise BadRequest("Enter the owner's name.")
        shop.owner_name = owner_name
    if "phone" in fields and data.phone is not None:
        shop.phone, _ = normalize_phone(data.phone, missing_message="Enter the shop's phone number.")
    if "email" in fields:
        shop.email = normalize_email(data.email)
    if "address" in fields and data.address is not None:
        shop.address = clean_text(data.address)
    if "city" in fields and data.city is not None:
        shop.city = clean_line(data.city)
    if "segment" in fields and data.segment is not None:
        shop.segment = clean_line(data.segment) or DEFAULT_SEGMENT
    if "upi_id" in fields:
        shop.upi_id = normalize_upi_id(data.upi_id)
    _apply_location(shop, data)
    if "portal_catalog" in fields and data.portal_catalog is not None:
        shop.portal_catalog = data.portal_catalog
    if "portal_orders" in fields and data.portal_orders is not None:
        shop.portal_orders = data.portal_orders
    return shop
