"""项目文件 API（Phase 4D）：上传 / 列表 / 详情·预览 / 删除(可逆) / 恢复 / 回流入库。

落盘走 uploads.py（硬编码 data/uploads + validate_path），解析走 parsing.py（分级状态不伪造）。
删除为软删（移 _trash + manifest），永不硬删。
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models, parsing, retrieval, schemas, uploads
from ..database import get_db

router = APIRouter(prefix="/api/projects", tags=["project-files"])


def _project_or_404(db: Session, project_id: int) -> models.Project:
    p = db.get(models.Project, project_id)
    if p is None:
        raise HTTPException(404, "项目不存在")
    return p


def _file_or_404(db: Session, project_id: int, file_id: int) -> models.ProjectFile:
    f = db.get(models.ProjectFile, file_id)
    if f is None or f.project_id != project_id:
        raise HTTPException(404, "文件不存在")
    return f


@router.post("/{project_id}/files", response_model=schemas.ProjectFileDetailOut, status_code=201)
async def upload_file(
    project_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    if not parsing.is_supported(file.filename or ""):
        raise HTTPException(400, "仅支持 txt/md/pdf/docx/pptx")

    data = await file.read()
    if len(data) > parsing.MAX_FILE_BYTES:
        raise HTTPException(400, "文件超过 25MB 上限")

    stored = uploads.save_upload(project_id, file.filename or "untitled", data)
    # 同步解析（文件通常不大）
    pr = parsing.parse_file(stored.abs_path)

    pf = models.ProjectFile(
        project_id=project_id,
        filename=stored.filename,
        stored_path=stored.stored_path,
        file_type=stored.filename.rsplit(".", 1)[-1].lower() if "." in stored.filename else "",
        size=stored.size,
        parse_status=pr.status,
        parse_error=pr.error,
        content_text=pr.text,
        status="active",
    )
    db.add(pf)
    db.commit()
    db.refresh(pf)
    return pf


@router.get("/{project_id}/files", response_model=schemas.ProjectFileListOut)
def list_files(project_id: int, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    items = (
        db.query(models.ProjectFile)
        .filter(
            models.ProjectFile.project_id == project_id,
            models.ProjectFile.status == "active",
        )
        .order_by(models.ProjectFile.created_at.desc())
        .all()
    )
    return schemas.ProjectFileListOut(items=items, total=len(items))


@router.get("/{project_id}/files/{file_id}", response_model=schemas.ProjectFileDetailOut)
def get_file(project_id: int, file_id: int, db: Session = Depends(get_db)):
    return _file_or_404(db, project_id, file_id)


@router.delete("/{project_id}/files/{file_id}")
def delete_file(project_id: int, file_id: int, db: Session = Depends(get_db)):
    """软删：移到 _trash + manifest，DB 标 trashed。永不硬删。"""
    f = _file_or_404(db, project_id, file_id)
    res = uploads.soft_delete(project_id, f.stored_path)
    if not res.get("ok"):
        raise HTTPException(400, res.get("error", "删除失败"))
    f.status = "trashed"
    db.commit()
    # 时间戳供 restore 用
    return {"ok": True, "file_id": file_id, "trash_timestamp": res["trash"].replace("\\", "/").rsplit("/", 1)[-1]}


@router.post("/{project_id}/files/{file_id}/restore", response_model=schemas.ProjectFileDetailOut)
def restore_file(project_id: int, file_id: int, timestamp: str, db: Session = Depends(get_db)):
    f = _file_or_404(db, project_id, file_id)
    res = uploads.restore(project_id, timestamp)
    if not res.get("ok"):
        raise HTTPException(400, res.get("error", "恢复失败"))
    f.status = "active"
    db.commit()
    db.refresh(f)
    return f


@router.post("/{project_id}/files/{file_id}/index", response_model=schemas.IndexFileOut)
def index_file(project_id: int, file_id: int, db: Session = Depends(get_db)):
    """回流入库：把已解析文件写入 knowledge_documents（人工触发，幂等）。"""
    f = _file_or_404(db, project_id, file_id)
    if f.parse_status != "ok" or not f.content_text.strip():
        raise HTTPException(400, "该文件无可用文本，无法入库（不伪造）")
    # 幂等：已入库则直接返回
    if f.indexed_doc_id:
        existing = db.get(models.KnowledgeDocument, f.indexed_doc_id)
        if existing is not None:
            return schemas.IndexFileOut(file_id=f.id, document_id=existing.id, title=existing.title)

    doc = models.KnowledgeDocument(
        title=f.filename,
        source_path=f.stored_path,  # 我方副本相对路径（已净化）
        content_text=f.content_text,
        file_type=f.file_type or "text",
        tags="项目文件",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    retrieval.index_one(db, doc.id, doc.title, doc.content_text, doc.tags)

    f.indexed_doc_id = doc.id
    db.commit()
    return schemas.IndexFileOut(file_id=f.id, document_id=doc.id, title=doc.title)
