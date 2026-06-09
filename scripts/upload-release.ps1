# Manual fallback: attach installers when CI did not publish them.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\upload-release.ps1
# Optional:  -Tag v0.2.4

param(
  [string]$Tag = ''
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not $Tag) {
  $v = (Get-Content package.json -Raw | ConvertFrom-Json).version
  $Tag = "v$v"
}

$dist = Join-Path (Get-Location) 'dist'
$files = @()
if (Test-Path $dist) {
  $files += Get-ChildItem $dist -File -Include '*.exe', '*.dmg' -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host "=== Upload installers to GitHub Release $Tag ===" -ForegroundColor Cyan
Write-Host ''

if (-not $files.Count) {
  Write-Host 'No .exe or .dmg in dist/. Build first:' -ForegroundColor Yellow
  Write-Host '  powershell -ExecutionPolicy Bypass -File build-windows.ps1' -ForegroundColor White
  Write-Host '  (Mac .dmg files are built by GitHub Actions on macos-latest)' -ForegroundColor DarkGray
  exit 1
}

Write-Host 'Files to upload:' -ForegroundColor Green
$files | ForEach-Object { Write-Host "  $($_.Name)" }

if (Get-Command gh -ErrorAction SilentlyContinue) {
  Write-Host ''
  Write-Host 'Uploading via GitHub CLI...' -ForegroundColor Cyan
  $paths = $files | ForEach-Object { $_.FullName }
  gh release upload $Tag @paths --clobber
  if ($LASTEXITCODE -eq 0) {
    Write-Host ''
    Write-Host "Done: https://github.com/Reyarzz/EveNewBro/releases/tag/$Tag" -ForegroundColor Green
    exit 0
  }
  Write-Host 'gh upload failed — use the browser steps below.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'GitHub CLI not found or upload failed. Upload in the browser:' -ForegroundColor Yellow
Write-Host "  1. Open https://github.com/Reyarzz/EveNewBro/releases/new" -ForegroundColor White
Write-Host "  2. Choose tag: $Tag (create from main if missing)" -ForegroundColor White
Write-Host '  3. Drag these files from dist/ into Assets:' -ForegroundColor White
$files | ForEach-Object { Write-Host "     $($_.Name)" -ForegroundColor White }
Write-Host '  4. Publish release' -ForegroundColor White
Write-Host ''
Write-Host 'Install gh for one-command upload: winget install GitHub.cli' -ForegroundColor DarkGray

explorer.exe $dist
Start-Process "https://github.com/Reyarzz/EveNewBro/releases/new?tag=$Tag"
