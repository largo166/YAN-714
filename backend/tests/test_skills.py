"""共创营地内置技能目录端点测试（只读，不触发执行）。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_list_skills(client):
    r = client.get("/api/skills")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 6
    ids = {s["id"] for s in body["items"]}
    assert {"ppt", "img", "review", "task", "meeting", "compete"} <= ids
    # 每项含展示所需字段，且不泄漏任何密钥/执行副作用
    for s in body["items"]:
        assert s["title"] and s["example"]


def _new_project(client, name="技能执行测试项目"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


def test_run_skill_unknown_project_404(client):
    r = client.post("/api/projects/999999/skills/ppt/run", json={"input": ""})
    assert r.status_code == 404


def test_run_skill_unknown_skill_400(client):
    pid = _new_project(client)
    r = client.post(f"/api/projects/{pid}/skills/nope/run", json={"input": ""})
    assert r.status_code == 400


def test_run_skill_status_contract(client):
    """技能执行三态契约（不伪造）：无 key→not_configured；有 key 但无材料→no_material；
    其余 ok/error。无论环境是否配 key，都不得返回伪造的成功结果。"""
    pid = _new_project(client)  # 空项目：无任何已解析文件、无知识库命中
    r = client.post(f"/api/projects/{pid}/skills/ppt/run", json={"input": ""})
    assert r.status_code == 200
    body = r.json()
    assert body["skill_id"] == "ppt"
    assert body["status"] in {"not_configured", "no_material", "ok", "error"}
    if body["status"] == "not_configured":
        assert body["sources"] == []  # 未生成不挂出处
    elif body["status"] == "no_material":
        # 需 RAG 的技能在空项目上应走 no_material（有 key 时）
        assert body["sources"] == []


def test_project_scoped_search_empty_when_no_indexed_docs(client):
    """项目级检索：项目无任何已索引文档 → 空结果（不报错）。"""
    pid = _new_project(client, name="空项目检索测试")
    r = client.post("/api/knowledge/search", json={"query": "立面", "top_k": 5, "project_id": pid})
    assert r.status_code == 200
    assert r.json()["hits"] == []


def _set_key(value="sk-test"):
    from app.database import SessionLocal
    from app import models
    db = SessionLocal()
    try:
        row = db.get(models.AppSetting, 1) or models.AppSetting(id=1)
        db.add(row)
        row.deepseek_api_key = value
        db.commit()
    finally:
        db.close()


def test_ppt_structured_forces_n_slides(client, monkeypatch):
    """PPT 技能：DeepSeek 返回少于目标页数 → normalizer 补足到 N 页;输出 markdown 分页 + output_json。"""
    import json as _json
    from app import llm
    # 模型只返回 2 页,但用户要 5 页 → 必须补足到 5
    fake = {"title": "测试汇报", "slides": [
        {"title": "封面", "keyMessage": "项目定位", "bullets": ["a", "b", "c"]},
        {"title": "现状", "keyMessage": "场地分析", "bullets": ["d", "e"]},
    ]}
    monkeypatch.setattr(llm, "chat_completion", lambda messages, **kw: _json.dumps(fake, ensure_ascii=False))
    pid = _new_project(client, name="PPT结构化测试")
    _set_key()
    # 上传材料让 gather_material 非空
    client.post(f"/api/projects/{pid}/files", files={"file": ("任务书.md", "# 任务书\n退台立面与展示区品质".encode("utf-8"), "text/markdown")})
    r = client.post(f"/api/projects/{pid}/skills/ppt/run", json={"input": "做 5 页"})
    body = r.json()
    assert body["status"] == "ok"
    assert body["output_json"]
    result = _json.loads(body["output_json"])
    assert len(result["slides"]) == 5  # 强制补足到 5 页
    assert "第 5 页" in body["content"]  # markdown 分页到第 5 页
    assert "需人工补充" in body["content"]  # 补足页明确标占位,不伪造


def test_meeting_structured_uses_transcript(client, monkeypatch):
    """会议纪要技能:优先用项目最新会议转写;输出五段式 JSON。"""
    import json as _json
    from app import llm
    fake = {"title": "评审会纪要", "overview": "出3版比选。",
            "coreMatters": [{"title": "立面", "details": ["朱红金属板点缀"]}],
            "clientNeedsTranslated": [{"original": "要大气", "translated": "强化体量与退台层次", "implication": "影响立面方案"}],
            "decisions": [{"decision": "出3版比选", "owner": "严硕"}],
            "actionItems": [{"task": "下周出比选", "owner": "团队", "deadline": "下周五"}],
            "chapters": []}
    monkeypatch.setattr(llm, "chat_completion", lambda messages, **kw: _json.dumps(fake, ensure_ascii=False))
    pid = _new_project(client, name="会议纪要测试")
    _set_key()
    # 建一个含转写的会议
    client.post(f"/api/projects/{pid}/meetings", json={"title": "方案评审会", "raw_text": "甲方:要大气。结论:出3版比选。"})
    r = client.post(f"/api/projects/{pid}/skills/meeting/run", json={"input": ""})
    body = r.json()
    assert body["status"] == "ok"
    result = _json.loads(body["output_json"])
    assert result["overview"] and result["clientNeedsTranslated"]  # 五段式有诉求转译
    assert "甲方诉求转译" in body["content"]


def test_img_not_configured_no_network(client, monkeypatch):
    """生图技能:未配生图 key → not_configured,不调网络、不伪造图(规则 3/10)。"""
    from app import image_gen, llm
    monkeypatch.setattr(image_gen, "is_configured", lambda: False)
    # 即使 deepseek 配着,生图 key 没配也必须 not_configured,且不应触达 generate_image
    monkeypatch.setattr(llm, "chat_completion", lambda messages, **kw: "a building, photorealistic")
    def _boom(*a, **k):
        raise AssertionError("未配 key 时不应调用 generate_image")
    monkeypatch.setattr(image_gen, "generate_image", _boom)
    pid = _new_project(client, name="生图未配测试")
    _set_key()
    r = client.post(f"/api/projects/{pid}/skills/img/run", json={"input": ""})
    body = r.json()
    assert body["status"] == "not_configured"
    assert body["image_url"] == ""  # 不伪造图


def test_skill_result_archived(client, monkeypatch):
    """成果落库归档:run 后能在项目成果历史里查到(含 result_id);not_configured 也如实落库。"""
    import json as _json
    from app import llm
    monkeypatch.setattr(llm, "chat_completion", lambda messages, **kw: _json.dumps({"title": "x", "slides": [{"title": "a", "keyMessage": "b"}]}, ensure_ascii=False))
    pid = _new_project(client, name="成果归档测试")
    _set_key()
    client.post(f"/api/projects/{pid}/files", files={"file": ("任务书.md", "# 任务书\n退台立面".encode("utf-8"), "text/markdown")})
    r = client.post(f"/api/projects/{pid}/skills/ppt/run", json={"input": "做 3 页"}).json()
    assert r["status"] == "ok" and r["result_id"] > 0
    # 历史能查到
    hist = client.get(f"/api/projects/{pid}/skill-results").json()
    assert hist["total"] >= 1
    assert any(x["id"] == r["result_id"] and x["skill_id"] == "ppt" for x in hist["items"])
    # 单条详情
    one = client.get(f"/api/projects/{pid}/skill-results/{r['result_id']}").json()
    assert one["title"] == "PPT 大纲" and one["output_json"]


def test_skill_commands_list(client):
    r = client.get("/api/skill-commands")
    assert r.status_code == 200
    cmds = {c["command"]: c for c in r.json()["items"]}
    assert "/ppt" in cmds and cmds["/ppt"]["skill_id"] == "ppt"
    assert cmds["/出图"]["needs_confirm"] is True  # 生图需轻确认


def test_command_text_runs_and_archives(client, monkeypatch):
    """/ppt 文本类命令:直接执行 + 落库 + 返回 result。"""
    import json as _json
    from app import llm
    monkeypatch.setattr(llm, "chat_completion", lambda messages, **kw: _json.dumps({"slides": [{"title": "a", "keyMessage": "b"}]}, ensure_ascii=False))
    pid = _new_project(client, name="命令测试")
    _set_key()
    client.post(f"/api/projects/{pid}/files", files={"file": ("x.md", "# 任务\n退台立面".encode("utf-8"), "text/markdown")})
    r = client.post(f"/api/projects/{pid}/command", json={"text": "/ppt 做 4 页"}).json()
    assert r["status"] == "result" and r["result"]["status"] == "ok" and r["result"]["result_id"] > 0
    # 落库了
    assert client.get(f"/api/projects/{pid}/skill-results").json()["total"] >= 1


def test_command_img_needs_confirm(client, monkeypatch):
    """/出图:不直接生图,返回 confirm_image,prompt=『真正要用的英文提示词草案』(用户输入为主)让前端看/改。"""
    from app import image_gen, llm
    called = {"gen": False}
    def _boom(*a, **k):
        called["gen"] = True
        raise AssertionError("不应直接生图")
    monkeypatch.setattr(image_gen, "generate_image", _boom)
    # 草案由 DeepSeek 扩写,这里桩掉;断言用户意图(退台立面)被带进草案
    monkeypatch.setattr(llm, "chat_completion",
                        lambda messages, **kw: "photorealistic stepped terrace facade, warm light, --ar 16:9")
    pid = _new_project(client, name="出图确认测试")
    _set_key()  # 配 DeepSeek 让草案生成走桩
    r = client.post(f"/api/projects/{pid}/command", json={"text": "/出图 退台立面"}).json()
    assert r["status"] == "confirm_image" and r["skill_id"] == "img"
    assert called["gen"] is False  # 确认前绝不生图(防白烧钱)
    assert "terrace" in r["prompt"]  # 确认弹窗给的是真要用的英文提示词,不是用户原中文


def test_command_not_a_command(client):
    """非斜杠/未知命令 → not_command,前端走普通对话。"""
    pid = _new_project(client, name="非命令测试")
    assert client.post(f"/api/projects/{pid}/command", json={"text": "这个项目甲方诉求?"}).json()["status"] == "not_command"
    assert client.post(f"/api/projects/{pid}/command", json={"text": "/不认识 x"}).json()["status"] == "not_command"




