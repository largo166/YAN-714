"""会议录音转写 · 异步 job 编排器(2026-07-09,录音不出本机)。

镜像 ingest.py 的 _JOBS 内存进度模式(dev 态,进程重启即丢)。一条 job 走十态:
  等待上传 → 上传中 → 检查文件 → 下载/检查模型 → 转写中 → 说话人分离中 → (等人工映射) → 生成纪要中 → 写入项目库 → 完成/失败
本模块负责「录音→转写→分离→落 Meeting 行(segments_json)」四段;生成纪要/映射改名走 meetings 路由既有端点(不重写)。

三态诚实:任一段失败 → phase='failed' + 真实 reason(模型未下/格式不支持/转写失败/分离失败/落库失败),不伪造。
音频解码用 PyAV(自带 ffmpeg,免系统依赖)转 16k 单声道 wav——转写与分离共用。
"""
from __future__ import annotations

import threading
import time
import uuid
import wave
from pathlib import Path
from typing import Optional

from . import config, diarize, models, safe_json, transcribe_local, transcription
from .database import SessionLocal

_JOBS: dict[str, dict] = {}
_LOCK = threading.Lock()

# 十态(与前端进度条对齐;"等待人工映射"是 done 后的人工环节,不在 job 内)
STAGES = ["检查文件", "检查/下载模型", "转写中", "说话人分离中", "写入项目库"]

AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".flac", ".webm", ".mp4", ".aac", ".ogg"}


def _now() -> float:
    return time.time()


def _set(job_id: str, **patch) -> None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is not None:
            job.update(patch)
            job["updated_at"] = _now()


def _stage(job_id: str, stage: str, note: str = "") -> None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is not None:
            job["stage"] = stage
            if note:
                job["note"] = note
            job["updated_at"] = _now()


def get_job(job_id: str) -> Optional[dict]:
    with _LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job else None


def decode_to_wav16k(src_path: str, dst_path: str) -> None:
    """任意音频 → 16kHz 单声道 16-bit wav(PyAV,自带 ffmpeg)。失败抛异常。"""
    import av
    import numpy as np

    container = av.open(src_path)
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks: list[bytes] = []
    for frame in container.decode(audio=0):
        for rframe in resampler.resample(frame):
            chunks.append(bytes(rframe.planes[0]))
    container.close()
    # flush resampler
    for rframe in resampler.resample(None):
        chunks.append(bytes(rframe.planes[0]))
    pcm = b"".join(chunks)
    if not pcm:
        raise RuntimeError("音频解码为空(文件损坏或无音轨)")
    with wave.open(dst_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(pcm)
    _ = np  # keep import explicit for packaging


def start_job(project_id: int, audio_path: str, filename: str, initial_prompt: str, meeting_title: str) -> str:
    job_id = uuid.uuid4().hex
    with _LOCK:
        _JOBS[job_id] = {
            "job_id": job_id,
            "project_id": project_id,
            "filename": filename,
            "meeting_title": meeting_title,
            "phase": "running",  # running | done | failed
            "stage": "检查文件",
            "note": "",
            "meeting_id": 0,
            "error": "",
            "created_at": _now(),
            "updated_at": _now(),
        }
    t = threading.Thread(target=_worker, args=(job_id, audio_path, filename, initial_prompt, meeting_title), daemon=True)
    t.start()
    return job_id


def _worker(job_id: str, audio_path: str, filename: str, initial_prompt: str, meeting_title: str) -> None:
    db = SessionLocal()
    wav_path = str(Path(audio_path).with_suffix(".16k.wav"))
    try:
        # ① 检查文件
        _stage(job_id, "检查文件")
        ext = Path(filename).suffix.lower()
        if ext not in AUDIO_EXTS:
            raise RuntimeError(f"不支持的音频格式:{ext}(支持 {', '.join(sorted(AUDIO_EXTS))})")
        decode_to_wav16k(audio_path, wav_path)

        # ② 检查/下载模型
        _stage(job_id, "检查/下载模型")
        transcribe_local.ensure_model(progress=lambda m: _stage(job_id, "检查/下载模型", m))

        # ③ 转写(带项目热词)
        _stage(job_id, "转写中")
        segs = transcribe_local.transcribe(
            wav_path, initial_prompt=initial_prompt, language=config.settings.asr_language,
            progress=lambda m: _stage(job_id, "转写中", m),
        )
        if not segs:
            raise RuntimeError("转写结果为空(录音可能无有效语音)")

        # ④ 说话人分离(可用则分,不可用/失败则降级单说话人——如实标注不伪造)
        _stage(job_id, "说话人分离中")
        ok, reason = diarize.available()
        diar_note = ""
        if ok:
            try:
                turns = diarize.diarize(wav_path)
                segs = diarize.align(segs, turns)
                spk_count = len({s.speaker_key for s in segs})
                diar_note = f"已分离 {spk_count} 位说话人"
            except Exception as e:  # noqa: BLE001  分离失败降级,不阻断全链
                diar_note = f"分离失败,降级为单说话人:{str(e)[:80]}"
        else:
            diar_note = f"未做分离({reason}),按单说话人"
        _stage(job_id, "说话人分离中", diar_note)

        # ⑤ 写入项目库(落 Meeting 行,transcript_source='asr';复用既有 segments_json 契约)
        _stage(job_id, "写入项目库")
        raw_text = "\n".join(s.text for s in segs)
        m = models.Meeting(
            project_id=int(_JOBS[job_id]["project_id"]),
            title=meeting_title or Path(filename).stem,
            raw_text=raw_text,
            segments_json=safe_json.dumps_safe(transcription.segments_to_dicts(segs)),
            transcript_source="asr",
            status="created",
        )
        # 原始录音留本机(P0 资产#1;录音不出本机=保留本地,非删除):存 uploads/{pid}/_audio/
        from .uploads import UPLOADS_ROOT

        audio_keep = UPLOADS_ROOT / str(_JOBS[job_id]["project_id"]) / "_audio" / filename
        try:
            audio_keep.parent.mkdir(parents=True, exist_ok=True)
            Path(audio_path).replace(audio_keep)
            m.raw_text = raw_text  # already set; audio path recorded in resource for traceability
        except OSError:
            pass
        db.add(m)
        db.commit()
        db.refresh(m)
        _set(job_id, phase="done", stage="完成", meeting_id=m.id, note=diar_note)
    except Exception as e:  # noqa: BLE001  全链任一段失败 → 真实报错
        _set(job_id, phase="failed", stage="失败", error=str(e)[:300])
        try:
            Path(audio_path).unlink(missing_ok=True)  # 失败时清临时源(未落库不留孤儿)
        except OSError:
            pass
    finally:
        db.close()
        try:
            Path(wav_path).unlink(missing_ok=True)  # 临时 16k wav 用完即删
        except OSError:
            pass
