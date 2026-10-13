from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.errors import NotFound
from app.services import media

router = APIRouter(prefix="/api/media", tags=["media"])


@router.get("/shops/{name}", response_class=FileResponse)
def shop_photo(name: str) -> FileResponse:
    """A shop's photo. Public, like a signboard: customers see it on their khata link. Every
    upload gets a new random name, so the file behind a URL never changes."""
    path = media.photo_path(name)
    if path is None:
        raise NotFound("Photo not found.")
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
