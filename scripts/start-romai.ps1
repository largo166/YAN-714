<#
  start-romai.ps1 — 一键启动 ROM-AI(生产形态,根治"红字反复出现")

  做四件事,只留一个正确入口:
    1) 停掉会骗人的旧服务:5173(dev) / 4173(vite preview) / 8000(旧后端)
    2) npm run build 出最新 dist(前端护栏也一并进包)
    3) 启动后端(无 reload),后端同源托管 dist —— /api 与页面同源,永不出"连不到后端"红字
    4) 只打开 http://127.0.0.1:8000/seasky.html

  为什么这样就不再复发:唯一入口=8000,页面与 /api 同源;开发端口全被关掉,想开错也没得开。
  用法(PowerShell,在仓库根或任意处):
    powershell -ExecutionPolicy Bypass -File scripts\start-romai.ps1
#>

$ErrorActionPreference = 'Stop'

# 仓库根 = 本脚本上一级
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $RepoRoot 'frontend'
$Backend  = Join-Path $RepoRoot 'backend'
$Venv     = Join-Path $Backend '.venv\Scripts\python.exe'
$Url      = 'http://127.0.0.1:8000/seasky.html'

function Write-Step($msg) { Write-Host "`n▶ $msg" -ForegroundColor Cyan }

# ── 1) 停旧服务(5173 / 4173 / 8000)——只停占这些端口的进程,不误伤别的 ──
Write-Step '停止旧服务(5173 / 4173 / 8000)'
foreach ($port in 5173, 4173, 8000) {
  try {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      $procId = $c.OwningProcess
      if ($procId -and $procId -ne 0) {
        Write-Host "  端口 $port ← 停 PID $procId"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    Write-Host "  端口 $port 检查跳过($($_.Exception.Message))" -ForegroundColor DarkGray
  }
}
Start-Sleep -Seconds 2

# ── 2) 构建前端 dist ──
Write-Step '构建前端(npm run build)'
Push-Location $Frontend
if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
  Write-Host '  首次:安装前端依赖(npm install)…'
  npm install
}
npm run build
Pop-Location
$distIndex = Join-Path $Frontend 'dist\seasky.html'
if (-not (Test-Path $distIndex)) {
  throw "构建后未找到 dist\seasky.html —— 构建可能失败,已中止(不启动半成品)。"
}
Write-Host '  dist 构建完成 ✓'

# ── 3) 启动后端(无 reload,同源托管 dist) ──
Write-Step '启动后端(FastAPI @ 8000,托管 dist)'
if (-not (Test-Path $Venv)) {
  throw "未找到后端 venv:$Venv —— 请先跑 scripts\dev-backend.cmd 初始化环境。"
}
$backendEnv = Join-Path $Backend '.env'
$backendEnvExample = Join-Path $Backend '.env.example'
if ((-not (Test-Path $backendEnv)) -and (Test-Path $backendEnvExample)) {
  Copy-Item $backendEnvExample $backendEnv
}
# 新窗口跑后端,便于查看日志;--app-dir 指到 backend,与现有 dev 脚本一致
Start-Process -FilePath $Venv `
  -ArgumentList '-m', 'uvicorn', 'app.main:app', '--app-dir', $Backend, '--host', '127.0.0.1', '--port', '8000' `
  -WindowStyle Normal

# ── 4) 等后端就绪,只打开 8000 ──
Write-Step '等待后端就绪…'
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch { }
}
if ($ready) {
  Write-Host "`n✓ 后端就绪。打开:$Url" -ForegroundColor Green
  Start-Process $Url
} else {
  Write-Host "`n⚠ 后端 30s 内未就绪。请查看后端窗口日志;就绪后手动打开:$Url" -ForegroundColor Yellow
}

Write-Host "`n提示:只用这个地址验收 —— $Url" -ForegroundColor DarkCyan
Write-Host "     dev(5173) / vite preview(4173) 连不到后端,只会看到「后端未连接」提示,不要用它们下结论。" -ForegroundColor DarkGray
