"""初始数据：仅在表为空时写入必要配置行。

注意：这是 seed（落库的真实数据,可删除/可改），不是页面硬编码 mock。
不再塞「示例项目」——项目一律由用户在数据基地真实整理产生(空库即空项目列表)。
"""
from . import models
from .database import SessionLocal


def seed_if_empty() -> None:
    db = SessionLocal()
    try:
        if db.query(models.AppSetting).count() == 0:
            db.add(models.AppSetting(id=1))
        db.commit()
    finally:
        db.close()
