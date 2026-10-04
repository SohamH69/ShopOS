from typing import Annotated

from fastapi import APIRouter, Depends

from app import schemas
from app.deps import AuthContext, DbSession, PathId, require_permission
from app.serializers import user_out
from app.services import users as users_service

router = APIRouter(prefix="/api", tags=["staff"])

StaffAuth = Annotated[AuthContext, Depends(require_permission("staff"))]


@router.get("/users", response_model=list[schemas.User])
def list_users(auth: StaffAuth, db: DbSession) -> list[schemas.User]:
    return [user_out(user) for user in users_service.list_users(db, auth.shop_id)]


@router.post("/users", response_model=schemas.User, status_code=201)
def create_user(payload: schemas.StaffCreate, auth: StaffAuth, db: DbSession) -> schemas.User:
    user = users_service.create_staff(db, auth.shop_id, payload)
    user_id = user.id
    db.commit()
    return user_out(users_service.get_user(db, auth.shop_id, user_id))


@router.patch("/users/{user_id}", response_model=schemas.User)
def update_user(
    user_id: PathId, payload: schemas.StaffUpdate, auth: StaffAuth, db: DbSession
) -> schemas.User:
    target = users_service.get_user(db, auth.shop_id, user_id)
    users_service.update_staff(db, auth.user, target, payload)
    db.commit()
    return user_out(users_service.get_user(db, auth.shop_id, user_id))


@router.get("/roles", response_model=list[schemas.RolePermissions])
def list_roles(auth: StaffAuth, db: DbSession) -> list[schemas.RolePermissions]:
    return users_service.list_roles(db, auth.shop_id)


@router.put("/roles/{role}", response_model=schemas.RolePermissions)
def update_role(
    role: schemas.Role, payload: schemas.RolePermissionsUpdate, auth: StaffAuth, db: DbSession
) -> schemas.RolePermissions:
    result = users_service.update_role(db, auth.shop_id, role, list(payload.permissions))
    db.commit()
    return result
