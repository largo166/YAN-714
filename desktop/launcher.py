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


def _msgbox(title: str, text: str) -> None:
    """无控制台窗口化 exe 出错时,给用户一个可见提示(否则双击像没反应)。"""
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, text, title, 0x10)  # MB_ICONERROR
    except Exception:  # noqa: BLE001
        pass


def _webview2_installed() -> bool:
    """检测 WebView2 Evergreen 运行时是否已装(读 EdgeUpdate 客户端注册表 pv)。"""
    try:
        import winreg
    except ImportError:
        return True  # 非 Windows 不拦
    guid = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"  # WebView2 Runtime 客户端 GUID
    candidates = [
        (winreg.HKEY_LOCAL_MACHINE, rf"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{guid}"),
        (winreg.HKEY_LOCAL_MACHINE, rf"SOFTWARE\Microsoft\EdgeUpdate\Clients\{guid}"),
        (winreg.HKEY_CURRENT_USER, rf"SOFTWARE\Microsoft\EdgeUpdate\Clients\{guid}"),
    ]
    for root, path in candidates:
        try:
            with winreg.OpenKey(root, path) as k:
                pv, _ = winreg.QueryValueEx(k, "pv")
                if pv and str(pv) not in ("", "0.0.0.0"):
                    return True
        except OSError:
            continue
    return False


def _ensure_webview2(log) -> bool:
    """方案 B:缺 WebView2 时联网下载 Evergreen 引导器静默装(per-user,不需管理员)。"""
    if _webview2_installed():
        return True
    log("[launcher] 未检测到 WebView2 运行时,尝试联网安装 Evergreen 引导器")
    url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"  # MicrosoftEdgeWebview2Setup.exe
    try:
        import subprocess
        import tempfile
        import urllib.request

        setup = Path(tempfile.gettempdir()) / "MicrosoftEdgeWebview2Setup.exe"
        urllib.request.urlretrieve(url, setup)
        subprocess.run([str(setup), "/silent", "/install"], check=False, timeout=300)
        ok = _webview2_installed()
        log(f"[launcher] WebView2 安装结果 installed={ok}")
        return ok
    except Exception as e:  # noqa: BLE001
        log(f"[launcher] WebView2 安装失败:{e}")
        return False


def _ensure_std_streams() -> None:
    """窗口化 exe(console=False)下 sys.stdout/stderr 为 None,
    uvicorn 日志会 sys.stdout.isatty() → AttributeError,print 也会崩。
    重定向到 os.devnull(真实文本流,isatty()=False),根治后端起不来。"""
    if sys.stdout is not None and sys.stderr is not None:
        return
    try:
        devnull = open(os.devnull, "w", encoding="utf-8")  # noqa: SIM115 进程级,不关
    except OSError:
        return
    if sys.stdout is None:
        sys.stdout = devnull
    if sys.stderr is None:
        sys.stderr = devnull


def main() -> None:
    _ensure_std_streams()
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
    # 导入/建 app 若抛异常(冻结态常见:漏 hiddenimport),窗口化 exe 会静默退出。
    # 这里捕获并把完整 traceback 写日志 + 弹框,避免「双击没反应」无从排错。
    try:
        import uvicorn

        from app.main import app

        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
        threading.Thread(target=server.run, daemon=True).start()
    except Exception as e:  # noqa: BLE001
        log(f"[launcher] 后端导入/启动崩溃：{e}\n{traceback.format_exc()}")
        _msgbox("ROM-AI 启动失败", f"后端初始化失败：{e}\n详见日志：{logf}")
        raise SystemExit(1)

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

    # 收件箱监听(P1-C):后台轮询,每 60s POST /api/inbox/scan 自动入库。
    # frozen exe 下后台线程异常会被静默吞,故线程体整体 try/except 写日志;前端另有手动「立即扫描」兜底。
    # 未配收件箱时 scan_once 早返回(no-op),轻量空转。
    def _inbox_poller() -> None:
        while not server.should_exit:
            time.sleep(60)
            try:
                req = urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/inbox/scan",
                    method="POST", data=b"{}", headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=120) as r:
                    r.read()
            except Exception as e:  # noqa: BLE001  扫描异常不致命,下轮重试
                log(f"[launcher] 收件箱扫描异常(忽略,下轮重试):{e}")

    threading.Thread(target=_inbox_poller, daemon=True).start()
    log("[launcher] 收件箱轮询线程已起(60s)")

    # WebView2 运行时(方案 B):缺了先联网装 Evergreen 引导器;装不上给可见提示再尝试开窗
    if not _ensure_webview2(log):
        _msgbox(
            "ROM-AI 启动提示",
            "未能安装 WebView2 运行时(可能离线或被网络拦截)。\n"
            "请联网后重试,或手动安装 Microsoft Edge WebView2 Runtime:\n"
            "https://developer.microsoft.com/microsoft-edge/webview2/",
        )

    # 桌面窗口（PyWebview，Windows 用 WebView2 运行时）
    try:
        import webview

        log("[launcher] 打开窗口")
        webview.create_window("ROM-AI 工作台", f"http://127.0.0.1:{port}", width=1360, height=900)
        webview.start()  # 阻塞至窗口关闭
        log("[launcher] 窗口已关闭")
    except Exception as e:  # noqa: BLE001
        log(f"[launcher] 开窗失败：{e}\n{traceback.format_exc()}")
        _msgbox("ROM-AI 启动失败", f"窗口打开失败：{e}\n详见日志：{logf}")
    finally:
        server.should_exit = True
        log("[launcher] 后端停止，退出")


if __name__ == "__main__":
    main()
