$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repo "backend\.venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) { throw "缺少 backend/.venv，请先安装后端依赖。" }

Push-Location (Join-Path $repo "backend")
try {
    & $python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
    if ($LASTEXITCODE -ne 0) { throw "uvicorn exited: $LASTEXITCODE" }
} finally {
    Pop-Location
}
