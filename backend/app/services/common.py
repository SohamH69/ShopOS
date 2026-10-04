"""Helpers shared by services: text clean-up, phone/email normalisation, scoped lookups."""

from __future__ import annotations

import re
from typing import Protocol, TypeVar

from sqlalchemy.orm import Session

from app.errors import BadRequest, NotFound

_WHITESPACE = re.compile(r"\s+")
_NON_DIGIT = re.compile(r"\D")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_UPI_ID = re.compile(r"^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$")

MIN_PASSWORD_LENGTH = 8


class ShopOwned(Protocol):
    shop_id: int


ShopOwnedT = TypeVar("ShopOwnedT", bound=ShopOwned)


def clean_text(value: str | None) -> str:
    return (value or "").strip()


def clean_line(value: str | None) -> str:
    """Trim and collapse inner whitespace (names, categories, single-line fields)."""
    return _WHITESPACE.sub(" ", (value or "").strip())


def digits_of(value: str | None) -> str:
    return _NON_DIGIT.sub("", value or "")


def phone_search_digits(term: str) -> str:
    """The digits to look for in phone keys (which hold a number's last 10 digits).

    People type numbers the way the app shows them ("+91 98765"), so a leading +91 country
    code is dropped. A full number with a 0 or 91 prefix is covered by keeping the last 10.
    """
    digits = digits_of(term)
    if term.strip().startswith("+") and digits.startswith("91") and len(digits) > 2:
        digits = digits[2:]
    return digits[-10:]


def order_number_text(term: str) -> str | None:
    """The digits of a search like "1045" or "#1045", or None if it isn't an order number.

    Only ASCII digits count: "²" or "①" pass ``str.isdigit()`` but ``int()`` rejects them.
    """
    text = term.lstrip("#").strip()
    return text if text.isascii() and text.isdigit() else None


def normalize_phone(raw: str | None, *, missing_message: str = "Enter a phone number.") -> tuple[str, str]:
    """Return (display form, match key). The key is the last 10 digits.

    Indian mobile numbers (10 digits, optionally with +91 / 0) are stored as
    "+91 98765 43210"; anything else keeps the spacing the user typed.
    """
    text = clean_line(raw)
    if not text:
        raise BadRequest(missing_message)
    digits = digits_of(text)
    if not 10 <= len(digits) <= 15:
        raise BadRequest("Enter a valid phone number with at least 10 digits.")
    key = digits[-10:]
    national = (
        len(digits) == 10
        or (len(digits) == 12 and digits.startswith("91"))
        or (len(digits) == 11 and digits.startswith("0"))
    )
    if national and key[0] in "6789":
        return f"+91 {key[:5]} {key[5:]}", key
    return text, key


def normalize_email(raw: str | None) -> str | None:
    text = clean_text(raw).lower()
    if not text:
        return None
    if len(text) > 254 or not _EMAIL.match(text):
        raise BadRequest("Enter a valid email address.")
    return text


def normalize_upi_id(raw: str | None) -> str | None:
    text = clean_text(raw)
    if not text:
        return None
    if not _UPI_ID.match(text):
        raise BadRequest("Enter a valid UPI ID, like yourshop@upi.")
    return text


def normalize_identifier(raw: str) -> str:
    """Sign-in key: a lowercased email, or the last 10 digits of a phone number."""
    text = clean_text(raw)
    if "@" in text:
        return text.lower()
    digits = digits_of(text)
    return digits[-10:] if digits else text.lower()


def require_password(password: str | None) -> str:
    if password is None or len(password) < MIN_PASSWORD_LENGTH:
        raise BadRequest(f"Use at least {MIN_PASSWORD_LENGTH} characters for the password.")
    return password


def get_owned(
    db: Session, model: type[ShopOwnedT], shop_id: int, object_id: int, message: str
) -> ShopOwnedT:
    """Fetch a row by id, treating rows of other shops as missing (404)."""
    found = db.get(model, object_id)
    if found is None or found.shop_id != shop_id:
        raise NotFound(message)
    return found
