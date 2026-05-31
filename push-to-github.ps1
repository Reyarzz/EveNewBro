# First-time push to https://github.com/Reyarzz/EveNewBro
# Run in PowerShell:  powershell -ExecutionPolicy Bypass -File push-to-github.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host 'Git is not installed. Install from https://git-scm.com/download/win' -ForegroundColor Red
  Write-Host 'Or: winget install Git.Git'
  Read-Host 'Press Enter to exit'
  exit 1
}

if (-not (Test-Path .git)) {
  Write-Host 'Initializing git repository...' -ForegroundColor Cyan
  git init
}

$status = git status --porcelain
if ($status) {
  Write-Host 'Committing project files...' -ForegroundColor Cyan
  git add -A
  git commit -m "Initial commit: EVE NewBro overlay"
} else {
  Write-Host 'No changes to commit (already clean).' -ForegroundColor Yellow
}

$originUrl = 'https://github.com/Reyarzz/EveNewBro.git'
$remotes = @(git remote 2>$null)
if ($remotes -notcontains 'origin') {
  git remote add origin $originUrl
  if ($LASTEXITCODE -ne 0) { throw 'git remote add failed' }
  Write-Host 'Added remote origin.' -ForegroundColor Green
} else {
  $current = (git remote get-url origin 2>$null | Out-String).Trim()
  if ($current -and $current -ne $originUrl) {
    git remote set-url origin $originUrl
    Write-Host 'Updated remote origin URL.' -ForegroundColor Green
  } else {
    Write-Host 'Remote origin already set.' -ForegroundColor DarkGray
  }
}

git branch -M main

Write-Host ''
Write-Host 'Pushing to GitHub (you may be asked to sign in)...' -ForegroundColor Cyan
git push -u origin main

if ($LASTEXITCODE -eq 0) {
  Write-Host ''
  Write-Host 'SUCCESS: https://github.com/Reyarzz/EveNewBro' -ForegroundColor Green
  Write-Host ''
  Write-Host 'Next: upload dist\EVE-NewBro-Setup-0.2.0.exe as a GitHub Release' -ForegroundColor Yellow
  Write-Host '  Repo -> Releases -> Create release -> attach the .exe'
} else {
  Write-Host ''
  Write-Host 'Push failed. Common fixes:' -ForegroundColor Red
  Write-Host '  1. Create empty repo at https://github.com/Reyarzz/EveNewBro (no README if git complains)'
  Write-Host '  2. Sign in: gh auth login   OR use a Personal Access Token when prompted'
  Write-Host '  3. If repo has README already: git pull origin main --rebase  then push again'
}

Write-Host ''
Read-Host 'Press Enter to exit'
