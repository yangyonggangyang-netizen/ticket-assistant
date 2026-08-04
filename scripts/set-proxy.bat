@echo off
chcp 65001 >nul 2>&1
title 设置/移除系统代理

echo ============================================
echo   系统代理管理工具
echo ============================================
echo.

if "%1"=="on" goto set_proxy
if "%1"=="off" goto remove_proxy
if "%1"=="status" goto show_status

echo 用法:
echo   set-proxy.bat on      设置系统代理为 127.0.0.1:8080
echo   set-proxy.bat off     移除系统代理
echo   set-proxy.bat status  查看当前代理状态
echo.
goto end

:set_proxy
echo 正在设置系统代理...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer /t REG_SZ /d "127.0.0.1:8080" /f
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyOverride /t REG_SZ /d "localhost;127.0.0.1" /f
echo.
echo [完成] 系统代理已设置为 127.0.0.1:8080
echo.
echo 注意：微信小程序可能不遵循系统代理设置。
echo 如果抓不到包，请使用 Proxifier 进行进程级代理。
echo.
echo Proxifier 配置：
echo   1. 打开 Proxifier
echo   2. Profile -> Proxy Servers -> Add
echo      Address: 127.0.0.1  Port: 8080  Protocol: HTTPS
echo   3. Profile -> Proxification Rules -> Add
echo      Name: WeChat Mini Program
echo      Applications: WeChatAppEx.exe; WeChat.exe
echo      Action: Proxy HTTPS 127.0.0.1
echo.
goto end

:remove_proxy
echo 正在移除系统代理...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f
echo.
echo [完成] 系统代理已移除
echo.
goto end

:show_status
echo 当前代理状态：
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable 2>nul
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer 2>nul
echo.
goto end

:end
