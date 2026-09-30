@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "VENV_PY=.venv\Scripts\python.exe"

if not exist "%VENV_PY%" (
  echo ERROR: The project virtual environment is missing.
  echo Run setup-windows.bat first.
  echo.
  echo Expected file:
  echo   %CD%\.venv\Scripts\python.exe
  pause
  exit /b 1
)

echo Starting RSG Dashboard...
echo Open http://127.0.0.1:8765 in your browser.
echo Press Ctrl+C in this window to stop the server.
echo.

"%VENV_PY%" run.py

if errorlevel 1 (
  echo.
  echo ERROR: The dashboard stopped with an error.
  pause
  exit /b 1
)
