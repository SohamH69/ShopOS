"""Password hashing (PBKDF2-SHA256 via hashlib), JWT access tokens (PyJWT, HS256) for shop staff
and ShopOS admins, and the signed khata links customers open from WhatsApp."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt

PBKDF2_SCHEME = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 260_000
SALT_BYTES = 16
JWT_ALGORITHM = "HS256"


def _b64encode(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def hash_password(password: str) -> str:
    """Encoded as ``pbkdf2_sha256$<iterations>$<salt b64>$<digest b64>``."""
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{PBKDF2_SCHEME}${PBKDF2_ITERATIONS}${_b64encode(salt)}${_b64encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt_b64, digest_b64 = encoded.split("$")
        if scheme != PBKDF2_SCHEME:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        rounds = int(iterations)
    except (ValueError, TypeError):
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
    return hmac.compare_digest(candidate, expected)


_dummy_hash: str | None = None


def burn_password_check(password: str) -> None:
    """Spend the same time as a real check so unknown accounts can't be detected by timing."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(secrets.token_hex(16))
    verify_password(password, _dummy_hash)


@dataclass(frozen=True)
class TokenClaims:
    user_id: int
    shop_id: int
    token_version: int


def create_access_token(
    *, user_id: int, shop_id: int, token_version: int, secret: str, days: int
) -> str:
    issued_at = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "typ": "user",
        "shop": shop_id,
        "ver": token_version,
        "iat": int(issued_at.timestamp()),
        "exp": int((issued_at + timedelta(days=days)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str, secret: str) -> TokenClaims | None:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat"]},
        )
        # Tokens issued before "typ" existed are staff tokens; admin tokens never pass here.
        if payload.get("typ", "user") != "user":
            return None
        return TokenClaims(
            user_id=int(payload["sub"]),
            shop_id=int(payload["shop"]),
            token_version=int(payload["ver"]),
        )
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return None


@dataclass(frozen=True)
class AdminClaims:
    admin_id: int
    token_version: int


def create_admin_token(*, admin_id: int, token_version: int, secret: str, hours: int = 12) -> str:
    """Admin sessions are short (12 hours by default) and can't be used as a shop token."""
    issued_at = datetime.now(timezone.utc)
    payload = {
        "sub": f"admin:{admin_id}",
        "typ": "admin",
        "ver": token_version,
        "iat": int(issued_at.timestamp()),
        "exp": int((issued_at + timedelta(hours=hours)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_admin_token(token: str, secret: str) -> AdminClaims | None:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat", "typ"]},
        )
        if payload["typ"] != "admin":
            return None
        prefix, _, raw_id = str(payload["sub"]).partition(":")
        if prefix != "admin":
            return None
        return AdminClaims(admin_id=int(raw_id), token_version=int(payload["ver"]))
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return None


# Khata links ----------------------------------------------------------------------------------
# "<customer id>.<link version>.<signature>": nothing secret is stored, the same link can be shared
# again and again, and bumping the customer's version turns every earlier link off.

PORTAL_SIGNATURE_BYTES = 18


def _portal_signature(secret: str, customer_id: int, version: int) -> str:
    mac = hmac.new(secret.encode("utf-8"), f"portal:{customer_id}:{version}".encode("ascii"), hashlib.sha256)
    return base64.urlsafe_b64encode(mac.digest()[:PORTAL_SIGNATURE_BYTES]).decode("ascii").rstrip("=")


def create_portal_token(*, customer_id: int, version: int, secret: str) -> str:
    return f"{customer_id}.{version}.{_portal_signature(secret, customer_id, version)}"


def read_portal_token(token: str, secret: str) -> tuple[int, int] | None:
    """(customer id, link version) when the signature is right, else None."""
    parts = token.split(".")
    if len(parts) != 3 or not (parts[0].isdigit() and parts[1].isdigit()):
        return None
    if len(parts[0]) > 18 or len(parts[1]) > 9:
        return None
    customer_id, version = int(parts[0]), int(parts[1])
    if not hmac.compare_digest(parts[2], _portal_signature(secret, customer_id, version)):
        return None
    return customer_id, version


class LoginRateLimiter:
    """In-memory sliding window of failed sign-ins per normalised identifier."""

    def __init__(self, max_failures: int = 5, window_seconds: float = 300.0) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        attempts = self._failures.setdefault(key, deque())
        while attempts and now - attempts[0] >= self.window_seconds:
            attempts.popleft()
        return attempts

    def is_blocked(self, key: str) -> bool:
        with self._lock:
            attempts = self._prune(key, time.monotonic())
            if not attempts:
                self._failures.pop(key, None)
            return len(attempts) >= self.max_failures

    def record_failure(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._prune(key, now).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()


login_limiter = LoginRateLimiter()
# The same sliding window counts orders placed through a customer's khata link (per customer).
portal_order_limiter = LoginRateLimiter(max_failures=10, window_seconds=3600)
