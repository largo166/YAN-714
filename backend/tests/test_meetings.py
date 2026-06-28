"""会议纪要测试：贴文本建会议 / 五段式三态 / 内外双版分离 / 词典命中 / 导出 MD。

不外呼 DeepSeek/ASR：monkeypatch llm.chat_completion。
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import models
from app.database import SessionLocal


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clear_key():
    db = SessionLocal()
    try:
        row = db.get(models.AppSetting, 1) or models.AppSetting(id=1)
        if row.id is None:
            db.add(row)
        row.deepseek_api_key = ""
        db.commit()
    finally:
        db.close()


def _set_key(v="sk-test"):
    db = SessionLocal()
    try:
        db.get(models.AppSetting, 1).deepseek_api_key = v
        db.commit()
    finally:
        db.close()


def _new_project(client):
    return client.post("/api/projects", json={"name": "会议测试项目"}).json()["id"]


def test_create_meeting_text(client):
    pid = _new_project(client)
    r = client.post(f"/api/projects/{pid}/meetings", json={"title": "评审会", "raw_text": "甲方:要高端大气\n我方:明白"})
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["transcript_source"] == "text"
    assert len(b["segments"]) == 2


def test_minute_not_configured(client):
    pid = _new_project(client)
    mid = client.post(f"/api/projects/{pid}/meetings", json={"title": "x", "raw_text": "甲方:随便弄弄"}).json()["id"]
    r = client.post(f"/api/projects/{pid}/meetings/{mid}/minute")
    assert r.status_code == 200
    assert r.json()["gen_status"] == "not_configured"


def test_minute_no_material(client):
    pid = _new_project(client)
    mid = client.post(f"/api/projects/{pid}/meetings", json={"title": "空", "raw_text": ""}).json()["id"]
    _set_key()
    r = client.post(f"/api/projects/{pid}/meetings/{mid}/minute")
    assert r.status_code == 200
    assert r.json()["gen_status"] == "no_material"  # 空转写不调模型


def test_minute_ok_dual_version_and_export(client, monkeypatch):
    from app import llm

    fake = json.dumps({
        "summary": ["甲方对立面提出更高要求"],
        "core_items": ["立面材料升级"],
        "demand_internal": [{"statement": "甲方其实担心造价但要面子", "quote": "要高端大气", "time": "00:01"}],
        "demand_external": [{"statement": "甲方期望立面更具品质感", "quote": "要高端大气", "time": "00:01"}],
        "decisions": ["下周提交材料样板"],
        "todos": [{"text": "准备3个立面方案", "owner": "张工", "due": "周五"}],
    })
    monkeypatch.setattr(llm, "chat_completion", lambda messages, **kw: fake)

    pid = _new_project(client)
    _set_key()
    mid = client.post(f"/api/projects/{pid}/meetings", json={"title": "立面评审", "raw_text": "甲方:要高端大气\n我方:好的"}).json()["id"]
    r = client.post(f"/api/projects/{pid}/meetings/{mid}/minute")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["gen_status"] == "ok"
    assert b["review_status"] == "draft"
    assert b["reflowed"] is False
    # 内外双版分离且不同
    assert b["demand_internal"][0]["statement"] != b["demand_external"][0]["statement"]
    # 锚定原话+时间点
    assert b["demand_external"][0]["quote"] == "要高端大气"
    assert b["demand_external"][0]["time"] == "00:01"
    aid = b["id"]

    # 确认（draft→confirmed）
    cf = client.post(f"/api/projects/{pid}/meetings/{mid}/minute/{aid}/confirm")
    assert cf.json()["review_status"] == "confirmed"

    # 对外 Word 导出不含对内研判（docx 是 zip，需解压查 document.xml）
    import io, zipfile

    def docx_text(content: bytes) -> str:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            return z.read("word/document.xml").decode("utf-8", errors="replace")

    ext = client.get(f"/api/projects/{pid}/meetings/{mid}/minute/{aid}/export.docx")
    assert ext.status_code == 200
    assert ext.headers["content-type"].startswith("application/vnd.openxmlformats")
    ext_text = docx_text(ext.content)
    assert "甲方期望立面更具品质感" in ext_text
    assert "担心造价但要面子" not in ext_text
    # 对内 Word 含研判
    intr = client.get(f"/api/projects/{pid}/meetings/{mid}/minute/{aid}/export.docx", params={"variant": "internal"})
    assert intr.status_code == 200
    assert "担心造价但要面子" in docx_text(intr.content)
    # 打印 HTML（对外不含对内研判）
    pr = client.get(f"/api/projects/{pid}/meetings/{mid}/minute/{aid}/print")
    assert pr.status_code == 200 and "window.print()" in pr.text
    assert "担心造价但要面子" not in pr.text


def test_minute_confirm_creates_board_tasks_and_status_flow(client, monkeypatch):
    """P0-A 闭环：确认纪要 → 待办落成看板任务 → 状态流转 todo/doing/done(done_at) → 幂等不重复。

    上面的 test 只验到「确认纪要」即止，没断言任务被创建/能列出/能流转——这条补齐该缺口。
    owner 精确匹配在册成员则关联 member_id，匹配不到只留 owner_name（不伪造成员）。
    成员名用唯一串避免和共享测试库里其他用例的成员撞名（conftest 全程共用一个 SQLite）。
    """
    from app import llm

    fake = json.dumps({
        "summary": ["定稿评审"],
        "core_items": ["立面定稿"],
        "demand_internal": [],
        "demand_external": [],
        "decisions": ["本周出图"],
        "todos": [
            {"text": "出施工图", "owner": "P0A唯一在册张工", "due": "2020-01-01"},  # 在册 + 明确过期日期
            {"text": "对接甲方", "owner": "P0A非成员外部李四", "due": "周五"},        # 不在册 → member_id 应为空
            {"text": "", "owner": "无名", "due": ""},                              # 空 text 应被跳过(不落任务)
        ],
    })
    monkeypatch.setattr(llm, "chat_completion", lambda messages, **kw: fake)

    pid = _new_project(client)
    _set_key()
    # 建一名在册成员用于验证 owner 匹配
    mem = client.post("/api/team/members", json={"name": "P0A唯一在册张工", "role": "建筑师"})
    assert mem.status_code == 201, mem.text
    mem_id = mem.json()["id"]

    mid = client.post(
        f"/api/projects/{pid}/meetings", json={"title": "定稿", "raw_text": "甲方:出图\n我方:好"}
    ).json()["id"]
    minute = client.post(f"/api/projects/{pid}/meetings/{mid}/minute").json()
    assert minute["gen_status"] == "ok"
    minute_id = minute["id"]

    # 确认前看板为空（未确认不落任务）
    assert client.get("/api/team/assignments", params={"project_id": pid}).json()["total"] == 0

    # 确认 → 触发 _todos_to_assignments
    cf = client.post(f"/api/projects/{pid}/meetings/{mid}/minute/{minute_id}/confirm")
    assert cf.json()["review_status"] == "confirmed"

    board = client.get("/api/team/assignments", params={"project_id": pid}).json()
    assert board["total"] == 2  # 空 text 那条被跳过
    by_title = {t["task_title"]: t for t in board["items"]}
    assert set(by_title) == {"出施工图", "对接甲方"}
    # 均初始 todo、来源本纪要
    assert all(t["status"] == "todo" and t["source_minute_id"] == minute_id for t in board["items"])
    # owner 匹配：在册→关联 member_id；非成员→不关联但保留名字（不伪造）
    assert by_title["出施工图"]["member_id"] == mem_id
    assert by_title["出施工图"]["owner_name"] == "P0A唯一在册张工"
    assert by_title["出施工图"]["due"] == "2020-01-01"
    assert by_title["对接甲方"]["member_id"] is None
    assert by_title["对接甲方"]["owner_name"] == "P0A非成员外部李四"

    # 状态流转：todo → doing(done_at 空) → done(done_at 有) → 退回 todo(done_at 清空)
    aid = by_title["出施工图"]["id"]
    r = client.patch(f"/api/team/assignments/{aid}", json={"status": "doing"})
    assert r.status_code == 200 and r.json()["status"] == "doing" and r.json()["done_at"] is None
    r = client.patch(f"/api/team/assignments/{aid}", json={"status": "done"})
    assert r.json()["status"] == "done" and r.json()["done_at"] is not None
    r = client.patch(f"/api/team/assignments/{aid}", json={"status": "todo"})
    assert r.json()["status"] == "todo" and r.json()["done_at"] is None
    # 非法状态拒绝
    assert client.patch(f"/api/team/assignments/{aid}", json={"status": "bogus"}).status_code == 400

    # 幂等：再次确认同一纪要不重复落任务
    client.post(f"/api/projects/{pid}/meetings/{mid}/minute/{minute_id}/confirm")
    assert client.get("/api/team/assignments", params={"project_id": pid}).json()["total"] == 2


def test_create_from_material_unsupported(client):
    """上传不支持格式的材料应 400。"""
    pid = _new_project(client)
    files = {"file": ("a.exe", b"MZ", "application/octet-stream")}
    r = client.post(f"/api/projects/{pid}/meetings/material", data={"title": "材料会"}, files=files)
    assert r.status_code == 400


def test_create_from_material_md(client):
    """上传 md 材料解析为会议记录并创建会议。"""
    pid = _new_project(client)
    files = {"file": ("纪要.md", "# 会议\n甲方:要高端大气\n我方:明白".encode("utf-8"), "text/markdown")}
    r = client.post(f"/api/projects/{pid}/meetings/material", data={"title": "材料会", "attendees": "张三,李四"}, files=files)
    assert r.status_code == 201, r.text
    assert "高端大气" in r.json()["raw_text"]
    assert r.json()["attendees"] == "张三,李四"


def test_slang_translator_4fields():
    from app import slang
    entries = slang.load_entries()
    assert len(entries) >= 30
    e = entries[0]
    assert all(k in e for k in ("term", "meaning", "impact", "action"))
    assert any(x["term"] == "高端大气上档次" for x in entries)
    assert len(slang.query("高端")) >= 1


def test_quick_tencent_not_configured(client, monkeypatch):
    """一键建会：腾讯未配置→400，不伪造。"""
    from app.providers import tencent_meeting as tm
    monkeypatch.setattr(tm, "is_configured", lambda: False)
    pid = _new_project(client)
    r = client.post(f"/api/projects/{pid}/tencent/quick")
    assert r.status_code == 400


def test_quick_tencent_success(client, monkeypatch):
    """一键建会：零输入→provider 成功→落库返回会议号/链接。"""
    from app.providers import tencent_meeting as tm
    monkeypatch.setattr(tm, "is_configured", lambda: True)
    monkeypatch.setattr(tm, "create_meeting", lambda subj, s, e: tm.MeetingResult(
        status="ok", meeting_id="m1", meeting_code="888", join_url="https://meeting.tencent.com/dm/x",
        start_time=s, end_time=e,
    ))
    pid = _new_project(client)
    r = client.post(f"/api/projects/{pid}/tencent/quick")
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["provider"] == "tencent"
    assert b["tencent_meeting_code"] == "888"
    assert b["tencent_join_url"].startswith("https://meeting.tencent.com")
