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

# 本地仓库根（检查点0·D1）：固定 = DATA_DIR/'repos'，不另立可覆盖根（避免复杂根解析）。
# 建仓（检查点①）在此目录下按项目名 mkdir 子目录。与 uploads(程序内部副本) 平级、互不嵌套。
REPOS_ROOT = DATA_DIR / "repos"

# 本地 AI 模型根（会议转写 whisper turbo + sherpa-onnx 分离模型）：DATA_DIR/'models'。
# 绝不进 exe bundle（_MEIPASS 只读且每次重启清空）——首次使用时下载到此可写持久目录。
MODELS_ROOT = DATA_DIR / "models"


def _ensure_repos_root() -> None:
    """确保 REPOS_ROOT 存在且可写；不可建/不可写 → fail closed 抛错（不静默降级到别处）。

    只做一次探针写：建根目录 + 建删一个临时子目录确认写权限。失败即抛 RuntimeError，
    让启动尽早暴露「数据目录不可写」这类环境问题，而非等到建仓时才炸。
    """
    try:
        REPOS_ROOT.mkdir(parents=True, exist_ok=True)
        probe = REPOS_ROOT / ".romai_write_probe"
        probe.mkdir(exist_ok=True)
        probe.rmdir()
    except OSError as e:
        raise RuntimeError(f"本地仓库根不可用（{REPOS_ROOT}）：{e}") from e


_ensure_repos_root()


def _bootstrap_bundled_env() -> None:
    """冻结态首启:若用户数据目录还没有 .env，且 bundle 内预置了 .env.bundle，则复制过去。

    用于「开箱即用」分发：build 时把分发专用 key 放进 desktop/.env.bundle（不入 git），
    打进 _MEIPASS。首启复制到 DATA_DIR/.env，供下方 Settings 读取生图/ASR key。
    只在 .env 不存在时复制一次——用户之后在设置页/.env 的改动不会被覆盖。
    """
    if not _is_frozen():
        return
    target = DATA_DIR / ".env"
    if target.exists():
        return
    bundled = RESOURCE_DIR / ".env.bundle"
    if not bundled.is_file():
        return
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        target.write_bytes(bundled.read_bytes())
    except OSError:
        pass


_bootstrap_bundled_env()


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

    # DeepSeek key 权威存于 DB(AppSetting.deepseek_api_key);此处仅用于「预置 key 分发」:
    # bundle 的 .env 带 deepseek_api_key → 首启 seed 写进空库的 AppSetting。运行期消费仍读 DB。
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    # ── ASR 转写（key 只进本机 .env，绝不入库/同步）──
    # provider: ""(自动:有 key 则用) | openai | mimo | custom
    asr_provider: str = ""
    asr_api_key: str = ""
    asr_api_url: str = ""
    asr_model: str = ""
    asr_language: str = "zh"

    # ── 本地会议转写（faster-whisper + sherpa-onnx，录音不出本机）──
    # HF 模型下载端点：默认国内镜像;开发机可直连 huggingface.co 时按 .env 覆盖。
    hf_endpoint: str = "https://hf-mirror.com"
    # 转写模型仓库(CT2 格式,首次下载不进包);计算精度(int8=CPU 友好体积小)。
    whisper_repo: str = "deepdml/faster-whisper-large-v3-turbo-ct2"
    whisper_compute_type: str = "int8"
    whisper_device: str = "cpu"

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
