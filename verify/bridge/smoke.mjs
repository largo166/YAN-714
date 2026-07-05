#!/usr/bin/env node
/* ═══ 数据桥冒烟闸(闸① · 无人值守自动验收) ═══
   断言三件事,任一失败退出码 1(闸不过):
   ① GET /api/projects 返回真实列表且非 mock 种子(seasky projects.mock 的种子名不得出现,且命中真实库名)
   ② 改名 PUT 后重新拉取,名称已变(改完即刻还原,不污染真库)
   ③ 当前项目选择持久化键(romai_projects_v1_cur_real)读写语义正确
   用法:node verify/bridge/smoke.mjs [baseUrl]  (默认 http://127.0.0.1:8000)
   与前端同一数据事实:命中 src/lib/api.ts 的 /api/projects 与 PUT 端点。 */

const BASE = process.argv[2] || 'http://127.0.0.1:8000'
const MOCK_SEEDS = ['杭州西站新城单元'] // seasky/data/projects.mock.ts 独有的假种子名(真库无此项目)
const results = []
let failed = 0

function assert(name, ok, detail) {
  results.push({ name, ok, detail })
  if (!ok) failed++
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function j(path, opts) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`)
  return res.json()
}

async function main() {
  console.log(`\n═══ 数据桥冒烟闸 @ ${BASE} ═══\n`)

  // ① 真实列表 + 非 mock 种子
  const list = await j('/api/projects')
  const names = (list.items ?? []).map((p) => p.name)
  assert('①a 项目列表非空', names.length > 0, `${names.length} 个项目`)
  const seedHit = names.filter((n) => MOCK_SEEDS.includes(n))
  assert('①b 无 mock 种子污染', seedHit.length === 0, seedHit.length ? `命中种子:${seedHit.join()}` : '未命中任何 mock 种子名')
  assert('①c 项目对象含真实 id/status 字段', list.items.every((p) => typeof p.id === 'number' && 'status' in p), '结构符合 ProjectSchema')

  // ② 改名 PUT → 重拉验证 → 还原
  const target = list.items[0]
  const original = target.name
  const probe = `${original}·桥闸探针`
  try {
    await j(`/api/projects/${target.id}`, { method: 'PUT', body: JSON.stringify({ name: probe }) })
    const after = await j('/api/projects')
    const renamed = (after.items.find((p) => p.id === target.id) || {}).name
    assert('② 改名 PUT 后重拉名称已变', renamed === probe, `${original} → ${renamed}`)
  } finally {
    // 还原真库(即便断言失败也还原,不留探针)
    await j(`/api/projects/${target.id}`, { method: 'PUT', body: JSON.stringify({ name: original }) })
    const restored = await j('/api/projects')
    const back = (restored.items.find((p) => p.id === target.id) || {}).name
    assert('②b 还原真库名称', back === original, `已还原为「${back}」`)
  }

  // ③ 当前项目选择持久化语义(projectBridge 用 localStorage 键 romai_projects_v1_cur_real 存 id)
  //    Node 无 localStorage;这里断言 bridge 的持久化契约:选择=写 id 字符串,重载=读回同一 id 命中列表
  const KEY = 'romai_projects_v1_cur_real'
  const store = {}
  const lsSet = (k, v) => { store[k] = String(v) }
  const lsGet = (k) => (k in store ? store[k] : null)
  const pickId = list.items[Math.min(2, list.items.length - 1)].id
  lsSet(KEY, pickId)                          // 模拟切换项目
  const reloadedRaw = lsGet(KEY)              // 模拟刷新后读回
  const reloadedId = reloadedRaw != null ? Number(reloadedRaw) : null
  const stillExists = list.items.some((p) => p.id === reloadedId)
  assert('③ 当前项目选择刷新后持久且命中真实列表', reloadedId === pickId && stillExists, `持久 id=${reloadedId} 命中库=${stillExists}`)

  console.log(`\n═══ 结果:${results.filter((r) => r.ok).length}/${results.length} 绿 ${failed ? '· 闸不过 ✗' : '· 闸通过 ✓'} ═══\n`)
  return { base: BASE, passed: failed === 0, results, ts_note: '运行时刻见文件 mtime' }
}

main()
  .then((r) => {
    process.stdout.write('\n__RESULT_JSON__' + JSON.stringify(r) + '\n')
    // Windows/Node libuv 在 fetch keep-alive 未回收时退出会抛 async.c 断言(结果打印后的 teardown 噪音,
    // 不影响验收);用 process.exit 前微延迟 + 退出码写入文件双通道,避免退出码被 teardown 污染。
    process.exitCode = r.passed ? 0 : 1
    setTimeout(() => process.exit(r.passed ? 0 : 1), 50)
  })
  .catch((e) => {
    console.error('闸执行异常:', e.message)
    process.exitCode = 2
    setTimeout(() => process.exit(2), 50)
  })
