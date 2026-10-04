"""FastAPI dependencies: database session, signed-in user and permission checks."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Path, Query, Request
from sqlalchemy.orm import Session

from app import db as database
from app.config import settings
from app.errors import SIGN_IN_REQUIRED, Forbidden, Unauthorized
from app.models import Shop, User
from app.permissions import forbidden_message, permissions_for
from app.schemas import DB_INT_MAX
from app.security import decode_access_token

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


def get_current_user(request: Request, db: Session = Depends(get_db)) -> AuthContext:
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
    return AuthContext(
        user=user,
        shop=shop,
        user_id=user.id,
        shop_id=shop.id,
        permissions=frozenset(permissions_for(db, user)),
    )


def require_permission(*permissions: str, module: str | None = None) -> Callable[..., AuthContext]:
    """Dependency that passes when the user has ANY of ``permissions``."""
    label = module or permissions[0]

    def dependency(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
        if not auth.can(*permissions):
            raise Forbidden(forbidden_message(label))
        return auth

    return dependency


DbSession = Annotated[Session, Depends(get_db)]
CurrentAuth = Annotated[AuthContext, Depends(get_current_user)]

# Ids and offsets from the URL, bounded to SQLite's 64-bit INTEGER range (see schemas.IdIn):
# anything larger can't be bound as a query parameter, so it is a 422 instead of a crash.
PathId = Annotated[int, Path(ge=-DB_INT_MAX, le=DB_INT_MAX)]
QueryId = Annotated[int, Query(ge=-DB_INT_MAX, le=DB_INT_MAX)]
Offset = Annotated[int, Query(ge=0, le=DB_INT_MAX)]
