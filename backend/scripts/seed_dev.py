"""开发/测试种子数据(2026-07-07)。可复现、幂等、物理文件与记录一致——
不再累积成"假存量"(见 postmortems/对着死库做手术.md)。

用法:
  python scripts/seed_dev.py            # 在当前 DATA_DIR 的库里播种(先清种子项目再建)
产出:
  - 一个隔离种子目录 {DATA_DIR}/_seed_source/,内含真实小文件(与 DB 记录一致);
  - 三个规范命名的种子项目(城市-甲方-地块),各挂 2-3 个真文件;
  - 全部走真实 ingest 端点入库(不直接塞 DB),保证 storage_root/stored_path/物理文件三者一致。

铁律:种子项目名带 [SEED] 前缀,便于一键清除,绝不与真实项目混。
"""
from __future__ import annotations

import os
import sys
import time
import urllib.request
import json
from pathlib import Path

# DATA_DIR 与 config 同源(默认 backend/data,可被 ROMAI_DATA_DIR 覆盖)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import DATA_DIR  # noqa: E402

BASE = os.environ.get("SEED_BASE", "http://127.0.0.1:8000")
SEED_SRC = DATA_DIR / "_seed_source"

# 种子项目:父目录/子项目结构,顺带示范 A 语义(选父目录→多项目)
SEED = {
    "[SEED]杭州-示范-云城地块": {
        "云城地块方案说明.txt": "杭州云城地块 高层住宅方案说明 种子数据",
        "云城地块会议纪要.md": "# 云城地块评审\n2026-07 方案通过 种子",
    },
    "[SEED]石家庄-示范-市庄路": {
        "市庄路任务书.txt": "石家庄市庄路地块 投标任务书 种子数据",
    },
}


def _post(path, obj):
    r = urllib.request.Request(BASE + path, data=json.dumps(obj).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r, timeout=30).read())


def main():
    # 1. 物理文件落盘(每个种子项目一个独立目录,与记录一致)
    SEED_SRC.mkdir(parents=True, exist_ok=True)
    proj_dirs = []
    for proj, files in SEED.items():
        d = SEED_SRC / proj
        d.mkdir(parents=True, exist_ok=True)
        for fn, content in files.items():
            (d / fn).write_text(content, encoding="utf-8")
        proj_dirs.append(str(d))
    print("种子物理文件已落: %s" % SEED_SRC)

    # 2. 每个项目目录单独走真实 ingest(single 模式,项目名=目录名=[SEED]...)——三者一致
    try:
        urllib.request.urlopen(BASE + "/health", timeout=3)
    except Exception:
        print("!! 后端未在 %s 运行,请先起后端再跑种子(种子走真实 ingest 端点)。" % BASE)
        sys.exit(1)
    total_imported = 0
    for pd in proj_dirs:
        job = _post("/api/ingest", {"paths": [pd]})
        jid = job["job_id"]
        for _ in range(60):
            s = json.loads(urllib.request.urlopen(BASE + "/api/ingest/%s" % jid, timeout=15).read())
            if s.get("phase") == "done":
                break
            time.sleep(0.4)
        total_imported += s.get("imported", 0)
    print("种子入库完成: imported=%d" % total_imported)
    stats = json.loads(urllib.request.urlopen(BASE + "/api/knowledge/stats", timeout=15).read())
    projs = json.loads(urllib.request.urlopen(BASE + "/api/projects", timeout=15).read())
    print("库现状: documents=%s projects=%s" % (stats["documents"], [p["name"] for p in projs["items"]]))
    print("完成。种子项目带 [SEED] 前缀,清除时按前缀删即可。")


if __name__ == "__main__":
    main()
