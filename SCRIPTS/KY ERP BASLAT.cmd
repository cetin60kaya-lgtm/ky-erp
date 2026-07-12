@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0KYERP_LIFECYCLE.ps1" -Mode Start
if errorlevel 1 (
	echo.
	echo KY ERP baslatma islemi basarisiz oldu.
	pause
	exit /b 1
)
echo.
echo KY ERP baslatildi.
pause
