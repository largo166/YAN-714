"""管理驾驶舱口令门槛(P1-6)。

定位:本机口令,防同屏他人误入「管理驾驶舱」——单机产品,不建会话/令牌体系,
非网络级安全(前端凭 sessionStorage 记住本次解锁)。口令只存加盐 pbkdf2 哈希,不回吐。
"""
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from .settings import _get_or_create

router = APIRouter(prefix="/api/admin", tags=["admin"])

_PBKDF2_ITERS = 120_000


def _hash_password(password: str, salt: str) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), _PBKDF2_ITERS)
    return dk.hex()


def _verify(password: str, stored: str) -> bool:
    if "$" not in stored:
        return False
    salt, expected = stored.split("$", 1)
    return secrets.compare_digest(_hash_password(password, salt), expected)


@router.get("/status", response_model=schemas.AdminStatusOut)
def admin_status(db: Session = Depends(get_db)) -> schemas.AdminStatusOut:
    row = _get_or_create(db)
    return schemas.AdminStatusOut(configured=bool(row.admin_password_hash))


@router.post("/setup", response_model=schemas.AdminLoginOut)
def admin_setup(payload: schemas.AdminPasswordIn, db: Session = Depends(get_db)) -> schemas.AdminLoginOut:
    """首次设置管理口令。已设置过 → 409(改口令属后续能力,不静默覆盖)。"""
    pw = payload.password.strip()
    if len(pw) < 4:
        raise HTTPException(400, "口令至少 4 位")
    row = _get_or_create(db)
    if row.admin_password_hash:
        raise HTTPException(409, "管理口令已设置")
    salt = secrets.token_hex(16)
    row.admin_password_hash = f"{salt}${_hash_password(pw, salt)}"
    db.commit()
    return schemas.AdminLoginOut(ok=True)


@router.post("/login", response_model=schemas.AdminLoginOut)
def admin_login(payload: schemas.AdminPasswordIn, db: Session = Depends(get_db)) -> schemas.AdminLoginOut:
    row = _get_or_create(db)
    if not row.admin_password_hash:
        raise HTTPException(409, "尚未设置管理口令")
    if not _verify(payload.password, row.admin_password_hash):
        raise HTTPException(401, "口令不正确")
    return schemas.AdminLoginOut(ok=True)
