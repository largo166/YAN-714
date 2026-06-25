"""DeepSeek（OpenAI 兼容）对话客户端。

约定:未配置 key → 抛 NotConfigured；调用失败 → 抛 LLMError。
绝不返回伪造内容。
"""
from __future__ import annotations

from typing import List, Optional

import httpx


class NotConfigured(Exception):
    """未配置 API Key。"""


class LLMError(Exception):
    """调用 LLM 失败。"""


# 文风约束（仅用于「自由文本/判断类」prose 输出：对话、研判、方案评审等）。
# ROM-AI 的声音 = 建筑项目「判断卡」，不是通用 AI 说明书。
# 红线：绝不注入结构化抽取/JSON-mode 调用（任务书认知、元数据推断、PPT/会议 json），
# 那些需要严格字段输出，文风会污染。需要时由调用点显式拼入，不在 chat_completion 里全局塞。
PROSE_STYLE = (
    "你是懂建筑设计前期工作的搭档，输出要像「项目桌面上的判断卡」，不是 AI 报告。务必遵守：\n"
    "1. 第一句直接给核心判断，不要铺垫。禁止用：基于提供的材料 / 我认为 / 总体认知如下 / "
    "需要进一步明确 / 无法完全具体化 / 可作为重要参考 / 后续可进一步深化。\n"
    "2. 工作备忘腔，不是报告腔。判断明确、能推进；不写方案文本初稿那种长句。\n"
    "3. 每段只讲一个意思，1-3 行；多用要点，不堆连续长段落。\n"
    "4. 每次输出要有推进感：不只说『是什么』，要给『下一步做什么』。\n"
    "5. 不确定就用短标记：『资料缺口：未见地块面积/容积率/业态比例』，不要写一长段免责。\n"
    "6. 敢下设计判断：该说『这个方向目前站不住，因为…』『这里还只是口号，没转成空间/材料策略』"
    "『这里已有依据』『这里还只是推测』，不要全是中性废话。\n"
    "7. 推荐用语：核心判断： / 关键矛盾： / 关键依据： / 资料缺口： / 下一步：。\n"
    "8. 不要把 markdown 噪音、prompt 标记、模型参数暴露给用户。"
)


def style_system_message() -> dict:
    """prose 调用点显式拼入的文风 system 消息。"""
    return {"role": "system", "content": PROSE_STYLE}


def chat_completion(
    messages: List[dict],
    *,
    api_key: str,
    base_url: str,
    model: str,
    timeout: float = 60.0,
    response_format: Optional[dict] = None,
) -> str:
    if not api_key:
        raise NotConfigured("AI 引擎未配置，请先在设置中配置 API Key")

    url = base_url.rstrip("/") + "/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": model, "messages": messages, "stream": False}
    if response_format is not None:
        payload["response_format"] = response_format  # DeepSeek 支持 {"type":"json_object"} 强制 JSON
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=headers, json=payload)
        if resp.status_code != 200:
            raise LLMError(f"DeepSeek 返回 {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except NotConfigured:
        raise
    except (httpx.HTTPError, KeyError, ValueError) as e:
        raise LLMError(f"调用 DeepSeek 失败: {e}") from e


def build_context_prompt(hits: List[dict]) -> Optional[str]:
    """把知识库检索片段拼成 system 上下文。"""
    if not hits:
        return None
    lines = ["以下是知识库检索到的相关资料，请基于这些资料回答用户问题，并在适当处引用来源标题：", ""]
    for i, h in enumerate(hits, 1):
        lines.append(f"[{i}] 《{h['title']}》: {h['snippet']}")
    return "\n".join(lines)
