# WORKSPACE_CLEANUP_DESIGN — 项目目录读取 + 安全清理（Phase 4C）

## 安全铁律
1. **永不永久删除**。`apply` 仅把文件**移动**到隔离区 `<项目根>/_ROMAI_CLEANUP_QUARANTINE/<时间戳>/`。
2. 每次 apply 写 `manifest.json`：原路径 / 隔离路径 / 大小 / 原因 / 时间。
3. `restore` 按 manifest 还原回原位。
4. `preview` 只扫描，不改任何文件。
5. 隔离区自身在后续 scan 中被排除，不会重复计入。

## 分类规则
- **自动可清理**：`.tmp .bak .log`、`__pycache__`/`.cache` 缓存目录、`.DS_Store`/`Thumbs.db`、空文件、重复导出命名（副本/备份/copy/old）。
- **人工复核（绝不自动清理）**：`.psd .ai .skp .dwg .rvt .3dm .blend .max .pdf` + Office（doc/xls/ppt）+ 图片 + 视频。
  - 即使带「副本/copy」标记，只要是复核类扩展名，也**不**进自动清理（复核优先）。

## 接口（`/api/workspace`）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/status` | 当前配置目录 + 可访问性 |
| POST | `/config` | 设置项目目录路径 |
| POST | `/scan` | 扫描：文件/夹数、总大小、类型分布、最近修改、大文件、自动可清理、人工复核 |
| POST | `/cleanup/preview` | 清理预览（只读） |
| POST | `/cleanup/apply` | 移动到隔离区（需 `confirm=true`），写 manifest |
| POST | `/cleanup/restore` | 按 `timestamp` 还原 |

## 测试结果
- `backend/tests/test_workspace.py`（5 用例，全部通过）：
  - scan 正确统计 + 人工复核分类
  - preview 正确识别可清理项、PDF 不进自动清理
  - **apply 只移动不删除**（文件在隔离区可见）
  - **restore 能还原**
  - 隔离区不被重复扫描
- apply/restore **仅在 pytest 临时目录**验证，未对真实目录执行。

## 真实目录读取结果
- 目录：`C:\Users\yz_ya\Desktop\石家庄市庄项目`（已通过 MCP 授权，Read/后端进程可读）。
- scan：**25 文件 / 2 文件夹 / 908.8 MB**；类型 `pdf×17 md×4 jpg/docx/txt/xlsx 各1`。
- 大文件：259.6MB / 209.7MB / 79.3MB 等方案 PDF。
- **cleanup preview：自动可清理 0 项**（全是设计/文档源文件，归人工复核 20 项）。
- **对真实目录仅执行 scan/preview，未 apply，文件零破坏。**

## 需要用户确认的动作
- 对**真实项目目录**执行 `cleanup/apply`（即使是移动到隔离区）必须用户单独确认 —— 当前前端面板**不提供**真实目录 apply 按钮，只做 scan + preview。
