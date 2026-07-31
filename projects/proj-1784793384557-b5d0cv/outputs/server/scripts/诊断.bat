@echo off
REM ASCII-only wrapper. Runs diagnose.ps1 with UTF-8 console so Chinese shows correctly.
chcp 65001 >nul
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%diagnose.ps1"
echo.
pause
