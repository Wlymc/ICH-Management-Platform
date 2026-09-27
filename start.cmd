@echo off
chcp 65001 >nul
title 非遗数字管理平台
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] 未检测到 Node.js，请先安装 Node.js 22.5 或更高版本。
  echo         下载地址：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动 非遗数字管理平台 ...
echo   浏览器访问： http://localhost:3000
echo   管理端：     http://localhost:3000/admin
echo   按 Ctrl+C 可停止服务
echo.

start "" http://localhost:3000
node --disable-warning=ExperimentalWarning server.js

echo.
echo 服务已停止。
pause
