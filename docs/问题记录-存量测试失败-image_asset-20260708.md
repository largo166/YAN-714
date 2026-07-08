# 问题记录 · test_image_asset_ok_regardless_of_size「失败」——环境口径问题,非代码缺陷（2026-07-08）

> 批复:暂不修,只建记录。本文零代码改动,未动 OCR/parsing/测试口径/心脏逻辑。

## 一、结论先行

**这不是代码 bug,是"跑测试用错了 Python"。** 权威解释器(`backend/.venv`,装了 rapidocr)下**全套 215 passed / 1 skipped,零失败**。失败只出现在系统 Python(ServBay,无 rapidocr)下——同一份代码,两个解释器,两种结果。

| 解释器 | rapidocr | 该测试 | 全套 |
|---|---|---|---|
| `backend/.venv/Scripts/python.exe`(权威,打包也用它) | ✅ 有 | **passed** | **215 passed / 1 skipped** |
| `C:\ServBay\...\python.exe`(系统 PATH 默认) | ❌ 无 | failed | 211 passed / 1 failed / 4 skipped |

## 二、为什么是存量问题(证据链)

1. **失败机理**:测试(`tests/test_parsing.py:151-156`)喂一段假 PNG 字节,断言 `status == "ok"`。`parsing._read_image`(app/parsing.py:384-403)的现行口径:**OCR 不可用 → `metadata_only(needs_ocr)`**(诚实降级,dc1edb7「OCR 入索引」引入)。系统 Python 无 rapidocr → 走降级分支 → `metadata_only` ≠ `ok` → 断言炸。
2. **测试自己的护栏没护住**:`tests/test_ocr_parsing.py` 对 OCR 相关用例做了 `rapidocr 未安装则 skip` 的保护(本次 4 个 skipped 里 3 个即它),但 `test_parsing.py` 里这条**图片资产用例写于 OCR 上线之前**(注释还是"登记为 ok,保持原行为"的旧口径),OCR 上线后没同步加 skip 守卫——在无 OCR 环境暴露。
3. **与本轮 11 文件改动无关**:封板可信度包全部改动在 `frontend/src/seasky/**` + 事件注释,零后端触碰。stash 实证:摘掉本轮全部改动后,系统 Python 下该测试**同样失败**(基线复现)。
4. **为何今天才看见**:此前会话跑后端测试惯用 `.venv`(如 215 passed 记录);本轮批量执行用了裸 `python -m pytest`(PATH 指向 ServBay)。**变量是解释器,不是代码。**

## 三、可能影响范围(如实列,均未发生在权威环境)

- **CI/他机风险**:任何"无 rapidocr 的环境"跑全套都会踩这一条(以及 test_ocr_parsing 的 3 个 skip)。当前无 CI,实际影响=0;未来建 CI 时须用 .venv 依赖清单。
- **打包无影响**:romai.spec 的 hiddenimports 收依赖时用打包 Python(.venv 系),rapidocr 在 requirements 内,exe 内 OCR 可用。
- **产品行为无影响**:`metadata_only(needs_ocr)` 本就是设计好的诚实降级分支(不伪造),真实用户环境走哪个分支只取决于 exe 内 rapidocr 是否随包——与此测试无关。

## 四、待授权的修复选项(先记录,不执行)

- **选项A(推荐,最小)**:给该用例加与 test_ocr_parsing 同款的 `rapidocr 未安装则 skip` 守卫——环境缺件=跳过,不是失败。一行改动,不动产品代码。
- **选项B**:测试断言改为接受 `ok | metadata_only(needs_ocr)` 双态——但这弱化断言,不如 A 干净。
- **选项C**:工程口径修——固定所有测试命令走 `.venv/Scripts/python.exe`(文档/脚本层),测试代码零改动。
- A 与 C 可并行,均不触 OCR/parsing 心脏。**等单独授权。**

## 五、复现命令(取证用)

```powershell
# 权威(过): cd backend; .venv/Scripts/python.exe -m pytest -q          → 215 passed
# 复现失败: cd backend; python -m pytest tests/test_parsing.py::test_image_asset_ok_regardless_of_size -q
#           (PATH 的 ServBay python,无 rapidocr → metadata_only ≠ ok)
```
