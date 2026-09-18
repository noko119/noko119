@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  接管端头螺纹计算（仅 Windows）
echo  打开后填写 D1/t1/D2/t2，点生成数据
echo.
start "" "http://127.0.0.1:8080/pipe-end.html"
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
echo 未找到 Python。可直接双击打开「接管端头螺纹.html」单文件版。
start "" "%~dp0接管端头螺纹.html"
pause
