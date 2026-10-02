@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM ------------------------------------------------------------
REM BD Dashboard - Windows setup
REM This script intentionally uses the venv Python directly.
REM It does NOT depend on activate.bat.
REM ------------------------------------------------------------

echo Checking Python...

set "PY_CMD="

REM Prefer Python 3.11 when it is installed.
where py >nul 2>nul
if not errorlevel 1 (
  py -3.11 -c "import sys" >nul 2>nul
  if not errorlevel 1 set "PY_CMD=py -3.11"
)

REM Otherwise use the default Python 3 registered with the launcher.
if not defined PY_CMD (
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 -c "import sys" >nul 2>nul
    if not errorlevel 1 set "PY_CMD=py -3"
  )
)

REM Last fallback: use python.exe from PATH.
if not defined PY_CMD (
  where python >nul 2>nul
  if not errorlevel 1 (
    python -c "import sys" >nul 2>nul
    if not errorlevel 1 set "PY_CMD=python"
  )
)

if not defined PY_CMD (
  echo.
  echo ERROR: Python 3 was not found.
  echo Install Python 3.11 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

echo Using: %PY_CMD%

REM If an earlier failed setup left a broken .venv, remove it.
if not exist ".venv\Scripts\python.exe" (
  if exist ".venv" (
    echo Removing incomplete virtual environment...
    rmdir /s /q ".venv"
  )

  echo Creating virtual environment...
  %PY_CMD% -m venv ".venv"

  if errorlevel 1 (
    echo.
    echo ERROR: Could not create .venv.
    echo Try this command manually:
    echo     python -m venv .venv
    echo.
    pause
    exit /b 1
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo.
  echo ERROR: .venv was not created correctly.
  echo Expected file: .venv\Scripts\python.exe
  echo.
  pause
  exit /b 1
)

set "VENV_PY=.venv\Scripts\python.exe"

echo.
echo Virtual environment ready.
echo Installing dependencies into .venv...

"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 goto :pip_error

"%VENV_PY%" -m pip install -r requirements.txt
if errorlevel 1 goto :pip_error

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo Created .env from .env.example
)

echo.
echo Setup complete.
echo Virtual environment: %CD%\.venv
echo Local use: keep the default BD_HOST and blank registration code.
echo LAN use: set BD_HOST=0.0.0.0 and a private BD_REGISTRATION_CODE in .env.
echo Next: run start-windows.bat
echo.
pause
exit /b 0

:pip_error
echo.
echo ERROR: Dependency installation failed.
echo Nothing else was started.
echo.
pause
exit /b 1
