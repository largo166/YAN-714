$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $repo "backend"
$python = Join-Path $backend ".venv\Scripts\python.exe"
$distIndex = Join-Path $repo "frontend\dist\seasky.html"
$runtime = Join-Path $repo "logs\public"
$origin = "http://127.0.0.1:8010"

if (-not (Test-Path -LiteralPath $python)) { throw "Missing backend/.venv. Install backend dependencies first." }
if (-not (Test-Path -LiteralPath $distIndex)) { throw "Missing frontend/dist. Run scripts/build-public.ps1 first." }

New-Item -ItemType Directory -Force -Path $runtime | Out-Null

function Stop-RecordedProcess([string]$PidFile, [string[]]$AllowedNames) {
    if (-not (Test-Path -LiteralPath $PidFile)) { return }
    $recorded = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    $processId = 0
    if (-not [int]::TryParse($recorded, [ref]$processId)) { return }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process -and $AllowedNames -contains $process.ProcessName) {
        Stop-Process -Id $processId -Force
        $process.WaitForExit(5000)
    }
}

$backendPid = Join-Path $runtime "backend.pid"
$tunnelPid = Join-Path $runtime "tunnel.pid"
$launcherPid = Join-Path $runtime "tunnel-launcher.pid"
Stop-RecordedProcess $backendPid @("python")
Stop-RecordedProcess $tunnelPid @("cloudflared")
Stop-RecordedProcess $launcherPid @("cmd", "node", "npm", "npx")

$backendOut = Join-Path $runtime "backend.out.log"
$backendErr = Join-Path $runtime "backend.err.log"
$tunnelOut = Join-Path $runtime "tunnel.out.log"
$tunnelErr = Join-Path $runtime "tunnel.err.log"
foreach ($path in $backendOut, $backendErr, $tunnelOut, $tunnelErr) {
    if (Test-Path -LiteralPath $path) { Clear-Content -LiteralPath $path }
}

$backendProcess = Start-Process `
    -FilePath $python `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8010") `
    -WorkingDirectory $backend `
    -WindowStyle Hidden `
    -RedirectStandardOutput $backendOut `
    -RedirectStandardError $backendErr `
    -PassThru
Set-Content -LiteralPath $backendPid -Value $backendProcess.Id

$localReady = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$origin/health" -TimeoutSec 2
        if ($response.StatusCode -eq 200) { $localReady = $true; break }
    } catch { }
}
if (-not $localReady) {
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    throw "Public backend did not become ready within 30 seconds. Check $backendErr"
}

$cloudflaredBefore = @(Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$npx = (Get-Command npx.cmd -ErrorAction Stop).Source
$tunnelLauncher = Start-Process `
    -FilePath $npx `
    -ArgumentList @("--yes", "wrangler@latest", "tunnel", "quick-start", $origin) `
    -WorkingDirectory $repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput $tunnelOut `
    -RedirectStandardError $tunnelErr `
    -PassThru
Set-Content -LiteralPath $launcherPid -Value $tunnelLauncher.Id

$publicUrl = $null
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    $log = ""
    if (Test-Path -LiteralPath $tunnelOut) { $log += Get-Content -LiteralPath $tunnelOut -Raw }
    if (Test-Path -LiteralPath $tunnelErr) { $log += Get-Content -LiteralPath $tunnelErr -Raw }
    $match = [regex]::Match($log, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($match.Success) { $publicUrl = $match.Value; break }
}
if (-not $publicUrl) {
    Stop-Process -Id $tunnelLauncher.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    throw "Quick Tunnel URL was not available within 45 seconds. Check $tunnelErr"
}

$newCloudflared = Get-Process cloudflared -ErrorAction SilentlyContinue |
    Where-Object { $cloudflaredBefore -notcontains $_.Id } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1
if ($newCloudflared) { Set-Content -LiteralPath $tunnelPid -Value $newCloudflared.Id }
Set-Content -LiteralPath (Join-Path $runtime "public-url.txt") -Value $publicUrl

$publicReady = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$publicUrl/health" -TimeoutSec 5
        if ($response.StatusCode -eq 200) { $publicReady = $true; break }
    } catch { }
}
if (-not $publicReady) { throw "Tunnel URL was created but public health check failed: $publicUrl" }

Write-Output $publicUrl
