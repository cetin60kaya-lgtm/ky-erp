@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%SCRIPTS\KYERP_LIFECYCLE.ps1" status
pause
