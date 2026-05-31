# Build EVE NewBro installer for Windows.
# Right-click -> Run with PowerShell, or:  powershell -ExecutionPolicy Bypass -File build-windows.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ''
Write-Host '=== EVE NewBro — Windows build ===' -ForegroundColor Cyan
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'ERROR: Node.js is not installed.' -ForegroundColor Red
  Write-Host 'Install from https://nodejs.org/ (LTS), then run this script again.'
  Read-Host 'Press Enter to exit'
  exit 1
}

Write-Host "Node: $(node -v)"
Write-Host ''

Write-Host 'Installing dependencies (first time may take a few minutes)...' -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
  Write-Host 'npm install failed.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit $LASTEXITCODE
}

Write-Host ''
Write-Host 'Generating app icon...' -ForegroundColor Yellow
npm run icons
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Icon generation failed.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit $LASTEXITCODE
}

Write-Host ''
Write-Host 'Building installer (downloads Electron — can take 5–15 min)...' -ForegroundColor Yellow
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Build failed. See errors above.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit $LASTEXITCODE
}

$dist = Join-Path $PSScriptRoot 'dist'
if (Test-Path $dist) {
  Write-Host ''
  Write-Host 'SUCCESS — installer is here:' -ForegroundColor Green
  Get-ChildItem $dist -Filter '*.exe' | ForEach-Object { Write-Host "  $($_.FullName)" }
  explorer.exe $dist
} else {
  Write-Host 'Build finished but dist folder is missing — check errors above.' -ForegroundColor Red
}

Write-Host ''
Read-Host 'Press Enter to exit'
