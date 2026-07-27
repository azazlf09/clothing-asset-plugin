@echo off
chcp 65001 >nul
title 服装资产库 · 卸载开机自启动

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\服装资产库反推服务.lnk"

if exist "%LNK%" (
  del "%LNK%"
  echo [成功] 已移除开机自启动项。
) else (
  echo [提示] 未发现自启动项，无需卸载。
)

echo.
echo 注：本操作只取消开机自启，不会删除已在运行的服务进程。
echo 如需立即停止服务，可在任务管理器结束 node.exe，或直接重启电脑。
pause
