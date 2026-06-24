"""parse_file 大文件 metadata-only 降级测试。

用 monkeypatch 把阈值调小，避免真写 20MB 文件。
"""
import app.parsing as parsing
from app.parsing import parse_file


def test_large_file_degrades_to_metadata_only(tmp_path, monkeypatch):
    # 阈值调到 10 字节，写一个 50 字节的 pdf（内容无所谓，走不到解析就被拦）
    monkeypatch.setattr(parsing, "MAX_PARSE_BYTES", 10)
    big = tmp_path / "投标文本.pdf"
    big.write_bytes(b"%PDF-1.4" + b"x" * 50)
    r = parse_file(big)
    assert r.status == "metadata_only"
    assert "受管资料" in r.text  # 登记说明
    assert "投标文本.pdf" in r.text


def test_small_file_still_parsed_normally(tmp_path, monkeypatch):
    # 阈值正常（20MB），小 txt 走正常解析
    small = tmp_path / "需求.txt"
    small.write_text("甲方要求：退台立面与展示区品质。", encoding="utf-8")
    r = parse_file(small)
    assert r.status == "ok"
    assert "退台立面" in r.text


def test_image_not_affected_by_size_gate(tmp_path, monkeypatch):
    # 图片即使超阈值也走资产登记（不是 metadata_only 降级），保持原行为
    monkeypatch.setattr(parsing, "MAX_PARSE_BYTES", 10)
    img = tmp_path / "效果图.png"
    img.write_bytes(b"\x89PNG\r\n" + b"y" * 100)
    r = parse_file(img)
    assert r.status == "ok"  # 图片资产登记仍是 ok
    assert "图片资产" in r.text
