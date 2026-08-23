@echo off
rem Sets PY to a usable python.exe. Call from other scripts after setlocal.
set "PY="
if defined CONDA_PREFIX if exist "%CONDA_PREFIX%\python.exe" set "PY=%CONDA_PREFIX%\python.exe"
if not defined PY if exist "%USERPROFILE%\miniconda3\python.exe" set "PY=%USERPROFILE%\miniconda3\python.exe"
if not defined PY if exist "%USERPROFILE%\Miniconda3\python.exe" set "PY=%USERPROFILE%\Miniconda3\python.exe"
if not defined PY if exist "%USERPROFILE%\anaconda3\python.exe" set "PY=%USERPROFILE%\anaconda3\python.exe"
if not defined PY if exist "C:\Users\HP\miniconda3\python.exe" set "PY=C:\Users\HP\miniconda3\python.exe"
if not defined PY (
  for /f "delims=" %%I in ('where python 2^>nul') do (
    echo %%I | find /i "WindowsApps" >nul
    if errorlevel 1 (
      set "PY=%%I"
      goto :eof
    )
  )
)
