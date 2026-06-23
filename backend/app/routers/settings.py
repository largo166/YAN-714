"""设置 API（单行设置表；密钥只写不回吐明文）。"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _get_or_create(db: Session) -> models.AppSetting:
    row = db.get(models.AppSetting, 1)
    if row is None:
        row = models.AppSetting(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _to_out(row: models.AppSetting) -> schemas.SettingsOut:
    return schemas.SettingsOut(
        deepseek_api_key_set=bool(row.deepseek_api_key),
        deepseek_base_url=row.deepseek_base_url,
        deepseek_model=row.deepseek_model,
        theme=row.theme,
    )


@router.get("", response_model=schemas.SettingsOut)
def get_settings(db: Session = Depends(get_db)) -> schemas.SettingsOut:
    return _to_out(_get_or_create(db))


@router.put("", response_model=schemas.SettingsOut)
def update_settings(
    payload: schemas.SettingsUpdate, db: Session = Depends(get_db)
) -> schemas.SettingsOut:
    row = _get_or_create(db)
    data = payload.model_dump(exclude_unset=True)
    # 空字符串的 api_key 视为“保持不变”：表单回填不了旧密钥，避免每次保存把它清空
    if "deepseek_api_key" in data and not data["deepseek_api_key"]:
        data.pop("deepseek_api_key")
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _to_out(row)
