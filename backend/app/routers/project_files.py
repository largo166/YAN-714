"""项目文件 API（Phase 4D）：上传 / 列表 / 详情·预览 / 删除(可逆) / 恢复 / 回流入库。

落盘走 uploads.py（硬编码 data/uploads + validate_path），解析走 parsing.py（分级状态不伪造）。
删除为软删（移 _trash + manifest），永不硬删。
"""
import os
from pathlib import Path

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import knowledge_meta, models, parsing, retrieval, schemas, uploads, image_assets, safe_json
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


def _project_dirs(root_path: str, mode: str = "collection") -> tuple[Path, list[Path]]:
    root = Path(root_path)
    # 单个文件:把它自己当作唯一项目单元,父目录作 root(rel 路径据此计算)。与 mode 无关。
    if root.is_file():
        return root.parent, [root]
    if not root.exists() or not root.is_dir():
        raise HTTPException(400, "路径不存在或不可访问")
    # 单项目模式:整个所选文件夹 = 1 个项目(子文件夹只是它的资料分类,_unit_files 已 rglob 全收)。
    # 用户明确"这个文件夹本身是一个项目"时选此,避免把分类子文件夹误建成独立项目。
    if mode == "single":
        return root, [root]
    # 项目集合模式(默认):一级子文件夹各=一个项目。
    # 排除清理隔离区(_ROMAI_CLEANUP_QUARANTINE)——它是 workspace 安全清理的隔离目录,
    # 不是项目,否则会把已隔离文件当项目误接入(与 workspace.scan 的过滤口径一致)。
    subdirs = sorted(
        [p for p in root.iterdir() if p.is_dir() and p.name != "_ROMAI_CLEANUP_QUARANTINE"],
        key=lambda p: p.name,
    )
    # 若根目录是【扁平文件夹】(无子目录、仅散落文件)→ 把根目录本身当作一个项目,
    # 否则散落在根的文件永远不会被接入(数据基地"选文件夹整理"对扁平文件夹就成了空操作)。
    if not subdirs:
        return root, [root]
    return root, subdirs


def _mode_hint(root: Path) -> str:
    """是否值得提示用户考虑"单个项目"解读。零猜测原则:不看子文件夹名,
    只要目录【有子文件夹】(即集合解读会拆成多个项目),就提示用户确认是集合还是单项目——
    因为只有用户知道这个文件夹是"装着多个项目"还是"本身一个项目、子文件夹是资料分类"。"""
    try:
        if root.is_file():
            return ""
        subs = [p for p in root.iterdir() if p.is_dir() and p.name != "_ROMAI_CLEANUP_QUARANTINE"]
    except OSError:
        return ""
    # 有子文件夹 → 两种解读都成立,提示用户选(单文件/扁平文件夹无歧义,不提示)
    return "choose_mode" if subs else ""


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


def _managed_layout(db: Session, project: models.Project) -> tuple:
    """据 AppSetting 解析「受管根 + 子目录 + storage_root(存库归一根)」。

    配置仓库 → (仓库根, 项目名, 归一仓库根);未配置 → (UPLOADS_ROOT, str(pid), "")。
    storage_root 存空串=回退行(还原视作 uploads),与历史行为一致。
    """
    cfg = db.get(models.AppSetting, 1)
    repo = (cfg.repository_root_path if cfg else "") or ""
    base = uploads.managed_root(repo)
    if base != uploads.UPLOADS_ROOT:
        return base, project.name, _norm_source(base)  # 仓库模式:{仓库}/{项目名}/
    return base, str(project.id), ""                    # 回退模式:{uploads}/{pid}/


def _store_file(db: Session, project: models.Project, path) -> tuple:
    """把单个源文件复制进受管根,返回 (StoredFile, storage_root)。"""
    base, subdir, storage_root = _managed_layout(db, project)
    stored = uploads.copy_into_root(base, subdir, path)
    return stored, storage_root


def _migrate_project_to_repo(db: Session, project: models.Project, repo_root: Path) -> dict:
    """把某项目所有【回退布局(storage_root='',落在内部 uploads)】的活动文件搬进
    {仓库}/{项目名}/。移动语义:复制成功后删内部副本。幂等:已在仓库的跳过。

    返回 {moved, skipped, failed}。逐文件提交,单个失败不影响其它(回滚该文件)。
    """
    repo_root_str = _norm_source(repo_root)
    files = (
        db.query(models.ProjectFile)
        .filter(
            models.ProjectFile.project_id == project.id,
            models.ProjectFile.status == "active",
        )
        .all()
    )
    moved = skipped = missing = failed = 0
    for pf in files:
        if (pf.storage_root or "").strip():
            skipped += 1  # 已在仓库,不重复搬
            continue
        try:
            src = uploads.abs_of(pf.stored_path, "")  # 回退根 = UPLOADS_ROOT/{pid}/{name}
            if not src.exists():
                missing += 1  # 源文件已不在内部目录(陈旧记录),不算失败:无文件可搬,不损坏任何东西
                continue
            stored = uploads.copy_into_root(repo_root, project.name, src, original_name=pf.filename)
            try:
                src.unlink()  # 复制成功 → 删内部副本(移动语义;失败不致命,文件已在仓库)
            except OSError:
                pass
            pf.storage_root = repo_root_str
            pf.stored_path = stored.stored_path
            db.commit()
            moved += 1
        except Exception:  # noqa: BLE001  真异常(复制/写库失败)才算 failed
            db.rollback()
            failed += 1
    return {"moved": moved, "skipped": skipped, "missing": missing, "failed": failed}


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


def _mode_summary(root_path: str, mode: str) -> schemas.BatchIngestModeSummaryOut:
    root, project_dirs = _project_dirs(root_path, mode)
    projects = [_scan_project_dir(root, pdir) for pdir in project_dirs]
    return schemas.BatchIngestModeSummaryOut(
        mode=mode,
        total_projects=len(projects),
        total_supported=sum(p.supported_count for p in projects),
        total_unsupported=sum(p.unsupported_count for p in projects),
        projects=projects,
    )


@router.post("/batch-ingest/preview", response_model=schemas.BatchIngestPreviewOut)
def batch_ingest_preview(payload: schemas.BatchIngestRequest) -> schemas.BatchIngestPreviewOut:
    root = Path(payload.root_path)
    is_file = root.is_file()
    collection = _mode_summary(payload.root_path, "collection")
    # 单文件无"集合/单项目"之分;目录才算两种解读
    single = None if is_file else _mode_summary(payload.root_path, "single")
    return schemas.BatchIngestPreviewOut(
        accessible=True,
        root=str(root if is_file else _project_dirs(payload.root_path, "collection")[0]),
        # 顶层沿用 collection 解读(向后兼容旧前端)
        total_projects=collection.total_projects,
        total_supported=collection.total_supported,
        total_unsupported=collection.total_unsupported,
        projects=collection.projects,
        is_single_file=is_file,
        collection=collection,
        single_project=single,
        mode_hint=_mode_hint(root),
    )


@router.post("/batch-ingest/import", response_model=schemas.BatchIngestImportOut)
def batch_ingest_import(
    payload: schemas.BatchIngestImportRequest, db: Session = Depends(get_db)
) -> schemas.BatchIngestImportOut:
    root, project_dirs = _project_dirs(payload.root_path, payload.mode)
    allowed = set(payload.project_names or [])
    results: list[schemas.BatchIngestProjectImportOut] = []

    # 仓库模式:导入前预检仓库根可访问(掉线→整体 400,不留半截);未配置则回退 uploads 不预检。
    cfg = db.get(models.AppSetting, 1)
    repo_path = (cfg.repository_root_path if cfg else "") or ""
    if repo_path and not Path(repo_path).is_dir():
        raise HTTPException(400, f"仓库不可访问,请检查仓库文件夹是否存在:{repo_path}")

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
                stored, storage_root = _store_file(db, project, path)
                pr = parsing.parse_file(stored.abs_path)
                pf = models.ProjectFile(
                    project_id=project.id,
                    filename=stored.filename,
                    stored_path=stored.stored_path,
                    storage_root=storage_root,
                    file_type=stored.filename.rsplit(".", 1)[-1].lower()
                    if "." in stored.filename
                    else "",
                    size=stored.size,
                    parse_status=pr.status,
                    parse_error=pr.error,
                    content_text=pr.text,
                    content_chunks_json=safe_json.dumps_safe(pr.chunks) if pr.chunks else "",
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


@router.post("/repository/organize")
def organize_to_repository(db: Session = Depends(get_db)) -> dict:
    """把所有项目【已落在内部 uploads 的现有文件】整理进已配置的仓库 {仓库}/{项目名}/。

    解决「配置仓库前上传的文件不会自动进仓库」:配置只影响以后的上传,此端点补做存量迁移。
    幂等可重复点;未配置仓库/仓库不可访问 → 400。
    """
    cfg = db.get(models.AppSetting, 1)
    repo_path = (cfg.repository_root_path if cfg else "") or ""
    if not repo_path:
        raise HTTPException(400, "未配置仓库,请先在设置中配置受管资料库(仓库)")
    repo_root = Path(repo_path)
    if not repo_root.is_dir():
        raise HTTPException(400, f"仓库不可访问,请检查仓库文件夹是否存在:{repo_path}")

    total = {"projects_touched": 0, "moved": 0, "skipped": 0, "missing": 0, "failed": 0}
    for project in db.query(models.Project).all():
        r = _migrate_project_to_repo(db, project, repo_root)
        if r["moved"] or r["failed"]:
            total["projects_touched"] += 1
        total["moved"] += r["moved"]
        total["skipped"] += r["skipped"]
        total["missing"] += r["missing"]
        total["failed"] += r["failed"]
    total["repository"] = str(repo_root)
    return total


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
    project = _project_or_404(db, project_id)
    if not parsing.is_supported(file.filename or ""):
        raise HTTPException(400, "仅支持 txt/md/pdf/docx/pptx/xlsx/png/jpg/jpeg")

    data = await file.read()

    # 单文件上传与批量接入一致:配置仓库则落仓库 {仓库}/{项目名}/,否则回退 {uploads}/{pid}/。
    base, subdir, storage_root = _managed_layout(db, project)
    if storage_root and not base.is_dir():
        raise HTTPException(400, f"仓库不可访问,请检查仓库文件夹是否存在:{base}")
    stored = uploads.write_into_root(base, subdir, file.filename or "untitled", data)
    # 同步解析（文件通常不大）
    pr = parsing.parse_file(stored.abs_path)

    pf = models.ProjectFile(
        project_id=project_id,
        filename=stored.filename,
        stored_path=stored.stored_path,
        storage_root=storage_root,
        file_type=stored.filename.rsplit(".", 1)[-1].lower() if "." in stored.filename else "",
        size=stored.size,
        parse_status=pr.status,
        parse_error=pr.error,
        content_text=pr.text,
        content_chunks_json=safe_json.dumps_safe(pr.chunks) if pr.chunks else "",
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


@router.get("/{project_id}/image")
def get_project_image(project_id: int, path: str, db: Session = Depends(get_db)):
    """按 stored_path 读项目内图片(供生图成果卡显示)。走 validate_path,只读受管根内的图。"""
    _project_or_404(db, project_id)
    # 据该文件行取 storage_root(仓库/回退),否则仓库内的图会被当 uploads 找而 404(迁移后必踩)
    pf = (
        db.query(models.ProjectFile)
        .filter(models.ProjectFile.project_id == project_id, models.ProjectFile.stored_path == path)
        .first()
    )
    storage_root = (pf.storage_root if pf else "") or ""
    try:
        abs_path = uploads.abs_of(path, storage_root)  # validate_path 兜底:越界/不存在抛错
    except Exception:  # noqa: BLE001
        raise HTTPException(404, "图片不存在")
    if not abs_path.is_file():
        raise HTTPException(404, "图片不存在")
    ext = abs_path.suffix.lower().lstrip(".")
    if ext not in {"png", "jpg", "jpeg", "webp", "gif"}:
        raise HTTPException(400, "非图片文件")
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(ext, f"image/{ext}")
    from fastapi.responses import FileResponse
    return FileResponse(str(abs_path), media_type=mime)


@router.delete("/{project_id}/files/{file_id}")
def delete_file(project_id: int, file_id: int, db: Session = Depends(get_db)):
    """软删：移到 _trash + manifest，DB 标 trashed。永不硬删。"""
    f = _file_or_404(db, project_id, file_id)
    res = uploads.soft_delete(f.stored_path, f.storage_root)
    if not res.get("ok"):
        raise HTTPException(400, res.get("error", "删除失败"))
    f.status = "trashed"
    db.commit()
    # 时间戳供 restore 用
    return {"ok": True, "file_id": file_id, "trash_timestamp": res["trash"].replace("\\", "/").rsplit("/", 1)[-1]}


@router.post("/{project_id}/files/{file_id}/restore", response_model=schemas.ProjectFileDetailOut)
def restore_file(project_id: int, file_id: int, timestamp: str, db: Session = Depends(get_db)):
    f = _file_or_404(db, project_id, file_id)
    res = uploads.restore(timestamp, f.storage_root, stored_path=f.stored_path)
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


# ── 图片资产层：从文件抽图（PPT/PDF/Word 嵌入图 + 直接上传图）成「一等资产」 ──
_IMG_EXTS = ("png", "jpg", "jpeg", "gif", "bmp", "webp")


def _assets_dir(pid: int):
    d = uploads.UPLOADS_ROOT / str(pid) / "_assets"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _extract_and_store_assets(db: Session, project: models.Project, pf: models.ProjectFile) -> int:
    """抽图 + 落 uploads/{pid}/_assets/ + 落库 FileAsset。幂等:该源文件已抽过则跳过。返回新建数。"""
    has = (
        db.query(models.FileAsset)
        .filter(models.FileAsset.source_file_id == pf.id, models.FileAsset.status == "active")
        .first()
    )
    if has is not None:
        return 0
    pid = int(project.id)
    ext = (pf.file_type or "").lower()
    adir = _assets_dir(pid)

    def _save(name: str, data: bytes) -> str:
        (adir / name).write_bytes(data)
        return f"{pid}/_assets/{name}"

    def _add(data: bytes, *, a_ext: str, w: int, h: int, name: str,
             page_no: int = 0, slide_no: int = 0, shape_index: int = 0, caption: str = "") -> None:
        sp = _save(name, data)
        thumb = image_assets.make_thumb(data)
        tp = _save("thumb_" + name + ".jpg", thumb) if thumb else ""
        db.add(models.FileAsset(
            project_id=pid, source_file_id=int(pf.id), asset_type="image",
            stored_path=sp, thumb_path=tp, ext=a_ext, page_no=page_no, slide_no=slide_no,
            shape_index=shape_index, caption=caption, width=w, height=h,
        ))

    created = 0
    if ext in _IMG_EXTS:
        # 直接上传的图：文件本身就是资产（复制进 _assets，serve 统一走 uploads 根）
        try:
            data = uploads.abs_of(pf.stored_path, pf.storage_root).read_bytes()
        except Exception:  # noqa: BLE001
            return 0
        w, h = image_assets._dims(data)
        _add(data, a_ext=ext, w=w, h=h, name=f"f{pf.id}_orig.{ext}", caption=pf.filename)
        created = 1
    else:
        try:
            src = uploads.abs_of(pf.stored_path, pf.storage_root)
        except Exception:  # noqa: BLE001
            return 0
        for i, a in enumerate(image_assets.extract(src, "." + ext)):
            _add(a.data, a_ext=a.ext, w=a.width, h=a.height,
                 name=f"f{pf.id}_{a.slide_no}_{a.page_no}_{i}.{a.ext}",
                 page_no=a.page_no, slide_no=a.slide_no, shape_index=a.shape_index, caption=a.caption)
            created += 1
    if created:
        db.commit()
    return created


def _asset_or_404(db: Session, project_id: int, asset_id: int) -> models.FileAsset:
    a = db.get(models.FileAsset, asset_id)
    if a is None or a.project_id != project_id or a.status != "active":
        raise HTTPException(404, "资产不存在")
    return a


@router.post("/{project_id}/files/{file_id}/extract-assets")
def extract_file_assets(project_id: int, file_id: int, db: Session = Depends(get_db)) -> dict:
    """从某文件抽图为资产(幂等)。前端上传后异步触发,不阻塞上传。"""
    project = _project_or_404(db, project_id)
    pf = _file_or_404(db, project_id, file_id)
    n = _extract_and_store_assets(db, project, pf)
    total = (
        db.query(models.FileAsset)
        .filter(models.FileAsset.project_id == project_id, models.FileAsset.status == "active")
        .count()
    )
    return {"extracted": n, "project_total": total}


@router.get("/{project_id}/assets")
def list_assets(project_id: int, db: Session = Depends(get_db)) -> dict:
    rows = (
        db.query(models.FileAsset)
        .filter(models.FileAsset.project_id == project_id, models.FileAsset.status == "active")
        .order_by(models.FileAsset.id.desc())
        .all()
    )
    items = [
        {
            "id": r.id, "source_file_id": r.source_file_id, "ext": r.ext,
            "asset_type": r.asset_type, "status": r.status,
            "page_no": r.page_no, "slide_no": r.slide_no, "shape_index": r.shape_index,
            "caption": r.caption, "width": r.width, "height": r.height,
        }
        for r in rows
    ]
    return {"items": items, "total": len(items)}


# 资产分类取值:render(AI效果图)/reference(参考)/plan(平面图纸)/model(白模体块)/
# material(材质)/logo(logo小图)/extracted(文档抽取)/image(未分类)。
_ASSET_TYPES = {"render", "reference", "plan", "model", "material", "logo", "extracted", "image"}


@router.patch("/{project_id}/assets/{asset_id}")
def update_asset(
    project_id: int,
    asset_id: int,
    asset_type: str = Body("", embed=True),
    status: str = Body("", embed=True),
    db: Session = Depends(get_db),
) -> dict:
    """改分类(asset_type)或软移除/恢复(status)。软移除复用文件软删的 'trashed' 语义,可恢复;
    只改资产登记,绝不删除 _assets 里的图或源文件。"""
    a = db.get(models.FileAsset, asset_id)  # 不走 _asset_or_404:它拒 trashed,会挡住恢复
    if a is None or a.project_id != project_id:
        raise HTTPException(404, "资产不存在")
    if asset_type:
        if asset_type not in _ASSET_TYPES:
            raise HTTPException(400, f"未知分类:{asset_type}")
        a.asset_type = asset_type
    if status:
        if status not in ("active", "trashed"):
            raise HTTPException(400, "状态非法(只允许 active/trashed)")
        a.status = status
    db.commit()
    db.refresh(a)
    return {"id": a.id, "asset_type": a.asset_type, "status": a.status}


def _serve_asset(rel_path: str):
    from fastapi.responses import FileResponse

    try:
        abs_path = uploads.abs_of(rel_path)  # 资产恒在 uploads 根下 _assets/
    except Exception:  # noqa: BLE001
        raise HTTPException(404, "资产文件不存在")
    if not abs_path.is_file():
        raise HTTPException(404, "资产文件不存在")
    ext = abs_path.suffix.lower().lstrip(".")
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(ext, f"image/{ext}")
    return FileResponse(str(abs_path), media_type=mime)


@router.get("/{project_id}/assets/{asset_id}/thumb")
def asset_thumb(project_id: int, asset_id: int, db: Session = Depends(get_db)):
    a = _asset_or_404(db, project_id, asset_id)
    return _serve_asset(a.thumb_path or a.stored_path)


@router.get("/{project_id}/assets/{asset_id}/image")
def asset_image(project_id: int, asset_id: int, db: Session = Depends(get_db)):
    a = _asset_or_404(db, project_id, asset_id)
    return _serve_asset(a.stored_path)
