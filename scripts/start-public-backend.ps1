$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo "deploy\public.env"
if (-not (Test-Path -LiteralPath $envFile)) {
    throw "缺少 deploy/public.env；请从 deploy/public.env.example 复制并填写。"
}

Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $pair = $line.Split("=", 2)
    if ($pair.Count -ne 2 -or -not $pair[0].Trim()) { throw "public.env 存在无效行" }
    [Environment]::SetEnvironmentVariable($pair[0].Trim(), $pair[1], "Process")
}

$python = Join-Path $repo "backend\.venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) { throw "缺少 backend/.venv，请先安装后端依赖。" }

Push-Location (Join-Path $repo "backend")
try {
    & $python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
    if ($LASTEXITCODE -ne 0) { throw "uvicorn exited: $LASTEXITCODE" }
} finally {
    Pop-Location
}
