@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DESEN-SISTEM-KUR.ps1"
endlocal
