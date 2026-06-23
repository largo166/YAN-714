# RESUME — 重启 / 休息后的接手启动（直接复制使用）

> 这份文件是给「休息后重新开始」用的。打开它，把【第一部分】整段复制发给新的 Claude / Codex 会话即可；
> 需要把工程跑起来时，用【第二部分】的命令；想确认环境没坏，用【第三部分】。

---

## 第一部分 · 接手指令（复制整段发给新会话）

```text
接手 ROM-AI 项目。唯一权威开发目录是 C:\ROM-AI-Claude 开发。

请先按顺序读取这些文件,确认进度,不要重做已完成的工作:
1. C:\ROM-AI-Claude 开发\START_HERE.md
2. C:\ROM-AI-Claude 开发\SNAPSHOT_README.md
3. C:\ROM-AI-Claude 开发\docs\MIGRATION_STATUS.md
4. C:\ROM-AI-Claude 开发\docs\API_MIGRATION_MAP.md
5. C:\ROM-AI-Claude 开发\ARCHITECTURE.md

已完成(勿重做):原 UI 保真迁移 + 五板块 + 设置抽屉9组 + Phase 4B(AI对话+知识库) + Phase 4C(目录读取+安全清理)。基线:后端 pytest 17 passed,前端 build/lint/typecheck 通过,浏览器 console 0 error。

目录边界(已锁定):
- 唯一权威开发目录: C:\ROM-AI-Claude 开发
- 冻结备份(只读,不再写入/不再从此启动): C:\ROM-AI开发V3-chatgtp-new
- 旧项目(只读参考,严禁写入): C:\ROM-AI开发V3-chatgtp
- 真实项目目录(只读 scan/preview,禁 cleanup apply): C:\Users\yz_ya\Desktop\石家庄市庄项目

禁止:重做骨架/4B/4C、把原版 ROM-AI UI 改成通用模板、恢复旧 Electron、引入 PG/JWT/多租户/对象存储、git commit/push、EXE 打包、生产部署。

确认进度后,从 Phase 4D(项目中心:文件上传/解析/AI研判)继续。4D 可能需装 pypdf/python-docx/python-pptx(普通解析库,装前在报告说明用途)。完成后跑前端 build/typecheck/lint + 后端 pytest + 浏览器 console 检查,并更新 docs\MIGRATION_STATUS.md。
```

---

## 第二部分 · 环境启动命令（让工程跑起来）

依赖已在本目录装好。重启后直接启动即可（若环境被清，`if` 分支会自动重装）。

**后端（PowerShell）**
```powershell
cd "C:\ROM-AI-Claude 开发\backend"
if (-not (Test-Path .venv)) { python -m venv .venv; .\.venv\Scripts\python -m pip install -r requirements.txt }
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python -m pytest          # 期望 17 passed
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**前端（另开一个 PowerShell）**
```powershell
cd "C:\ROM-AI-Claude 开发\frontend"
if (-not (Test-Path node_modules)) { npm install }
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run typecheck
npm run dev               # http://127.0.0.1:5173
```

**或脚本一键起（工程根）**
```powershell
cd "C:\ROM-AI-Claude 开发"
.\scripts\dev-all.cmd
```

---

## 第三部分 · 健康检查基线（确认环境没坏）

```powershell
# 后端 17 passed
cd "C:\ROM-AI-Claude 开发\backend"; .\.venv\Scripts\python -m pytest
# 前端三连绿
cd "C:\ROM-AI-Claude 开发\frontend"; npm run typecheck; npm run build; npm run lint
# 接口冒烟（后端起来后）
curl http://127.0.0.1:8000/health
```

---

## 关键提醒
- **DeepSeek key 未配** → AI 对话返回 `not_configured`，这是**正确行为不是 bug**；要验真实 AI 在应用「设置」页填 key。
- 路径含空格，`cd` 时务必带双引号：`cd "C:\ROM-AI-Claude 开发"`。
- 基线是 **17 passed**；若 pytest 不是这个数，先排查环境再开发。
- 下一步是 **Phase 4D**（项目中心：文件上传 / 解析 / AI 研判），不要重做 4B / 4C。

---

## 后续 Phase 顺序
1. Phase 4D：项目中心文件上传 / 解析 / AI 研判 ← 下一步
2. Phase 4E：会议纪要五段式
3. Phase 4F：A2 生图三卡 + 成果卡回流
4. Phase 4G：管理驾驶舱 / 协作平台真实数据
5. 最终整体验收
6. 之后再考虑 PyWebview 桌面化 / EXE 打包
