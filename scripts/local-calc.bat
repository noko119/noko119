@echo off
chcp 65001 >nul
setlocal
set "PYTHONIOENCODING=utf-8"
cd /d "%~dp0.."
call "%~dp0set-python.bat"
if not exist "%PY%" (
  echo 找不到 Python。请在这台电脑安装 Miniconda，或从开始菜单打开 Anaconda Prompt 后再双击本文件。
  pause
  exit /b 1
)
echo 使用: %PY%
"%PY%" calc\local_app.py
if errorlevel 1 pause
