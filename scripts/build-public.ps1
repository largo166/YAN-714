$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $repo "frontend"

Push-Location $frontend
try {
    Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "frontend build failed: $LASTEXITCODE" }
} finally {
    Pop-Location
}

$hash = (git -C $repo rev-parse --short HEAD).Trim()
Write-Host "dist build complete (git $hash)"
