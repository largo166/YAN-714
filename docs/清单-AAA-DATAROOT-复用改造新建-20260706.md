# 复用 / 改造 / 新建 清单 · A/A/A + DATA_ROOT

> 交付物②(与 bug 收敛报告分开)。依据:六路只读盘点(wemp9sdac)+ 三桶合成与作用域核验(wzgp38k4y)。
> 凭代码现实归类,不凭工单假设。清单确认前不写码。行号为盘点时证据锚点。

---

## 一、【先数新建栏】新建项清点 = 9 项(概念上 5 核心 + 3 越界 + 1 你自己的决策5)

你的天花板:**对话框、SSE、去重、建仓,顶多加检查点0迁移 = 5**。逐项对账:

| # | 新建项 | 落你天花板? | 必要性(为何非新建不可) |
|---|---|---|---|
| N1 | 检查点0:升级前自动备份 DB | ✅ 检查点0 | init_db 只 create_all 从不备份(database.py:76-101);WAL 边车需先 checkpoint 再连 .db/-wal/-shm 一起复制。验收「备份文件存在」硬要求。 |
| N2 | 对话框:launcher pywebview js_api 原生桥 | ✅ 对话框 | 全库零 js_api/create_file_dialog(grep 仅 launcher.py:211 create_window 丢返回值)。零命中,确实没有。 |
| N3 | 对话框:前端 nativeDialog helper + 类型声明 | ✅ 对话框(子件) | N2 的前端半边:window.pywebview 特征探测 + TS 类型。与 N2 同属"对话框"一件。 |
| N4 | 去重:sha256 查重 + 入库重试 + 三态回执 | ✅ 去重 | upload_file 端点零查重(project_files.py:198-234),现 dedup 仅 name+size;with_write_retry(database.py:47)在入库路由零调用;旧 batch 回执已删。 |
| N5 | **切块:真·尺寸/重叠检索切块 + 逐块 FTS** | ⚠️ **越界** | **唯一实质越界项**。今「切块」只是页/张 provenance(parsing.py:204/325),FTS 一文档一行(retrieval.py:133-137)→检索粒度是整文档。但它是**你自己定义的五段之一**,且你 checkpoint① 硬约束"重复入库不产生重复 chunks"。**触发「一写新管线就停」红线 → 写码前必停确认。** 可选降级:本轮 切块 只落页/张占位(诚实),真检索切块留后置。 |
| N6 | SSE:实时逐文件逐段进度流 | ✅ SSE | 后端零 StreamingResponse/EventSource;前端 request() 是 fetch→json。你 checkpoint① 硬约束"必须 SSE,禁同步转圈"。 |
| N7 | 前端:5段术语常量文件(识别→抽取→切块→索引→归档) | ⚠️ 越界(琐碎) | 非"大件":单一常量+映射文件,做术语单一真源防漂移。不写 fetch/流、不触红线。可并入 N/A 改造项,不单独占额度。 |
| N8 | 建仓:DATA_ROOT 下作用域安全 mkdir 端点 | ✅ 建仓 | 反转 b1 降级(§二:33)。全库无 mkdir 端点,filesystem.py 只读铁律。**你已显式确认反转。** |
| N9 | 打包:fitz 导入校验 + preset-key 泄露守卫(前置检查) | ⚠️ 越界(你的决策5) | 是**你自己的决策5**。新建仅因今天无此自动前置步骤。非夹带。 |

**结论:9 项 → 你的 5 核心(N1/N2+N3/N4/N6/N8)全部对上;越界 3 项中,只有 N5「切块」是实质大件,已按红线标为"先停后确认",N7 琐碎、N9 是你自己要的。无夹带其它大件。**

> 若你要把额度压到最紧:本轮先不做 N5 真切块(降级为页/张占位)、N7 并入改造,新建实数就回落到 **7 项(N1/N2/N3/N4/N6/N8/N9)**,概念上正好卡你的 5。

---

## 二、检查点 0(置顶 · 先于一切功能 · 后续每个 exe 不变砖的前提)

> 验收:一台已有数据的环境装新 exe → 启动不崩、数据完好、备份文件存在。**依赖:无(最前)。**

| 项 | 类 | 文件范围 | 预估改动量 | 依据 |
|---|---|---|---|---|
| 0-1 升级前自动备份 DB(WAL checkpoint + 复制 .db/-wal/-shm 到带时间戳) | 新建 | `backend/app/database.py`(或新 `backend/app/db_backup.py`) | +40~70 | init_db:76-101 只 create_all;PRAGMA WAL :33 |
| 0-2 启动时 `command.upgrade(head)`(在 create_all **之前**、备份之后) | 改造 | `backend/app/database.py`(init_db 顶部 :83-85 前)、`backend/app/main.py`(lifespan :29-32) | +20~30 | 唯一启动钩子 main.py:31;env.py:29 **已**设好 url,无需改 env |
| 0-3 alembic(ini+env+versions)打进 onefile + 冻结态解析 script_location | 改造 | `desktop/romai.spec`(datas +2)、`desktop/launcher.py`(启动排序) | +10~20 | spec 现不含迁移(:28/33-35);**alembic.ini:6 script_location=alembic 是 cwd 相对,冻结态须在代码里 set_main_option 指向 _MEIPASS/alembic**(核验补漏项) |
| 0-4 `config._resolve_data_dir` → 单一显式 DATA_ROOT,dev==exe 同落点,ENV_FILE 归一 | 改造 | `backend/app/config.py` | +10~20 | 唯一解析函数 :30-38(dev=backend/data / 冻结=%LOCALAPPDATA%);ENV_FILE :42 dev 不在 DATA_DIR 下 |
| 0-5 三路径配置收敛为 DATA_ROOT 派生(workspace/repository/inbox 三处串台收口) | 改造 | `backend/app/models.py`(:89/92/94 列)、`backend/app/routers/workspace.py`(:34-41 setter 零校验)、`backend/app/routers/settings.py`(:48-56 setter 最严)、**`backend/app/routers/inbox.py`(:36-44 setter 中校验)**、`backend/app/inbox.py`(:30 消费者随改) | +30~60 | **核验纠错:inbox setter 在 routers/inbox.py 不在 inbox.py**;三端点三语义分叉 |
| 0-6 settings API + 两处设置界面显示解析后 DATA_ROOT / DB 路径 | 改造 | `backend/app/schemas.py`(:409-415 SettingsOut)、`backend/app/routers/settings.py`、`frontend/src/seasky/components/system/SettingsOverlay.tsx`、`frontend/src/components/layout/SettingsDrawer.tsx`(:265/286 现无物理路径)、`frontend/src/lib/api.ts`、`frontend/src/types/schemas.ts` | +30~50 | 决策3"UI 显示完整 DATA_ROOT";只读展示字段,可不改 config.py 本身 |

---

## 三、复用栏(原样不动,或删了会断)

| 项 | 文件范围 | 依据 |
|---|---|---|
| 抽取:成熟抽取器 + OCR + 超时分级 | `backend/app/parsing.py`、`backend/app/ocr.py` | parse_file/_dispatch/_read_*(:86-403)覆盖 txt/md/pdf/docx/pptx/xlsx/图,30s 超时、分级状态不伪造、留 provenance |
| 归档:受管根 + 软删/恢复 + 资产落盘 | `backend/app/uploads.py`、`backend/app/routers/project_files.py` | FileAsset + 受管根 + _trash manifest 可 restore + 迁移 0017 |
| 索引:真 FTS5/BM25 引擎(+CJK bigram) | `backend/app/retrieval.py` | ensure_fts 建 fts5(:85-89),bm25+MATCH(:309-316),LIKE 仅兜底(:341-365)——非桩 |
| 对话框:`/api/filesystem/list-dir` 只读列目录(纯浏览器唯一拿绝对路径通道) | `backend/app/routers/filesystem.py` | :1 铁律只读;原生对话框上线后仍需共存 |
| 术语:前端**无需改名**(已全用 索引/入库/检索) | `frontend/src/pages/KnowledgePage.tsx`、`.../boards/KnowledgeBaseBoard.tsx` | 两次 grep 证 frontend/src 零 向量/vector/embedding;**工单"前端说向量"前提为假**,不得捏造 |
| 术语守卫:排除 嵌入(图)与 RAG,勿误伤 | `backend/app/image_assets.py`、`parsing.py`、`models.py`、`analysis.py`、`schemas.py` | 后端每个"嵌入"=嵌入图;RAG=真 FTS5 支撑的检索增强,与向量无关 |

---

## 四、改造栏(既有逻辑增强/接线,非新管线)

| 项 | 检查点 | 文件范围 | 预估改动量 | 依赖检查点0? |
|---|---|---|---|---|
| DATA_ROOT 统一(见 §二 0-4/0-5/0-6) | 0 | 见上 | — | 本身即检查点0 |
| alembic 接入 / 打包(0-2/0-3) | 0 | 见上 | — | 本身即检查点0 |
| 识别:扩展名之外加 magic-byte 嗅探回退 | CP2 | `backend/app/parsing.py`(:70-71/126-142) | +15~25 | 否 |
| 索引:上传解析成功后自动入库 / 回执暴露入库态 | CP2 | `backend/app/routers/project_files.py`;**+`docs/现状契约-b1清理入库.md`(核验补:此项反转 §三 自动入库降级,须同步补记)** | +10~20 | 是(落 DATA_ROOT) |
| 进度条/回执卡改 5 段/索引术语(保留三态计数) | CP2 | `frontend/src/pages/KnowledgePage.tsx`(:589)、`.../agent/OrganizeFlowCard.tsx`(:68) | +20~30 | 否 |
| seams.py 移除死向量接缝 + 改其测试 | CP4 | `backend/app/seams.py`(:8-9/41-49/52-62)、`backend/tests/test_seams_json.py`(**:12-13**) | -15~25 | 否 |
| 4 处文档"未来向量库"→"FTS5 索引即最终形态" | CP4 | `docs/总路线图-20260628.md`(:58/66)、`docs/架构演进与点亮路线-20260628.md`(:27)、`docs/KNOWLEDGE_BASE_DESIGN.md`(:27) | +10~20 | 否 |
| 对话框:CleanupWizard 第一步接「浏览…」(原生为主 + 输入框 dev 降级) | CP1 | `frontend/src/seasky/components/data/CleanupWizard.tsx`(:197-203) | +20~40 | 部分(落点需 DATA_ROOT) |
| 对话框:复用 FolderPicker 作非原生回退 + 重皮 sk-* | CP1 | `frontend/src/components/FolderPicker.tsx`(紫黑变量→sk-*)、`.../CleanupWizard.tsx` | +40 | 否 |
| 对话框:SettingsOverlay 路径框同给浏览入口(随收敛结果定,低优先) | CP1 | `frontend/src/seasky/components/system/SettingsOverlay.tsx`(:60-71) | +15~30 | 是(依 0-5 收敛后剩几个路径框) |
| 建仓:CleanupWizard 第一步恢复"新建子目录"入口 | CP3 | `.../CleanupWizard.tsx`(:194-195 反转文案)、`frontend/src/lib/api.ts`、`frontend/src/seasky/services/index.ts` | +30~40 | 是 |
| 建仓:契约文档 append-only 反转补记(保留 b1 原降级) | CP3 | `docs/现状契约-b1清理入库.md` | +30~50 追加 | 否 |

---

## 五、新建栏(9 项 · 详见 §一 必要性)

| # | 项 | 检查点 | 文件范围 | 预估改动量 | 依赖检查点0? | 红线 |
|---|---|---|---|---|---|---|
| N1 | 升级前自动备份 DB | 0 | `backend/app/database.py`(或新 `db_backup.py`) | +40~70 | 本身 | — |
| N2 | launcher pywebview js_api 原生桥 | CP1 | `desktop/launcher.py`(:211) | +40~70 | 否 | — |
| N3 | 前端 nativeDialog helper + 类型 | CP1 | 新 `frontend/src/lib/nativeDialog.ts`、新 `frontend/src/types/pywebview.d.ts` | +45 | 否 | — |
| N4 | sha256 查重 + 入库重试 + 三态回执 | CP2 | `backend/app/routers/project_files.py`、`backend/app/models.py`、`backend/app/schemas.py`、新迁移 `backend/alembic/versions/0023_*.py`、`backend/app/database.py`(复用 with_write_retry) | +60~100 | 是 | — |
| N5 | **真·切块 + 逐块 FTS** | CP2 | 新 `backend/app/chunking.py`、`backend/app/parsing.py`、`backend/app/retrieval.py`(加 doc_id 列) | +90~130 | 是 | **🔴 先停确认** |
| N6 | SSE 实时逐段进度 | CP2 | `backend/app/routers/project_files.py`、`frontend/src/lib/api.ts`、`frontend/src/pages/KnowledgePage.tsx`、`.../agent/OrganizeFlowCard.tsx` | +90~110 | 是 | **🔴 先停确认** |
| N7 | 前端 5 段术语常量 | CP2 | 新 `frontend/src/lib/ingestStages.ts`、`frontend/src/seasky/lib/constants.ts` | +18 | 否 | — |
| N8 | DATA_ROOT 下 mkdir 端点 | CP3 | `backend/app/routers/settings.py`(或新 `routers/repository.py` + `main.py` 注册)、`backend/app/uploads.py`(复用 _unit_dir :77-80 / sanitize_filename / validate_path;放宽 validate_repository_root :49-50、_reject_nested_with_uploads :29-34) | +40~70 | 是 | — |
| N9 | fitz 导入校验 + preset-key 泄露守卫(前置) | 每次重建 | `desktop/分发构建.md`、`desktop/romai.spec`(或新 precheck 脚本) | +20~40 | 否 | — |

---

## 六、打包前置检查(单列 · 每次重打 exe 必跑)

1. **fitz 导入校验**:在打包所用同一 Python 跑 `python -c "import fitz"`,必过。PyMuPDF 在 Windows 偶尔静默装失败→所有 PDF 抽取+抽图静默失效(分发构建.md:55-59)。失败即中止构建、不出包。
2. **preset-key 泄露守卫**:onefile 可反编译;`desktop/.env.bundle` 若含真 key 会随 exe 泄露(分发构建.md:50;romai.spec:33-35 打进 bundle)。构建前检查 .env.bundle 是否含 key,检测到即显式告警确认,仅对可信接收方打可吊销/限额 key。
3. **smoke_test.ps1 必跑**:已存在(ROMAI_SMOKE_SECONDS=90),升为每检查点强制门。
4. **构建时长实测**:全库 grep 分钟/秒/耗时**零命中**(:153 的 ~30s 是 /health 轮询、smoke:58 是保活),故**首次重建时实测并记入分发构建.md**。

---

## 七、待你拍板的开放问题(写码前需定)

1. **DATA_ROOT 具体默认落点**:dev==exe 统一到哪?(Windows 恒用 `%LOCALAPPDATA%\ROM-AI`,还是固定 dev 目录?)统一后 dev 默认写 %LOCALAPPDATA%、与 exe 共库——是否接受?还是仍靠 `ROMAI_DATA_DIR` 隔离 dev(注:import 期读取,运行期改需重启)。
2. **既有数据迁移**:旧位置(exe=%LOCALAPPDATA%\ROM-AI、dev=backend/data)已有 rom_ai.db(+WAL)/uploads/_assets/_trash。改默认落点后**自动搬迁**(WAL checkpoint→移三文件→改 ProjectFile.storage_root/FileAsset 行/_trash manifest),还是不动、要求用 ROMAI_DATA_DIR 指回旧目录?(本次最小化 DATA_ROOT 特意未含 _assets 跟随根/一次性重定位。)
3. **三路径收敛语义**:inbox_root_path / workspace_path 归一后**强制成 DATA_ROOT 下固定子目录**,还是仍允许指向外部(外部下载夹自动入库、外部设计仓库清理)?强制内置会去掉"外部收件箱/外部工作目录"用法。
4. **database_url 覆盖开关**(config.py:123):保留(会让 DB 静默落 DATA_ROOT 之外、瓦解归一)还是随归一弃用/加校验?
5. **入库两段净新增(N5 切块 / N6 SSE)本轮范围边界**:两者都触发"一写新管线就停"。A 裁决要 SSE + 真流水线,但可先交付**同步版 5 段回执**(识别/抽取/切块占位/索引/归档 + 三态计数),把真切块与 SSE 流作为确认后的独立段。本轮做到哪?

---

## 八、依赖关系图(执行顺序)

```
检查点0(0-1~0-6:备份 + alembic + DATA_ROOT 统一 + 三路径收敛 + UI 显示)
   │  ← 后续每个 exe 不变砖的前提,先于一切
   ├─→ CP1 对话框(N2 桥 / N3 前端 helper / 浏览接线 / FolderPicker 回退)
   ├─→ CP3 建仓 mkdir(N8 端点 / 向导新建入口 / 契约补记)  ← 需 DATA_ROOT 受控
   └─→ CP2 入库(识别改造 / 自动入库 / N4 去重 / 术语 UI)
          └─(红线,先停确认)→ N5 真切块 · N6 SSE 流
   CP4 术语(seams 删接缝 / 文档改写)可与任意并行,无依赖
   每次重建:打包前置检查(fitz / preset-key / smoke / 构建时长)
```
