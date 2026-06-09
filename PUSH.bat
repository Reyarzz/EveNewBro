@echo off
cd /d "%~dp0"
title Push to GitHub + Release
echo.
echo This pushes code and tags v0.2.3 so GitHub Actions builds Win + Mac installers.
echo You may be asked to sign in to GitHub once.
echo.
pause

git add -A
git reset node_modules 2>nul
git commit -m "Add Ops hub, Photon HUD UI, release workflow, and install docs"
if errorlevel 1 echo (nothing new to commit is OK)

git push origin main
if errorlevel 1 goto fail

git tag -f v0.2.3
git push origin v0.2.3 --force
if errorlevel 1 goto fail

echo.
echo DONE. Open Actions and wait ~10 min for the installer:
echo   https://github.com/Reyarzz/EveNewBro/actions
echo Then players download from:
echo   https://github.com/Reyarzz/EveNewBro/releases/latest
echo.
pause
exit /b 0

:fail
echo.
echo PUSH FAILED - sign in with:  gh auth login
echo Or use GitHub Desktop / a Personal Access Token.
pause
exit /b 1
