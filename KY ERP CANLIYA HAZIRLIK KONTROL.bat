@echo off
setlocal EnableExtensions
chcp 65001 >nul
title KY ERP - CANLIYA HAZIRLIK KONTROL
set "ROOT=%~dp0"
set "SCRIPT=%ROOT%DEPLOY\KYERP_FILE_HUB_ACCOUNTING_PREFLIGHT.ps1"

if not exist "%SCRIPT%" (
  echo [HATA] Preflight scripti bulunamadi: %SCRIPT%
  pause
  exit /b 1
)

set "PWSH="
if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined PWSH for /f "delims=" %%P in ('where pwsh.exe 2^>nul') do if not defined PWSH set "PWSH=%%P"
if not defined PWSH (
  echo [HATA] PowerShell 7 bulunamadi.
  pause
  exit /b 1
)

"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo [OK] Canli oncesi kod/build/test/migration provasi temiz.
) else (
  echo [HATA] Hazirlik kontrolu basarisiz. Kod: %RC%
)
pause
exit /b %RC%
