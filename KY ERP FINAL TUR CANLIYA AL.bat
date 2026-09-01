@echo off
setlocal EnableExtensions
title KY ERP - FINAL TUR CANLIYA AL

set "ROOT=D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ"
set "SCRIPT=%ROOT%\DEPLOY\KYERP_FINAL_ROUND_RELEASE_20260901_V3.ps1"

echo.
echo ============================================================
echo   KY ERP - FINAL TUR CANLIYA AL
echo ============================================================
echo   Mail + MFA + Oturum + IsNet tenant + Worker + Pages
echo   Auth DB guard + IsNet DB guard dahil
echo   D1 reset YOK / git reset YOK / git clean YOK
echo ============================================================
echo.

if not exist "%ROOT%\.git" (
  echo [HATA] KY ERP repo bulunamadi: %ROOT%
  goto :FAIL
)
if not exist "%SCRIPT%" (
  echo [HATA] Final release scripti bulunamadi: %SCRIPT%
  goto :FAIL
)
where pwsh >nul 2>&1
if errorlevel 1 (
  echo [HATA] PowerShell 7 ^(pwsh^) bulunamadi.
  goto :FAIL
)

echo [1/2] Final PowerShell syntax kontrolu...
pwsh -NoProfile -Command "$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile('%SCRIPT%',[ref]$tokens,[ref]$errors) ^| Out-Null; if($errors.Count -gt 0){ $errors ^| ForEach-Object { Write-Host ('[PARSE HATA] ' + $_.Message) }; exit 1 }"
if errorlevel 1 (
  echo [HATA] Final release scriptinde PowerShell parse hatasi var. Hicbir canli islem baslatilmadi.
  goto :FAIL
)
echo [OK] PowerShell syntax temiz.

echo [2/2] Final release baslatiliyor...
cd /d "%ROOT%"
pwsh -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo [HATA] Final release tamamlanamadi. Cikis kodu: %RC%
  goto :FAIL
)

echo.
echo ============================================================
echo   KY ERP FINAL TUR BASARILI
echo ============================================================
echo.
pause
exit /b 0

:FAIL
echo.
echo Pencere kapanmayacak. Yukaridaki ilk HATA satirini kontrol edin.
pause
exit /b 1
