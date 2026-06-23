"""初始数据：仅在表为空时写入，提供前端可联调的真实 SQLite 数据。

注意：这是 seed（落库的真实数据，可删除/可改），不是页面硬编码 mock。
"""
from . import models
from .database import SessionLocal


def seed_if_empty() -> None:
    db = SessionLocal()
    try:
        if db.query(models.AppSetting).count() == 0:
            db.add(models.AppSetting(id=1))

        if db.query(models.Project).count() == 0:
            db.add_all(
                [
                    models.Project(
                        name="示例项目 · 城市更新片区",
                        description="seed 初始数据，可在页面删除/新增后被真实数据替代",
                        status="active",
                    ),
                    models.Project(
                        name="示例项目 · 文化中心方案",
                        description="seed 初始数据，可在页面删除/新增后被真实数据替代",
                        status="planning",
                    ),
                    models.Project(
                        name="示例项目 · 滨水商业综合体",
                        description="seed 初始数据，可在页面删除/新增后被真实数据替代",
                        status="completed",
                    ),
                ]
            )
        db.commit()
    finally:
        db.close()
