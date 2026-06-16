@echo off
setlocal

cd /d "%~dp0"

set "HOST=127.0.0.1"
set "PORT=8799"
set "URL=http://%HOST%:%PORT%/"

title iCloud Mail Panel

echo.
echo ========================================
echo   iCloud Mail Panel
echo ========================================
echo.

where py >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_CMD=py -3"
) else (
  where python >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=python"
  ) else (
    echo Python was not found. Please install Python 3 first.
    echo.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$listener = Get-NetTCPConnection -LocalAddress '%HOST%' -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($listener) { exit 0 } exit 1" >nul 2>nul

if %errorlevel%==0 (
  echo Panel is already running.
  echo Opening %URL%
  start "" "%URL%"
  echo.
  exit /b 0
)

echo Starting panel at %URL%
echo Close this window to stop the panel.
echo.

%PYTHON_CMD% start_panel.py

echo.
echo Panel stopped.
pause
