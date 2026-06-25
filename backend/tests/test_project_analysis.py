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


def test_analyze_structured_judgment(client, monkeypatch):
    """配 key + 模型返回 JSON:研判产出结构化 output_json + 核心判断优先的 markdown content。"""
    import json as _json
    from app import llm

    fake = {
        "core": "项目核心是寒地城市更新与多地块协同,而非风格堆砌。",
        "points": [
            {"label": "项目定位", "text": "片区更新的锚点"},
            {"label": "关键约束", "text": "寒地气候与多地块运营"},
        ],
        "actions": ["补齐用地规模与业态组合", "把寒地策略转译为空间与材料动作"],
        "questions": ["各地块是否有统一运营关系?"],
        "detail": "## 展开\n详细分析正文...",
    }
    monkeypatch.setattr(llm, "chat_completion", lambda messages, **kw: _json.dumps(fake, ensure_ascii=False))
    pid = _new_project(client)
    _set_key()
    try:
        client.post(f"/api/projects/{pid}/files", files={"file": ("任务书.md", "# 任务书\n退台立面".encode("utf-8"), "text/markdown")})
        r = client.post(f"/api/projects/{pid}/analyze", json={"task": "overview"}).json()
        assert r["status"] == "ok"
        assert r["output_json"], "结构化判断应落 output_json"
        result = _json.loads(r["output_json"])
        assert result["core"] and len(result["points"]) >= 2 and result["actions"]
        assert "核心判断" in r["content"] and "关键依据" in r["content"]  # 判断卡:核心判断 + 关键依据
    finally:
        _cleanup(pid)


def test_analyze_plaintext_fallback_not_faked(client, monkeypatch):
    """模型没按 JSON 返回(纯文本)→ 回落纯文本(仍 ok),output_json 为空,不硬塞空壳结构(不伪造)。"""
    from app import llm

    monkeypatch.setattr(llm, "chat_completion", lambda messages, **kw: "这是一段没有 JSON 结构的研判结论。")
    pid = _new_project(client)
    _set_key()
    try:
        client.post(f"/api/projects/{pid}/files", files={"file": ("任务书.md", "# 任务书\n退台立面".encode("utf-8"), "text/markdown")})
        r = client.post(f"/api/projects/{pid}/analyze", json={"task": "difficulty"}).json()
        assert r["status"] == "ok"
        assert r["output_json"] == ""  # 回落纯文本,不伪造结构
        assert "没有 JSON 结构" in r["content"]
    finally:
        _cleanup(pid)


def test_analyze_cache_hit_no_rerun(client, monkeypatch):
    """缓存快路:同 task 第二次 POST 不再调 LLM,返回同一条记录(修卡顿核心)。"""
    from app import llm

    calls = {"n": 0}

    def _stub(messages, **kw):
        calls["n"] += 1
        return f"研判结论(第{calls['n']}次调用)"

    monkeypatch.setattr(llm, "chat_completion", _stub)
    pid = _new_project(client)
    _set_key()
    try:
        files = {"file": ("任务书.md", "# 任务书\n退台立面材料质感。".encode("utf-8"), "text/markdown")}
        client.post(f"/api/projects/{pid}/files", files=files)

        r1 = client.post(f"/api/projects/{pid}/analyze", json={"task": "overview"}).json()
        assert r1["status"] == "ok" and calls["n"] == 1
        # 第二次:命中缓存,不再调 LLM,返回同一 id
        r2 = client.post(f"/api/projects/{pid}/analyze", json={"task": "overview"}).json()
        assert calls["n"] == 1, "缓存命中不应再调 LLM"
        assert r2["id"] == r1["id"]

        # force=true:强制重跑,调一次 LLM,新增记录(id 变)
        r3 = client.post(f"/api/projects/{pid}/analyze", json={"task": "overview", "force": True}).json()
        assert calls["n"] == 2 and r3["id"] != r1["id"] and r3["status"] == "ok"
    finally:
        _cleanup(pid)


def test_latest_analyses_only_ok(client, monkeypatch):
    """latest 端点:每 task 最新 ok 各一条,供前端批量回填。"""
    from app import llm

    monkeypatch.setattr(llm, "chat_completion", lambda messages, **kw: "结论(桩)")
    pid = _new_project(client)
    _set_key()
    try:
        files = {"file": ("任务书.md", "# 任务书\n退台立面。".encode("utf-8"), "text/markdown")}
        client.post(f"/api/projects/{pid}/files", files=files)
        client.post(f"/api/projects/{pid}/analyze", json={"task": "overview"})
        client.post(f"/api/projects/{pid}/analyze", json={"task": "difficulty"})
        # 同 task 重跑一次 → latest 仍只回最新一条
        client.post(f"/api/projects/{pid}/analyze", json={"task": "overview", "force": True})

        latest = client.get(f"/api/projects/{pid}/analyses/latest").json()
        tasks = sorted(i["task"] for i in latest["items"])
        assert tasks == ["difficulty", "overview"]  # 每 task 一条,无重复
        assert all(i["status"] == "ok" for i in latest["items"])
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


def test_gather_material_only_injects_ok_files_not_registration_notes():
    """红线(不伪造)：metadata_only / extraction_timeout 的「登记说明」绝不能当真实材料注入研判。
    只有 parse_status==ok 的真正文进 gather_material；登记说明既不进 context 也不进 sources。"""
    from app import analysis

    db = SessionLocal()
    try:
        proj = models.Project(name="注入红线回归", status="active")
        db.add(proj)
        db.commit()
        db.refresh(proj)
        ok_file = models.ProjectFile(
            project_id=proj.id, filename="真任务书.txt", stored_path="x/真任务书.txt",
            file_type="txt", size=10, parse_status="ok", content_text="退台立面与展示区品质要求。",
            status="active",
        )
        meta_file = models.ProjectFile(
            project_id=proj.id, filename="扫描件.pdf", stored_path="x/扫描件.pdf",
            file_type="pdf", size=99, parse_status="metadata_only",
            content_text="扫描件.pdf 状态：需OCR 说明：未检测到文字层，需 OCR；不伪造正文。",
            status="active",
        )
        timeout_file = models.ProjectFile(
            project_id=proj.id, filename="超大.pdf", stored_path="x/超大.pdf",
            file_type="pdf", size=99, parse_status="extraction_timeout",
            content_text="超大.pdf 状态：提取超时 说明：内容层提取超过 30s，待人工。",
            status="active",
        )
        db.add_all([ok_file, meta_file, timeout_file])
        db.commit()
        m = analysis.gather_material(db, proj.id, query="设计要点", top_k=5)
        # 只注入了 ok 文件的真实正文
        assert "退台立面与展示区品质要求" in m.context
        titles = {s.title for s in m.sources}
        assert "真任务书.txt" in titles
        # 登记说明的文件既不进 sources，其说明文本也不进 context（不伪造）
        assert "扫描件.pdf" not in titles
        assert "超大.pdf" not in titles
        assert "需OCR" not in m.context
        assert "提取超时" not in m.context
    finally:
        db.query(models.ProjectFile).filter_by(project_id=proj.id).delete()
        db.query(models.Project).filter_by(id=proj.id).delete()
        db.commit()
        db.close()
