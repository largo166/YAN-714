"""仓库根配置端点 + 校验(本地仓库·刀2)。

settings PUT 仓库根:合法→存归一绝对路径;不存在/非绝对/symlink/嵌套 uploads→400;空串=解除。
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import uploads


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _reset_repo(client):
    """每个用例后把仓库根清掉,避免污染 dev 库/其它用例。"""
    client.put("/api/settings", json={"repository_root_path": ""})


def test_repo_root_configure_and_clear(client, tmp_path):
    repo = tmp_path / "ROM-AI-仓库"
    repo.mkdir()
    try:
        r = client.put("/api/settings", json={"repository_root_path": str(repo)})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["repository_configured"] is True
        assert body["repository_root_path"]  # 存的是归一绝对路径
        # GET 回显一致
        got = client.get("/api/settings").json()
        assert got["repository_configured"] is True
        # 空串解除
        r2 = client.put("/api/settings", json={"repository_root_path": ""})
        assert r2.status_code == 200
        assert r2.json()["repository_configured"] is False
    finally:
        _reset_repo(client)


def test_repo_root_nonexistent_rejected(client, tmp_path):
    missing = tmp_path / "不存在的文件夹"
    r = client.put("/api/settings", json={"repository_root_path": str(missing)})
    assert r.status_code == 400
    assert "不存在" in r.json()["detail"]
    _reset_repo(client)


def test_repo_root_relative_rejected(client):
    r = client.put("/api/settings", json={"repository_root_path": "相对路径\\x"})
    assert r.status_code == 400  # 非绝对路径
    _reset_repo(client)


def test_repo_root_nested_with_uploads_rejected(client):
    # 仓库根 = uploads 自身 → 拒绝(否则 _trash 与 uploads 树嵌套、cleanup 误删)
    uploads.UPLOADS_ROOT.mkdir(parents=True, exist_ok=True)
    r = client.put("/api/settings", json={"repository_root_path": str(uploads.UPLOADS_ROOT)})
    assert r.status_code == 400
    assert "内部上传目录" in r.json()["detail"]
    # 仓库根 = uploads 的父(data 目录)→ 也拒绝(uploads 是它的子孙)
    r2 = client.put("/api/settings", json={"repository_root_path": str(uploads.UPLOADS_ROOT.parent)})
    assert r2.status_code == 400
    _reset_repo(client)


def test_validate_repository_root_unit(tmp_path):
    """直接测校验函数:合法返回 resolve 后绝对 Path;空/非绝对/不存在抛错。"""
    from app.safe_paths import PathValidationError

    good = tmp_path / "lib"
    good.mkdir()
    out = uploads.validate_repository_root(str(good))
    assert out.is_absolute() and out.exists()

    for bad in ["", "   ", "relative/path"]:
        with pytest.raises(PathValidationError):
            uploads.validate_repository_root(bad)
    with pytest.raises(PathValidationError):
        uploads.validate_repository_root(str(tmp_path / "nope"))
