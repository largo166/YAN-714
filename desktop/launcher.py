"""ROM-AI 桌面壳占位（PyWebview 方向）。

当前阶段：仅占位。
- 不安装 pywebview、不打包、不接旧 Electron 链路。
- 后续方向：本地启动 FastAPI（backend/app/main.py），再用 PyWebview 打开本地 Web UI。

后续启用步骤（届时再实现）：
    pip install pywebview
    # 先起后端，再用 webview.create_window 打开 http://127.0.0.1:8000
    python desktop/launcher.py
"""
from __future__ import annotations


def main() -> None:
    raise SystemExit(
        "桌面壳尚未启用（占位）。当前请用 scripts/dev-backend 与 scripts/dev-frontend 分别启动前后端。"
    )


if __name__ == "__main__":
    main()
