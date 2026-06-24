"""AI 研判（Phase 4D）：5 任务 Prompt 模板内置 + RAG 装配 + 结构化出处 + Markdown 导出。

纲要红线：
- 判断类输出必须基于真实材料、带出处（RAG）；结论与出处分离存储。
- 双零材料（本项目无可用解析文件 且 知识库无命中）→ no_material，不调模型、不伪造。
- 未配 key → not_configured（由路由层判断），不调模型。
- 段落级精确锚点留 P6；本轮为文档级 sources（doc_id/file_id + 片段）。
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import List, Optional

from sqlalchemy.orm import Session

from . import models, retrieval

# 5 个研判任务（task -> 中文名 + 指令）
TASKS = {
    "overview": (
        "项目总览分析",
        "请基于材料给出该建筑设计项目的总体认知：项目定位、规模与业态、关键约束、设计目标。",
    ),
    "difficulty": (
        "设计难点分析",
        "请基于材料识别本项目的设计难点与技术重点，逐条说明难点、成因与可能的应对方向。",
    ),
    "demand": (
        "甲方诉求分析",
        "请基于材料梳理甲方的显性与隐性诉求，区分硬性要求与倾向性偏好，并标注依据。",
    ),
    "plan": (
        "设计推进计划",
        "请基于材料给出阶段化的设计推进计划：关键里程碑、交付物、风险点与建议时序。",
    ),
    "report": (
        "汇报提纲",
        "请基于材料拟定一份面向甲方的汇报提纲：结构化要点、每节核心论据与建议图示。",
    ),
}


@dataclass
class Source:
    kind: str       # "knowledge" | "project_file"
    ref_id: int
    title: str
    snippet: str
    engine: str     # "fts5" | "like" | "file"


@dataclass
class Material:
    """装配结果：喂模型的上下文文本 + 结构化出处。"""

    context: str
    sources: List[Source]

    @property
    def empty(self) -> bool:
        return not self.sources


def _file_snippet(text: str, width: int = 200) -> str:
    t = (text or "").strip().replace("\n", " ")
    return (t[:width] + "…") if len(t) > width else t


def gather_material(db: Session, project_id: int, query: str, *, top_k: int = 5) -> Material:
    """三路取材：本项目已确认结构化认知(最高优先) + 已解析文件 + 全局知识库检索。结构化为 sources。"""
    sources: List[Source] = []
    lines: List[str] = []

    # 路0：本项目结构化认知——只注入 status=confirmed 的字段（规格 1.5），让推演基于"已审定认知"
    cogs = (
        db.query(models.ProjectCognition)
        .filter(models.ProjectCognition.project_id == project_id)
        .order_by(models.ProjectCognition.updated_at.desc())
        .all()
    )
    cog_block: List[str] = []
    import json as _json
    for c in cogs:
        try:
            raw = _json.loads(c.fields_json) if c.fields_json else []
        except (ValueError, TypeError):
            raw = []
        fields = raw if isinstance(raw, list) else []
        # 只取已确认字段（draft/empty 不注入，规格 1.5）
        confirmed = [f for f in fields if isinstance(f, dict) and f.get("status") == "confirmed" and f.get("value") not in (None, "", [], {})]
        if not confirmed:
            continue
        label = c.module_label or c.module
        cog_block.append(f"【已确认认知·{label}】" + (f" 摘要：{c.summary_md}" if c.summary_md else ""))
        for f in confirmed:
            v = f.get("value")
            vs = "、".join(map(str, v)) if isinstance(v, list) else str(v)
            cog_block.append(f"  - {f.get('label', f.get('key'))}：{vs}")
        sources.append(
            Source(kind="cognition", ref_id=c.id, title=f"{label}结构化认知",
                   snippet=(c.summary_md or "; ".join(f"{f.get('label')}:{f.get('value')}" for f in confirmed[:3]))[:200],
                   engine="cognition")
        )

    # 路1：本项目已解析文件（取前若干，作为项目现场材料）
    # ok=完整正文；ok_truncated=截断但仍是真实正文（停在第N页），二者都可作材料；
    # metadata_only/extraction_timeout 是登记说明、非正文，绝不注入（不伪造，纲要规则3/4）。
    files = (
        db.query(models.ProjectFile)
        .filter(
            models.ProjectFile.project_id == project_id,
            models.ProjectFile.status == "active",
            models.ProjectFile.parse_status.in_(["ok", "ok_truncated"]),
        )
        .order_by(models.ProjectFile.created_at.desc())
        .limit(top_k)
        .all()
    )
    for f in files:
        if not f.content_text.strip():
            continue
        # ok_truncated：正文被截断,如实在标题标注「(正文截断,停在第N页/共M页)」,
        # 让 LLM 知道这不是全文,不据残缺正文当完整材料下判断（不伪造）。
        title = f.filename
        if f.parse_status == "ok_truncated" and f.total_pages:
            title = f"{f.filename}（正文截断·读到第{f.truncated_at_page}页/共{f.total_pages}页）"
        sources.append(
            Source(kind="project_file", ref_id=f.id, title=title,
                   snippet=_file_snippet(f.content_text), engine="file")
        )

    # 路2：全局知识库检索
    hits = retrieval.search(db, query, top_k=top_k)
    for h in hits:
        sources.append(
            Source(kind="knowledge", ref_id=h.document_id, title=h.title,
                   snippet=h.snippet, engine=h.engine)
        )

    # 装配喂模型的上下文（已确认认知置顶，带编号引用）
    if sources:
        if cog_block:
            lines.append("以下是本项目【已确认的结构化认知】，请优先据此分析：")
            lines.extend(cog_block)
            lines.append("")
        lines.append("以下是检索到的项目材料与知识库资料，请仅基于这些材料分析，并在结论中引用来源标题：")
        lines.append("")
        for i, s in enumerate(sources, 1):
            tag = {"cognition": "已确认认知", "project_file": "项目文件"}.get(s.kind, "知识库")
            lines.append(f"[{i}]（{tag}）《{s.title}》: {s.snippet}")
    return Material(context="\n".join(lines), sources=sources)


def build_messages(task: str, project_name: str, material: Material) -> List[dict]:
    """组装 LLM messages（system 上下文 + user 指令）。"""
    _, instruction = TASKS[task]
    msgs: List[dict] = []
    if material.context:
        msgs.append({"role": "system", "content": material.context})
    msgs.append({
        "role": "user",
        "content": f"项目：{project_name}\n\n任务：{instruction}\n\n要求：基于上述材料，条理清晰、可执行；如材料不足请明确指出，不要臆测。",
    })
    return msgs


def sources_as_dicts(sources: List[Source]) -> List[dict]:
    return [asdict(s) for s in sources]


def render_markdown(task: str, project_name: str, content: str, sources: List[dict],
                    status: str, created_at: Optional[str] = None) -> str:
    """把一次研判渲染为可导出的 Markdown（简单格式化，不强制 RAG）。"""
    title = TASKS.get(task, (task, ""))[0]
    out = [f"# {project_name} · {title}", ""]
    if created_at:
        out.append(f"> 生成时间：{created_at}　状态：{status}")
        out.append("")
    if status == "not_configured":
        out.append("> ⚠️ AI 引擎未配置，本研判未生成。请先在设置中配置 API Key。")
        return "\n".join(out)
    if status == "no_material":
        out.append("> ⚠️ 暂无可用材料（项目无可解析文件且知识库无命中），未生成研判。请先上传资料或补充知识库。")
        return "\n".join(out)
    out.append(content or "")
    if sources:
        out.append("")
        out.append("## 出处")
        for i, s in enumerate(sources, 1):
            tag = "项目文件" if s.get("kind") == "project_file" else "知识库"
            out.append(f"{i}. （{tag}）《{s.get('title', '')}》 — {s.get('snippet', '')}")
    return "\n".join(out)
