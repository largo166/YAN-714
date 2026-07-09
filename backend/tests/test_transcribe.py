"""会议转写回归守卫(2026-07-09)。锁纯函数与三态契约,不下真模型(慢)。
真模型全链在打包实测覆盖(见 docs 决议档),此处只锁不依赖模型的逻辑。"""
import pytest
from fastapi.testclient import TestClient

from app import diarize, meeting_hotwords
from app.main import app
from app.transcription import Segment


# ═══ 热词纯函数 ═══

def test_hotwords_default_baseline():
    hw = meeting_hotwords.build_hotwords()
    for term in ("市庄", "展示区", "总图", "报规", "面宽"):
        assert term in hw


def test_hotwords_project_terms_appended():
    hw = meeting_hotwords.build_hotwords(project_name="哈尔滨江帆序", city="哈尔滨", client="保利")
    assert "哈尔滨" in hw
    # 默认基线仍在
    assert "总图" in hw


def test_hotwords_dedup_preserves_order():
    hw = meeting_hotwords.build_hotwords(project_name="市庄", client="市庄")  # 与默认表重复
    assert hw.count("市庄") == 1
    assert hw[0] == "市庄"  # 默认表首项


def test_hotwords_cognition_splits_short_terms():
    hw = meeting_hotwords.build_hotwords(cognition_terms=["退台式立面，归家动线", "这是一句很长的描述不应成为热词因为超过八字"])
    assert "退台式立面" in hw
    assert "归家动线" in hw
    assert not any(len(t) > 8 for t in hw)  # 长句被滤


def test_initial_prompt_empty_and_nonempty():
    assert meeting_hotwords.to_initial_prompt([]) == ""
    p = meeting_hotwords.to_initial_prompt(["市庄", "总图"])
    assert "市庄" in p and "总图" in p


# ═══ 说话人对齐纯函数 ═══

def test_align_by_overlap():
    segs = [
        Segment("甲方发言", start_ms=0, end_ms=1000),
        Segment("我方回应", start_ms=1200, end_ms=2000),
    ]
    turns = [
        diarize.DiaTurn(0, 1100, "speaker-1"),
        diarize.DiaTurn(1100, 2100, "speaker-2"),
    ]
    out = diarize.align(segs, turns)
    assert out[0].speaker_key == "speaker-1"
    assert out[1].speaker_key == "speaker-2"


def test_align_no_turns_degrades():
    """分离不可用(turns 空)→ 原样返回,保持 speaker-1(降级单说话人,不伪造)。"""
    segs = [Segment("内容", start_ms=0, end_ms=1000)]
    out = diarize.align(segs, [])
    assert out[0].speaker_key == "speaker-1"


def test_align_no_overlap_keeps_original():
    """段落时间与所有 turn 无重叠 → 保持原说话人,不猜。"""
    segs = [Segment("内容", start_ms=5000, end_ms=6000)]
    turns = [diarize.DiaTurn(0, 1000, "speaker-2")]
    out = diarize.align(segs, turns)
    assert out[0].speaker_key == "speaker-1"


def test_align_text_and_time_preserved():
    segs = [Segment("原文", start_ms=100, end_ms=900)]
    turns = [diarize.DiaTurn(0, 1000, "speaker-3")]
    out = diarize.align(segs, turns)
    assert out[0].text == "原文" and out[0].start_ms == 100 and out[0].end_ms == 900
    assert out[0].speaker_key == "speaker-3"


# ═══ 三态可用性(不下模型时如实报,不崩)═══

def test_availability_never_crashes():
    from app import transcribe_local
    av = transcribe_local.availability()
    assert isinstance(av.ready, bool) and isinstance(av.reason, str)
    ok, reason = diarize.available()
    assert isinstance(ok, bool) and isinstance(reason, str)


# ═══ 链路:端点契约(不触模型的部分)═══

@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_capability_endpoint(client):
    p = client.post("/api/projects", json={"name": "转写能力测试"}).json()
    r = client.get(f"/api/projects/{p['id']}/transcribe/status")
    assert r.status_code == 200
    body = r.json()
    assert "ready" in body and "diarize_ready" in body and "reason" in body


def test_from_audio_rejects_bad_ext(client):
    p = client.post("/api/projects", json={"name": "转写格式测试"}).json()
    r = client.post(
        f"/api/projects/{p['id']}/meetings/from-audio",
        files={"file": ("notaudio.pdf", b"x", "application/pdf")},
        data={"title": "x"},
    )
    # 依赖装了→400 格式;没装→503 不可用。都不是 200/500。
    assert r.status_code in (400, 503)


def test_job_status_404_unknown(client):
    p = client.post("/api/projects", json={"name": "转写job测试"}).json()
    r = client.get(f"/api/projects/{p['id']}/transcribe/jobs/nonexistent")
    assert r.status_code == 404


def test_speaker_map_rewrites_keys(client):
    """speaker-map 端点:人工映射改写 segments_json 里的 speaker_key。"""
    from app.database import SessionLocal
    from app import models, safe_json, transcription

    p = client.post("/api/projects", json={"name": "改名测试"}).json()
    db = SessionLocal()
    try:
        segs = [
            transcription.Segment("甲方说", speaker_key="speaker-1", start_ms=0, end_ms=1000),
            transcription.Segment("我方说", speaker_key="speaker-2", start_ms=1000, end_ms=2000),
        ]
        m = models.Meeting(
            project_id=p["id"], title="改名会议",
            segments_json=safe_json.dumps_safe(transcription.segments_to_dicts(segs)),
            transcript_source="asr", status="created",
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        mid = m.id
    finally:
        db.close()
    r = client.post(
        f"/api/projects/{p['id']}/meetings/{mid}/speaker-map",
        json={"mapping": {"speaker-1": "甲方王总", "speaker-2": "我方严总"}},
    )
    assert r.status_code == 200
    segs_out = r.json()["segments"]
    keys = {s["speaker_key"] for s in segs_out}
    assert keys == {"甲方王总", "我方严总"}
