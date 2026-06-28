"""初始数据：仅在表为空时写入必要配置行。

注意：这是 seed（落库的真实数据,可删除/可改），不是页面硬编码 mock。
不再塞「示例项目」——项目一律由用户在数据基地真实整理产生(空库即空项目列表)。
"""
from . import models
from .config import _is_frozen, settings
from .database import SessionLocal


def seed_if_empty() -> None:
    db = SessionLocal()
    try:
        if db.query(models.AppSetting).count() == 0:
            row = models.AppSetting(id=1)
            # 「预置 key 分发」:仅冻结态(exe)首启空库时,把 bundle .env 的 DeepSeek key 写进设置行,
            # 收件人无需在设置页填 key 即可用 AI(开箱即用)。开发/测试态不从 .env 自动 seed
            # (消费侧本就只读 DB,dev 一向在设置页填 key),保持原有行为与测试隔离。
            if _is_frozen() and settings.deepseek_api_key:
                row.deepseek_api_key = settings.deepseek_api_key
                if settings.deepseek_base_url:
                    row.deepseek_base_url = settings.deepseek_base_url
                if settings.deepseek_model:
                    row.deepseek_model = settings.deepseek_model
            db.add(row)
        db.commit()
    finally:
        db.close()
