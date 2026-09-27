@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "NO_COLOR=1"
set "FORCE_COLOR=0"
title KY ERP - RESEND AKTIF SECRET ONARIMI

set "ROOT=%~dp0"
set "SCRIPT=%ROOT%KYERP_RESEND_ACTIVE_SECRET_REPAIR.ps1"
set "PWSH="

if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined PWSH for /f "delims=" %%P in ('where pwsh.exe 2^>nul') do if not defined PWSH set "PWSH=%%P"

if not defined PWSH (
  echo [HATA] PowerShell 7 bulunamadi.
  goto :FAIL
)
if not exist "%SCRIPT%" (
  echo [HATA] Onarim scripti bulunamadi: %SCRIPT%
  goto :FAIL
)

echo.
echo ============================================================
echo   KY ERP - RESEND ACTIVE WORKER SECRET REPAIR
echo ============================================================
echo   Latest Worker activate edilir, sonra standard secret put.
echo   DNS YOK / D1 YOK / Pages YOK.
echo ============================================================
echo.

"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :FAIL

echo.
echo [OK] Resend active Worker secret repair tamamlandi.
echo.
pause
exit /b 0

:FAIL
echo.
echo [HATA] Islem tamamlanamadi. Ilk HATA satirini kontrol edin.
echo.
pause
exit /b 1
