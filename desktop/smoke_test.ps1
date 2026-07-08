<#
ROM-AI exe 冒烟测试(L1 后端 / L2 干净空库 / L3 老库不炸)。

用 launcher 内置 ROMAI_SMOKE=1:只起内嵌后端、写 .port、不开窗、保活,供本脚本 curl 断言。
不验证 WebView2 开窗(那需真机,见 L4),只验证「打包正确性 + 各板块接口不漏模块 + 空库自举」。

用法:
  # L2 干净环境(默认):用全新临时数据目录,验证空库 create_all+seed 后五板块可用
  pwsh desktop/smoke_test.ps1

  # 指定 exe 路径
  pwsh desktop/smoke_test.ps1 -Exe dist_exe/ROM-AI.exe

  # L3 升级冒烟:把一份旧库放进 -DataDir 指的目录,验证新 exe 不报 no such column
  pwsh desktop/smoke_test.ps1 -DataDir C:\some\dir\with\old\rom_ai.db -KeepData

退出码:0=全过,1=有失败。
#>
[CmdletBinding()]
param(
  [string]$Exe = "dist_exe/ROM-AI.exe",
  [string]$DataDir = "",
  [switch]$KeepData,                 # 不清理 DataDir(L3 升级冒烟用,保留预置的老库)
  [switch]$ExpectKeyless,            # T0-2 出包检查:断言包内无预置 key(keyless 包出包前必跑)
  [switch]$ExpectKey,                # 反向:断言预置 key 已注入(显式带 key 包用)
  [int]$ReadyTimeoutSec = 40
)

$ErrorActionPreference = "Stop"
$script:fails = 0

function Step($name, [scriptblock]$body) {
  Write-Host -NoNewline ("  [{0}] " -f $name)
  try {
    & $body
    Write-Host "PASS" -ForegroundColor Green
  } catch {
    Write-Host "FAIL — $($_.Exception.Message)" -ForegroundColor Red
    $script:fails++
  }
}

# ── 解析 exe ──
$exePath = Resolve-Path -LiteralPath $Exe -ErrorAction SilentlyContinue
if (-not $exePath) { Write-Host "找不到 exe: $Exe(先 build)" -ForegroundColor Red; exit 1 }
Write-Host "exe: $exePath"

# ── 数据目录(默认全新临时目录 = L2 干净环境)──
$cleanup = $false
if (-not $DataDir) {
  $DataDir = Join-Path ([System.IO.Path]::GetTempPath()) ("romai-smoke-" + [guid]::NewGuid().ToString("N").Substring(0,8))
  $cleanup = $true
}
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$portFile = Join-Path $DataDir ".port"
if (Test-Path $portFile) { Remove-Item $portFile -Force }
Write-Host "data_dir: $DataDir  (clean=$cleanup keepData=$KeepData)"

$env:ROMAI_SMOKE = "1"
$env:ROMAI_SMOKE_SECONDS = "90"
$env:ROMAI_DATA_DIR = $DataDir

# ── 密闭性:冒烟测的是「包里有什么」,不是「宿主机有什么」──
# 开发机系统环境常有 DEEPSEEK_API_KEY 等变量,exe 子进程会继承 → pydantic Settings 环境变量
# 优先于 env_file → keyless 包也会 seed 出 key,-ExpectKeyless 误报。启动前清掉,结束后恢复。
$_isolated = @{}
foreach ($k in @("DEEPSEEK_API_KEY","IMAGE_API_KEY","IMAGE_API_PROVIDER","IMAGE_API_BASE_URL")) {
  $v = [Environment]::GetEnvironmentVariable($k)
  if ($null -ne $v) { $_isolated[$k] = $v; Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
}
if ($_isolated.Count -gt 0) { Write-Host ("env isolated: " + ($_isolated.Keys -join ", ")) }

$proc = $null
try {
  $proc = Start-Process -FilePath $exePath -PassThru -WindowStyle Hidden

  # ── 等 .port 出现(launcher 先写 .port 再起服务)──
  $port = $null
  $deadline = (Get-Date).AddSeconds($ReadyTimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if ($proc.HasExited) { throw "exe 提前退出,退出码 $($proc.ExitCode)(看 $DataDir\launcher.log)" }
    if (Test-Path $portFile) {
      $port = (Get-Content $portFile -Raw).Trim()
      if ($port) { break }
    }
    Start-Sleep -Milliseconds 400
  }
  if (-not $port) { throw "超时未拿到端口($ReadyTimeoutSec s),看 $DataDir\launcher.log" }
  $base = "http://127.0.0.1:$port"

  # ── 再轮询 /health 直到后端真正就绪(避开 写port→起服务 的竞态)──
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    if ($proc.HasExited) { throw "exe 起后端时退出(看 $DataDir\launcher.log)" }
    try {
      $h = Invoke-RestMethod -Uri "$base/health" -Method Get -TimeoutSec 3
      if ($h.status) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 400 }
  }
  if (-not $ready) { throw "后端 $ReadyTimeoutSec s 内未就绪,看 $DataDir\launcher.log" }
  Write-Host "backend ready @ $base`n"

  function Get-Json($path) {
    return Invoke-RestMethod -Uri "$base$path" -Method Get -TimeoutSec 15
  }

  # ── L1:健康 + 五板块各打一个关键只读端点(验证无漏模块 ModuleNotFoundError)──
  Step "health"            { $r = Get-Json "/health";                 if ($r.status -ne "ok" -and $r.status -ne "healthy") { throw "status=$($r.status)" } }
  Step "proj  /api/projects"        { Get-Json "/api/projects" | Out-Null }
  Step "know  /api/knowledge/stats" { Get-Json "/api/knowledge/stats" | Out-Null }
  Step "agent /api/agents"          { Get-Json "/api/agents" | Out-Null }
  Step "hub   /api/skills"          { Get-Json "/api/skills" | Out-Null }
  Step "boss  /api/boss/dashboard"  { Get-Json "/api/boss/dashboard" | Out-Null }
  Step "skill-commands"             { Get-Json "/api/skill-commands" | Out-Null }

  # ── 写操作:建项目→读回(验证 DB 可写 + WAL 正常)──
  $script:pid_created = $null
  Step "POST /api/projects (写)" {
    $body = @{ name = "冒烟项目-$(Get-Random)" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$base/api/projects" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 15
    if (-not $r.id) { throw "未返回 id" }
    $script:pid_created = $r.id
  }
  Step "GET 刚建项目" {
    if ($script:pid_created) { Get-Json "/api/projects/$($script:pid_created)" | Out-Null } else { throw "无 id" }
  }

  # ── 预置 key 验证:设置页是否反映 bundle 注入的 DeepSeek key(无 bundle 则应为 false)──
  Step "GET /api/settings (预置key状态)" {
    $r = Get-Json "/api/settings"
    Write-Host -NoNewline ("deepseek_api_key_set=$($r.deepseek_api_key_set) ")
    # T0-2 出包防呆:keyless 包断言无 key;带 key 包断言有 key。两开关都不给则只报告不断言。
    if ($ExpectKeyless -and $r.deepseek_api_key_set) { throw "断言失败:期望 keyless,但包内预置了 DeepSeek key(.env.bundle 被打入?)" }
    if ($ExpectKey -and -not $r.deepseek_api_key_set) { throw "断言失败:期望预置 key,但未注入(构建时忘了 ROMAI_BUNDLE_KEY=1?)" }
  }

  # ── 前端 dist 同源托管(SPA index)──
  Step "GET / (前端 dist)" {
    $r = Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 15
    if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
    if ($r.Content -notmatch "<div id=`"root`"|<!doctype html|<html") { throw "不像 SPA index" }
  }

} finally {
  if ($proc -and -not $proc.HasExited) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
  Remove-Item Env:ROMAI_SMOKE, Env:ROMAI_SMOKE_SECONDS, Env:ROMAI_DATA_DIR -ErrorAction SilentlyContinue
  foreach ($k in $_isolated.Keys) { [Environment]::SetEnvironmentVariable($k, $_isolated[$k]) }  # 恢复宿主 env
  if ($cleanup -and -not $KeepData) {
    Start-Sleep -Milliseconds 500
    try { Remove-Item -Recurse -Force $DataDir -ErrorAction SilentlyContinue } catch {}
  }
}

Write-Host ""
if ($script:fails -eq 0) {
  Write-Host "✅ 冒烟全过" -ForegroundColor Green
  exit 0
} else {
  Write-Host "❌ 冒烟失败 $script:fails 项" -ForegroundColor Red
  exit 1
}
