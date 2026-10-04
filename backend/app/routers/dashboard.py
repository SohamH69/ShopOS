from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app import schemas
from app.deps import AuthContext, CurrentAuth, DbSession, require_permission
from app.services import dashboard as dashboard_service
from app.services import search as search_service

router = APIRouter(prefix="/api", tags=["dashboard"])

DashboardAuth = Annotated[AuthContext, Depends(require_permission("dashboard"))]


@router.get("/dashboard", response_model=schemas.Dashboard)
def get_dashboard(auth: DashboardAuth, db: DbSession) -> schemas.Dashboard:
    return dashboard_service.build_dashboard(db, auth.shop_id)


@router.get("/attention", response_model=list[schemas.AttentionItem])
def get_attention(auth: DashboardAuth, db: DbSession) -> list[schemas.AttentionItem]:
    return dashboard_service.attention_items(db, auth.shop_id)


@router.get("/search", response_model=schemas.SearchResults)
def search(
    auth: CurrentAuth,
    db: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=100)],
) -> schemas.SearchResults:
    return search_service.search_everything(db, auth.shop_id, auth.permissions, q)
