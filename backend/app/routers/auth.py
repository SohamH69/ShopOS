from fastapi import APIRouter
from sqlalchemy.orm import Session

from app import schemas
from app.deps import DbSession, SessionAuth
from app.errors import Unauthorized, SIGN_IN_REQUIRED
from app.models import Shop, User
from app.permissions import normalize_permissions, permissions_for
from app.serializers import auth_response, session_out
from app.services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _signed_in(db: Session, user: User) -> schemas.AuthResponse:
    shop = db.get(Shop, user.shop_id)
    if shop is None:
        raise Unauthorized(SIGN_IN_REQUIRED)
    return auth_response(user, shop, permissions_for(db, user), auth_service.issue_token(user))


@router.post("/signup", response_model=schemas.AuthResponse, status_code=201)
def signup(payload: schemas.SignupRequest, db: DbSession) -> schemas.AuthResponse:
    user = auth_service.signup(db, payload)
    db.commit()
    return _signed_in(db, user)


@router.post("/login", response_model=schemas.AuthResponse)
def login(payload: schemas.LoginRequest, db: DbSession) -> schemas.AuthResponse:
    user = auth_service.login(db, payload.identifier, payload.password)
    db.commit()
    return _signed_in(db, user)


@router.post("/demo", response_model=schemas.AuthResponse)
def demo(db: DbSession) -> schemas.AuthResponse:
    user = auth_service.demo_owner(db)
    db.commit()
    return _signed_in(db, user)


@router.get("/me", response_model=schemas.Session)
def me(auth: SessionAuth) -> schemas.Session:
    return session_out(auth.user, auth.shop, normalize_permissions(auth.permissions))


@router.post("/change-password", response_model=schemas.TokenRefreshResponse)
def change_password(
    payload: schemas.ChangePasswordRequest, auth: SessionAuth, db: DbSession
) -> schemas.TokenRefreshResponse:
    token = auth_service.change_password(db, auth.user, payload.current_password, payload.new_password)
    db.commit()
    return schemas.TokenRefreshResponse(ok=True, token=token)
