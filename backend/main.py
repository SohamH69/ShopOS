"""Compatibility entry point: ``uvicorn main:app --app-dir backend`` (see the root package.json).

The application lives in the ``app`` package; this module only re-exports it.
"""

from app.main import app

__all__ = ["app"]
