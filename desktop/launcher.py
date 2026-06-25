"""ROM-AI 桌面壳（PyWebview）。

双击 exe → 本机起 FastAPI（后台线程，空闲端口）→ 等健康检查 → PyWebview 开本地窗口
（同源托管前端 dist，无需第二个端口/CORS）→ 关窗时停后端、进程退出。

数据落点：可写目录（冻结态 %LOCALAPPDATA%\\ROM-AI，开发态 backend/data，均可被 ROMAI_DATA_DIR 覆盖）。
冒烟模式：设 ROMAI_SMOKE=1 → 只起后端、写端口、不开窗（供自动化测试 curl 验证）。
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import time
import traceback
from pathlib import Path


def _setup_path() -> None:
    """开发态把 backend/ 加进 sys.path；冻结态(PyInstaller)模块已打包，无需处理。"""
    if getattr(sys, "frozen", False):
        return
    backend = Path(__file__).resolve().parent.parent / "backend"
    if backend.is_dir() and str(backend) not in sys.path:
        sys.path.insert(0, str(backend))


def _free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])
    finally:
        s.close()


def main() -> None:
    _setup_path()

    # 先解析可写数据目录（config 已按 冻结/开发/ROMAI_DATA_DIR 处理）
    from app.config import DATA_DIR

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    logf = DATA_DIR / "launcher.log"

    def log(msg: str) -> None:
        try:
            with open(logf, "a", encoding="utf-8") as f:
                f.write(msg + "\n")
        except OSError:
            pass
        print(msg, flush=True)

    port = _free_port()
    try:
        (DATA_DIR / ".port").write_text(str(port), encoding="utf-8")
    except OSError:
        pass
    log(f"[launcher] frozen={getattr(sys, 'frozen', False)} data_dir={DATA_DIR} port={port}")

    # 起后端（后台线程；uvicorn 在非主线程会跳过信号处理，正常）
    import uvicorn

    from app.main import app

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()

    # 等健康检查
    import urllib.request

    ready = False
    for _ in range(150):  # 最多 ~30s
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as r:
                if r.status == 200:
                    ready = True
                    break
        except Exception:  # noqa: BLE001  起步阶段连接失败属正常
            time.sleep(0.2)
    log(f"[launcher] backend_ready={ready}")
    if not ready:
        log("[launcher] 后端启动失败，退出")
        server.should_exit = True
        raise SystemExit(1)

    # 冒烟模式：不开窗，保持存活供自动化测试 curl，然后退出
    if os.environ.get("ROMAI_SMOKE"):
        secs = float(os.environ.get("ROMAI_SMOKE_SECONDS", "60"))
        log(f"[launcher] SMOKE 模式：后端就绪，跳过开窗，保持 {secs:.0f}s")
        print(f"SMOKE_READY port={port}", flush=True)
        try:
            time.sleep(secs)
        finally:
            server.should_exit = True
        return

    # 桌面窗口（PyWebview，Windows 用 WebView2 运行时）
    try:
        import webview

        log("[launcher] 打开窗口")
        webview.create_window("ROM-AI 工作台", f"http://127.0.0.1:{port}", width=1360, height=900)
        webview.start()  # 阻塞至窗口关闭
        log("[launcher] 窗口已关闭")
    except Exception as e:  # noqa: BLE001
        log(f"[launcher] 开窗失败：{e}\n{traceback.format_exc()}")
    finally:
        server.should_exit = True
        log("[launcher] 后端停止，退出")


if __name__ == "__main__":
    main()
