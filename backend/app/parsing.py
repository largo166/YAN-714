"""文档文本抽取（内容层提取，**不按文件大小降级**）。

核心原则（用户指令 2026-06，替换旧的「>20MB 即降级」逻辑）：
- 文件大小【不】决定读不读正文。所有支持格式都尝试提取「内容层」（文字层/文本框/正文/表格）。
- 决策维度只剩两个：「文件类型」决定怎么读、「有没有内容层」决定读不读得到。大小完全消失。
- 只取内容层、跳过媒体：PDF 只抽文字层（pypdf，不渲染图像、不 OCR）；PPTX 抽文本框+演讲者备注
  （跳过嵌入图片/视频）；Word/MD/txt 读正文；xlsx 抽表格；图片登记元数据。
  → 实测 394MB PDF 文字层 1.7s、588MB PPTX 0.5s 即读到正文，跟总大小无关（重的是图，不是字）。
- 性能保护用【超时】而非【大小预判】：内容层提取本身就快；个别异常慢的文件命中提取超时
  → extraction_timeout，标记待人工，而不是按大小预先放弃。

分级返回 parse_status，绝不伪造内容（纲要规则 3/4）：
- ok                抽到非空正文（任意大小）。
- metadata_only     文件有效、但【真的提不出内容】：扫描件无文字层(需OCR) / 加密 / 结构损坏。
                    如实登记元数据 + 原因(reason)，不伪造正文；仍可靠 文件名/类型 入库检索。
- extraction_timeout 内容层提取超过 PARSE_TIMEOUT_SECONDS（异常慢的个例），标记待人工，不按大小放弃。
- empty             支持格式但文档本身无文本（空 txt/docx 等）。
- unsupported       非支持格式。
- failed            提取过程未预期异常（捕获分级，不阻断批量里的其它文件）。

支持格式：.txt .md（内建）/ .pdf（pypdf 文字层）/ .docx（python-docx）/ .pptx（python-pptx 文本框+备注）/
.xlsx（轻量 XML 抽取）/ 图片资产元数据（png/jpg/jpeg，不做 OCR）。
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET

SUPPORTED_EXTS = {".txt", ".md", ".pdf", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg"}

# 抽取后截断上限（防超大文本撑爆 DB / 上下文）。提取器按页/片增量累积到此即停，
# 这样超大文档也只读到「够用的正文」就收手，跟文件总大小无关。
MAX_TEXT_CHARS = 200_000

# 提取超时（秒）：内容层提取本就快；个别异常慢的文件命中此超时 → extraction_timeout，
# 标记待人工，而不是用「大小阈值」预先放弃。这是唯一的性能保护，不再有 MB 阈值。
PARSE_TIMEOUT_SECONDS = 30


@dataclass
class ParseResult:
    status: str  # ok / metadata_only / extraction_timeout / empty / unsupported / failed
    text: str = ""
    error: str = ""
    reason: str = ""  # metadata_only 的细分：needs_ocr / encrypted / unreadable；超时为 timeout


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
            return ParseResult(status="ok", text=_read_image_asset(p))  # 图片资产登记（保持原行为）
        if ext in (".txt", ".md"):
            text = _read_text(p)
        elif ext == ".docx":
            text = _read_docx(p)
        elif ext == ".pptx":
            text = _read_pptx(p)
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
    """只抽 PDF 文字层（不渲染图像、不 OCR）——故跟文件总大小无关，秒级。
    分档：结构损坏→metadata_only(unreadable)；加密→metadata_only(encrypted)；
    有效但无文字层(扫描件)→metadata_only(needs_ocr)；有文字层→ok。
    增量累积到 MAX_TEXT_CHARS 即停，超大 PDF 不白读后续页。"""
    from pypdf import PdfReader

    try:
        reader = PdfReader(str(p))
    except Exception as e:  # noqa: BLE001  结构损坏/非法 PDF
        return ParseResult(
            status="metadata_only", reason="unreadable",
            text=_register_note(p, ".pdf", "无法读取",
                                f"PDF 结构无法解析（{type(e).__name__}），已登记元数据、未提取正文（不伪造）。"),
        )

    if reader.is_encrypted:
        try:
            unlocked = reader.decrypt("")  # 试空密码
        except Exception:  # noqa: BLE001
            unlocked = 0
        if not unlocked:
            return ParseResult(
                status="metadata_only", reason="encrypted",
                text=_register_note(p, ".pdf", "加密",
                                    "PDF 已加密、无法提取正文，已登记元数据（不伪造）。"),
            )

    parts: list[str] = []
    chars = 0
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:  # noqa: BLE001  单页异常跳过，不放弃整篇
            t = ""
        if t:
            parts.append(t)
            chars += len(t)
            if chars >= MAX_TEXT_CHARS:
                break

    text = unicodedata.normalize("NFKC", "\n".join(parts)).strip()
    if not text:
        # 有效 PDF 但无文字层 → 扫描件/图片型，需 OCR（如实标记，不伪造正文）
        return ParseResult(
            status="metadata_only", reason="needs_ocr",
            text=_register_note(p, ".pdf", "需OCR",
                                "未检测到文字层（可能为扫描件/图片型 PDF），需 OCR 才能提取正文；"
                                "已登记元数据，不伪造正文。"),
        )
    return ParseResult(status="ok", text=text[:MAX_TEXT_CHARS])


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


def _read_pptx(p: Path) -> str:
    """抽 PPTX 全部文本框 + 演讲者备注，跳过嵌入图片/视频（python-pptx 不加载媒体二进制）。
    增量到 MAX_TEXT_CHARS 即停，超大 PPTX 也只读够用的文本。"""
    from pptx import Presentation

    prs = Presentation(str(p))
    parts: list[str] = []
    total = 0
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    line = "".join(run.text for run in para.runs)
                    if line:
                        parts.append(line)
                        total += len(line)
        # 演讲者备注（常含关键说明，旧逻辑漏抽）
        if slide.has_notes_slide:
            ntf = slide.notes_slide.notes_text_frame
            if ntf is not None and (ntf.text or "").strip():
                note = ntf.text.strip()
                parts.append("【备注】" + note)
                total += len(note)
        if total >= MAX_TEXT_CHARS:
            break
    return "\n".join(parts)


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


def _read_image_asset(p: Path) -> str:
    st = p.stat()
    return (
        f"图片资产：{p.name}\n格式：{p.suffix.lower().lstrip('.')}\n大小：{st.st_size} bytes\n"
        f"说明：该文件已登记为项目图片资产；当前未做 OCR 或图像内容识别。"
    )
