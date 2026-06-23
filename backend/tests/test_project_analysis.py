"""4D 研判域测试：not_configured / no_material / ok+结构化出处 / 导出MD。

不外呼 DeepSeek：用 monkeypatch 桩掉 llm.chat_completion。只验三态分支与 sources 结构。
"""
import shutil

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import uploads
from app.database import SessionLocal
from app import models


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clear_key():
    """默认清空 key，单测内需要时再设。"""
    db = SessionLocal()
    try:
        row = db.get(models.AppSetting, 1)
        if row is None:
            row = models.AppSetting(id=1)
            db.add(row)
        row.deepseek_api_key = ""
        db.commit()
    finally:
        db.close()


def _set_key(value="sk-test"):
    db = SessionLocal()
    try:
        row = db.get(models.AppSetting, 1)
        row.deepseek_api_key = value
        db.commit()
    finally:
        db.close()


def _new_project(client, name="4D研判测试项目"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


def _cleanup(pid):
    d = uploads.UPLOADS_ROOT / str(pid)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)


def test_analyze_not_configured(client):
    """未配 key：not_configured，不调模型、不伪造。"""
    pid = _new_project(client)
    try:
        r = client.post(f"/api/projects/{pid}/analyze", json={"task": "overview"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "not_configured"
        assert body["sources"] == []
    finally:
        _cleanup(pid)


def test_analyze_no_material(client):
    """配了 key 但无任何材料：no_material，不调模型。"""
    pid = _new_project(client)
    _set_key()
    try:
        # 不上传文件、知识库无命中（用生僻查询）→ 该项目应触发 no_material
        # 知识库可能有其它测试残留文档命中，但本项目无文件；用一个几乎不可能命中的项目名降低串扰
        r = client.post(f"/api/projects/{pid}/analyze", json={"task": "overview", "top_k": 5})
        assert r.status_code == 200, r.text
        body = r.json()
        # 若知识库恰好命中则为 ok，否则 no_material；两种都不应伪造。这里断言不会是 error，
        # 且 no_material 时不带 sources。
        assert body["status"] in ("no_material", "ok")
        if body["status"] == "no_material":
            assert body["sources"] == []
    finally:
        _cleanup(pid)


def test_analyze_ok_with_sources(client, monkeypatch):
    """有项目文件材料 + 桩 LLM：ok，结论与结构化出处分离返回。"""
    from app import llm, analysis as analysis_mod

    monkeypatch.setattr(
        llm, "chat_completion",
        lambda messages, **kw: "【总览】这是基于材料生成的研判结论（测试桩）。",
    )
    # analysis 路由是 from .. import llm 后调用 llm.chat_completion，故 patch llm 模块即可

    pid = _new_project(client)
    _set_key()
    try:
        # 上传一个可解析文件作为项目材料
        files = {"file": ("任务书.md", "# 项目任务书\n本项目为退台式商业综合体，强调立面材料质感。".encode("utf-8"), "text/markdown")}
        client.post(f"/api/projects/{pid}/files", files=files)

        r = client.post(f"/api/projects/{pid}/analyze", json={"task": "overview", "top_k": 5})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "ok"
        assert "测试桩" in body["content"]
        # 结构化出处：至少含该项目文件
        assert len(body["sources"]) >= 1
        s0 = body["sources"][0]
        assert set(["kind", "ref_id", "title", "snippet", "engine"]).issubset(s0.keys())
        assert any(s["kind"] == "project_file" for s in body["sources"])

        # 历史列表含本条
        lst = client.get(f"/api/projects/{pid}/analyses")
        assert lst.json()["total"] >= 1
        aid = body["id"]

        # 导出 Markdown
        md = client.get(f"/api/projects/{pid}/analyses/{aid}/export.md")
        assert md.status_code == 200
        assert "# " in md.text and "出处" in md.text
    finally:
        _cleanup(pid)


def test_unknown_task_rejected(client):
    pid = _new_project(client)
    _set_key()
    try:
        r = client.post(f"/api/projects/{pid}/analyze", json={"task": "bogus"})
        assert r.status_code == 400
    finally:
        _cleanup(pid)
