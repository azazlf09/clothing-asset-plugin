@echo off
setlocal
title Clothing Asset Server - Install Autostart

echo ============================================
echo   Clothing Asset Reason Service
echo   Install Windows Autostart
echo ============================================
echo.

REM This bat lives in server\scripts
set "SCRIPT_DIR=%~dp0"
set "VBS_PATH=%SCRIPT_DIR%start-hidden.vbs"

if not exist "%VBS_PATH%" (
  echo [ERROR] start-hidden.vbs not found. Do not move the scripts.
  pause
  exit /b 1
)

REM Detect node
where node >nul 2>nul
if errorlevel 1 (
  if not exist "C:\Program Files\nodejs\node.exe" (
    echo [ERROR] Node.js not found. Please install Node 18+ first.
    pause
    exit /b 1
  )
)

REM Put a shortcut in the Startup folder pointing to the vbs
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\ClothingAssetServer.lnk"

echo Writing autostart shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%');" ^
  "$s.TargetPath='wscript.exe';" ^
  "$s.Arguments='\"%VBS_PATH%\"';" ^
  "$s.WorkingDirectory='%SCRIPT_DIR%';" ^
  "$s.Description='Clothing Asset local reason service (silent background)';" ^
  "$s.Save()"

if exist "%LNK%" (
  echo [OK] Autostart registered: %LNK%
) else (
  echo [FAIL] Could not write startup item. Try running again as normal user.
  pause
  exit /b 1
)

echo.
echo Starting service now (silent background, no window)...
wscript "%VBS_PATH%"
timeout /t 3 >nul

echo Verifying service health...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try{$r=Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 5; if($r.ok){Write-Host ('[OK] Reason service is running (provider='+$r.provider+')') -ForegroundColor Green}else{Write-Host '[WARN] Service returned unexpected response'}}catch{Write-Host '[INFO] Service not detected yet. Wait a few seconds then click Reason in browser. If it still fails, reboot.' -ForegroundColor Yellow}"

echo.
echo ============================================
echo   Install complete.
echo   The reason service will auto-start on boot
echo   in the background. You can close this window.
echo ============================================
echo.
pause
