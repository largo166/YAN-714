"""路0.5 判断层回流（P0-2）：最近 AI 研判结论注入技能/共创取材上下文。

红线：研判是 AI 生成——注入必须带「未经人工确认」标注；无 core 的记录不注入（不造空壳）。
"""
import json
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app import analysis, models
from app.database import SessionLocal
from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_judgments_flow_into_material_context(client):
    pid = client.post("/api/projects", json={"name": "判断回流测试", "status": "active"}).json()["id"]
    db = SessionLocal()
    try:
        # 一份可作材料的文件（让 sources 非空触发装配）
        db.add(models.ProjectFile(
            project_id=pid, filename="brief.txt", stored_path="x/brief.txt",
            file_type="txt", size=10, parse_status="ok", content_text="项目任务书正文",
            status="active",
        ))
        # 最新研判（判断卡结构 output_json）
        db.add(models.ProjectAnalysis(
            project_id=pid, task="difficulty", status="ok",
            content="md", created_at=datetime.utcnow(),
            output_json=json.dumps({
                "core": "本项目的关键是山地高差与限高的冲突。",
                "points": [{"label": "关键矛盾", "text": "台地成本与产品溢价互斥"}],
            }, ensure_ascii=False),
        ))
        # 无 core 的旧记录：不注入
        db.add(models.ProjectAnalysis(
            project_id=pid, task="plan", status="ok", content="md",
            created_at=datetime.utcnow(), output_json=json.dumps({"points": []}),
        ))
        db.commit()

        m = analysis.gather_material(db, pid, query="测试")
        assert "AI 研判·设计难点分析" in m.context
        assert "未经人工确认" in m.context  # 来源属性如实标注
        assert "山地高差" in m.context
        assert "AI 研判·设计推进计划" not in m.context  # 无 core 不注入
    finally:
        db.close()
