@echo off
REM ---- Whistle Ready: local preview launcher ----
REM Double-click this to run the app locally with instant hot-reload at http://localhost:3000
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org then run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First-time setup: installing dependencies. This can take a few minutes...
  call npm install
)

echo.
echo Starting local preview at http://localhost:3000
echo Leave this window open while you work. Close it (or press Ctrl+C) to stop.
echo.
start "" http://localhost:3000
call npm run dev
pause
