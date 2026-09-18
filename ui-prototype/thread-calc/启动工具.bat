@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  ========================================
echo   螺纹几何工具（仅 Windows）
echo   标题应为：螺纹尺寸推导 / THREAD LAB
echo   若出现「皮带机」字样 = 开错了
echo  ========================================
echo.
start "" "http://127.0.0.1:8080/"
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
echo 未找到 Python。请先安装 Python 3，并勾选 Add to PATH。
pause
