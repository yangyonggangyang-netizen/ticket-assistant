@echo off
chcp 65001 >nul 2>&1
title 分析抓包数据

echo ============================================
echo   分析抓包数据
echo ============================================
echo.

set PYTHON="C:\Users\Administrator\.workbuddy\binaries\python\envs\default\Scripts\python.exe"
set SCRIPT_DIR=%~dp0

%PYTHON% "%SCRIPT_DIR%analyze.py"

echo.
pause
