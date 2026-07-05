# ROM-AI 验收闸留档(verify/)

无人值守模式的三处自动验收闸,可随时重放。前置:后端 8000 + 前端 5173 均在运行。

## 闸① 数据桥冒烟 · `bridge/smoke.mjs`
```
node verify/bridge/smoke.mjs            # 默认 http://127.0.0.1:8000
```
断言三件事,六项断言全绿才算通过(退出码 0):
- ①a/b/c 列表非空 + 无 mock 种子污染(`杭州西站新城单元` 等 seasky 假种子不得出现)+ 结构符合 ProjectSchema
- ② 改名 PUT 后重拉名称已变(改完即刻还原,不污染真库)
- ②b 还原真库名称
- ③ 当前项目选择持久化契约(localStorage 键 `romai_projects_v1_cur_real`)

最近结果:`bridge/smoke-result.txt`(6/6 绿)。

## 闸② b2 像素对照 · `frontend/pixel-gate.mjs`
纯 pixelmatch(v7.2, ESM)+pngjs（装在 `frontend/node_modules`），截图走 Edge headless（**替代 Playwright**，见决策清单 D1）。
**脚本必须放在 frontend/ 下**——ESM bare import 按脚本所在目录向上找 node_modules，放 verify/ 下会静默 ERR_MODULE_NOT_FOUND（见决策清单 D9）。
```
cd frontend && node pixel-gate.mjs <baseline.png> <current.png> [0.1]
# 图用绝对路径;实测三次连跑 exit=0 稳定可重放
```
- 基准 `verify/b2/baseline.png` = **当前代码稳定态锁定**（非跨版本历史图，见决策清单 D2）
- 阈值 0.1%；超阈→`verify/b2/diff.png` 定位差异→自主回修至达标
- 最近结果:`verify/b2/gate-result.txt`（0 差异像素 / 0.0000%）

**关键结论**:同代码同时机连截两张，差异 0.0000%——构图完全稳定，WebGL 海面在 `?capture=1`+同 virtual-time-budget 下是确定帧。

## 闸③ b1 清理入口摆位 · `b1/b1-placement.png`
自主拍板达标:清理入口与「最近入库」均为同一 `<GhostButton>…›</GhostButton>` 组件（字重/间距/圆角组件层根上一致），流程收进浮层。**留用户一次性否决权**——若否决只返工摆位，不返工链路。

## 回滚生命线
逐板退役 tag（无人值守回滚保障）:
`retire-purple-{know,proj,agent,hub,boss,final}-20260706`
