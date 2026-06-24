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
