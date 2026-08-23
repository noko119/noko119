@echo off
setlocal
set "PY=C:\Users\HP\miniconda3\python.exe"
cd /d "%~dp0.."
if not exist "%PY%" (
  echo 找不到 %PY%
  exit /b 1
)
"%PY%" calc\m01_capacity.py %*
