"""腾讯会议 provider（4E，可选接缝）。

通过本机已安装的腾讯会议 MCP skill 脚本（subprocess）调用，不写死为核心依赖。
- token 只从环境 / config 读（TENCENT_MEETING_TOKEN），绝不进代码/测试/日志/文档。
- skill 脚本目录可配（TENCENT_MEETING_SKILL_DIR），否则按默认路径探测。
- 状态：not_configured（无 token/脚本）/ provider_unavailable（调用失败）/
  no_recording / transcript_pending（会后同步）/ ok。绝不伪造会议号/链接/纪要。

测试通过 monkeypatch `_run_tool` 注入，不真实外呼。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from ..config import settings

_DEFAULT_SKILL_DIRS = [
    Path.home() / ".claude" / "skills" / "tencent-meeting-mcp" / "scripts",
]
_CLIENT_INFO = {"os": "windows", "agent": "rom-ai", "model": "claude"}


@dataclass
class MeetingResult:
    status: str  # ok|not_configured|provider_unavailable
    meeting_id: str = ""
    meeting_code: str = ""
    join_url: str = ""
    start_time: str = ""
    end_time: str = ""
    message: str = ""


@dataclass
class SyncResult:
    status: str  # ok|not_configured|provider_unavailable|no_recording|transcript_pending
    minutes: str = ""
    transcript: str = ""
    message: str = ""


def _token() -> str:
    return settings.tencent_meeting_token or os.environ.get("TENCENT_MEETING_TOKEN", "")


def _skill_script() -> Optional[Path]:
    if settings.tencent_meeting_skill_dir:
        p = Path(settings.tencent_meeting_skill_dir) / "tencent_meeting.py"
        return p if p.exists() else None
    for d in _DEFAULT_SKILL_DIRS:
        p = d / "tencent_meeting.py"
        if p.exists():
            return p
    return None


def is_configured() -> bool:
    return bool(_token()) and _skill_script() is not None


def _decode(b: bytes) -> str:
    """子进程输出解码防呆:Windows 下 skill 脚本 stdout 常为 GBK(如'会议'=b'\\xbb\\xe1\\xd2\\xe9'),
    硬按 UTF-8 解会把中文全变 '�' 一路糊到前端红字(2026-07-10 实锤)。
    策略:先严格 UTF-8;失败则 GBK;再失败才 UTF-8+replace 兜底。"""
    for enc in ("utf-8", "gbk"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            continue
    return b.decode("utf-8", errors="replace")


def _run_tool(name: str, arguments: dict, *, timeout: float = 60.0) -> dict:
    """调 skill 脚本的 tools/call。返回解析后的 JSON dict。失败抛 RuntimeError。"""
    script = _skill_script()
    if script is None:
        raise RuntimeError("skill 脚本不存在")
    args = dict(arguments)
    args.setdefault("_client_info", _CLIENT_INFO)
    payload = json.dumps({"name": name, "arguments": args}, ensure_ascii=False)
    env = dict(os.environ)
    env["TENCENT_MEETING_TOKEN"] = _token()
    proc = subprocess.run(
        [sys.executable, str(script), "tools/call", payload],
        cwd=str(script.parent), env=env, capture_output=True, timeout=timeout,
    )
    out = _decode(proc.stdout).strip()
    if proc.returncode != 0 or not out:
        raise RuntimeError(f"skill 调用失败: {out[:200] or _decode(proc.stderr)[:200]}")
    try:
        return json.loads(out)
    except ValueError:
        # 脚本以纯文本报错(returncode=0 但非 JSON,如"[错误] tool execution failed…"):
        # 把可读原文透传,而非"输出非 JSON"这种无信息报错。
        raise RuntimeError(out[:200])


def _body(resp: dict) -> dict:
    """从 skill 响应取业务 body（schedule_meeting 等把腾讯返回放 data.body 字符串）。"""
    data = resp.get("data", resp)
    body = data.get("body") if isinstance(data, dict) else None
    if isinstance(body, str):
        try:
            return json.loads(body)
        except ValueError:
            return {}
    return data if isinstance(data, dict) else {}


def create_meeting(subject: str, start_time: str, end_time: str) -> MeetingResult:
    """创建真实腾讯会议。未配→not_configured；失败→provider_unavailable；绝不伪造。"""
    if not is_configured():
        return MeetingResult(status="not_configured", message="腾讯会议未配置（缺 token 或 skill）")
    try:
        resp = _run_tool("schedule_meeting", {
            "subject": subject, "start_time": start_time, "end_time": end_time,
        })
    except (RuntimeError, subprocess.SubprocessError, OSError) as e:
        return MeetingResult(status="provider_unavailable", message=str(e)[:200])

    body = _body(resp)
    lst = body.get("meeting_info_list") or []
    info = lst[0] if lst else body
    code = str(info.get("meeting_code", "") or "")
    mid = str(info.get("meeting_id", "") or "")
    url = str(info.get("join_url", "") or "")
    if not (code and url):
        return MeetingResult(status="provider_unavailable", message="返回缺少会议号/链接")
    return MeetingResult(
        status="ok", meeting_id=mid, meeting_code=code, join_url=url,
        start_time=str(info.get("start_time", start_time)), end_time=str(info.get("end_time", end_time)),
    )


def sync_minutes(meeting_id: str) -> SyncResult:
    """会后同步智能纪要 + 转写。无录制→no_recording；纪要未生成→transcript_pending。"""
    if not is_configured():
        return SyncResult(status="not_configured", message="腾讯会议未配置")
    minutes = ""
    transcript = ""
    try:
        try:
            r = _run_tool("get_smart_minutes", {"meeting_id": meeting_id})
            minutes = _extract_text(r)
        except RuntimeError:
            minutes = ""
        try:
            r2 = _run_tool("get_transcripts_details", {"meeting_id": meeting_id})
            transcript = _extract_text(r2)
        except RuntimeError:
            transcript = ""
    except (subprocess.SubprocessError, OSError) as e:
        return SyncResult(status="provider_unavailable", message=str(e)[:200])

    if not minutes and not transcript:
        return SyncResult(status="no_recording", message="该会议暂无录制/转写")
    if not minutes and transcript:
        return SyncResult(status="transcript_pending", transcript=transcript, message="智能纪要未生成，仅有转写")
    return SyncResult(status="ok", minutes=minutes, transcript=transcript)


def _extract_text(resp: dict) -> str:
    """尽力从响应里取可读文本（纪要/转写）。结构不定时回退 JSON 串。"""
    body = _body(resp)
    for k in ("minutes", "summary", "text", "transcript", "content"):
        v = body.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    # 列表型转写
    paras = body.get("paragraphs") or body.get("minutes_list") or []
    if isinstance(paras, list) and paras:
        return "\n".join(str(p.get("text", p) if isinstance(p, dict) else p) for p in paras)
    return ""
