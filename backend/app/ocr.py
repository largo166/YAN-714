"""本地 OCR（RapidOCR / onnxruntime，纯本地推理，无网络依赖）。

职责：给 parsing.py 提供「图片 → 文字」能力，让扫描件 PDF / 图片材料的文字能进全文索引。
红线（与 parsing 一致，绝不伪造）：
- rapidocr 未安装 / 初始化失败 → available()=False，调用方回落到「登记元数据 + needs_ocr」原行为，不崩。
- OCR 结果为空 → 返回空串，调用方如实标注，不塞占位文本。
- 单次识别包在异常捕获里：坏图/异常输入返回空串，不阻断批量解析。

选型说明：RapidOCR(onnxruntime) 而非 PaddleOCR——纯 pip 轮子、CPU 推理、模型内置、
中文效果好、体积 ~60MB；适合本地优先的桌面产品。首次调用加载模型(~1-2s)，进程内单例复用。
"""
from __future__ import annotations

import threading
from typing import Optional

_engine = None
_engine_lock = threading.Lock()
_engine_failed = False


def _get_engine():
    """懒加载单例。导入/初始化失败只试一次，之后恒 None（不反复重试拖慢解析）。"""
    global _engine, _engine_failed
    if _engine is not None or _engine_failed:
        return _engine
    with _engine_lock:
        if _engine is not None or _engine_failed:
            return _engine
        try:
            from rapidocr_onnxruntime import RapidOCR  # type: ignore

            _engine = RapidOCR()
        except Exception:  # noqa: BLE001  未安装/初始化失败 → 优雅降级
            _engine_failed = True
            _engine = None
    return _engine


def available() -> bool:
    """OCR 是否可用（rapidocr 已安装且能初始化）。"""
    return _get_engine() is not None


def ocr_image(source) -> str:
    """识别一张图，返回按行拼接的文字（空串 = 没识别出内容或 OCR 不可用）。
    source: 文件路径 str / bytes / numpy 数组（RapidOCR 原生支持）。"""
    engine = _get_engine()
    if engine is None:
        return ""
    try:
        result, _ = engine(source)
    except Exception:  # noqa: BLE001  坏图/异常输入不崩
        return ""
    if not result:
        return ""
    lines: list[str] = []
    for item in result:
        # RapidOCR 返回 [box, text, score]
        try:
            text = str(item[1]).strip()
        except (IndexError, TypeError):
            continue
        if text:
            lines.append(text)
    return "\n".join(lines).strip()


def ocr_pdf_page(page, dpi: int = 200) -> str:
    """OCR 一页 PDF（fitz Page → 渲染位图 → 识别）。失败返回空串。"""
    try:
        pix = page.get_pixmap(dpi=dpi)
        return ocr_image(pix.tobytes("png"))
    except Exception:  # noqa: BLE001
        return ""


# 扫描件 PDF 的 OCR 预算：页数与耗时双上限（CPU 推理约 1-2s/页；
# 超预算如实标 ok_truncated，不把部分结果当全文，也不触发外层 30s 解析超时）。
OCR_MAX_PAGES = 12
OCR_TIME_BUDGET_SECONDS = 22.0


def reason_note(kind: str) -> Optional[str]:
    """占位提示文案（保留接口以便统一措辞；当前由 parsing 直接生成登记文本）。"""
    return None
