"""4D 文件域测试：上传→解析→列表→预览→入库→删除(软删)→恢复。

注意：上传落盘到真实 data/uploads/{pid}（我方副本目录）。本测试用 tearDown 清理自己
建的项目目录，杜绝污染（沿用项目测试自清理约定）。
"""
import shutil

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import uploads


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _new_project(client, name="4D文件测试项目"):
    r = client.post("/api/projects", json={"name": name})
    assert r.status_code == 201
    return r.json()["id"]


def _cleanup_project_dir(pid: int):
    d = uploads.UPLOADS_ROOT / str(pid)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)


def test_upload_parse_list_preview(client):
    pid = _new_project(client)
    try:
        # 上传 txt
        files = {"file": ("需求.txt", b"\xe7\x94\xb2\xe6\x96\xb9\xe8\xa6\x81\xe6\xb1\x82\xef\xbc\x9a\xe9\x80\x80\xe5\x8f\xb0\xe7\xab\x8b\xe9\x9d\xa2", "text/plain")}
        r = client.post(f"/api/projects/{pid}/files", files=files)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["parse_status"] == "ok"
        assert "退台立面" in body["content_text"]
        fid = body["id"]

        # 列表
        lst = client.get(f"/api/projects/{pid}/files")
        assert lst.status_code == 200
        assert any(f["id"] == fid for f in lst.json()["items"])

        # 预览（详情带 content_text）
        det = client.get(f"/api/projects/{pid}/files/{fid}")
        assert det.status_code == 200
        assert "退台立面" in det.json()["content_text"]
    finally:
        _cleanup_project_dir(pid)


def test_unsupported_rejected(client):
    pid = _new_project(client)
    try:
        files = {"file": ("evil.exe", b"MZ\x90\x00", "application/octet-stream")}
        r = client.post(f"/api/projects/{pid}/files", files=files)
        assert r.status_code == 400
    finally:
        _cleanup_project_dir(pid)


def test_index_to_knowledge(client):
    pid = _new_project(client)
    try:
        files = {"file": ("方法论.md", "# 立面材料\n退台通过材料质感提升气势".encode("utf-8"), "text/markdown")}
        fid = client.post(f"/api/projects/{pid}/files", files=files).json()["id"]
        r = client.post(f"/api/projects/{pid}/files/{fid}/index")
        assert r.status_code == 200, r.text
        did = r.json()["document_id"]
        assert did > 0
        # 知识库能查到
        sr = client.post("/api/knowledge/search", json={"query": "退台", "top_k": 5})
        assert any(h["document_id"] == did for h in sr.json()["hits"])
        # 幂等：再次入库返回同一文档
        r2 = client.post(f"/api/projects/{pid}/files/{fid}/index")
        assert r2.json()["document_id"] == did
    finally:
        _cleanup_project_dir(pid)


def test_index_fills_metadata(client):
    """入库时规则填充 type/resource(零 LLM);description 留空待 AI 生成。"""
    pid = _new_project(client, name="元数据测试项目")
    try:
        files = {"file": ("项目评审会纪要.txt", "参会人员：严硕。会议结论：出3版比选。".encode("utf-8"), "text/plain")}
        fid = client.post(f"/api/projects/{pid}/files", files=files).json()["id"]
        did = client.post(f"/api/projects/{pid}/files/{fid}/index").json()["document_id"]
        doc = client.get(f"/api/knowledge/documents/{did}").json()
        assert doc["type"] == "会议纪要"
        assert "元数据测试项目" in doc["resource"]
        assert doc["description"] == ""
    finally:
        _cleanup_project_dir(pid)


def test_metadata_only_file_indexes_and_searchable(client):
    """无文字层 PDF(扫描件)→ metadata_only(需OCR),仍能入库且靠文件名/类型被检索到。
    注:触发 metadata_only 的是「真提不出内容」而非文件大小(大小开关已移除)。"""
    from io import BytesIO

    from pypdf import PdfWriter

    buf = BytesIO()
    w = PdfWriter()
    w.add_blank_page(width=300, height=300)  # 有效 PDF 但无文字层
    w.write(buf)
    pid = _new_project(client, name="扫描件资料测试项目")
    try:
        files = {"file": ("投标文本汇编.pdf", buf.getvalue(), "application/pdf")}
        up = client.post(f"/api/projects/{pid}/files", files=files).json()
        assert up["parse_status"] == "metadata_only"  # 真提不出内容,如实登记(不是按大小降级)
        fid = up["id"]
        # 仍能入知识库
        did = client.post(f"/api/projects/{pid}/files/{fid}/index").json()["document_id"]
        assert did > 0
        # 靠文件名检索能命中
        sr = client.post("/api/knowledge/search", json={"query": "投标文本汇编", "top_k": 5})
        assert any(h["document_id"] == did for h in sr.json()["hits"])
    finally:
        _cleanup_project_dir(pid)


def test_index_empty_rejected(client):
    """空文本文件不能入库（不伪造来源）。"""
    pid = _new_project(client)
    try:
        files = {"file": ("空.txt", b"   ", "text/plain")}
        fid = client.post(f"/api/projects/{pid}/files", files=files).json()["id"]
        det = client.get(f"/api/projects/{pid}/files/{fid}").json()
        assert det["parse_status"] == "empty"
        r = client.post(f"/api/projects/{pid}/files/{fid}/index")
        assert r.status_code == 400
    finally:
        _cleanup_project_dir(pid)


def test_soft_delete_and_restore(client):
    pid = _new_project(client)
    try:
        files = {"file": ("临时.txt", "草稿内容".encode("utf-8"), "text/plain")}
        fid = client.post(f"/api/projects/{pid}/files", files=files).json()["id"]

        # 软删
        d = client.delete(f"/api/projects/{pid}/files/{fid}")
        assert d.status_code == 200
        ts = d.json()["trash_timestamp"]
        # 已不在 active 列表
        lst = client.get(f"/api/projects/{pid}/files")
        assert not any(f["id"] == fid for f in lst.json()["items"])
        # 文件进了 _trash（未硬删）
        trash_dir = uploads.UPLOADS_ROOT / str(pid) / uploads.TRASH_DIRNAME / ts
        assert trash_dir.exists()
        assert (trash_dir / "manifest.json").exists()

        # 恢复
        rr = client.post(f"/api/projects/{pid}/files/{fid}/restore", params={"timestamp": ts})
        assert rr.status_code == 200
        assert rr.json()["status"] == "active"
        lst2 = client.get(f"/api/projects/{pid}/files")
        assert any(f["id"] == fid for f in lst2.json()["items"])
    finally:
        _cleanup_project_dir(pid)


def test_batch_ingest_preview_and_import(client, tmp_path):
    root = tmp_path / "YAN-项目数据"
    p1 = root / "石家庄市庄项目" / "项目笔记"
    p2 = root / "石家庄振三街项目" / "原始资料"
    p1.mkdir(parents=True)
    p2.mkdir(parents=True)
    (p1 / "项目复盘.md").write_text("# 复盘\n退台立面策略", encoding="utf-8")
    (p1 / "效果图.png").write_bytes(b"png")
    (p2 / "会议纪要.txt").write_text("甲方要求：展示区节点", encoding="utf-8")

    preview = client.post("/api/projects/batch-ingest/preview", json={"root_path": str(root)})
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["total_projects"] == 2
    assert body["total_supported"] == 3
    assert body["total_unsupported"] == 0

    imported = client.post("/api/projects/batch-ingest/import", json={"root_path": str(root)})
    assert imported.status_code == 200, imported.text
    result = imported.json()
    project_ids = [p["project_id"] for p in result["projects"]]
    try:
        assert result["copied"] == 3
        assert result["indexed"] == 3
        assert result["failed"] == 0

        projects = client.get("/api/projects").json()["items"]
        assert any(p["name"] == "石家庄市庄项目" for p in projects)
        assert any(p["name"] == "石家庄振三街项目" for p in projects)

        search = client.post("/api/knowledge/search", json={"query": "退台立面", "top_k": 5})
        assert any("项目复盘" in hit["title"] for hit in search.json()["hits"])

        again = client.post("/api/projects/batch-ingest/import", json={"root_path": str(root)})
        assert again.status_code == 200
        assert again.json()["copied"] == 0
        assert again.json()["skipped_existing"] == 3
    finally:
        for pid in project_ids:
            _cleanup_project_dir(pid)
