"""说话人分离 · sherpa-onnx(2026-07-09,免 torch,复用已随包 onnxruntime)。

pyannote segmentation(ONNX)+ 3D-Speaker 中文 embedding + 快速聚类。
本阶段只区分 speaker-1/2/3,不认真实身份——生成纪要前由人工映射改名(不承诺自动认人)。

三态诚实(与 transcribe_local 同构):
- sherpa-onnx 未装 / 分离模型未下 → available()=False,调用方降级为单说话人(全 speaker-1),如实标注,不伪造分离。
- align():把分离出的说话人时间轴对齐到转写 Segment(纯函数,可单测——按时间重叠投票)。
"""
from __future__ import annotations

import threading
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from . import config
from .transcription import Segment

_DIA_LOCK = threading.Lock()
_DIA = None


def _seg_model() -> Path:
    return config.MODELS_ROOT / "sherpa-onnx-pyannote-segmentation-3-0" / "model.onnx"


def _embed_model() -> Path:
    return config.MODELS_ROOT / "spk_embed_zh.onnx"


def deps_installed() -> bool:
    try:
        import sherpa_onnx  # noqa: F401
        return True
    except Exception:
        return False


def models_present() -> bool:
    return _seg_model().exists() and _embed_model().exists()


@dataclass(frozen=True)
class DiaTurn:
    start_ms: int
    end_ms: int
    speaker: str  # "speaker-1" / "speaker-2" ...


def available() -> tuple[bool, str]:
    if not deps_installed():
        return False, "分离依赖未安装(sherpa-onnx)"
    if not models_present():
        return False, "分离模型未下载"
    return True, "就绪"


def _get_diarizer(num_speakers: int = -1):
    global _DIA
    with _DIA_LOCK:
        if _DIA is not None:
            return _DIA
        import sherpa_onnx as so

        cfg = so.OfflineSpeakerDiarizationConfig(
            segmentation=so.OfflineSpeakerSegmentationModelConfig(
                pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(_seg_model())),
            ),
            embedding=so.SpeakerEmbeddingExtractorConfig(model=str(_embed_model())),
            clustering=so.FastClusteringConfig(
                num_clusters=num_speakers if num_speakers and num_speakers > 0 else -1,
                threshold=0.5,  # num_clusters<0 时按阈值自动定说话人数
            ),
            min_duration_on=0.3,
            min_duration_off=0.5,
        )
        if not cfg.validate():
            raise RuntimeError("说话人分离配置无效(模型文件缺失或损坏)")
        _DIA = so.OfflineSpeakerDiarization(cfg)
        return _DIA


def diarize(wav_path: str, num_speakers: int = -1) -> list[DiaTurn]:
    """对 16k 单声道 wav 做说话人分离 → 时间轴 turns。失败抛异常,调用方降级不伪造。"""
    dia = _get_diarizer(num_speakers)
    with wave.open(wav_path, "rb") as wf:
        if wf.getframerate() != dia.sample_rate:
            raise RuntimeError(f"分离需要 {dia.sample_rate}Hz 采样,实际 {wf.getframerate()}Hz")
        import numpy as np

        n = wf.getnframes()
        raw = wf.readframes(n)
        samples = np.frombuffer(raw, dtype=np.int16).astype("float32") / 32768.0
    result = dia.process(samples)
    turns: list[DiaTurn] = []
    for seg in result.sort_by_start_time():
        turns.append(
            DiaTurn(
                start_ms=int(seg.start * 1000),
                end_ms=int(seg.end * 1000),
                speaker=f"speaker-{seg.speaker + 1}",
            )
        )
    return turns


def align(segments: list[Segment], turns: list[DiaTurn]) -> list[Segment]:
    """把说话人时间轴对齐到转写 Segment:每段取时间重叠最多的说话人(纯函数,可单测)。

    无重叠(分离没覆盖到)→ 保持原 speaker-1,不猜。turns 为空 → 原样返回(降级单说话人)。
    """
    if not turns:
        return segments
    out: list[Segment] = []
    for s in segments:
        best_spk = s.speaker_key
        best_overlap = 0
        for t in turns:
            lo = max(s.start_ms, t.start_ms)
            hi = min(s.end_ms, t.end_ms)
            ov = hi - lo
            if ov > best_overlap:
                best_overlap = ov
                best_spk = t.speaker
        out.append(
            Segment(text=s.text, speaker_key=best_spk, start_ms=s.start_ms, end_ms=s.end_ms)
        )
    return out
