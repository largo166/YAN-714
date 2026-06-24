"""只读列目录接口测试(目录选择弹窗用)。

盘符层 / 列目录(文件夹文件分类+supported标记+parent) / 不存在路径降级 / 排除隔离区。
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_list_drives(client):
    """path 为空 → 盘符层。"""
    r = client.get("/api/filesystem/list-dir", params={"path": ""})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accessible"] is True
    assert body["level"] == "drives"
    assert isinstance(body["drives"], list) and len(body["drives"]) >= 1  # 至少一个盘符/根


def test_list_dir_classifies(client, tmp_path):
    """列目录:文件夹在前、文件标 supported、parent 正确。"""
    (tmp_path / "子项目A").mkdir()
    (tmp_path / "子项目B").mkdir()
    (tmp_path / "任务书.md").write_text("# x", encoding="utf-8")
    (tmp_path / "压缩包.zip").write_bytes(b"PK")

    r = client.get("/api/filesystem/list-dir", params={"path": str(tmp_path)})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accessible"] is True and body["level"] == "dir"
    assert body["path"] == str(tmp_path)
    assert body["parent"] == str(tmp_path.parent)

    items = body["items"]
    names = [i["name"] for i in items]
    # 文件夹在前(按名),文件在后(按名,Unicode 码点序:任<压)
    assert names == ["子项目A", "子项目B", "任务书.md", "压缩包.zip"]

    by_name = {i["name"]: i for i in items}
    assert by_name["子项目A"]["is_dir"] is True
    assert by_name["任务书.md"]["is_dir"] is False and by_name["任务书.md"]["supported"] is True
    assert by_name["压缩包.zip"]["supported"] is False  # zip 不可解析


def test_list_dir_nonexistent(client, tmp_path):
    """不存在路径 → accessible=false,不抛 500。"""
    r = client.get("/api/filesystem/list-dir", params={"path": str(tmp_path / "无此目录")})
    assert r.status_code == 200
    assert r.json()["accessible"] is False and r.json()["error"]


def test_list_dir_excludes_quarantine(client, tmp_path):
    """清理隔离区 / _trash 不出现在列表里。"""
    (tmp_path / "正常项目").mkdir()
    (tmp_path / "_ROMAI_CLEANUP_QUARANTINE").mkdir()
    (tmp_path / "_trash").mkdir()
    body = client.get("/api/filesystem/list-dir", params={"path": str(tmp_path)}).json()
    names = [i["name"] for i in body["items"]]
    assert "正常项目" in names
    assert "_ROMAI_CLEANUP_QUARANTINE" not in names and "_trash" not in names
