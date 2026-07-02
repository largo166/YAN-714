"""FTS 中文召回（2026-07 修复）：长中文串 bigram 影子文本。

历史缺陷：FTS5 unicode61 把连续 CJK 当一个 token，查询侧 bigram 对不上 →
「城市森林花园建筑试点工作」这类长串里的词(森林/试点)搜不到。
修法验证：写入侧 _fts_text 同样 bigram 化后，长串中任意 2 字词可命中。
"""
import pytest
from fastapi.testclient import TestClient

from app import retrieval
from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_fts_text_bigrams_long_cjk_keeps_ascii():
    out = retrieval._fts_text("城市森林花园建筑A4容积率2.4")
    assert "森林" in out.split() and "花园" in out.split()  # 长串切出 bigram
    assert "a4" in out.lower().split() or "A4" in out.split()  # ASCII 保持整词
    assert retrieval._fts_text("试点") == "试点"  # 短串原样


def test_long_cjk_run_is_searchable(client):
    r = client.post(
        "/api/knowledge/documents",
        json={
            "title": "测试通知",
            "content_text": "关于开展城市森林花园建筑试点工作的通知全文内容",
            "file_type": "txt",
        },
    )
    assert r.status_code in (200, 201)
    doc_id = r.json()["id"]
    s = client.post("/api/knowledge/search", json={"query": "森林花园", "top_k": 10})
    assert s.status_code == 200
    ids = [h["document_id"] for h in s.json()["hits"]]
    assert doc_id in ids, "长中文串里的 bigram 词应可命中（修复前搜不到）"
