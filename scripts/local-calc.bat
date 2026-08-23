@echo off
chcp 65001 >nul
setlocal
set "PYTHONIOENCODING=utf-8"
set "PY=C:\Users\HP\miniconda3\python.exe"
cd /d "%~dp0.."
if not exist "%PY%" (
  echo 找不到 %PY%
  echo 请确认 Miniconda 已安装在该路径。
  pause
  exit /b 1
)
"%PY%" calc\local_app.py
if errorlevel 1 pause
