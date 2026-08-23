@echo off
cd /d "%~dp0"
if not exist "%~dp0local-calc\index.html" (
  echo 找不到 local-calc\index.html
  echo 请在能看到「打开本机计算.bat」的文件夹里双击。
  pause
  exit /b 1
)
start "" "%~dp0local-calc\index.html"
