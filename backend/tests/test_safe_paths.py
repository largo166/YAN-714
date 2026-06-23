"""P1 测试：统一 validate_path 安全校验。

红线：白名单 is_relative_to / 拒 symlink 逃逸 / 空 base fail closed / 文件名净化。
"""
import sys

import pytest

from app.safe_paths import PathValidationError, sanitize_filename, validate_path


def test_normal_relative_passes(tmp_path):
    sub = tmp_path / "uploads"
    sub.mkdir()
    out = validate_path(tmp_path, "uploads/a.txt")
    assert out == (tmp_path / "uploads" / "a.txt").resolve()


def test_normal_absolute_inside_passes(tmp_path):
    f = tmp_path / "x.txt"
    f.write_text("x", encoding="utf-8")
    out = validate_path(tmp_path, f, must_exist=True)
    assert out == f.resolve()


def test_traversal_rejected(tmp_path):
    base = tmp_path / "base"
    base.mkdir()
    with pytest.raises(PathValidationError):
        validate_path(base, "../outside.txt")


def test_absolute_outside_rejected(tmp_path):
    base = tmp_path / "base"
    base.mkdir()
    other = tmp_path / "other.txt"
    other.write_text("x", encoding="utf-8")
    with pytest.raises(PathValidationError):
        validate_path(base, other)


def test_empty_base_fail_closed():
    with pytest.raises(PathValidationError):
        validate_path("", "a.txt")
    with pytest.raises(PathValidationError):
        validate_path(None, "a.txt")


def test_nonexistent_base_fail_closed(tmp_path):
    with pytest.raises(PathValidationError):
        validate_path(tmp_path / "nope", "a.txt")


def test_must_exist_rejects_missing(tmp_path):
    with pytest.raises(PathValidationError):
        validate_path(tmp_path, "ghost.txt", must_exist=True)


@pytest.mark.skipif(sys.platform == "win32", reason="符号链接在 Windows 需特权，CI 环境跳过")
def test_symlink_escape_rejected(tmp_path):
    base = tmp_path / "base"
    base.mkdir()
    secret = tmp_path / "secret"
    secret.mkdir()
    (secret / "k.txt").write_text("top", encoding="utf-8")
    link = base / "link"
    link.symlink_to(secret, target_is_directory=True)
    with pytest.raises(PathValidationError):
        validate_path(base, "link/k.txt")


def test_sanitize_filename():
    assert sanitize_filename("a/b/c.txt") == "c.txt"
    assert sanitize_filename("..\\evil.txt") == "evil.txt"
    assert sanitize_filename('bad:name?.txt') == "bad_name_.txt"
    assert sanitize_filename("   ") == "untitled"
    assert sanitize_filename("...") == "untitled"
    # Windows 保留字被前缀化
    assert sanitize_filename("con.txt").startswith("_")
