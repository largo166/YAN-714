"""项目文件 API（Phase 4D）：上传 / 列表 / 详情·预览 / 删除(可逆) / 恢复 / 回流入库。

落盘走 uploads.py（硬编码 data/uploads + validate_path），解析走 parsing.py（分级状态不伪造）。
删除为软删（移 _trash + manifest），永不硬删。
"""
import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import knowledge_meta, models, parsing, retrieval, schemas, uploads
from ..database import get_db
from ..safe_paths import sanitize_filename

router = APIRouter(prefix="/api/projects", tags=["project-files"])

# 项目名直接用一级文件夹原名,不做自动切分——中文地名(如"石家庄市庄")用规则无法消歧,
# 取名是人的判断不是匹配题。建项目后由用户在项目中心手动改名(PUT /projects/{id})。


def _project_name(pdir: Path) -> str:
    """项目单元显示名:单文件→去扩展名(如 任务书.pdf→任务书);目录→文件夹原名。"""
    return pdir.stem if pdir.is_file() else pdir.name


def _unit_files(pdir: Path) -> list[Path]:
    """一个项目单元包含的文件:单文件单元就是它自己;目录单元则递归取其下所有文件。"""
    if pdir.is_file():
        return [pdir]
    return [p for p in sorted(pdir.rglob("*"), key=lambda x: str(x)) if p.is_file()]


def _project_dirs(root_path: str) -> tuple[Path, list[Path]]:
    root = Path(root_path)
    # 单个文件:把它自己当作唯一项目单元,父目录作 root(rel 路径据此计算)。
    # 支持"选择来源"既可选文件夹也可选单个文件(与前端两动作拆分配套)。
    if root.is_file():
        return root.parent, [root]
    if not root.exists() or not root.is_dir():
        raise HTTPException(400, "路径不存在或不可访问")
    # 排除清理隔离区(_ROMAI_CLEANUP_QUARANTINE)——它是 workspace 安全清理的隔离目录,
    # 不是项目,否则会把已隔离文件当项目误接入(与 workspace.scan 的过滤口径一致)。
    subdirs = sorted(
        [p for p in root.iterdir() if p.is_dir() and p.name != "_ROMAI_CLEANUP_QUARANTINE"],
        key=lambda p: p.name,
    )
    # 子文件夹=各自一个项目;若根目录是【扁平文件夹】(无子目录、仅散落文件)→ 把根目录本身当作一个项目,
    # 否则散落在根的文件永远不会被接入(数据基地"选文件夹整理"对扁平文件夹就成了空操作)。
    if not subdirs:
        return root, [root]
    return root, subdirs


def _scan_project_dir(root: Path, pdir: Path) -> schemas.BatchIngestProjectPreviewOut:
    supported: list[schemas.BatchIngestFileOut] = []
    unsupported: list[schemas.BatchIngestFileOut] = []
    for path in _unit_files(pdir):
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
        project_name=_project_name(pdir),  # 文件夹原名/文件去扩展名,不自动切分(用户后续可手动改名)
        path=str(pdir),
        supported_count=len(supported),
        unsupported_count=len(unsupported),
        files=supported,
        unsupported=unsupported,
    )


def _norm_source(p) -> str:
    """规范化源路径作去重键:绝对化 + 按平台大小写规则归一(Windows 不区分大小写,避免同夹两路径形式漏判)。"""
    try:
        return os.path.normcase(os.path.abspath(str(p)))
    except Exception:  # noqa: BLE001
        return str(p)


def _find_or_create_project(db: Session, folder_name: str, source_path: str) -> models.Project:
    """按【源文件夹路径】去重(可靠键,支持重新整理):同 source_path 已存在→复用(不改名,
    保留用户在项目中心可能做过的手动改名);否则用文件夹原名新建并记录来源路径。"""
    source_path = _norm_source(source_path) if source_path else source_path
    if source_path:
        row = db.query(models.Project).filter(models.Project.source_path == source_path).first()
        if row is not None:
            return row
    project = models.Project(name=folder_name, status="active", source_path=source_path)
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


def _doc_from_file(db: Session, f: models.ProjectFile, tags: str) -> models.KnowledgeDocument:
    """从项目文件构造知识文档，规则填充 type/resource（零 LLM，description 留空待 AI 生成）。"""
    proj = db.get(models.Project, f.project_id)
    resource = f"{proj.name} / {f.stored_path}" if proj else f.stored_path
    return models.KnowledgeDocument(
        title=f.filename,
        source_path=f.stored_path,
        content_text=f.content_text,
        file_type=f.file_type or "text",
        tags=tags,
        type=knowledge_meta.infer_type(f.filename, f.file_type, tags, f.content_text[:200]),
        resource=resource,
    )


def _index_project_file(db: Session, f: models.ProjectFile) -> int:
    # ok/ok_truncated=真实正文（截断也是真材料）；metadata_only=登记说明（靠 title/type 检索）。
    # extraction_timeout 是待人工状态，不入库。
    if f.parse_status not in ("ok", "ok_truncated", "metadata_only") or not f.content_text.strip():
        return 0
    if f.indexed_doc_id:
        existing = db.get(models.KnowledgeDocument, f.indexed_doc_id)
        if existing is not None:
            return existing.id
    doc = _doc_from_file(db, f, "项目文件,批量接入")
    db.add(doc)
    db.commit()
    db.refresh(doc)
    retrieval.index_one(db, doc.id, doc.title, doc.content_text, retrieval.fts_tags(doc))
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
        if allowed and _project_name(pdir) not in allowed:
            continue
        unit_files = _unit_files(pdir)
        # 预检:无任何可解析文件的单元直接跳过,不创建空项目(避免污染项目列表)
        if not any(parsing.is_supported(p.name) for p in unit_files):
            continue
        project = _find_or_create_project(db, _project_name(pdir), str(pdir))
        copied = indexed = failed = skipped = 0

        for path in unit_files:
            if not parsing.is_supported(path.name):
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
                    truncated_at_page=pr.truncated_at_page,
                    total_pages=pr.total_pages,
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
        truncated_at_page=pr.truncated_at_page,
        total_pages=pr.total_pages,
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
    if f.parse_status not in ("ok", "ok_truncated", "metadata_only") or not f.content_text.strip():
        raise HTTPException(400, "该文件无可用文本，无法入库（不伪造）")
    # 幂等：已入库则直接返回
    if f.indexed_doc_id:
        existing = db.get(models.KnowledgeDocument, f.indexed_doc_id)
        if existing is not None:
            return schemas.IndexFileOut(file_id=f.id, document_id=existing.id, title=existing.title)

    doc = _doc_from_file(db, f, "项目文件")
    db.add(doc)
    db.commit()
    db.refresh(doc)
    retrieval.index_one(db, doc.id, doc.title, doc.content_text, retrieval.fts_tags(doc))

    f.indexed_doc_id = doc.id
    db.commit()
    return schemas.IndexFileOut(file_id=f.id, document_id=doc.id, title=doc.title)
