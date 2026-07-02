"""OCR 入索引（P0）：图片/扫描件 PDF 的文字提取与优雅降级。

红线验证：OCR 可用时图片文字进正文（可入 FTS）；OCR 不可用时保持
「登记元数据 + needs_ocr」原行为，不伪造、不崩。
"""
import io

import pytest

from app import ocr, parsing


def _text_image_bytes(text: str) -> bytes:
    """PIL 画一张含中文的白底黑字图。"""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (720, 160), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 44)
    except OSError:  # 非 Windows/无雅黑 → 退默认字体（拉丁字符仍可测）
        font = ImageFont.load_default()
    d.text((24, 50), text, fill="black", font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.skipif(not ocr.available(), reason="rapidocr 未安装（OCR 可选依赖）")
def test_image_parse_extracts_ocr_text(tmp_path):
    p = tmp_path / "规划条件.png"
    p.write_bytes(_text_image_bytes("容积率2.4 限高80米"))
    r = parsing.parse_file(p)
    assert r.status == "ok"
    assert "OCR 识别文字" in r.text
    assert "容积率" in r.text and "80" in r.text  # 文字真进了正文（可入索引）


@pytest.mark.skipif(not ocr.available(), reason="rapidocr 未安装（OCR 可选依赖）")
def test_blank_image_registers_metadata_honestly(tmp_path):
    from PIL import Image

    p = tmp_path / "blank.png"
    img = Image.new("RGB", (200, 120), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    p.write_bytes(buf.getvalue())
    r = parsing.parse_file(p)
    assert r.status == "ok"
    assert "未检测到文字内容" in r.text  # 跑了 OCR 但没字：如实说明，不伪造


def test_image_falls_back_when_ocr_unavailable(tmp_path, monkeypatch):
    """OCR 不可用 → metadata_only(needs_ocr)，保持原诚实登记行为。"""
    monkeypatch.setattr(ocr, "available", lambda: False)
    p = tmp_path / "photo.jpg"
    p.write_bytes(_text_image_bytes("测试"))
    r = parsing.parse_file(p)
    assert r.status == "metadata_only"
    assert r.reason == "needs_ocr"
    assert "OCR 组件不可用" in r.text


@pytest.mark.skipif(not ocr.available(), reason="rapidocr 未安装（OCR 可选依赖）")
def test_scanned_pdf_gets_ocr_text(tmp_path):
    """无文字层 PDF（页面即图片）→ OCR 出正文 + 按页 chunk。"""
    import fitz

    img_bytes = _text_image_bytes("抬板架空 会客厅")
    doc = fitz.open()
    page = doc.new_page(width=720, height=160)
    page.insert_image(fitz.Rect(0, 0, 720, 160), stream=img_bytes)
    p = tmp_path / "scan.pdf"
    doc.save(str(p))
    doc.close()

    r = parsing.parse_file(p)
    assert r.status in ("ok", "ok_truncated")
    assert "OCR 识别" in r.text
    assert "抬板" in r.text
    assert r.chunks and r.chunks[0]["page_no"] == 1  # 出处仍精确到页


def test_scanned_pdf_stays_needs_ocr_when_unavailable(tmp_path, monkeypatch):
    import fitz

    monkeypatch.setattr(ocr, "available", lambda: False)
    doc = fitz.open()
    page = doc.new_page(width=300, height=200)
    page.insert_image(fitz.Rect(0, 0, 300, 200), stream=_text_image_bytes("字"))
    p = tmp_path / "scan2.pdf"
    doc.save(str(p))
    doc.close()

    r = parsing.parse_file(p)
    assert r.status == "metadata_only"
    assert r.reason == "needs_ocr"
