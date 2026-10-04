"""Shop profile updates."""

from __future__ import annotations

from app import schemas
from app.constants import DEFAULT_SEGMENT
from app.errors import BadRequest
from app.models import Shop
from app.services.common import (
    clean_line,
    clean_text,
    normalize_email,
    normalize_phone,
    normalize_upi_id,
)


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
    return shop
