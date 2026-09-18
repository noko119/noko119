@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  正在启动【螺纹几何工具】...
echo  请确认浏览器标题是：螺纹尺寸推导
echo  若出现「皮带机」字样，说明开错了。
echo.
start "" "http://127.0.0.1:8080/"
python -m http.server 8080
if errorlevel 1 py -m http.server 8080
pause
