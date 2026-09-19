@echo off
cd /d "%~dp0"
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator rights...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo === PIDM DTII SolidWorks Add-in : one-click test ===
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0.' -Recurse | Unblock-File"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\quickstart.ps1"
if exist "%~dp0tools\selfcheck-report.txt" start notepad "%~dp0tools\selfcheck-report.txt"
if exist "%~dp0tools\sw-smoke-report.txt" start notepad "%~dp0tools\sw-smoke-report.txt"
echo.
echo Done. Two Notepad windows show the reports - screenshot them.
pause
