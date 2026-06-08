$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$log = Join-Path $PSScriptRoot 'deploy-result.txt'
function Log($msg) { Add-Content -Path $log -Value $msg; Write-Host $msg }

Remove-Item $log -ErrorAction SilentlyContinue
Log "=== EVE NewBro deploy $(Get-Date -Format o) ==="

$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

Log "npm install..."
npm install 2>&1 | Out-File -Append $log
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Log "npm run build..."
npm run build 2>&1 | Out-File -Append $log
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

$exe = Join-Path $PSScriptRoot 'dist\EVE-NewBro-Setup-0.2.1.exe'
if (-not (Test-Path $exe)) {
  $alt = Get-ChildItem dist\*.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($alt) { $exe = $alt.FullName } else { throw "No installer exe in dist" }
}
Log "Installer: $exe"

Log "git add..."
git add -A 2>&1 | Out-File -Append $log
git reset node_modules 2>&1 | Out-File -Append $log

$porcelain = git status --porcelain 2>&1
if ($porcelain) {
  Log "git commit..."
  git commit -m "Add Ops hub, Photon HUD overlay UI, and block dock webview ad trackers" 2>&1 | Out-File -Append $log
  if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
} else {
  Log "git: nothing to commit"
}

$hash = (git rev-parse HEAD 2>&1 | Out-String).Trim()
Log "Commit: $hash"

Log "git push..."
git push origin main 2>&1 | Out-File -Append $log
if ($LASTEXITCODE -ne 0) { throw "git push failed" }
Log "Push: OK"

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
  Log "gh CLI not found — upload $exe manually to GitHub Releases"
  Log "DONE (no release)"
  exit 0
}

Log "gh release..."
$notes = @"
## EVE NewBro 0.2.1

- **Ops tab** — 10 veteran tools (route brief, threat fusion, killmail analyze, courier board, WH log, fleet rollup, arbitrage, fit logistics, gate camps)
- **Photon HUD UI** — overlay-first design aligned with EVE client aesthetics
- **Webview guard** — blocks ad/tracker iframes in zKill/Dotlan map dock (stops console spam)
"@
gh release delete v0.2.1 -y 2>&1 | Out-File -Append $log
gh release create v0.2.1 --title "EVE NewBro 0.2.1" --notes $notes $exe 2>&1 | Out-File -Append $log
if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }

$url = (gh release view v0.2.1 --json url -q .url 2>&1 | Out-String).Trim()
Log "Release: $url"
Log "DONE"
