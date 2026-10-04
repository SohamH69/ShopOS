"""Role defaults and effective-permission resolution (per-shop overrides live in the DB)."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants import PERMISSIONS, STAFF_ROLES
from app.models import RolePermission, User

DEFAULT_ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "manager": (
        "dashboard",
        "orders",
        "customers",
        "payments",
        "inventory",
        "suppliers",
        "reports",
    ),
    "employee": ("dashboard", "orders", "customers"),
    "accountant": ("dashboard", "payments", "expenses", "reports"),
}

# Used in "You don't have access to <module>." messages.
MODULE_LABELS: dict[str, str] = {
    "dashboard": "the dashboard",
    "orders": "orders",
    "customers": "customers",
    "payments": "payments",
    "inventory": "inventory",
    "suppliers": "suppliers",
    "expenses": "expenses",
    "reports": "reports",
    "staff": "staff",
    "settings": "settings",
}


def normalize_permissions(permissions: Iterable[str]) -> list[str]:
    """Known permissions only, deduplicated, in canonical order."""
    wanted = set(permissions)
    return [permission for permission in PERMISSIONS if permission in wanted]


def role_permission_map(db: Session, shop_id: int) -> dict[str, list[str]]:
    stored = {
        row.role: row.permissions
        for row in db.scalars(select(RolePermission).where(RolePermission.shop_id == shop_id))
    }
    result: dict[str, list[str]] = {"owner": list(PERMISSIONS)}
    for role in STAFF_ROLES:
        if role in stored:
            result[role] = normalize_permissions(stored[role] or [])
        else:
            result[role] = list(DEFAULT_ROLE_PERMISSIONS[role])
    return result


def permissions_for(db: Session, user: User) -> list[str]:
    if user.role == "owner":
        return list(PERMISSIONS)
    row = db.scalar(
        select(RolePermission).where(
            RolePermission.shop_id == user.shop_id, RolePermission.role == user.role
        )
    )
    if row is None:
        return list(DEFAULT_ROLE_PERMISSIONS.get(user.role, ()))
    return normalize_permissions(row.permissions or [])


def forbidden_message(permission: str) -> str:
    return f"You don't have access to {MODULE_LABELS.get(permission, permission)}."
