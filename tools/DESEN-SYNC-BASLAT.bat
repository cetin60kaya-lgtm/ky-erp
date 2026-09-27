@echo off
setlocal
start "KY ERP Desen Sync" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DESEN-SYNC-CALISTIR.ps1"
endlocal
