@echo off
chcp 65001 >nul 2>&1
title 大埔嘉逸影联 - 抓包工具

echo ============================================
echo   大埔嘉逸影联 - API 抓包工具
echo ============================================
echo.

set MITMDUMP="C:\Users\Administrator\.workbuddy\binaries\python\envs\default\Scripts\mitmdump.exe"
set SCRIPT_DIR=%~dp0
set CAPTURE_DIR=%SCRIPT_DIR%..\captured_api

echo [1] 启动 mitmproxy 代理服务器 (端口 8080)...
echo.
echo 重要提示：
echo   1. 确保已安装 mitmproxy CA 证书（运行 install-ca.bat）
echo   2. 确保已设置系统代理或 Proxifier 规则
echo   3. 在微信中打开"大埔嘉逸影联"小程序
echo   4. 正常操作：浏览影片 → 选座 → 下单 → 查看会员 → 积分商城
echo   5. 操作完成后按 Ctrl+C 停止抓包
echo.
echo 抓包数据将保存到: %CAPTURE_DIR%
echo.
echo --------------------------------------------
echo.

%MITMDUMP% -s "%SCRIPT_DIR%mitm_capture.py" -p 8080 --set ssl_insecure=true

echo.
echo --------------------------------------------
echo 抓包已停止。
echo 请运行 analyze.py 分析抓包数据。
echo.
pause
