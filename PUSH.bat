@echo off
cd /d "%~dp0"
title Push to GitHub + Release
echo.
echo This pushes code and tags v0.2.6 so GitHub Actions builds Win + Mac installers.
echo You may be asked to sign in to GitHub once.
echo.
pause

git add -A
git reset node_modules 2>nul
git commit -m "Fix Mac build (zip target for auto-update) + update CI actions to Node 24"
if errorlevel 1 echo (nothing new to commit is OK)

git push origin main
if errorlevel 1 goto fail

git tag v0.2.6
git push origin v0.2.6
if errorlevel 1 goto fail

echo.
echo DONE. Open Actions and wait ~10 min for green checkmark:
echo   https://github.com/Reyarzz/EveNewBro/actions
echo.
echo Release should then show (below the automatic source zip/tar.gz):
echo   EVE-NewBro-Setup-0.2.6.exe
echo   EVE-NewBro-0.2.6-arm64.dmg
echo   EVE-NewBro-0.2.6-x64.dmg
echo.
echo If CI fails, upload your local dist\*.exe manually:
echo   powershell -ExecutionPolicy Bypass -File scripts\upload-release.ps1
echo.
pause
exit /b 0

:fail
echo.
echo PUSH FAILED - sign in with:  gh auth login
echo Or use GitHub Desktop / a Personal Access Token.
pause
exit /b 1
