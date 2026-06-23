"""4E 腾讯会议 provider 测试：全 mock _run_tool，不真实外呼。

覆盖：未配置 / 服务不可用 / 创建成功 / 字段缺失 / 无录制 / 纪要未生成 / 同步成功。
"""
import json

import pytest

from app.providers import tencent_meeting as tm


@pytest.fixture(autouse=True)
def _force_configured(monkeypatch):
    """默认让 is_configured 为 True，单测各自控制 _run_tool。"""
    monkeypatch.setattr(tm, "is_configured", lambda: True)


def _resp(body_obj):
    """构造 skill 响应（data.body 为 JSON 字符串）。"""
    return {"data": {"status_code": 200, "body": json.dumps(body_obj, ensure_ascii=False)}}


def test_create_not_configured(monkeypatch):
    monkeypatch.setattr(tm, "is_configured", lambda: False)
    r = tm.create_meeting("t", "2026-06-23T15:00:00+08:00", "2026-06-23T15:30:00+08:00")
    assert r.status == "not_configured"
    assert not r.join_url  # 不伪造


def test_create_provider_unavailable(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("network down")
    monkeypatch.setattr(tm, "_run_tool", boom)
    r = tm.create_meeting("t", "s", "e")
    assert r.status == "provider_unavailable"
    assert not r.meeting_code


def test_create_success(monkeypatch):
    body = {"meeting_info_list": [{
        "meeting_id": "123", "meeting_code": "999", "join_url": "https://meeting.tencent.com/dm/abc",
        "start_time": "2026-06-23T15:00:00+08:00", "end_time": "2026-06-23T15:30:00+08:00",
    }]}
    monkeypatch.setattr(tm, "_run_tool", lambda *a, **k: _resp(body))
    r = tm.create_meeting("t", "s", "e")
    assert r.status == "ok"
    assert r.meeting_code == "999"
    assert r.join_url.startswith("https://meeting.tencent.com")


def test_create_missing_fields(monkeypatch):
    """返回缺会议号/链接→provider_unavailable，不伪造。"""
    monkeypatch.setattr(tm, "_run_tool", lambda *a, **k: _resp({"meeting_info_list": [{"subject": "x"}]}))
    r = tm.create_meeting("t", "s", "e")
    assert r.status == "provider_unavailable"
    assert not r.join_url


def test_sync_no_recording(monkeypatch):
    monkeypatch.setattr(tm, "_run_tool", lambda *a, **k: _resp({}))  # 纪要与转写都空
    r = tm.sync_minutes("123")
    assert r.status == "no_recording"


def test_sync_transcript_pending(monkeypatch):
    def fake(name, args, **k):
        if name == "get_smart_minutes":
            return _resp({})  # 纪要未生成
        return _resp({"text": "转写内容ABC"})
    monkeypatch.setattr(tm, "_run_tool", fake)
    r = tm.sync_minutes("123")
    assert r.status == "transcript_pending"
    assert "转写内容" in r.transcript


def test_sync_ok(monkeypatch):
    def fake(name, args, **k):
        if name == "get_smart_minutes":
            return _resp({"summary": "智能纪要内容"})
        return _resp({"text": "转写全文"})
    monkeypatch.setattr(tm, "_run_tool", fake)
    r = tm.sync_minutes("123")
    assert r.status == "ok"
    assert "智能纪要" in r.minutes
