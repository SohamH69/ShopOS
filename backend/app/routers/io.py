from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app import schemas
from app.deps import AuthContext, CurrentAuth, DbSession, require_permission
from app.errors import Forbidden
from app.permissions import forbidden_message
from app.services import io as io_service

router = APIRouter(prefix="/api", tags=["import-export"])

SettingsAuth = Annotated[AuthContext, Depends(require_permission("settings"))]

# Order and payment exports are also part of the reports module.
EXPORTS_ALSO_FOR_REPORTS = frozenset({"orders", "payments"})


@router.post("/import/{kind}", response_model=schemas.ImportResult)
def import_csv(
    kind: schemas.ImportKind, payload: schemas.ImportRequest, auth: SettingsAuth, db: DbSession
) -> schemas.ImportResult:
    result = io_service.import_csv(db, auth.shop_id, auth.user, kind, payload.csv)
    db.commit()
    return result


@router.get(
    "/export/{kind}.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "CSV file download"}},
)
def export_csv(kind: schemas.ExportKind, auth: CurrentAuth, db: DbSession) -> Response:
    allowed = auth.can("settings") or (kind in EXPORTS_ALSO_FOR_REPORTS and auth.can("reports"))
    if not allowed:
        raise Forbidden(forbidden_message("settings"))
    filename, content = io_service.export_csv(db, auth.shop_id, kind)
    return Response(
        content=("﻿" + content).encode("utf-8"),  # BOM so Excel reads ₹ and Indian names
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
