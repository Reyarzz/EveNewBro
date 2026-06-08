# Maintainer: commit your changes, then run this to trigger the GitHub Actions release build.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\tag-and-release.ps1
# Optional:  -Version 0.2.2  to bump package.json first

param(
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if ($Version) {
  $raw = Get-Content package.json -Raw
  $updated = $raw -replace '"version"\s*:\s*"[^"]+"', "`"version`": `"$Version`""
  Set-Content package.json $updated -NoNewline
  Write-Host "Bumped package.json to $Version" -ForegroundColor Cyan
}

$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$v"

$dirty = git status --porcelain
if ($dirty) {
  Write-Host 'Uncommitted changes — commit first:' -ForegroundColor Yellow
  git status --short
  exit 1
}

$exists = git tag -l $tag
if ($exists) {
  Write-Host "Tag $tag already exists. Bump version in package.json or delete the tag." -ForegroundColor Red
  exit 1
}

Write-Host "Creating tag $tag and pushing..." -ForegroundColor Cyan
git tag $tag
git push origin main
git push origin $tag

Write-Host ''
Write-Host "Pushed $tag — GitHub Actions will build the installer." -ForegroundColor Green
Write-Host 'Watch: https://github.com/Reyarzz/EveNewBro/actions' -ForegroundColor Green
Write-Host "When done: https://github.com/Reyarzz/EveNewBro/releases/tag/$tag" -ForegroundColor Green
