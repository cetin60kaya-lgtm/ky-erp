@echo off
setlocal
title KY ERP - Desen Bulut Aktarimi
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0DESEN-AKTAR.ps1"
set "EXITCODE=%ERRORLEVEL%"
endlocal & exit /b %EXITCODE%
