"""ASR 录音转写接缝（会议模块）。

[DEPRECATED 4E] 本轮会议模块不再用音频 ASR 入口（改为贴文本/上传材料 + 腾讯会议同步）。
本模块保留不删：text_to_segments / segments_to_dicts 仍被会议路由复用；
transcribe()/ASR provider 部分暂停使用，待后续确认 ASR 方案再启用。

参照独立 H5 录音应用的转写协议，用 Python 实现可配置 ASR provider：
- 上传音频 → 调 ASR HTTP API → 返回带时间点的 segments [{text,speaker_key,start_ms,end_ms}]。
- key 只从本机 .env/config 读，绝不入库/同步（纲要规则 10）。
- 未配 key → NotConfigured（不伪造转写）。
- provider: openai(/v1/audio/transcriptions) | mimo | custom(自定义 URL)；空则按 key 自动选。

注：真实转写需用户在 .env 配 ASR key 后验证；本环境用桩测链路。
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import List, Optional

import httpx

from .config import settings


class NotConfigured(Exception):
    """未配置 ASR key。"""


class ASRError(Exception):
    """转写调用失败。"""


@dataclass
class Segment:
    text: str
    speaker_key: str = "speaker-1"
    start_ms: int = 0
    end_ms: int = 0


def _pick_provider() -> str:
    if settings.asr_provider:
        return settings.asr_provider
    if settings.asr_api_key and settings.asr_api_url:
        return "custom"
    if settings.asr_api_key:
        return "openai"
    return ""


def is_configured() -> bool:
    return bool(_pick_provider()) and bool(settings.asr_api_key)


def transcribe(audio_bytes: bytes, filename: str = "audio.m4a", *, timeout: float = 120.0) -> List[Segment]:
    """把音频字节转写为带时间点 segments。未配 key 抛 NotConfigured。"""
    provider = _pick_provider()
    if not provider or not settings.asr_api_key:
        raise NotConfigured("ASR 转写未配置，请在 .env 配置 ASR_API_KEY/ASR_API_URL")

    if provider == "openai":
        url = settings.asr_api_url or "https://api.openai.com/v1/audio/transcriptions"
        model = settings.asr_model or "gpt-4o-transcribe"
        return _post_multipart(url, audio_bytes, filename, model, timeout)
    if provider == "custom":
        if not settings.asr_api_url:
            raise NotConfigured("custom provider 需配置 ASR_API_URL")
        return _post_multipart(settings.asr_api_url, audio_bytes, filename, settings.asr_model, timeout)
    if provider == "mimo":
        url = settings.asr_api_url or "https://api.xiaomimimo.com/v1/audio/transcriptions"
        model = settings.asr_model or "mimo-v2.5-asr"
        return _post_multipart(url, audio_bytes, filename, model, timeout)
    raise ASRError(f"未知 ASR provider: {provider}")


def _post_multipart(url: str, audio: bytes, filename: str, model: str, timeout: float) -> List[Segment]:
    headers = {"Authorization": f"Bearer {settings.asr_api_key}"}
    data = {"model": model, "language": settings.asr_language, "response_format": "verbose_json"}
    files = {"file": (filename, audio)}
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=headers, data=data, files=files)
        if resp.status_code != 200:
            raise ASRError(f"ASR 返回 {resp.status_code}: {resp.text[:300]}")
        return parse_segments(resp.json())
    except (httpx.HTTPError, ValueError) as e:
        raise ASRError(f"ASR 调用失败: {e}") from e


def parse_segments(payload: dict) -> List[Segment]:
    """从 ASR 响应解析 segments（兼容 openai verbose_json 与通用 segments）。"""
    segs: List[Segment] = []
    raw = (
        payload.get("segments")
        or payload.get("results")
        or (payload.get("transcription") or {}).get("segments")
        or []
    )
    for s in raw:
        text = (s.get("text") or s.get("content") or "").strip()
        if not text:
            continue
        start = s.get("start_ms")
        end = s.get("end_ms")
        if start is None and s.get("start") is not None:
            start = int(float(s["start"]) * 1000)
        if end is None and s.get("end") is not None:
            end = int(float(s["end"]) * 1000)
        segs.append(Segment(
            text=text,
            speaker_key=str(s.get("speaker") or s.get("speaker_key") or "speaker-1"),
            start_ms=int(start or 0),
            end_ms=int(end or 0),
        ))
    # 回退：无 segments 但有整段 text
    if not segs:
        whole = (payload.get("text") or payload.get("transcript") or "").strip()
        if whole:
            segs.append(Segment(text=whole))
    return segs


def segments_to_dicts(segs: List[Segment]) -> List[dict]:
    return [asdict(s) for s in segs]


def text_to_segments(raw_text: str) -> List[Segment]:
    """贴文本入口：按行切分为伪 segments（无精确时间点，start/end=0）。"""
    out: List[Segment] = []
    for line in (raw_text or "").replace("\r", "\n").split("\n"):
        line = line.strip()
        if line:
            out.append(Segment(text=line))
    return out
