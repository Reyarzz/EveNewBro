@echo off
cd /d "%~dp0"
title EVE NewBro Build
echo.
echo === EVE NewBro Windows Build ===
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Download from https://nodejs.org/ then run this again.
  pause
  exit /b 1
)

echo Node version:
node -v
echo.

echo [1/3] npm install ...
call npm install
if errorlevel 1 goto fail

echo.
echo [2/3] npm run icons ...
call npm run icons
if errorlevel 1 goto fail

echo.
echo [3/3] npm run build ...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run build
if errorlevel 1 goto fail

echo.
if exist dist\*.exe (
  echo SUCCESS. Installer is in the dist folder:
  dir /b dist\*.exe
  start "" dist
) else (
  echo Build finished but no .exe in dist - check errors above.
)
echo.
pause
exit /b 0

:fail
echo.
echo BUILD FAILED. See errors above. Read BUILD.md for help.
pause
exit /b 1
