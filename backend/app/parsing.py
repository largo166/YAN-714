"""文档文本抽取（Phase 4D）。

分级返回 parse_status，绝不伪造内容（纲要规则 3/4）：
- ok          抽到非空文本
- empty       支持的格式但抽出空串（加密/损坏/纯扫描件）
- unsupported 非 5 类支持格式
- failed      解析过程异常（捕获，不阻塞其它文件）

支持格式：.txt .md（内建）/ .pdf（pypdf）/ .docx（python-docx）/ .pptx（python-pptx）。
单文件大小上限防 OOM。
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import unicodedata

MAX_FILE_BYTES = 25 * 1024 * 1024  # 25MB（与上传上限一致）
SUPPORTED_EXTS = {".txt", ".md", ".pdf", ".docx", ".pptx"}

# 抽取后截断上限（防超大文本撑爆 DB / 上下文）
MAX_TEXT_CHARS = 200_000


@dataclass
class ParseResult:
    status: str  # ok / empty / unsupported / failed
    text: str = ""
    error: str = ""


def is_supported(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTS


def parse_file(path: str | Path) -> ParseResult:
    """抽取文本。异常一律捕获为 failed，不抛出（不阻塞批量）。"""
    p = Path(path)
    ext = p.suffix.lower()
    if ext not in SUPPORTED_EXTS:
        return ParseResult(status="unsupported")
    try:
        if p.stat().st_size > MAX_FILE_BYTES:
            return ParseResult(status="failed", error="文件超过 25MB 上限")
        if ext in (".txt", ".md"):
            text = _read_text(p)
        elif ext == ".pdf":
            text = _read_pdf(p)
        elif ext == ".docx":
            text = _read_docx(p)
        elif ext == ".pptx":
            text = _read_pptx(p)
        else:  # 理论不达
            return ParseResult(status="unsupported")
    except Exception as e:  # noqa: BLE001  抽取失败不崩、不伪造
        return ParseResult(status="failed", error=f"{type(e).__name__}: {e}"[:500])

    # NFKC 归一化：把兼容/部首区异体字折叠回常规字符
    # （pypdf 对部分 CID PDF 会把「自」抽成 U+2F03 康熙部首，致检索/匹配漏命中）
    text = unicodedata.normalize("NFKC", (text or "")).strip()
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


def _read_pdf(p: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(p))
    parts = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts)


def _read_docx(p: Path) -> str:
    import docx  # python-docx

    d = docx.Document(str(p))
    parts = [para.text for para in d.paragraphs]
    # 表格文本
    for table in d.tables:
        for row in table.rows:
            parts.append("\t".join(cell.text for cell in row.cells))
    return "\n".join(parts)


def _read_pptx(p: Path) -> str:
    from pptx import Presentation

    prs = Presentation(str(p))
    parts = []
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    parts.append("".join(run.text for run in para.runs))
    return "\n".join(parts)
