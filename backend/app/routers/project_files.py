"""项目文件 API（Phase 4D）：上传 / 列表 / 详情·预览 / 删除(可逆) / 恢复 / 回流入库。

落盘走 uploads.py（硬编码 data/uploads + validate_path），解析走 parsing.py（分级状态不伪造）。
删除为软删（移 _trash + manifest），永不硬删。
"""
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models, parsing, retrieval, schemas, uploads
from ..database import get_db
from ..safe_paths import sanitize_filename

router = APIRouter(prefix="/api/projects", tags=["project-files"])


def _project_dirs(root_path: str) -> tuple[Path, list[Path]]:
    root = Path(root_path)
    if not root.exists() or not root.is_dir():
        raise HTTPException(400, "目录不存在或不可访问")
    return root, sorted([p for p in root.iterdir() if p.is_dir()], key=lambda p: p.name)


def _scan_project_dir(root: Path, pdir: Path) -> schemas.BatchIngestProjectPreviewOut:
    supported: list[schemas.BatchIngestFileOut] = []
    unsupported: list[schemas.BatchIngestFileOut] = []
    for path in sorted(pdir.rglob("*"), key=lambda x: str(x)):
        if not path.is_file():
            continue
        rel = str(path.relative_to(root))
        item = schemas.BatchIngestFileOut(
            path=rel,
            size=path.stat().st_size,
            ext=path.suffix.lower(),
        )
        if parsing.is_supported(path.name):
            supported.append(item)
        else:
            unsupported.append(item)
    return schemas.BatchIngestProjectPreviewOut(
        project_name=pdir.name,
        path=str(pdir),
        supported_count=len(supported),
        unsupported_count=len(unsupported),
        files=supported,
        unsupported=unsupported,
    )


def _find_or_create_project(db: Session, name: str) -> models.Project:
    row = db.query(models.Project).filter(models.Project.name == name).first()
    if row is not None:
        return row
    project = models.Project(name=name, status="active")
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def _already_imported(db: Session, project_id: int, filename: str, size: int) -> bool:
    return (
        db.query(models.ProjectFile)
        .filter(
            models.ProjectFile.project_id == project_id,
            models.ProjectFile.filename == sanitize_filename(filename),
            models.ProjectFile.size == size,
            models.ProjectFile.status == "active",
        )
        .first()
        is not None
    )


def _index_project_file(db: Session, f: models.ProjectFile) -> int:
    if f.parse_status != "ok" or not f.content_text.strip():
        return 0
    if f.indexed_doc_id:
        existing = db.get(models.KnowledgeDocument, f.indexed_doc_id)
        if existing is not None:
            return existing.id
    doc = models.KnowledgeDocument(
        title=f.filename,
        source_path=f.stored_path,
        content_text=f.content_text,
        file_type=f.file_type or "text",
        tags="项目文件,批量接入",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    retrieval.index_one(db, doc.id, doc.title, doc.content_text, doc.tags)
    f.indexed_doc_id = doc.id
    db.commit()
    return doc.id


@router.post("/batch-ingest/preview", response_model=schemas.BatchIngestPreviewOut)
def batch_ingest_preview(payload: schemas.BatchIngestRequest) -> schemas.BatchIngestPreviewOut:
    root, project_dirs = _project_dirs(payload.root_path)
    projects = [_scan_project_dir(root, pdir) for pdir in project_dirs]
    return schemas.BatchIngestPreviewOut(
        accessible=True,
        root=str(root),
        total_projects=len(projects),
        total_supported=sum(p.supported_count for p in projects),
        total_unsupported=sum(p.unsupported_count for p in projects),
        projects=projects,
    )


@router.post("/batch-ingest/import", response_model=schemas.BatchIngestImportOut)
def batch_ingest_import(
    payload: schemas.BatchIngestImportRequest, db: Session = Depends(get_db)
) -> schemas.BatchIngestImportOut:
    root, project_dirs = _project_dirs(payload.root_path)
    allowed = set(payload.project_names or [])
    results: list[schemas.BatchIngestProjectImportOut] = []

    for pdir in project_dirs:
        if allowed and pdir.name not in allowed:
            continue
        project = _find_or_create_project(db, pdir.name)
        copied = indexed = failed = skipped = 0

        for path in sorted(pdir.rglob("*"), key=lambda x: str(x)):
            if not path.is_file() or not parsing.is_supported(path.name):
                continue
            size = path.stat().st_size
            if _already_imported(db, project.id, path.name, size):
                skipped += 1
                continue
            try:
                stored = uploads.copy_into_uploads(project.id, path)
                pr = parsing.parse_file(stored.abs_path)
                pf = models.ProjectFile(
                    project_id=project.id,
                    filename=stored.filename,
                    stored_path=stored.stored_path,
                    file_type=stored.filename.rsplit(".", 1)[-1].lower()
                    if "." in stored.filename
                    else "",
                    size=stored.size,
                    parse_status=pr.status,
                    parse_error=pr.error,
                    content_text=pr.text,
                    status="active",
                )
                db.add(pf)
                db.commit()
                db.refresh(pf)
                copied += 1
                if payload.index_to_knowledge and _index_project_file(db, pf):
                    indexed += 1
            except Exception as exc:  # noqa: BLE001  批量接入单文件失败不阻断其它文件
                db.rollback()
                failed += 1
                print(f"batch ingest failed: {path}: {exc}")

        results.append(
            schemas.BatchIngestProjectImportOut(
                project_id=project.id,
                project_name=project.name,
                copied=copied,
                indexed=indexed,
                failed=failed,
                skipped_existing=skipped,
            )
        )

    return schemas.BatchIngestImportOut(
        status="ok",
        root=str(root),
        total_projects=len(results),
        copied=sum(x.copied for x in results),
        indexed=sum(x.indexed for x in results),
        failed=sum(x.failed for x in results),
        skipped_existing=sum(x.skipped_existing for x in results),
        projects=results,
    )


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
        raise HTTPException(400, "仅支持 txt/md/pdf/docx/pptx/xlsx/png/jpg/jpeg")

    data = await file.read()

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
