"""集中配置。所有路径相对 backend/ 解析，与进程工作目录无关。"""
from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ 目录（config.py 在 backend/app/ 下，parents[1] = backend/）
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    host: str = "127.0.0.1"
    port: int = 8000
    database_url: str = ""
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    # ── ASR 转写（key 只进本机 .env，绝不入库/同步）──
    # provider: ""(自动:有 key 则用) | openai | mimo | custom
    asr_provider: str = ""
    asr_api_key: str = ""
    asr_api_url: str = ""
    asr_model: str = ""
    asr_language: str = "zh"

    # ── 腾讯会议 provider（可选；通过本机已装 MCP skill 脚本调用）──
    # token 读 TENCENT_MEETING_TOKEN（本机 settings/env，绝不入库/同步）
    tencent_meeting_token: str = ""
    # skill 脚本所在目录（含 tencent_meeting.py）；空则按默认 ~/.claude/skills/... 探测
    tencent_meeting_skill_dir: str = ""

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{(DATA_DIR / 'rom_ai.db').as_posix()}"

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
