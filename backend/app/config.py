"""集中配置。路径解析与进程工作目录无关，且区分「开发态」与「打包冻结态(exe)」。

- 开发态：代码资源与可写数据都在 backend/ 下（BASE_DIR=backend/，DATA_DIR=backend/data）。
- 冻结态(PyInstaller exe)：代码/前端 dist 在只读解压目录 _MEIPASS；可写数据(DB/上传/.env)
  绝不能写进只读 bundle，落到用户可写目录 %LOCALAPPDATA%\ROM-AI（可被 ROMAI_DATA_DIR 覆盖）。
  这是 exe 化最大风险点（__file__ 在冻结态指向临时目录）。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


# RESOURCE_DIR：代码/前端 dist 等只读资源根。BASE_DIR 保留向后兼容(=RESOURCE_DIR)。
if _is_frozen():
    RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
else:
    RESOURCE_DIR = Path(__file__).resolve().parents[1]  # backend/
BASE_DIR = RESOURCE_DIR


def _resolve_data_dir() -> Path:
    """可写数据目录。优先 ROMAI_DATA_DIR；冻结态用 %LOCALAPPDATA%\\ROM-AI；开发态用 backend/data。"""
    override = os.environ.get("ROMAI_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser()
    if _is_frozen():
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or str(Path.home())
        return Path(base) / "ROM-AI"
    return BASE_DIR / "data"


DATA_DIR = _resolve_data_dir()
ENV_FILE = DATA_DIR / ".env" if _is_frozen() else (BASE_DIR / ".env")


def frontend_dist_dir() -> Path:
    """前端构建产物 dist 目录：冻结态在 _MEIPASS/frontend_dist；开发态在 <repo>/frontend/dist。"""
    if _is_frozen():
        return RESOURCE_DIR / "frontend_dist"
    return BASE_DIR.parent / "frontend" / "dist"


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

    # ── AI 生图（key 只进本机 .env，绝不入库/同步;未配→not_configured 不伪造）──
    # APImart OpenAI 兼容异步制:提交 /v1/images/generations → 轮询 /v1/tasks/{id}
    image_api_key: str = ""
    image_base_url: str = "https://api.apimart.ai"
    image_model: str = "gpt-image-1-official"  # 默认 OpenAI;可选 gemini-3-pro-image-preview

    # ── 腾讯会议 provider（可选；通过本机已装 MCP skill 脚本调用）──
    # token 读 TENCENT_MEETING_TOKEN（本机 settings/env，绝不入库/同步）
    tencent_meeting_token: str = ""
    # skill 脚本所在目录（含 tencent_meeting.py）；空则按默认 ~/.claude/skills/... 探测
    tencent_meeting_skill_dir: str = ""

    # ── 成果发送渠道（本批只做 preview，不真实外发）──
    result_send_email_configured: bool = False
    result_send_wecom_configured: bool = False
    result_send_wx_configured: bool = False

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
