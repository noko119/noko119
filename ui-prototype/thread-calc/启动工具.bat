@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  螺纹工具（仅 Windows）
echo  1) 端头结构表：输入型号如 M200X2
echo  2) 接管计算：填写 D1/t1/D2/t2
echo.
start "" "http://127.0.0.1:8080/thread-card.html"
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
echo 未找到 Python。可直接双击打开单文件版：
echo   螺纹端头结构表.html  或  接管端头螺纹.html
start "" "%~dp0螺纹端头结构表.html"
pause
