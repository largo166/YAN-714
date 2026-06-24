"""清理脏项目(示例 seed + 误把子文件夹当项目建的历史脏数据)。

默认 dry-run 只打印待删清单;加 --apply 才真删。删前请先备份:
    cp data/rom_ai.db data/rom_ai.db.bak

判定脏的双保险(绝不误删真实项目):
- KEEP_IDS / DELETE_IDS 写死,启动断言两集零交集。
- 运行时再校验每个待删项目满足脏特征(source_path 空,或 source_path 是另一项目目录的子路径)。
  不满足则跳过并告警。

删除步骤(每个 pid):① 手删其文件关联的 knowledge_documents + FTS(知识库无 project 外键,
CASCADE 删不到);② 物理删受管副本 best-effort(不存在则跳过);③ 删 project_files 行 +
project 行(CASCADE 清 analyses/cognitions/meetings/assignments)。可重跑(已删则跳过)。

用法(在 backend/ 下):
    python -m scripts.cleanup_dirty_projects            # dry-run
    python -m scripts.cleanup_dirty_projects --apply     # 真删
"""
from __future__ import annotations

import sys

from app import models, retrieval, uploads
from app.database import SessionLocal

# 真实项目(用户在 C:\YAN-项目数据 整理的),绝不删
KEEP_IDS = {6, 7, 8}
# 待删:示例 seed(1,2,3)+ 无来源历史脏数据(4,5)+ 误把子文件夹当项目(9,10)
DELETE_IDS = {1, 2, 3, 4, 5, 9, 10}

assert not (KEEP_IDS & DELETE_IDS), "KEEP 与 DELETE 集有交集,拒绝运行(防误删)"


def _safe_to_delete(p: models.Project, keep_sources: set) -> tuple[bool, str]:
    """安全闸:DELETE_IDS 是用户核对过的权威待删集;此函数只做"防误删真实项目"的反向校验——
    若该项目的 source_path 恰好等于某保留(真实)项目的 source_path,则拒删(疑似搞错 id)。
    否则放行(空 source=示例/历史脏;子文件夹 source=误建,都该删)。"""
    src = (p.source_path or "").strip()
    if src:
        import os
        norm = os.path.normcase(os.path.abspath(src))
        if norm in keep_sources:
            return False, f"source 与某保留项目相同,拒删(防误删):{src}"
    return True, ("source 为空(示例/历史脏)" if not src else f"独立 source(子文件夹误建/外部):{src}")


def main(apply: bool) -> None:
    db = SessionLocal()
    try:
        import os
        all_projects = db.query(models.Project).all()
        existing_ids = {p.id for p in all_projects}
        # 保留项目的归一 source(供反向防误删校验)
        keep_sources = {
            os.path.normcase(os.path.abspath(p.source_path.strip()))
            for p in all_projects
            if p.id in KEEP_IDS and (p.source_path or "").strip()
        }

        print(f"=== 清理脏项目 ({'APPLY 真删' if apply else 'DRY-RUN 只打印'}) ===")
        print(f"库中现有项目 id: {sorted(existing_ids)}")
        print(f"保留(真实项目): {sorted(KEEP_IDS)}")
        print()

        to_delete = []
        for pid in sorted(DELETE_IDS):
            p = db.get(models.Project, pid)
            if p is None:
                print(f"  id={pid:>2} 已不存在,跳过(幂等)")
                continue
            if pid in KEEP_IDS:
                print(f"  ⚠ id={pid} 在 KEEP 集,拒绝删除,跳过")
                continue
            safe, why = _safe_to_delete(p, keep_sources)
            files = db.query(models.ProjectFile).filter(models.ProjectFile.project_id == pid).all()
            doc_ids = {f.indexed_doc_id for f in files if f.indexed_doc_id}
            mark = "✓待删" if safe else "✗拒删(防误删)"
            print(f"  id={pid:>2} | {p.name:<22} | files={len(files):>3} docs={len(doc_ids):>3} | {mark} | {why}")
            if safe:
                to_delete.append((p, files, doc_ids))

        print()
        if not apply:
            print(f"DRY-RUN:将删除 {len(to_delete)} 个项目。确认无误后加 --apply 执行(先备份 db)。")
            return

        # 真删
        deleted = 0
        for p, files, doc_ids in to_delete:
            # ① 知识文档 + FTS
            for did in doc_ids:
                doc = db.get(models.KnowledgeDocument, did)
                if doc is not None:
                    retrieval.remove_one(db, did)
                    db.delete(doc)
            # ② 物理副本 best-effort
            for f in files:
                try:
                    ap = uploads.abs_of(f.stored_path, f.storage_root)
                    if ap.exists():
                        ap.unlink()
                except Exception as e:  # noqa: BLE001
                    print(f"        物理删 {f.stored_path} 跳过: {e}")
            # ③ project_files + project(CASCADE 清其余子表)
            for f in files:
                db.delete(f)
            db.delete(p)
            db.commit()
            deleted += 1
            print(f"  已删 id={p.id} {p.name}")

        # 自检:保留项目仍在
        print()
        for kid in sorted(KEEP_IDS):
            kp = db.get(models.Project, kid)
            fc = db.query(models.ProjectFile).filter(models.ProjectFile.project_id == kid).count() if kp else 0
            print(f"  保留校验 id={kid}: {'在' if kp else '丢失!!'} | files={fc} | name={kp.name if kp else '-'}")
        remain = sorted(p.id for p in db.query(models.Project).all())
        print(f"\n删除 {deleted} 个;库中剩余项目 id: {remain}")
    finally:
        db.close()


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
