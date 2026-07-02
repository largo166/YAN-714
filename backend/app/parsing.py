"""文档文本抽取（内容层提取，**不按文件大小降级**）。

核心原则（用户指令 2026-06，替换旧的「>20MB 即降级」逻辑）：
- 文件大小【不】决定读不读正文。所有支持格式都尝试提取「内容层」（文字层/文本框/正文/表格）。
- 决策维度只剩两个：「文件类型」决定怎么读、「有没有内容层」决定读不读得到。大小完全消失。
- 只取内容层、跳过媒体：PDF 只抽文字层（PyMuPDF/fitz，不渲染图像、不 OCR）；PPTX 抽文本框+演讲者
  备注（跳过嵌入图片/视频）；Word/MD/txt 读正文；xlsx 抽表格；图片登记元数据。
  → 实测 fitz：394MB PDF 文字层 0.14s 读完全文、195MB 0.19s，跟总大小无关（重的是图，不是字）。
    fitz 比 pypdf 快约 10-14×，是 ROM-AI 实际该用的提取器。
- 性能保护用【超时】而非【大小预判】：内容层提取本身就快；个别异常慢的文件命中提取超时
  → extraction_timeout，标记待人工，而不是按大小预先放弃。

分级返回 parse_status，绝不伪造内容（纲要规则 3/4）：
- ok                完整读完非空正文（任意大小）。
- ok_truncated      读到正文但中途截断（触顶 MAX_TEXT_CHARS 字符上限）；如实标 truncated_at_page/total_pages，
                    不把截断值当全文报。仍是可用正文、可入库。
- metadata_only     文件有效、但【真的提不出内容】：扫描件无文字层(需OCR) / 加密 / 结构损坏。
                    如实登记元数据 + 原因(reason)，不伪造正文；仍可靠 文件名/类型 入库检索。
- extraction_timeout 内容层提取超过 PARSE_TIMEOUT_SECONDS（异常慢的个例），标记待人工，不按大小放弃。
- empty             支持格式但文档本身无文本（空 txt/docx 等）。
- unsupported       非支持格式。
- failed            提取过程未预期异常（捕获分级，不阻断批量里的其它文件）。

支持格式：.txt .md（内建）/ .pdf（PyMuPDF/fitz 文字层；无文字层的扫描件走本地 OCR）/
.docx（python-docx）/ .pptx（python-pptx 文本框+备注）/ .xlsx（轻量 XML 抽取）/
图片（png/jpg/jpeg：本地 OCR 提文字入索引；OCR 不可用或无文字时回落元数据登记）。

OCR（2026-07 P0）：RapidOCR 本地推理（见 ocr.py）。扫描件 PDF 按页 OCR，受页数+耗时双预算
保护（超预算如实标 ok_truncated）；OCR 不可用时保持原「登记元数据 + needs_ocr」行为，不伪造。
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET

from . import ocr

SUPPORTED_EXTS = {".txt", ".md", ".pdf", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg"}

# 抽取后截断上限（防超大文本撑爆 DB / 上下文）。提取器按页/片增量累积到此即停，
# 这样超大文档也只读到「够用的正文」就收手，跟文件总大小无关。
MAX_TEXT_CHARS = 200_000

# 提取超时（秒）：内容层提取本就快；个别异常慢的文件命中此超时 → extraction_timeout，
# 标记待人工，而不是用「大小阈值」预先放弃。这是唯一的性能保护，不再有 MB 阈值。
PARSE_TIMEOUT_SECONDS = 30


@dataclass
class ParseResult:
    status: str  # ok / ok_truncated / metadata_only / extraction_timeout / empty / unsupported / failed
    text: str = ""
    error: str = ""
    reason: str = ""  # metadata_only 的细分：needs_ocr / encrypted / unreadable；超时为 timeout
    # 截断信息（仅 ok_truncated 有意义；如实告知停在哪、共多少页，不把截断值当全文）
    truncated_at_page: int = 0
    total_pages: int = 0
    # 分块溯源：PDF 按页 / PPTX 按片产出 [{"text":..,"page_no":N,"slide_no":N}]，供出处精确到页。
    # 其它类型(docx/txt/xlsx)无页概念 → 空列表(出处不带页码)。
    chunks: List[dict] = field(default_factory=list)


def is_supported(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTS


def _register_note(p: Path, ext: str, tag: str, detail: str) -> str:
    """生成「如实登记」说明文本（metadata_only / extraction_timeout 用），不伪造正文。"""
    try:
        mb = p.stat().st_size / (1024 * 1024)
        size = f"{mb:.1f} MB"
    except OSError:
        size = "未知"
    return (
        f"{p.name}\n类型：{ext.lstrip('.')}\n大小：{size}\n状态：{tag}\n说明：{detail}"
    )


def parse_file(path: str | Path) -> ParseResult:
    """抽取文本。**不按大小降级**——所有支持格式都尝试提取内容层，按类型选策略。
    提取包在超时保护里：异常慢 → extraction_timeout（不预先按大小放弃）。
    异常一律捕获分级（failed / metadata_only），不抛出（不阻塞批量）。"""
    p = Path(path)
    ext = p.suffix.lower()
    if ext not in SUPPORTED_EXTS:
        return ParseResult(status="unsupported")
    return _extract_with_timeout(p, ext)


def _extract_with_timeout(p: Path, ext: str) -> ParseResult:
    """在 daemon 工作线程里跑内容层提取，超时则返回 extraction_timeout。
    Windows 无 signal.alarm，故用线程 + join(timeout)。线程设为 daemon：个别异常慢的提取
    超时后，残留线程不阻塞进程退出、随进程回收（不强杀、不用线程池避免堆积阻塞）。"""
    box: dict = {}

    def _worker() -> None:
        try:
            box["result"] = _dispatch(p, ext)
        except BaseException as e:  # noqa: BLE001  兜底（_dispatch 已自捕，理论不达）
            box["error"] = e

    th = threading.Thread(target=_worker, name="parse-extract", daemon=True)
    th.start()
    th.join(PARSE_TIMEOUT_SECONDS)
    if th.is_alive():
        return ParseResult(
            status="extraction_timeout", reason="timeout",
            text=_register_note(
                p, ext, "提取超时",
                f"内容层提取超过 {PARSE_TIMEOUT_SECONDS}s，已登记待人工处理（未按文件大小放弃）。",
            ),
        )
    if "error" in box:
        e = box["error"]
        return ParseResult(status="failed", error=f"{type(e).__name__}: {e}"[:500])
    return box.get("result") or ParseResult(status="failed", error="提取无结果")


def _dispatch(p: Path, ext: str) -> ParseResult:
    """按文件类型分派到「只取内容层」的提取器。大小在这里完全不参与决策。"""
    try:
        if ext == ".pdf":
            return _read_pdf(p)  # 自行判定 ok / metadata_only(needs_ocr|encrypted|unreadable)
        if ext in (".png", ".jpg", ".jpeg"):
            return _read_image(p)  # 本地 OCR 提文字；OCR 不可用/无文字 → 元数据登记（不伪造）
        if ext in (".txt", ".md"):
            text = _read_text(p)
        elif ext == ".docx":
            text = _read_docx(p)
        elif ext == ".pptx":
            return _read_pptx(p)  # 自带按片 chunk，直接返回 ParseResult
        elif ext == ".xlsx":
            text = _read_xlsx(p)
        else:  # 理论不达（已过 SUPPORTED_EXTS）
            return ParseResult(status="unsupported")
    except Exception as e:  # noqa: BLE001  抽取失败不崩、不伪造
        return ParseResult(status="failed", error=f"{type(e).__name__}: {e}"[:500])

    # 先按字符数截断、再 NFKC 归一化（避免对将被丢弃的超长文本做无谓归一化）。
    # NFKC：把兼容/部首区异体字折叠回常规字符（pypdf 对部分 CID PDF 会把「自」抽成
    # U+2F03 康熙部首，致检索/匹配漏命中）。
    text = unicodedata.normalize("NFKC", (text or "")[:MAX_TEXT_CHARS]).strip()
    if not text:
        return ParseResult(status="empty")
    return ParseResult(status="ok", text=text[:MAX_TEXT_CHARS])


def _read_text(p: Path) -> str:
    # 容错编码：utf-8 优先，失败退 gbk，再失败忽略错误
    raw = p.read_bytes()
    for enc in ("utf-8", "gbk"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def _read_pdf(p: Path) -> ParseResult:
    """用 PyMuPDF/fitz 只抽 PDF 文字层（不渲染图像、不 OCR）——故跟文件总大小无关，秒级。
    实测 fitz 比 pypdf 快约 10-14×（394MB 0.14s / 195MB 0.19s 读完全文）。
    分档（绝不伪造、如实区分）：
      结构损坏→metadata_only(unreadable)；加密无法解→metadata_only(encrypted)；
      有效但无文字层(扫描件)→metadata_only(needs_ocr)；
      读完全文→ok；触顶 MAX_TEXT_CHARS 中途截断→ok_truncated(标停在第N页/共M页，不把截断值当全文)。"""
    import fitz  # PyMuPDF

    try:
        doc = fitz.open(str(p))
    except Exception as e:  # noqa: BLE001  结构损坏/非法 PDF
        return ParseResult(
            status="metadata_only", reason="unreadable",
            text=_register_note(p, ".pdf", "无法读取",
                                f"PDF 结构无法解析（{type(e).__name__}），已登记元数据、未提取正文（不伪造）。"),
        )

    try:
        if doc.is_encrypted and not doc.authenticate(""):  # 试空密码
            return ParseResult(
                status="metadata_only", reason="encrypted",
                text=_register_note(p, ".pdf", "加密",
                                    "PDF 已加密、无法提取正文，已登记元数据（不伪造）。"),
            )

        total_pages = doc.page_count
        parts: list[str] = []
        chunks: List[dict] = []  # 按页分块溯源
        last_page_read = 0  # 已读到的最后页号（1-based）
        for i in range(total_pages):
            try:
                t = doc.load_page(i).get_text("text") or ""
            except Exception:  # noqa: BLE001  单页异常跳过，不放弃整篇
                t = ""
            last_page_read = i + 1
            if t:
                parts.append(t)
                chunks.append({"text": t, "page_no": i + 1, "slide_no": 0})
                # 用归一化后的累计长度判截断（与最终返回文本同口径，不靠 raw len 估）
                if len(unicodedata.normalize("NFKC", "\n".join(parts))) >= MAX_TEXT_CHARS:
                    break
    finally:
        doc.close()

    full = unicodedata.normalize("NFKC", "\n".join(parts))
    text = full[:MAX_TEXT_CHARS].strip()
    # 截断判定基于归一化后真实长度（含 join 的换行、NFKC 展开），不把截断值当全文报
    truncated_at = last_page_read if len(full) > MAX_TEXT_CHARS else 0
    if not text:
        # 有效 PDF 但无文字层 → 扫描件/图片型：尝试本地 OCR（页数+耗时双预算）；
        # OCR 不可用或没识别出文字 → 保持原「登记元数据 + needs_ocr」（不伪造）。
        if ocr.available():
            ocr_text, ocr_chunks, pages_done, hit_budget = _ocr_pdf_pages(p, total_pages)
            if ocr_text:
                if hit_budget and pages_done < total_pages:
                    # 如实标截断：OCR 只做到第 N 页 / 共 M 页，不把部分结果当全文
                    return ParseResult(status="ok_truncated", text=ocr_text, chunks=ocr_chunks,
                                       truncated_at_page=pages_done, total_pages=total_pages)
                return ParseResult(status="ok", text=ocr_text, chunks=ocr_chunks, total_pages=total_pages)
        return ParseResult(
            status="metadata_only", reason="needs_ocr", total_pages=total_pages,
            text=_register_note(p, ".pdf", "需OCR",
                                f"未检测到文字层（可能为扫描件/图片型 PDF，共 {total_pages} 页），"
                                + ("OCR 未识别出文字；" if ocr.available() else "OCR 组件不可用；")
                                + "已登记元数据，不伪造正文。"),
        )
    if truncated_at:
        # 如实告知截断：停在第 N 页 / 共 M 页，不把截断值当全文
        return ParseResult(status="ok_truncated", text=text, chunks=chunks,
                           truncated_at_page=truncated_at, total_pages=total_pages)
    return ParseResult(status="ok", text=text, chunks=chunks, total_pages=total_pages)


def _ocr_pdf_pages(p: Path, total_pages: int) -> tuple[str, List[dict], int, bool]:
    """扫描件 PDF 按页 OCR。返回 (归一化全文, 按页 chunks, 已处理页数, 是否触预算)。
    双预算保护（页数 OCR_MAX_PAGES / 耗时 OCR_TIME_BUDGET_SECONDS）：CPU 推理约 1-2s/页，
    预算内不触发外层解析超时；超预算由调用方如实标 ok_truncated。"""
    import fitz  # PyMuPDF

    parts: list[str] = []
    chunks: List[dict] = []
    pages_done = 0
    hit_budget = False
    started = time.monotonic()
    try:
        doc = fitz.open(str(p))
    except Exception:  # noqa: BLE001
        return "", [], 0, False
    try:
        n = min(total_pages, doc.page_count)
        for i in range(n):
            if pages_done >= ocr.OCR_MAX_PAGES or (time.monotonic() - started) > ocr.OCR_TIME_BUDGET_SECONDS:
                hit_budget = True
                break
            t = ocr.ocr_pdf_page(doc.load_page(i))
            pages_done = i + 1
            if t:
                parts.append(t)
                chunks.append({"text": t, "page_no": i + 1, "slide_no": 0})
            if len("\n".join(parts)) >= MAX_TEXT_CHARS:
                hit_budget = True
                break
    finally:
        doc.close()
    text = unicodedata.normalize("NFKC", "\n".join(parts))[:MAX_TEXT_CHARS].strip()
    if text:
        text = f"【OCR 识别（扫描件 PDF，已处理 {pages_done}/{total_pages} 页）】\n" + text
    return text, chunks, pages_done, hit_budget


def _read_docx(p: Path) -> str:
    """读 Word 正文 + 表格，增量到 MAX_TEXT_CHARS 即停（与 pdf/pptx 一致，超大文档不读爆）。"""
    import docx  # python-docx

    d = docx.Document(str(p))
    parts: list[str] = []
    total = 0
    for para in d.paragraphs:
        parts.append(para.text)
        total += len(para.text)
        if total >= MAX_TEXT_CHARS:
            return "\n".join(parts)
    # 表格文本
    for table in d.tables:
        for row in table.rows:
            line = "\t".join(cell.text for cell in row.cells)
            parts.append(line)
            total += len(line)
        if total >= MAX_TEXT_CHARS:
            break
    return "\n".join(parts)


def _read_pptx(p: Path) -> ParseResult:
    """抽 PPTX 全部文本框 + 演讲者备注，跳过嵌入图片/视频（python-pptx 不加载媒体二进制）。
    按【幻灯片】分块溯源(slide_no);增量到 MAX_TEXT_CHARS 即停，超大 PPTX 也只读够用的文本。"""
    from pptx import Presentation

    prs = Presentation(str(p))
    parts: list[str] = []
    chunks: List[dict] = []
    total = 0
    for sidx, slide in enumerate(prs.slides, start=1):
        slide_lines: list[str] = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    line = "".join(run.text for run in para.runs)
                    if line:
                        slide_lines.append(line)
        # 演讲者备注（常含关键说明，旧逻辑漏抽）
        if slide.has_notes_slide:
            ntf = slide.notes_slide.notes_text_frame
            if ntf is not None and (ntf.text or "").strip():
                slide_lines.append("【备注】" + ntf.text.strip())
        if slide_lines:
            st = "\n".join(slide_lines)
            parts.append(st)
            chunks.append({"text": st, "page_no": 0, "slide_no": sidx})
            total += len(st)
        if total >= MAX_TEXT_CHARS:
            break
    text = unicodedata.normalize("NFKC", "\n".join(parts))[:MAX_TEXT_CHARS].strip()
    if not text:
        return ParseResult(status="empty")
    return ParseResult(status="ok", text=text, chunks=chunks)


def _read_xlsx(p: Path) -> str:
    """轻量读取 xlsx 文本，不引入 openpyxl。公式计算值依赖文件内缓存。"""
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    parts: list[str] = []
    with zipfile.ZipFile(p) as zf:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root.findall("a:si", ns):
                texts = [t.text or "" for t in si.findall(".//a:t", ns)]
                shared.append("".join(texts))

        sheet_names = sorted(
            name for name in zf.namelist()
            if re.match(r"xl/worksheets/sheet\d+\.xml$", name)
        )
        total = 0
        for sheet_name in sheet_names:
            root = ET.fromstring(zf.read(sheet_name))
            rows: list[str] = []
            for row in root.findall(".//a:row", ns):
                cells: list[str] = []
                for c in row.findall("a:c", ns):
                    value = ""
                    cell_type = c.attrib.get("t")
                    v = c.find("a:v", ns)
                    inline = c.find("a:is", ns)
                    if cell_type == "s" and v is not None and v.text:
                        idx = int(v.text)
                        value = shared[idx] if 0 <= idx < len(shared) else ""
                    elif inline is not None:
                        value = "".join(t.text or "" for t in inline.findall(".//a:t", ns))
                    elif v is not None and v.text:
                        value = v.text
                    if value:
                        cells.append(value)
                if cells:
                    line = "\t".join(cells)
                    rows.append(line)
                    total += len(line)
                    if total >= MAX_TEXT_CHARS:
                        break  # 增量够用即停，不再读本表后续行
            if rows:
                parts.append(f"【{Path(sheet_name).stem}】\n" + "\n".join(rows))
            if total >= MAX_TEXT_CHARS:
                break  # 已够用，不再解析后续 sheet（含其 DOM）
    return "\n\n".join(parts)


def _read_image(p: Path) -> ParseResult:
    """图片：本地 OCR 提文字（规划条件截图/扫描页/PPT 导出图是设计院常见材料）。
    识别到文字 → ok，正文=登记头+OCR 文字（可进全文索引）；
    OCR 不可用 → metadata_only(needs_ocr)；OCR 跑了但无文字（照片/效果图） → 元数据登记（如实说明）。"""
    st = p.stat()
    head = f"图片资产：{p.name}\n格式：{p.suffix.lower().lstrip('.')}\n大小：{st.st_size} bytes"
    if not ocr.available():
        return ParseResult(
            status="metadata_only", reason="needs_ocr",
            text=head + "\n说明：该文件已登记为项目图片资产；OCR 组件不可用，未提取文字（不伪造）。",
        )
    text = ocr.ocr_image(str(p))
    if not text:
        # OCR 真跑了但没识别出文字（纯图像/照片/效果图）——如实登记，不算 needs_ocr
        return ParseResult(
            status="ok",
            text=head + "\n说明：已做 OCR，未检测到文字内容（图像类资产），登记元数据。",
        )
    body = unicodedata.normalize("NFKC", text)[:MAX_TEXT_CHARS].strip()
    return ParseResult(status="ok", text=f"{head}\n【OCR 识别文字】\n{body}"[:MAX_TEXT_CHARS])
