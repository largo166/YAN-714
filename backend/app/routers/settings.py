"""设置 API（单行设置表；密钥只写不回吐明文）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, uploads
from ..database import get_db
from ..safe_paths import PathValidationError

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
        repository_root_path=row.repository_root_path,
        repository_configured=bool(row.repository_root_path),
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
    # 仓库根：非空必须通过校验(存在/可写/非 symlink/不与 uploads 嵌套)；空串=解除配置(允许)
    if "repository_root_path" in data:
        val = (data["repository_root_path"] or "").strip()
        if val:
            try:
                data["repository_root_path"] = str(uploads.validate_repository_root(val))
            except PathValidationError as e:
                raise HTTPException(400, str(e))
        else:
            data["repository_root_path"] = ""
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _to_out(row)
