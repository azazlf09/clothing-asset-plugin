@echo off
setlocal
title Clothing Asset Server - Uninstall Autostart

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\ClothingAssetServer.lnk"
set "OLD_LNK=%STARTUP%\服装资产库反推服务.lnk"

if exist "%LNK%" (
  del "%LNK%"
  echo [OK] Autostart item removed.
) else (
  echo [INFO] No autostart item found.
)

REM Also remove legacy shortcut from older versions if present
if exist "%OLD_LNK%" (
  del "%OLD_LNK%"
  echo [OK] Legacy autostart item removed.
)

echo.
echo Note: this only cancels autostart. It does not kill a running service.
echo To stop the service now, end node.exe in Task Manager or reboot.
pause
