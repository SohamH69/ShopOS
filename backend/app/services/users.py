"""Staff accounts and per-shop role permissions."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app import schemas
from app.constants import ROLES
from app.errors import BadRequest
from app.models import RolePermission, User
from app.permissions import normalize_permissions, role_permission_map
from app.security import hash_password
from app.services.auth import ensure_identifiers_available
from app.services.common import (
    clean_line,
    get_owned,
    normalize_email,
    normalize_phone,
    require_password,
)
from app.timeutil import now_utc

USER_NOT_FOUND = "Staff member not found."


def list_users(db: Session, shop_id: int) -> list[User]:
    owner_first = case((User.role == "owner", 0), else_=1)
    return list(
        db.scalars(
            select(User).where(User.shop_id == shop_id).order_by(owner_first, User.created_at, User.id)
        )
    )


def get_user(db: Session, shop_id: int, user_id: int) -> User:
    return get_owned(db, User, shop_id, user_id, USER_NOT_FOUND)


def create_staff(
    db: Session, shop_id: int, data: schemas.StaffCreate, *, at: datetime | None = None
) -> User:
    at = at or now_utc()
    name = clean_line(data.name)
    if not name:
        raise BadRequest("Enter the staff member's name.")
    email = normalize_email(data.email)
    phone: str | None = None
    phone_key: str | None = None
    if clean_line(data.phone):
        phone, phone_key = normalize_phone(data.phone)
    if email is None and phone is None:
        raise BadRequest("Add an email or phone number they will sign in with.")
    require_password(data.password)
    ensure_identifiers_available(db, email=email, phone_key=phone_key)

    user = User(
        shop_id=shop_id,
        name=name,
        email=email,
        phone=phone,
        phone_key=phone_key,
        role=data.role,
        password_hash=hash_password(data.password),
        is_active=True,
        token_version=0,
        created_at=at,
    )
    db.add(user)
    db.flush()
    return user


def update_staff(db: Session, actor: User, target: User, data: schemas.StaffUpdate) -> User:
    if target.role == "owner":
        raise BadRequest("The shop owner's account can't be changed here.")
    if target.id == actor.id:
        raise BadRequest("You can't change your own role or access. Ask the shop owner.")

    fields = data.model_fields_set
    if "name" in fields and data.name is not None:
        name = clean_line(data.name)
        if not name:
            raise BadRequest("Enter the staff member's name.")
        target.name = name
    if "role" in fields and data.role is not None:
        target.role = data.role
    if "is_active" in fields and data.is_active is not None and data.is_active != target.is_active:
        target.is_active = data.is_active
        if not data.is_active:
            target.token_version += 1  # sign them out everywhere
    if "password" in fields and data.password is not None:
        target.password_hash = hash_password(require_password(data.password))
        target.token_version += 1
    db.flush()
    return target


def list_roles(db: Session, shop_id: int) -> list[schemas.RolePermissions]:
    mapping = role_permission_map(db, shop_id)
    return [
        schemas.RolePermissions(
            role=role,  # type: ignore[arg-type]
            permissions=mapping[role],  # type: ignore[arg-type]
            editable=role != "owner",
        )
        for role in ROLES
    ]


def update_role(
    db: Session, shop_id: int, role: str, permissions: list[str]
) -> schemas.RolePermissions:
    if role == "owner":
        raise BadRequest("The owner always has every permission.")
    cleaned = normalize_permissions(permissions)
    row = db.scalar(
        select(RolePermission).where(RolePermission.shop_id == shop_id, RolePermission.role == role)
    )
    if row is None:
        row = RolePermission(shop_id=shop_id, role=role, permissions=cleaned)
        db.add(row)
    else:
        row.permissions = cleaned
    db.flush()
    return schemas.RolePermissions(
        role=role,  # type: ignore[arg-type]
        permissions=cleaned,  # type: ignore[arg-type]
        editable=True,
    )
