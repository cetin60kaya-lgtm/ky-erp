@echo off
chcp 65001 >nul
setlocal
set "HERE=%~dp0"
title KY PDKS - Yerel Gelistirme ve Test Ajani
:menu
cls
echo ===============================================
echo   KY PDKS - GUVENLI YEREL GELISTIRME MERKEZI
echo ===============================================
echo   1  Durum kontrolu
echo   2  Gercek cihaz baglanti kontrolu (salt-okuma)
echo   3  GitHub son kodu ve tum izole testleri calistir
echo   4  Codex CLI kur (ilk kez)
echo   5  Codex ile PDKS kod gorevi (giris sonrasi)
echo   6  30 dakikada bir otomatik test gorevini kur
echo   7  Otomatik kontrol gorevi durumunu gor
echo   8  Otomatik test gorevini kaldir
echo   0  Cikis
echo.
choice /C 123456780 /N /M "Secim: "
if errorlevel 9 goto done
if errorlevel 8 goto remove
if errorlevel 7 goto task_status
if errorlevel 6 goto install
if errorlevel 5 goto code
if errorlevel 4 goto codex
if errorlevel 3 goto tests
if errorlevel 2 goto device
if errorlevel 1 goto status
:status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Invoke-KyPdks-DevWorker.ps1" -Mode Status
goto pause_menu
:device
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Invoke-KyPdks-DevWorker.ps1" -Mode DeviceCheck
goto pause_menu
:tests
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Invoke-KyPdks-DevWorker.ps1" -Mode Tests
goto pause_menu
:codex
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Invoke-KyPdks-DevWorker.ps1" -Mode InstallCodex
echo Ilk oturum acma bir kez size aittir. Sonra 5 tusunu kullanin.
goto pause_menu
:code
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Invoke-KyPdks-DevWorker.ps1" -Mode Code
goto pause_menu
:install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Install-KyPdks-DevWorker.ps1" -Mode Install
goto pause_menu
:task_status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Install-KyPdks-DevWorker.ps1" -Mode Status
goto pause_menu
:remove
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Install-KyPdks-DevWorker.ps1" -Mode Remove
goto pause_menu
:pause_menu
echo.
pause
goto menu
:done
endlocal
exit /b 0
