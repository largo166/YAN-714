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
    import fitz

    doc = fitz.open()
    doc.new_page(width=300, height=300)  # 有效 PDF 但无文字层
    pdf_bytes = doc.tobytes()
    doc.close()
    pid = _new_project(client, name="扫描件资料测试项目")
    try:
        files = {"file": ("投标文本汇编.pdf", pdf_bytes, "application/pdf")}
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


def test_project_image_endpoint(client, tmp_path):
    """生图成果卡用的 /image 端点:能按 stored_path 读项目内图片;非图/不存在拒绝。"""
    from app import uploads
    pid = _new_project(client)
    try:
        # 存一张真 png 进项目 uploads
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        stored = uploads.save_upload(pid, "AI生图-test.png", png)
        r = client.get(f"/api/projects/{pid}/image", params={"path": stored.stored_path})
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/png")
        assert r.content == png
        # 不存在 → 404
        assert client.get(f"/api/projects/{pid}/image", params={"path": f"{pid}/无此图.png"}).status_code == 404
        # 越界路径 → 404(validate_path 兜底)
        assert client.get(f"/api/projects/{pid}/image", params={"path": "../../etc/passwd"}).status_code in (400, 404)
    finally:
        _cleanup_project_dir(pid)

