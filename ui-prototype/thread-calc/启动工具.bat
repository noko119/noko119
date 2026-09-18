@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  螺纹 / 锥管模具工具（仅 Windows）
echo  默认打开：锥管模具分段
echo.
start "" "http://127.0.0.1:8080/cone-mold.html"
where python >nul 2>&1
if %errorlevel%==0 (
  python -m http.server 8080
  goto :eof
)
where py >nul 2>&1
if %errorlevel%==0 (
  py -m http.server 8080
  goto :eof
)
echo 未找到 Python。可直接双击单文件版：
echo   锥管模具分段.html
start "" "%~dp0锥管模具分段.html"
pause
