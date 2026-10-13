"""Runtime settings, read once from environment variables (documented in README.md)."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"

DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name).lower()
    if not raw:
        return default
    return raw not in {"0", "false", "no", "off"}


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a whole number, got {raw!r}.") from exc


def _default_database_url() -> str:
    return f"sqlite:///{(DATA_DIR / 'shopos.db').as_posix()}"


def _load_secret_key() -> str:
    """SHOPOS_SECRET_KEY, or a random key generated once into backend/data/secret.key."""
    from_env = _env("SHOPOS_SECRET_KEY")
    if from_env:
        return from_env
    key_file = DATA_DIR / "secret.key"
    if key_file.exists():
        stored = key_file.read_text(encoding="utf-8").strip()
        if stored:
            return stored
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key = secrets.token_urlsafe(48)
    key_file.write_text(key, encoding="utf-8")
    return key


def _cors_origins() -> list[str]:
    extra = [origin.strip().rstrip("/") for origin in _env("SHOPOS_CORS_ORIGINS").split(",")]
    origins = list(DEFAULT_CORS_ORIGINS)
    for origin in extra:
        if origin and origin not in origins:
            origins.append(origin)
    return origins


def _default_uploads_dir(database_url: str) -> Path:
    """Next to a SQLite database file (so a throwaway database gets throwaway uploads)."""
    prefix = "sqlite:///"
    if database_url.startswith(prefix):
        path = database_url[len(prefix) :]
        if path and path != ":memory:" and not path.startswith("file:"):
            return Path(path).parent / "uploads"
    return DATA_DIR / "uploads"


@dataclass
class Settings:
    database_url: str
    secret_key: str
    token_days: int
    cors_origins: list[str]
    seed_demo: bool
    frontend_dist: Path
    uploads_dir: Path


def load_settings() -> Settings:
    dist = _env("SHOPOS_FRONTEND_DIST")
    uploads = _env("SHOPOS_UPLOADS_DIR")
    database_url = _env("SHOPOS_DATABASE_URL") or _default_database_url()
    return Settings(
        database_url=database_url,
        secret_key=_load_secret_key(),
        token_days=max(1, _env_int("SHOPOS_TOKEN_DAYS", 30)),
        cors_origins=_cors_origins(),
        seed_demo=_env_bool("SHOPOS_SEED_DEMO", True),
        frontend_dist=Path(dist) if dist else PROJECT_DIR / "frontend" / "dist",
        uploads_dir=Path(uploads) if uploads else _default_uploads_dir(database_url),
    )


settings = load_settings()
