@echo off
setlocal EnableExtensions
chcp 65001 >nul
title KY ERP - RESEND AKTIF SECRET ONARIMI

set "ROOT=%~dp0"
set "SCRIPT=%ROOT%KYERP_RESEND_ACTIVE_SECRET_REPAIR.ps1"
set "PWSH="

if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined PWSH for /f "delims=" %%P in ('where pwsh.exe 2^>nul') do if not defined PWSH set "PWSH=%%P"

if not defined PWSH (
  echo [HATA] PowerShell 7 bulunamadi.
  goto :fail
)

if not exist "%SCRIPT%" (
  echo [HATA] Onarim scripti bulunamadi: %SCRIPT%
  goto :fail
)

echo.
echo ============================================================
echo   KY ERP - RESEND AKTIF WORKER SECRET ONARIMI
echo ============================================================
echo   Yalniz RESEND_API_KEY duzeltilir.
echo   DNS, D1 ve Pages degistirilmez.
echo   API key sadece acilan terminale girilir.
echo ============================================================
echo.

"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :fail

echo.
echo [OK] Resend aktif Worker secret onarimi tamamlandi.
echo app.kyerp.net Admin ^> Kullanicilar ^> Giris ^& MFA ekranini yenileyin.
echo.
pause
exit /b 0

:fail
echo.
echo Islem tamamlanamadi. Yukaridaki ilk HATA satirini kontrol edin.
echo.
pause
exit /b 1
