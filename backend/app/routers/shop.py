from typing import Annotated

from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool

from app import db as database
from app import schemas
from app.deps import AuthContext, DbSession, SessionAuth, get_session_auth, require_permission
from app.errors import BadRequest, Forbidden
from app.permissions import forbidden_message
from app.serializers import shop_out
from app.services import media
from app.services import shop as shop_service

router = APIRouter(prefix="/api/shop", tags=["shop"])

# The setup screen uses these before the shop's photo and location are in, so they skip the gate.
SettingsAuth = Annotated[AuthContext, Depends(require_permission("settings", during_setup=True))]


@router.get("", response_model=schemas.Shop)
def get_shop(auth: SessionAuth) -> schemas.Shop:
    return shop_out(auth.shop)


@router.patch("", response_model=schemas.Shop)
def update_shop(payload: schemas.ShopUpdate, auth: SettingsAuth, db: DbSession) -> schemas.Shop:
    shop_service.update_shop(auth.shop, payload)
    db.commit()
    return shop_out(auth.shop)  # expired by the commit, so this re-reads the saved row


async def _read_upload(request: Request) -> bytes:
    """The raw request body, refusing anything over the size limit without reading it all."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > media.MAX_UPLOAD_BYTES:
        raise BadRequest(media.PHOTO_TOO_LARGE)
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > media.MAX_UPLOAD_BYTES:
            raise BadRequest(media.PHOTO_TOO_LARGE)
        chunks.append(chunk)
    return b"".join(chunks)


def _store_photo(request: Request, name: str) -> schemas.Shop:
    """Signs the caller in and points their shop at the stored photo, in one short transaction."""
    with database.SessionLocal() as db:
        db.connection(execution_options={database.BEGIN_MODE_OPTION: "IMMEDIATE"})
        auth = get_session_auth(request, db)
        if not auth.can("settings"):
            raise Forbidden(forbidden_message("settings"))
        previous = shop_service.set_photo(auth.shop, name)
        db.commit()
        shop = shop_out(auth.shop)
    if previous:
        media.delete_shop_photo(previous)
    return shop


@router.put(
    "/photo",
    response_model=schemas.Shop,
    openapi_extra={
        "requestBody": {
            "required": True,
            "description": "The photo itself as the request body (JPG, PNG or WebP, up to 8 MB).",
            "content": {"image/*": {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
async def upload_photo(request: Request) -> schemas.Shop:
    """Replace the shop's photo. Send the image file as the raw body, not as a form.

    The body is read and the photo re-encoded before the write transaction starts, so a slow
    upload never holds the database's write lock. If saving fails, the new file is removed.
    """
    with database.SessionLocal() as db:
        auth = get_session_auth(request, db)  # fail fast for signed-out callers
        if not auth.can("settings"):
            raise Forbidden(forbidden_message("settings"))
    raw = await _read_upload(request)
    name = await run_in_threadpool(media.save_shop_photo, raw)
    try:
        return await run_in_threadpool(_store_photo, request, name)
    except Exception:
        media.delete_shop_photo(name)
        raise
