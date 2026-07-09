"""本地会议转写 · faster-whisper large-v3-turbo(2026-07-09,录音不出本机)。

三态诚实(与 ocr.py 同构):
- 依赖未装 / 模型未下 / 引擎初始化失败 → available() 返回对应状态,调用方如实报,不伪造 transcript。
- 模型不进 exe:首次使用时经 HF(默认镜像)下载到 config.MODELS_ROOT/whisper-large-v3-turbo。

热词:transcribe(audio_path, initial_prompt=...) 把项目认知脊椎词表喂进去(meeting_hotwords 构造)。
输出:List[Segment]——复用 transcription.Segment(text/speaker_key/start_ms/end_ms),说话人由 diarize 覆盖。
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

from . import config
from .transcription import Segment

_MODEL_LOCK = threading.Lock()
_MODEL = None  # 懒加载单例(WhisperModel 实例)
_MODEL_KEY = ""  # 已加载模型的 (repo,compute) 指纹,变更则重载


def _model_dir() -> Path:
    return config.MODELS_ROOT / "whisper-large-v3-turbo"


def deps_installed() -> bool:
    """faster-whisper 是否已安装(打包缺件时优雅报,不崩)。"""
    try:
        import faster_whisper  # noqa: F401
        return True
    except Exception:
        return False


def model_present() -> bool:
    """转写模型是否已下载到本机(model.bin 存在且非空)。"""
    mb = _model_dir() / "model.bin"
    return mb.exists() and mb.stat().st_size > 1_000_000


@dataclass(frozen=True)
class Availability:
    ready: bool
    deps: bool
    model: bool
    reason: str  # 面向用户的一句话(三态诚实)


def availability() -> Availability:
    deps = deps_installed()
    model = model_present() if deps else False
    if not deps:
        return Availability(False, False, False, "转写依赖未安装(faster-whisper)")
    if not model:
        return Availability(False, True, False, "转写模型未下载,首次使用时下载")
    return Availability(True, True, True, "就绪")


def ensure_model(progress: Optional[Callable[[str], None]] = None) -> None:
    """确保模型在本机;缺则按 model_source 下载(ModelScope 主路 / HF 备选)。失败抛异常(不伪造成功)。

    离线兜底:手动把模型放进 config.MODELS_ROOT/whisper-large-v3-turbo/(含 model.bin 等),
    model_present() 即真,直接跳过下载——不把命交给在线下载。
    """
    if not deps_installed():
        raise RuntimeError("转写依赖未安装(faster-whisper);请重新安装或联系维护者")
    if model_present():
        return
    dst = _model_dir()
    dst.mkdir(parents=True, exist_ok=True)
    source = (config.settings.model_source or "modelscope").lower()

    if source == "modelscope":
        if progress:
            progress("下载转写模型…(ModelScope 国内源,首次约 1.6GB)")
        try:
            from modelscope.hub.snapshot_download import snapshot_download as ms_download
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(f"ModelScope 库未安装({e});或改 model_source=hf") from e
        # ModelScope 下到缓存后,把 CT2 文件复制到我们的标准目录
        local = ms_download(config.settings.whisper_repo_ms)
        import shutil
        from pathlib import Path as _P
        for f in _P(local).iterdir():
            if f.is_file():
                shutil.copy2(f, dst / f.name)
    else:  # hf
        os.environ.setdefault("HF_ENDPOINT", config.settings.hf_endpoint)
        if progress:
            progress("下载转写模型…(HuggingFace,首次约 1.6GB)")
        from huggingface_hub import snapshot_download
        snapshot_download(config.settings.whisper_repo, local_dir=str(dst))

    if not model_present():
        raise RuntimeError(
            "模型下载后仍未就绪(网络中断/源不可达)。"
            "可改 .env 的 model_source,或手动放模型到 "
            + str(dst)
        )


def _get_model():
    global _MODEL, _MODEL_KEY
    key = f"{config.settings.whisper_repo}|{config.settings.whisper_compute_type}|{config.settings.whisper_device}"
    with _MODEL_LOCK:
        if _MODEL is not None and _MODEL_KEY == key:
            return _MODEL
        from faster_whisper import WhisperModel

        _MODEL = WhisperModel(
            str(_model_dir()),
            device=config.settings.whisper_device,
            compute_type=config.settings.whisper_compute_type,
        )
        _MODEL_KEY = key
        return _MODEL


def transcribe(
    audio_path: str,
    initial_prompt: str = "",
    language: str = "zh",
    progress: Optional[Callable[[str], None]] = None,
) -> list[Segment]:
    """转写音频 → 带时间戳的 Segment 列表(说话人先统一 speaker-1,由 diarize 覆盖)。

    失败抛异常(RuntimeError/引擎异常),调用方转成 job 失败态如实报——不返回空冒充成功。
    """
    ensure_model(progress)
    model = _get_model()
    if progress:
        progress("转写中…")
    segments, _info = model.transcribe(
        audio_path,
        language=language or "zh",
        initial_prompt=initial_prompt or None,
        vad_filter=True,  # 去静音段,减少幻听
        beam_size=5,
    )
    out: list[Segment] = []
    for s in segments:
        txt = (s.text or "").strip()
        if not txt:
            continue
        out.append(
            Segment(
                text=txt,
                speaker_key="speaker-1",
                start_ms=int((s.start or 0.0) * 1000),
                end_ms=int((s.end or 0.0) * 1000),
            )
        )
    return out
