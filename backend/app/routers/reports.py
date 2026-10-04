from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app import schemas
from app.deps import AuthContext, DbSession, require_permission
from app.services import reports as reports_service

router = APIRouter(prefix="/api", tags=["reports"])

ReportsAuth = Annotated[AuthContext, Depends(require_permission("reports"))]


@router.get("/reports", response_model=schemas.Report)
def get_report(
    auth: ReportsAuth,
    db: DbSession,
    range_: Annotated[schemas.ReportRange, Query(alias="range")] = "30d",
) -> schemas.Report:
    return reports_service.build_report(db, auth.shop_id, range_)
