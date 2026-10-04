"""Sign-up, sign-in (with rate limiting), demo access and password changes."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.config import settings
from app.constants import DEFAULT_SEGMENT
from app.errors import BadRequest, Conflict, Forbidden, NotFound, TooManyRequests, Unauthorized
from app.models import Shop, User
from app.security import (
    burn_password_check,
    create_access_token,
    hash_password,
    login_limiter,
    verify_password,
)
from app.services.common import (
    clean_line,
    normalize_email,
    normalize_identifier,
    normalize_phone,
    require_password,
)
from app.timeutil import now_utc

INVALID_LOGIN = "Phone/email or password is incorrect."
ACCOUNT_TURNED_OFF = "This account is turned off. Ask the shop owner."
TOO_MANY_ATTEMPTS = "Too many failed sign-in attempts. Wait 5 minutes and try again."


def issue_token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        shop_id=user.shop_id,
        token_version=user.token_version,
        secret=settings.secret_key,
        days=settings.token_days,
    )


def ensure_identifiers_available(
    db: Session,
    *,
    email: str | None,
    phone_key: str | None,
    email_message: str = "This email is already used by another account.",
    phone_message: str = "This phone number is already used by another account.",
) -> None:
    """Sign-in identifiers are unique across every shop."""
    if email and db.scalar(select(User.id).where(User.email == email).limit(1)) is not None:
        raise Conflict(email_message)
    if phone_key and db.scalar(select(User.id).where(User.phone_key == phone_key).limit(1)) is not None:
        raise Conflict(phone_message)


def signup(db: Session, data: schemas.SignupRequest, *, at: datetime | None = None) -> User:
    at = at or now_utc()
    shop_name = clean_line(data.shop_name)
    if not shop_name:
        raise BadRequest("Enter your shop's name.")
    owner_name = clean_line(data.owner_name)
    if not owner_name:
        raise BadRequest("Enter your name.")
    phone, phone_key = normalize_phone(data.phone)
    email = normalize_email(data.email)
    require_password(data.password)
    ensure_identifiers_available(
        db,
        email=email,
        phone_key=phone_key,
        email_message="An account with this email already exists. Sign in instead.",
        phone_message="An account with this phone number already exists. Sign in instead.",
    )

    shop = Shop(
        name=shop_name,
        owner_name=owner_name,
        phone=phone,
        email=email,
        address="",
        city=clean_line(data.city),
        segment=clean_line(data.segment) or DEFAULT_SEGMENT,
        plan="free",
        is_demo=False,
        next_order_number=1001,
        created_at=at,
    )
    db.add(shop)
    db.flush()
    owner = User(
        shop_id=shop.id,
        name=owner_name,
        email=email,
        phone=phone,
        phone_key=phone_key,
        role="owner",
        password_hash=hash_password(data.password),
        is_active=True,
        token_version=0,
        last_login_at=at,
        created_at=at,
    )
    db.add(owner)
    db.flush()
    return owner


def _find_user(db: Session, key: str) -> User | None:
    if "@" in key:
        return db.scalar(select(User).where(User.email == key))
    if key.isdigit() and len(key) == 10:
        return db.scalar(select(User).where(User.phone_key == key))
    return None


def login(db: Session, identifier: str, password: str) -> User:
    key = normalize_identifier(identifier)
    if login_limiter.is_blocked(key):
        raise TooManyRequests(TOO_MANY_ATTEMPTS)
    user = _find_user(db, key) if key else None
    if user is None:
        burn_password_check(password)
        login_limiter.record_failure(key)
        raise Unauthorized(INVALID_LOGIN)
    if not verify_password(password, user.password_hash):
        login_limiter.record_failure(key)
        raise Unauthorized(INVALID_LOGIN)
    if not user.is_active:
        raise Forbidden(ACCOUNT_TURNED_OFF)
    login_limiter.reset(key)
    user.last_login_at = now_utc()
    return user


def demo_owner(db: Session) -> User:
    """The demo shop's owner, seeding the demo shop first if it does not exist yet."""
    shop = db.scalar(select(Shop).where(Shop.is_demo.is_(True)).order_by(Shop.id).limit(1))
    if shop is None:
        from app.seed import seed_demo_shop  # local import: the seed is built on these services

        shop = seed_demo_shop(db)
    owner = db.scalar(
        select(User).where(User.shop_id == shop.id, User.role == "owner").order_by(User.id).limit(1)
    )
    if owner is None:
        raise NotFound("Demo shop not found.")
    owner.last_login_at = now_utc()
    return owner


def change_password(db: Session, user: User, current_password: str, new_password: str) -> str:
    """Set a new password, sign out every other device and return a fresh token."""
    if not verify_password(current_password, user.password_hash):
        raise BadRequest("Your current password is incorrect.")
    require_password(new_password)
    user.password_hash = hash_password(new_password)
    user.token_version += 1
    db.flush()
    return issue_token(user)
