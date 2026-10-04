from fastapi import APIRouter

from app import schemas

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=schemas.OkResponse)
def health() -> schemas.OkResponse:
    return schemas.OkResponse(ok=True)
