@echo off
chcp 65001 >nul
set "HERE=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HERE%Open-UnifiedStudioPreview.ps1"
if errorlevel 1 (
  echo KY PDKS Studio acilamadi. Yukaridaki hatayi kontrol edin.
  pause
)
