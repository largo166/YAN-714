"""甲方画像库(P1-E):按甲方聚合同一甲方的项目 + 已确认认知(诉求/历史)。

复用 Project.client + ProjectCognition(confirmed)——不另起表、不伪造:
只汇总【人工已确认】的认知摘要,抽不到就空。诉求结构化/黑话词典已在别处 done。
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.get("")
def list_clients(db: Session = Depends(get_db)) -> dict:
    """有甲方名的项目按甲方聚合,返回 [{name, project_count}]。"""
    rows = (
        db.query(models.Project.client, func.count(models.Project.id))
        .filter(models.Project.client != "")
        .group_by(models.Project.client)
        .order_by(func.count(models.Project.id).desc())
        .all()
    )
    return {"items": [{"name": c, "project_count": int(n)} for c, n in rows], "total": len(rows)}


@router.get("/{name}")
def client_portrait(name: str, db: Session = Depends(get_db)) -> dict:
    """某甲方画像:其全部项目 + 每个项目【已确认】认知摘要(诉求/历史),城市汇总。"""
    projs = (
        db.query(models.Project)
        .filter(models.Project.client == name)
        .order_by(models.Project.created_at.desc())
        .all()
    )
    cities = sorted({p.city for p in projs if p.city})
    out_projs = []
    for p in projs:
        cogs = (
            db.query(models.ProjectCognition)
            .filter(
                models.ProjectCognition.project_id == p.id,
                models.ProjectCognition.status == "confirmed",
            )
            .order_by(models.ProjectCognition.id.asc())
            .all()
        )
        cognition = [
            {"module_label": c.module_label or c.module, "summary": c.summary_md.strip()}
            for c in cogs
            if (c.summary_md or "").strip()
        ]
        out_projs.append(
            {
                "id": p.id,
                "name": p.name,
                "city": p.city,
                "status": p.status,
                "current_stage": p.current_stage,
                "cognition": cognition,
            }
        )
    return {
        "client": name,
        "project_count": len(projs),
        "cities": cities,
        "projects": out_projs,
    }
