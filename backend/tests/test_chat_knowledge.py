"""4B 测试：AI 对话（not_configured 分支）+ 知识库增删查搜 + use_knowledge。

未配 DeepSeek key 时，not_configured 是正确行为，测试据此断言（不依赖真实 key）。
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clear_api_key():
    """确保每个测试在「未配置 key」状态下运行 not_configured 分支，
    不受其它测试文件写入的 key 影响。"""
    from app.database import SessionLocal
    from app import models

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


# ── 聊天 ──
def test_create_and_list_session(client):
    r = client.post("/api/chat/sessions", json={"title": "测试会话"})
    assert r.status_code == 201
    sid = r.json()["id"]

    lst = client.get("/api/chat/sessions")
    assert lst.status_code == 200
    assert any(s["id"] == sid for s in lst.json()["items"])


def test_send_message_not_configured(client):
    """未配 key：user 消息保存成功，assistant 返回 not_configured（非伪造）。"""
    sid = client.post("/api/chat/sessions", json={"title": "x"}).json()["id"]
    r = client.post(f"/api/chat/sessions/{sid}/messages", json={"message": "你好"})
    assert r.status_code == 200
    body = r.json()
    assert body["user_message"]["role"] == "user"
    assert body["user_message"]["content"] == "你好"
    assert body["assistant_message"]["role"] == "assistant"
    assert body["assistant_message"]["status"] == "not_configured"
    assert body["ai_configured"] is False
    # 消息确实落库
    detail = client.get(f"/api/chat/sessions/{sid}").json()
    assert len(detail["messages"]) == 2


def test_delete_session(client):
    sid = client.post("/api/chat/sessions", json={"title": "del"}).json()["id"]
    assert client.delete(f"/api/chat/sessions/{sid}").status_code == 204
    assert client.get(f"/api/chat/sessions/{sid}").status_code == 404


# ── 知识库 ──
def test_knowledge_crud_and_search(client):
    created = client.post(
        "/api/knowledge/documents",
        json={
            "title": "立面材料方法论",
            "content_text": "退台立面通过材料质感与檐口比例提升高级感与气势。",
            "tags": "立面,材料,方法",
        },
    )
    assert created.status_code == 201
    did = created.json()["id"]

    # 列表
    lst = client.get("/api/knowledge/documents")
    assert lst.status_code == 200
    assert any(d["id"] == did for d in lst.json()["items"])

    # 详情
    got = client.get(f"/api/knowledge/documents/{did}")
    assert got.status_code == 200
    assert "退台立面" in got.json()["content_text"]

    # 搜索命中
    sr = client.post("/api/knowledge/search", json={"query": "立面", "top_k": 5})
    assert sr.status_code == 200
    body = sr.json()
    assert body["engine"] in ("fts5", "like")
    assert any(h["document_id"] == did for h in body["hits"])
    assert all("snippet" in h and "score" in h for h in body["hits"])

    # 删除
    assert client.delete(f"/api/knowledge/documents/{did}").status_code == 204
    assert client.get(f"/api/knowledge/documents/{did}").status_code == 404


def test_search_long_natural_query_matches(client):
    """长自然语言整句应能命中（修发现1：FTS5 整句短语匹配 0 命中 → 分词 OR）。"""
    created = client.post(
        "/api/knowledge/documents",
        json={
            "title": "市庄项目方案研判",
            "content_text": "市庄项目的设计要点包括退台立面与户型配比；甲方诉求强调材料质感与展示区品质。",
            "tags": "市庄,立面,户型",
        },
    )
    assert created.status_code == 201
    did = created.json()["id"]
    try:
        # 整句口语化提问（旧实现整句短语匹配会 0 命中）
        sr = client.post(
            "/api/knowledge/search",
            json={"query": "市庄项目的设计要点和甲方诉求是什么？", "top_k": 5},
        )
        assert sr.status_code == 200
        hits = sr.json()["hits"]
        assert any(h["document_id"] == did for h in hits), "长自然语言 query 应命中相关文档"
    finally:
        client.delete(f"/api/knowledge/documents/{did}")


def test_reindex(client):
    r = client.post("/api/knowledge/reindex")
    assert r.status_code == 200
    assert "reindexed" in r.json()


def test_use_knowledge_returns_hits_and_not_configured(client):
    """use_knowledge=true 且未配 key：返回检索结果 + assistant not_configured。"""
    client.post(
        "/api/knowledge/documents",
        json={"title": "宋式美学", "content_text": "宋式强调留白、比例与含蓄之美。", "tags": "宋式"},
    )
    sid = client.post("/api/chat/sessions", json={"title": "kb"}).json()["id"]
    r = client.post(
        f"/api/chat/sessions/{sid}/messages",
        json={"message": "讲讲宋式美学", "use_knowledge": True, "knowledge_query": "宋式", "top_k": 3},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["knowledge_hits"]) >= 1
    assert body["assistant_message"]["status"] == "not_configured"
