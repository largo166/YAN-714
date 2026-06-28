"""AI 生图(APImart OpenAI 兼容,异步 task 制)。

约定(规则 3/10):
- key 只从 config(本机 .env)读,绝不入库/进卡/同步。
- 未配 key → status=not_configured,绝不返回伪造图。
- 失败/超时 → status=error,如实报错。
- 成功 → 下载图片字节交给调用方(由 skills 存进项目 uploads,不依赖 24h 过期 URL)。

链路:POST {base}/v1/images/generations → 拿 task_id → 轮询 GET {base}/v1/tasks/{id}
到 completed → result.images[0].url[0]（url 是数组）→ 下载字节。
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

import httpx

from .config import settings

# 卡上可选模型(默认 OpenAI;Gemini 更快更便宜)。两者同端点、同异步制,参数分派见下。
ALLOWED_MODELS = {"gpt-image-1-official", "gpt-image-1.5-official", "gpt-image-2", "gemini-3-pro-image-preview"}
DEFAULT_MODEL = "gpt-image-1-official"  # 兜底默认(强制合法生图模型,杜绝外部脏 env 如 gpt-5 污染)
# 确实吃参考图(image_urls)做图生图的模型。带参考图却选了别的 → 切到 gemini 编辑模型,绝不静默退 t2i。
IMG2IMG_MODELS = {"gemini-3-pro-image-preview", "gpt-image-2"}
NOT_CONFIGURED_MSG = "AI 生图未配置：请在 backend/.env 设置 IMAGE_API_KEY（不会伪造图片）。"


@dataclass
class ImageResult:
    status: str            # ok | not_configured | error
    model: str = ""
    image_url: str = ""    # 上游临时 URL(供溯源;真正落地由调用方下载存本机)
    image_bytes: Optional[bytes] = None
    mime: str = "image/png"
    message: str = ""


def is_configured() -> bool:
    return bool(settings.image_api_key)


def _params_for(model: str, prompt: str) -> dict:
    """按模型分派参数:gpt-image 用 size 比例 + quality;gemini 用 resolution。"""
    body = {"model": model, "prompt": prompt, "n": 1}
    if model.startswith("gpt-image"):
        body.update({"size": "3:2", "quality": "high"})  # 横构图,效果图常用
    else:  # gemini
        body.update({"size": "16:9", "resolution": "1K"})
    return body


def generate_image(
    prompt: str, model: str = "", *, image_urls: Optional[list] = None, poll_timeout: float = 180.0
) -> ImageResult:
    if not is_configured():
        return ImageResult(status="not_configured", message=NOT_CONFIGURED_MSG)
    # 收口到合法生图模型:用户选的优先,否则 settings 默认,再否则 DEFAULT_MODEL(防外部脏 env 如 gpt-5)
    if model not in ALLOWED_MODELS:
        model = settings.image_model if settings.image_model in ALLOWED_MODELS else DEFAULT_MODEL
    # 图生图:带了参考图却选了不吃参考图的模型 → 切到能吃的(gemini 编辑模型),不静默退化成纯文生图。
    if image_urls and model not in IMG2IMG_MODELS:
        model = "gemini-3-pro-image-preview"
    base = settings.image_base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {settings.image_api_key}", "Content-Type": "application/json"}

    body = _params_for(model, prompt)
    if image_urls:
        body["image_urls"] = list(image_urls)[:16]  # APImart 上限 16 张

    try:
        with httpx.Client(timeout=60.0) as client:
            # 1) 提交
            r = client.post(f"{base}/v1/images/generations", headers=headers, json=body)
            if r.status_code != 200:
                return ImageResult(status="error", model=model, message=f"提交失败 {r.status_code}: {r.text[:200]}")
            data = (r.json() or {}).get("data") or []
            task_id = data[0].get("task_id") if data and isinstance(data[0], dict) else None
            if not task_id:
                return ImageResult(status="error", model=model, message=f"未返回 task_id: {str(r.text)[:200]}")

            # 2) 轮询到终态
            deadline = time.monotonic() + poll_timeout
            img_url = ""
            while time.monotonic() < deadline:
                time.sleep(6)
                tr = client.get(f"{base}/v1/tasks/{task_id}", headers=headers)
                if tr.status_code != 200:
                    continue
                d = (tr.json() or {}).get("data") or {}
                st = d.get("status")
                if st in ("completed", "succeeded", "success"):
                    imgs = ((d.get("result") or {}).get("images") or [])
                    if imgs:
                        u = imgs[0].get("url")
                        img_url = u[0] if isinstance(u, list) and u else (u if isinstance(u, str) else "")
                    break
                if st == "failed":
                    err = (d.get("error") or {}).get("message", "生图任务失败")
                    return ImageResult(status="error", model=model, message=str(err)[:300])
            if not img_url:
                return ImageResult(status="error", model=model, message="生图超时或未返回图片地址。")

            # 3) 下载图片字节(供存本机,避免 24h 过期)
            ir = client.get(img_url, timeout=120.0)
            if ir.status_code != 200:
                return ImageResult(status="error", model=model, image_url=img_url, message="图片下载失败。")
            mime = ir.headers.get("content-type", "image/png").split(";")[0]
            return ImageResult(status="ok", model=model, image_url=img_url, image_bytes=ir.content, mime=mime)
    except httpx.HTTPError as e:
        return ImageResult(status="error", model=model, message=f"生图调用失败: {e}")
