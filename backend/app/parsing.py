"""文档文本抽取（Phase 4D）。

分级返回 parse_status，绝不伪造内容（纲要规则 3/4）：
- ok            抽到非空文本
- empty         支持的格式但抽出空串（加密/损坏/纯扫描件）
- unsupported   非 5 类支持格式
- failed        解析过程异常（捕获，不阻塞其它文件）
- metadata_only 文件超大（>MAX_PARSE_BYTES），降级为只登记元数据，不强制全文解析
                （投标资料包/大 PDF/PPTX 不卡死导入；content_text 写登记说明，靠 title/type/resource 入库可检索）

支持格式：.txt .md（内建）/ .pdf（pypdf）/ .docx（python-docx）/ .pptx（python-pptx）/
.xlsx（轻量 XML 抽取）/ 图片资产元数据（png/jpg/jpeg，不做 OCR）。
超大文件不强制全文解析（降级 metadata_only）；解析异常分级返回 failed，不阻断其它文件。
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET

SUPPORTED_EXTS = {".txt", ".md", ".pdf", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg"}

# 抽取后截断上限（防超大文本撑爆 DB / 上下文）
MAX_TEXT_CHARS = 200_000

# 超大文件阈值：超过则降级 metadata_only，不读全文（避免投标资料包/大 PDF 卡死导入）。
# 图片资产本就只登记元数据、不受此限。
MAX_PARSE_BYTES = 20 * 1024 * 1024  # 20 MB


@dataclass
class ParseResult:
    status: str  # ok / empty / unsupported / failed / metadata_only
    text: str = ""
    error: str = ""


def is_supported(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTS


def parse_file(path: str | Path) -> ParseResult:
    """抽取文本。异常一律捕获为 failed，不抛出（不阻塞批量）。
    超大文件（>MAX_PARSE_BYTES）的全文类格式降级 metadata_only，不读全文。"""
    p = Path(path)
    ext = p.suffix.lower()
    if ext not in SUPPORTED_EXTS:
        return ParseResult(status="unsupported")

    # 大文件降级：图片资产只登记元数据、不受限；其余全文类超阈值 → metadata_only，不读全文
    if ext not in (".png", ".jpg", ".jpeg"):
        try:
            size = p.stat().st_size
        except OSError:
            size = 0
        if size > MAX_PARSE_BYTES:
            mb = size / (1024 * 1024)
            note = (
                f"{p.name}\n类型：{ext.lstrip('.')}\n大小：{mb:.1f} MB\n"
                f"说明：文件超过 {MAX_PARSE_BYTES // (1024 * 1024)}MB，已登记为受管资料（仅元数据），"
                f"未做全文解析；可在数据基地按需查看原件或后续补充摘要。"
            )
            return ParseResult(status="metadata_only", text=note)

    try:
        if ext in (".txt", ".md"):
            text = _read_text(p)
        elif ext == ".pdf":
            text = _read_pdf(p)
        elif ext == ".docx":
            text = _read_docx(p)
        elif ext == ".pptx":
            text = _read_pptx(p)
        elif ext == ".xlsx":
            text = _read_xlsx(p)
        elif ext in (".png", ".jpg", ".jpeg"):
            text = _read_image_asset(p)
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
                    rows.append("\t".join(cells))
            if rows:
                parts.append(f"【{Path(sheet_name).stem}】\n" + "\n".join(rows))
    return "\n\n".join(parts)


def _read_image_asset(p: Path) -> str:
    st = p.stat()
    return f"图片资产：{p.name}\n格式：{p.suffix.lower().lstrip('.')}\n大小：{st.st_size} bytes\n说明：该文件已登记为项目图片资产；当前未做 OCR 或图像内容识别。"
