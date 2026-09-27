$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function Confirm-NativeSuccess([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE" }
}
if (-not (Test-Path -LiteralPath '.\backend\.venv\Scripts\python.exe')) {
    python -m venv .\backend\.venv
    Confirm-NativeSuccess 'Create Python environment'
}
& .\backend\.venv\Scripts\python.exe -m pip install -r .\backend\requirements-dev.txt
Confirm-NativeSuccess 'Install backend and test dependencies'
Push-Location -LiteralPath '.\frontend'
try {
    npm.cmd ci
    Confirm-NativeSuccess 'Install frontend dependencies'
    npm.cmd run build
    Confirm-NativeSuccess 'Build frontend'
} finally { Pop-Location }
Write-Host 'Setup complete. Start with: .\start.ps1' -ForegroundColor Green
