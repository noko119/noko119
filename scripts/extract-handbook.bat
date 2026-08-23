@echo off
setlocal
cd /d "%~dp0.."
call "%~dp0set-python.bat"
if not exist "%PY%" (
  echo 找不到 Python。
  exit /b 1
)
"%PY%" calc\extract_handbook.py %*
