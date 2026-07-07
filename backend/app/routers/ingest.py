"""一键清理·入库 API（检查点① 铁条3，dev 态）：启动 job + SSE 逐文件逐段进度。

- POST /api/ingest        启动一个入库 job（body: {paths:[...]}），返回 job_id。
- GET  /api/ingest/{id}/stream   SSE(text/event-stream) 逐文件逐段推进度直到 done。
- GET  /api/ingest/{id}          job 快照（前端断线重连兜底；dev 态进程重启即丢）。

进度存内存（app.ingest._JOBS）。DB-backed 续跑（ingest_jobs 表）依赖 0023 迁移，卡命门后。
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .. import ingest, schemas

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


@router.post("", response_model=schemas.IngestStartOut)
def start(payload: schemas.StagingIn) -> schemas.IngestStartOut:
    """启动入库 job。复用 staging 的路径入参形态（文件/文件夹混合，后台递归展开）。"""
    paths = [p.strip() for p in (payload.paths or []) if p and p.strip()]
    if not paths:
        raise HTTPException(400, "未选择任何文件或文件夹")
    job_id = ingest.start_ingest(paths)
    return schemas.IngestStartOut(job_id=job_id)


@router.get("/{job_id}")
def snapshot(job_id: str) -> dict:
    """job 当前快照（含累计计数与最近事件）。前端断线可用它兜底。"""
    job = ingest.get_job(job_id)
    if job is None:
        raise HTTPException(404, "job 不存在（可能进程已重启，dev 态进度不持久）")
    return job


@router.get("/{job_id}/stream")
async def stream(job_id: str) -> StreamingResponse:
    """SSE：从头重放已产生的事件，再实时推后续，直到 phase=done/error。"""
    if ingest.get_job(job_id) is None:
        raise HTTPException(404, "job 不存在")

    async def gen():
        sent = 0
        while True:
            job = ingest.get_job(job_id)
            if job is None:
                yield _sse({"kind": "gone"})
                return
            events = job.get("events", [])
            # 推送尚未发送的增量事件
            while sent < len(events):
                yield _sse(events[sent])
                sent += 1
            if job.get("phase") in ("done", "error"):
                yield _sse({"kind": "eof", "phase": job.get("phase")})
                return
            await asyncio.sleep(0.25)  # 轮询内存事件队列（dev 态；非高频，够真实推进观感）

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"
