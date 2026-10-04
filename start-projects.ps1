param([int]$Port = 8011)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$python = Join-Path $PSScriptRoot 'backend\.venv\Scripts\python.exe'
$dist = Join-Path $PSScriptRoot 'frontend\dist-local'
$db = Join-Path $PSScriptRoot 'backend\project-workspace.db'
if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath "$dist\index.html") -or -not (Test-Path -LiteralPath $db)) {
    throw 'Local project database/build missing. Import the register and build frontend/dist-local first.'
}
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Port must be between 1024 and 65535.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already in use." }
$env:APP_MODE = 'demo'
$env:PYTHONUTF8 = '1'
$env:FRONTEND_DIST = $dist
$env:PROJECT_DATABASE_URL = 'sqlite:///' + $db.Replace('\', '/')
$env:PROJECT_ASSETS = Join-Path $PSScriptRoot 'backend\import-assets'
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'backend')
try {
    Write-Host "Project workspace: http://127.0.0.1:$Port/#projects"
    & $python -m uvicorn app.project_workspace:app --host 127.0.0.1 --port $Port
} finally { Pop-Location }
