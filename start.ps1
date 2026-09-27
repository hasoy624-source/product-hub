param([int]$Port = 8010, [switch]$NoWorker)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$python = Join-Path $PSScriptRoot 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath '.\frontend\dist\index.html')) {
    throw 'Run .\setup.ps1 first.'
}
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Port must be between 1024 and 65535.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use. Choose -Port 8011 or stop the earlier server."
}
# This launcher is explicitly local demo mode; production uses compose.yaml.
$env:APP_MODE = 'demo'
$env:PYTHONUTF8 = '1'
$env:FRONTEND_DIST = Join-Path $PSScriptRoot 'frontend\dist'
$env:DATABASE_URL = 'sqlite:///' + (Join-Path $PSScriptRoot 'backend\product-hub.db').Replace('\', '/')
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'logs') | Out-Null
$worker = $null
Push-Location -LiteralPath '.\backend'
try {
    # First initialize schema/demo seed in the API process before starting worker.
    & $python -c 'from app.database import initialize; from app.main import app; from app.seed import seed; initialize(app.state.engine); session=app.state.Session(); seed(session); session.close(); app.state.engine.dispose()'
    if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed.' }
    if (-not $NoWorker) {
        $worker = Start-Process -FilePath $python -ArgumentList '-m','app.worker' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'logs\worker.log') -RedirectStandardError (Join-Path $PSScriptRoot 'logs\worker-error.log')
    }
    Write-Host "Zhixu Product Hub: http://127.0.0.1:$Port (local demo; Ctrl+C to stop)" -ForegroundColor Green
    & $python -m uvicorn app.main:app --host 127.0.0.1 --port $Port
} finally {
    if ($worker -and -not $worker.HasExited) { Stop-Process -Id $worker.Id -ErrorAction SilentlyContinue }
    Pop-Location
}
