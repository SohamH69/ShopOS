"""FastAPI dependencies: database session, signed-in user (and the shop setup gate), permission
checks, and the signed-in ShopOS admin."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Path, Query, Request
from sqlalchemy.orm import Session

from app import db as database
from app.config import settings
from app.errors import SIGN_IN_REQUIRED, Forbidden, Unauthorized
from app.models import Admin, Shop, User
from app.permissions import forbidden_message, permissions_for
from app.schemas import DB_INT_MAX
from app.security import decode_access_token, decode_admin_token
from app.services.auth import SHOP_SUSPENDED
from app.services.shop import SETUP_REQUIRED

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def get_db(request: Request) -> Iterator[Session]:
    session = database.SessionLocal()
    try:
        if request.method in WRITE_METHODS:
            # Take SQLite's write lock before reading anything (see app/db.py).
            session.connection(execution_options={database.BEGIN_MODE_OPTION: "IMMEDIATE"})
        yield session
    finally:
        session.close()


@dataclass(frozen=True)
class AuthContext:
    user: User
    shop: Shop
    user_id: int
    shop_id: int
    permissions: frozenset[str]

    def can(self, *permissions: str) -> bool:
        return any(permission in self.permissions for permission in permissions)


def _bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def get_session_auth(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    """The signed-in user, whether or not their shop has finished setup (photo and location)."""
    token = _bearer_token(request)
    claims = decode_access_token(token, settings.secret_key) if token else None
    if claims is None:
        raise Unauthorized(SIGN_IN_REQUIRED)
    user = db.get(User, claims.user_id)
    if (
        user is None
        or user.shop_id != claims.shop_id
        or user.token_version != claims.token_version
        or not user.is_active
    ):
        raise Unauthorized(SIGN_IN_REQUIRED)
    shop = db.get(Shop, user.shop_id)
    if shop is None:
        raise Unauthorized(SIGN_IN_REQUIRED)
    if shop.is_suspended:
        raise Unauthorized(SHOP_SUSPENDED)
    return AuthContext(
        user=user,
        shop=shop,
        user_id=user.id,
        shop_id=shop.id,
        permissions=frozenset(permissions_for(db, user)),
    )


def get_current_user(auth: AuthContext = Depends(get_session_auth)) -> AuthContext:
    """The signed-in user of a shop that has finished setup. Every shop endpoint uses this, except
    the few the setup screen itself needs (session, shop profile, shop photo, password)."""
    if not auth.shop.setup_complete:
        raise Forbidden(SETUP_REQUIRED)
    return auth


def require_permission(
    *permissions: str, module: str | None = None, during_setup: bool = False
) -> Callable[..., AuthContext]:
    """Dependency that passes when the user has ANY of ``permissions``.

    ``during_setup=True`` also lets it through before the shop's photo and location are in.
    """
    label = module or permissions[0]
    base = get_session_auth if during_setup else get_current_user

    def dependency(auth: AuthContext = Depends(base)) -> AuthContext:
        if not auth.can(*permissions):
            raise Forbidden(forbidden_message(label))
        return auth

    return dependency


def get_current_admin(request: Request, db: Session = Depends(get_db)) -> Admin:
    token = _bearer_token(request)
    claims = decode_admin_token(token, settings.secret_key) if token else None
    if claims is None:
        raise Unauthorized(SIGN_IN_REQUIRED)
    admin = db.get(Admin, claims.admin_id)
    if admin is None or not admin.is_active or admin.token_version != claims.token_version:
        raise Unauthorized(SIGN_IN_REQUIRED)
    return admin


DbSession = Annotated[Session, Depends(get_db)]
CurrentAuth = Annotated[AuthContext, Depends(get_current_user)]
SessionAuth = Annotated[AuthContext, Depends(get_session_auth)]
CurrentAdmin = Annotated[Admin, Depends(get_current_admin)]

# Ids and offsets from the URL, bounded to SQLite's 64-bit INTEGER range (see schemas.IdIn):
# anything larger can't be bound as a query parameter, so it is a 422 instead of a crash.
PathId = Annotated[int, Path(ge=-DB_INT_MAX, le=DB_INT_MAX)]
QueryId = Annotated[int, Query(ge=-DB_INT_MAX, le=DB_INT_MAX)]
Offset = Annotated[int, Query(ge=0, le=DB_INT_MAX)]
