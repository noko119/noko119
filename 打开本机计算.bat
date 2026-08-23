@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "%~dp0local-calc\index.html" (
  echo 找不到 local-calc\index.html
  echo 请在能看到「打开本机计算.bat」的文件夹里双击。
  pause
  exit /b 1
)
call "%~dp0scripts\set-python.bat"
if exist "%PY%" (
  echo 正在打开本机计算页...
  start "" "http://127.0.0.1:8091/local-calc/index.html"
  echo 浏览器打开后即可载入本机 DTII 手册。
  echo 关闭本窗口即停止。
  "%PY%" -m http.server 8091 --bind 127.0.0.1
) else (
  start "" "%~dp0local-calc\index.html"
)
