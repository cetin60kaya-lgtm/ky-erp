@echo off
setlocal
cd /d "%~dp0"
if not exist "file-hub-agent.config.json" (
  echo [KY FILE HUB] file-hub-agent.config.json bulunamadi.
  echo Ornek dosyayi kopyalayip KY ERP ekranindaki storageConnectionId degerlerini girin.
  pause
  exit /b 1
)
if "%KYERP_AGENT_KEY%"=="" (
  echo [KY FILE HUB] KYERP_AGENT_KEY ortam degiskeni tanimli degil.
  pause
  exit /b 1
)
if "%KYERP_MAIN_COMPANY_SLUG%"=="" set "KYERP_MAIN_COMPANY_SLUG=mecit-hakan"
if "%KYERP_API_URL%"=="" set "KYERP_API_URL=https://api.kyerp.net"
set "KYERP_FILE_HUB_CONFIG=%CD%\file-hub-agent.config.json"
node "%CD%\file-hub-agent.mjs"
if errorlevel 1 pause
