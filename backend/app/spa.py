"""Serve the built frontend (``frontend/dist``) from FastAPI.

Real files are served as-is (``/sw.js``, ``/manifest.webmanifest``, ``/icons/*``,
``/assets/*``); any other non-API GET path falls back to ``index.html`` so client-side
routes like ``/app/orders`` work on refresh. Unknown ``/api/*`` paths stay JSON 404s.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response

from app.config import settings

# Explicit types: Windows registries sometimes map .js to text/plain, which browsers
# reject for module scripts.
MEDIA_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".map": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml",
    ".wasm": "application/wasm",
}

NO_CACHE = "no-cache"
IMMUTABLE = "public, max-age=31536000, immutable"
SHORT_CACHE = "public, max-age=3600"
ALWAYS_REVALIDATE = frozenset({"index.html", "sw.js", "manifest.webmanifest"})

NOT_BUILT_MESSAGE = (
    "The ShopOS frontend has not been built yet. Run `npm run build` in frontend/ "
    "or use the Vite dev server on http://127.0.0.1:5173."
)


def resolve_static_file(dist: Path, request_path: str) -> tuple[Path, str] | None:
    """Return (file, path relative to dist) if ``request_path`` names a file inside ``dist``."""
    if not request_path:
        return None
    try:
        root = dist.resolve()
        candidate = (root / request_path).resolve()
    except (OSError, ValueError):
        return None
    if not candidate.is_relative_to(root) or not candidate.is_file():
        return None
    return candidate, candidate.relative_to(root).as_posix()


def cache_control_for(relative_path: str) -> str:
    if relative_path.startswith("assets/"):
        return IMMUTABLE
    if relative_path in ALWAYS_REVALIDATE:
        return NO_CACHE
    return SHORT_CACHE


def _file_response(path: Path, relative_path: str) -> FileResponse:
    return FileResponse(
        path,
        media_type=MEDIA_TYPES.get(path.suffix.lower()),
        headers={"Cache-Control": cache_control_for(relative_path)},
    )


def register_spa(app: FastAPI) -> None:
    """Register the catch-all GET route. Call after every API router is included."""

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str) -> Response:
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found."}, status_code=404)
        dist = settings.frontend_dist
        index = dist / "index.html"
        if not index.is_file():
            return PlainTextResponse(NOT_BUILT_MESSAGE, status_code=404)
        found = resolve_static_file(dist, full_path)
        if found is not None:
            return _file_response(*found)
        if full_path.startswith("assets/"):
            # A missing hashed bundle must not be answered with HTML (the service worker
            # would cache it as JavaScript).
            return PlainTextResponse("Not found.", status_code=404)
        return _file_response(index, "index.html")
