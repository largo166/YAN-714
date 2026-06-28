"""方案评审检查清单路由（MoA 版）。

使用 MoA Lite 调度器：三位专家（功能/甲方/成本）并行分析，聚合模型整合输出结构化检查清单。

端点：
- POST /api/review-checklist/moa — 触发 MoA 方案评审
- GET /api/review-checklist/{project_id} — 获取项目最新评审结果
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppSetting, Project, ProjectAnalysis, ProjectCognition
from ..moa import run_moa_sync, BUILTIN_MOA_PRESETS, format_reference_summary

# 注意：MoA 版评审挂在 /moa 子路径,与 skills.py 的 GET /api/review-checklist(清单模板)、
# POST /api/projects/{id}/review-precheck(P1-D 单模型预检)是不同端点,互不冲突。
router = APIRouter(prefix="/api/review-checklist", tags=["review-checklist"])


# ═══════════════════════════════════════════════════════════════════
# 辅助函数：构建评审输入材料
# ═══════════════════════════════════════════════════════════════════

def _build_review_input(project_id: int, db: Session) -> tuple[str, str]:
    """从项目数据构建 MoA 评审输入材料。
    
    Returns:
        (user_input, project_context)
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    # 收集认知
    cognitions = db.query(ProjectCognition).filter(
        ProjectCognition.project_id == project_id
    ).all()
    
    cog_texts = []
    for cog in cognitions:
        if cog.module and cog.fields_json:
            cog_texts.append(f"【{cog.module}】\n{cog.fields_json}")
    
    # 项目背景（用现有 Project 字段；无 project_type，改用 description）
    context = f"""项目名称：{project.name}
甲方：{project.client or '未指定'}
项目描述：{project.description or '未指定'}
状态：{project.status}
创建时间：{project.created_at}

已确认认知模块：{len(cognitions)} 个
"""
    
    # 评审材料 = 所有认知 + 项目信息
    user_input = "\n\n---\n\n".join(cog_texts) if cog_texts else "暂无结构化认知数据，请基于项目信息评审。"
    
    return user_input, context


# ═══════════════════════════════════════════════════════════════════
# 端点
# ═══════════════════════════════════════════════════════════════════

@router.post("/moa")
def run_review_moa(project_id: int, db: Session = Depends(get_db)):
    """触发 MoA 方案评审。
    
    流程：
    1. 收集项目认知数据作为评审材料
    2. 调用 MoA 调度器（3位专家 + 聚合模型）
    3. 解析聚合结果（JSON）
    4. 保存到 ProjectAnalysis（task="review_moa"）
    5. 返回结构化检查清单
    
    注意：这是同步阻塞调用（等待全部模型完成），耗时约 15-30 秒。
    """
    # 构建输入
    user_input, project_context = _build_review_input(project_id, db)

    # DeepSeek key 从 AppSetting 读(全 app 约定;moa 不读 os.environ)。未配→三态不伪造。
    cfg = db.get(AppSetting, 1)
    if cfg is None or not cfg.deepseek_api_key:
        raise HTTPException(status_code=400, detail="AI 引擎未配置，请先在设置中配置 DeepSeek API Key")

    # 运行 MoA
    result = run_moa_sync(
        preset_key="review_moa",
        user_input=user_input,
        project_context=project_context,
        response_format={"type": "json_object"},  # 强制 JSON 输出
        api_key=cfg.deepseek_api_key,
        base_url=cfg.deepseek_base_url,
    )
    
    if not result.success:
        raise HTTPException(status_code=500, detail=f"MoA 评审失败: {result.error_message}")
    
    # 解析 JSON 结果
    try:
        checklist = json.loads(result.final_output)
    except json.JSONDecodeError:
        # 解析失败，尝试从原始聚合输出提取
        raise HTTPException(
            status_code=500, 
            detail=f"聚合模型输出解析失败。原始输出:\n{result.aggregation_output[:500]}"
        )
    
    # 保存到 ProjectAnalysis（复用现有表;真实列是 content，无 output_text）
    analysis = ProjectAnalysis(
        project_id=project_id,
        task="review_moa",
        content=result.final_output,        # MoA 聚合 JSON（GET 端点读 content 再 json.loads）
        output_json=result.final_output,    # 同存结构化列，便于后续检索
        model="moa:review_moa",             # 标记成果来源（3×deepseek-chat + deepseek-reasoner）
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    
    # 组装返回
    return {
        "success": True,
        "analysis_id": analysis.id,
        "checklist": checklist,
        "expert_summary": format_reference_summary(result.reference_outputs),
        "cost": {
            "total_tokens": result.total_tokens,
            "total_cost_yuan": result.total_cost_yuan,
            "total_latency_ms": result.total_latency_ms,
        },
        "reference_details": [
            {
                "role": ref.role,
                "model": ref.model_name,
                "status": ref.status,
                "output": ref.output if ref.status == "success" else ref.error,
                "latency_ms": ref.latency_ms,
                "cost_yuan": ref.cost_yuan,
            }
            for ref in result.reference_outputs
        ],
    }


@router.get("/{project_id}")
def get_review_checklist(project_id: int, db: Session = Depends(get_db)):
    """获取项目最新的 MoA 方案评审结果。"""
    # 查找最新 review_moa 分析
    analysis = db.query(ProjectAnalysis).filter(
        ProjectAnalysis.project_id == project_id,
        ProjectAnalysis.task == "review_moa"
    ).order_by(ProjectAnalysis.created_at.desc()).first()
    
    if not analysis:
        return {
            "success": False,
            "message": "该项目尚未进行 MoA 方案评审",
            "checklist": None,
        }
    
    try:
        checklist = json.loads(analysis.content)
    except json.JSONDecodeError:
        checklist = {"parse_error": True, "raw": analysis.content}
    
    return {
        "success": True,
        "analysis_id": analysis.id,
        "created_at": analysis.created_at,
        "checklist": checklist,
    }


@router.get("/{project_id}/history")
def get_review_history(project_id: int, limit: int = 5, db: Session = Depends(get_db)):
    """获取项目评审历史（多次评审记录）。"""
    analyses = db.query(ProjectAnalysis).filter(
        ProjectAnalysis.project_id == project_id,
        ProjectAnalysis.task == "review_moa"
    ).order_by(ProjectAnalysis.created_at.desc()).limit(limit).all()
    
    return {
        "count": len(analyses),
        "items": [
            {
                "id": a.id,
                "created_at": a.created_at,
                "checklist_preview": json.loads(a.content).get("overall_score", "N/A") if a.content else "N/A",
            }
            for a in analyses
        ]
    }
