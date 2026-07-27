@echo off
chcp 65001 >nul
setlocal
title 服装资产库 · 安装开机自启动

echo ============================================
echo   服装资产库反推服务 · 开机自启动安装
echo ============================================
echo.

REM 本 bat 所在目录 = server\scripts
set "SCRIPT_DIR=%~dp0"
set "VBS_PATH=%SCRIPT_DIR%start-hidden.vbs"

if not exist "%VBS_PATH%" (
  echo [错误] 找不到 start-hidden.vbs，请勿移动脚本位置。
  pause
  exit /b 1
)

REM 检测 node
where node >nul 2>nul
if errorlevel 1 (
  if not exist "C:\Program Files\nodejs\node.exe" (
    echo [错误] 未检测到 Node.js，请先安装 Node 18+ 再运行本脚本。
    pause
    exit /b 1
  )
)

REM 目标：启动文件夹里放一个快捷方式指向 vbs
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\服装资产库反推服务.lnk"

echo 正在写入开机启动项...
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%');" ^
  "$s.TargetPath='wscript.exe';" ^
  "$s.Arguments='\"%VBS_PATH%\"';" ^
  "$s.WorkingDirectory='%SCRIPT_DIR%';" ^
  "$s.Description='服装资产库本地反推服务(静默后台)';" ^
  "$s.Save()"

if exist "%LNK%" (
  echo [成功] 已注册开机自启动: %LNK%
) else (
  echo [失败] 无法写入启动项，请以普通用户身份重试。
  pause
  exit /b 1
)

echo.
echo 正在立即启动一次（后台静默，无窗口）...
wscript "%VBS_PATH%"
timeout /t 3 >nul

echo 正在验证服务是否就绪...
powershell -NoProfile -Command ^
  "try{$r=Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 5; if($r.ok){Write-Host '[成功] 反推服务已在后台运行 (provider='$r.provider')' -ForegroundColor Green}else{Write-Host '[警告] 服务返回异常'}}catch{Write-Host '[提示] 暂未探测到服务，稍等几秒后在浏览器点反推即可；若仍失败请重启电脑。' -ForegroundColor Yellow}"

echo.
echo ============================================
echo   安装完成！
echo   以后开机会自动在后台启动反推服务，
echo   无需再手动敲命令。可关闭本窗口。
echo ============================================
echo.
pause
