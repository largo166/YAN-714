"""公网访问闸：服务端校验访问口令并签发短期 HttpOnly 会话。"""

from __future__ import annotations

import hashlib
import hmac
import time

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

from .config import settings


COOKIE_NAME = "romai_access"


class AccessPasswordIn(BaseModel):
    password: str


class AccessLoginOut(BaseModel):
    ok: bool


class AccessStatusOut(BaseModel):
    enabled: bool
    configured: bool
    authenticated: bool


def _session_secret() -> bytes:
    secret = settings.access_session_secret.strip() or settings.access_password
    return secret.encode("utf-8")


def _sign(issued_at: int) -> str:
    return hmac.new(_session_secret(), str(issued_at).encode("ascii"), hashlib.sha256).hexdigest()


def _new_token() -> str:
    issued_at = int(time.time())
    return f"{issued_at}.{_sign(issued_at)}"


def _valid_token(token: str | None) -> bool:
    if not settings.access_control_enabled:
        return True
    if not token or not settings.access_password or not _session_secret():
        return False
    try:
        raw_time, supplied = token.split(".", 1)
        issued_at = int(raw_time)
    except (TypeError, ValueError):
        return False
    age = int(time.time()) - issued_at
    if age < 0 or age > settings.access_session_hours * 3600:
        return False
    return hmac.compare_digest(supplied, _sign(issued_at))


def _is_protected_path(path: str) -> bool:
    if path in {"/docs", "/redoc", "/openapi.json"}:
        return True
    return path.startswith("/api/") and not path.startswith("/api/access/")


class AccessControlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if (
            settings.access_control_enabled
            and _is_protected_path(request.url.path)
            and not _valid_token(request.cookies.get(COOKIE_NAME))
        ):
            return JSONResponse(status_code=401, content={"detail": "需要访问口令"})
        return await call_next(request)


router = APIRouter(prefix="/api/access", tags=["access"])


@router.get("/status", response_model=AccessStatusOut)
def access_status(request: Request) -> AccessStatusOut:
    enabled = settings.access_control_enabled
    configured = bool(settings.access_password.strip())
    return AccessStatusOut(
        enabled=enabled,
        configured=configured,
        authenticated=(not enabled) or _valid_token(request.cookies.get(COOKIE_NAME)),
    )


@router.post("/login", response_model=AccessLoginOut)
def access_login(payload: AccessPasswordIn, response: Response) -> AccessLoginOut:
    if not settings.access_control_enabled:
        return AccessLoginOut(ok=True)
    if not settings.access_password:
        raise HTTPException(503, "公网访问闸已开启但尚未配置口令")
    if not hmac.compare_digest(payload.password.encode("utf-8"), settings.access_password.encode("utf-8")):
        raise HTTPException(401, "访问口令不正确")
    response.set_cookie(
        COOKIE_NAME,
        _new_token(),
        max_age=settings.access_session_hours * 3600,
        httponly=True,
        secure=settings.access_cookie_secure,
        samesite="strict",
        path="/",
    )
    return AccessLoginOut(ok=True)


@router.post("/logout", response_model=AccessLoginOut)
def access_logout(response: Response) -> AccessLoginOut:
    response.delete_cookie(COOKIE_NAME, path="/")
    return AccessLoginOut(ok=True)
