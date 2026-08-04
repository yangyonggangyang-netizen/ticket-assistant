@echo off
chcp 65001 >nul 2>&1
title 安装 mitmproxy CA 证书

echo ============================================
echo   安装 mitmproxy CA 证书
echo ============================================
echo.

set MITM_PROXY=http://127.0.0.1:8080

echo [步骤] 请按以下顺序操作：
echo.
echo 1. 先启动 mitmproxy（运行 start-capture.bat）
echo 2. 确认 mitmproxy 正在运行（端口 8080）
echo 3. 然后运行本脚本安装证书
echo.

echo 正在设置临时系统代理...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer /t REG_SZ /d "127.0.0.1:8080" /f >nul 2>&1

echo 正在下载 mitmproxy CA 证书...
powershell -Command "try { Invoke-WebRequest -Uri 'http://mitm.it/cert/cer' -Proxy 'http://127.0.0.1:8080' -OutFile '%TEMP%\mitmproxy-ca.cer' -UseBasicParsing; Write-Host '证书下载成功' } catch { Write-Host '证书下载失败，请确保 mitmproxy 正在运行'; exit 1 }"

if not exist "%TEMP%\mitmproxy-ca.cer" (
    echo.
    echo [错误] 证书下载失败！
    echo 请确保 mitmproxy 正在运行（端口 8080）
    echo.
    pause
    exit /b 1
)

echo 正在安装证书到受信任的根证书颁发机构...
certutil -addstore -user Root "%TEMP%\mitmproxy-ca.cer" >nul 2>&1

if %errorlevel% equ 0 (
    echo.
    echo [成功] 证书已安装！
) else (
    echo.
    echo [尝试] 使用 PowerShell 安装...
    powershell -Command "Import-Certificate -FilePath '%TEMP%\mitmproxy-ca.cer' -CertStoreLocation Cert:\CurrentUser\Root" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [成功] 证书已安装！
    ) else (
        echo [错误] 自动安装失败，请手动安装：
        echo   1. 双击打开 %TEMP%\mitmproxy-ca.cer
        echo   2. 点击"安装证书"
        echo   3. 选择"本地计算机"
        echo   4. 选择"将所有的证书放入下列存储"
        echo   5. 浏览选择"受信任的根证书颁发机构"
        echo   6. 完成
    )
)

echo.
echo 正在移除临时系统代理...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f >nul 2>&1

echo.
echo ============================================
echo   证书安装完成！
echo ============================================
echo.
echo 现在可以：
echo   1. 配置 Proxifier 规则（推荐）
echo   2. 或设置系统代理
echo   3. 运行 start-capture.bat 开始抓包
echo.
pause
