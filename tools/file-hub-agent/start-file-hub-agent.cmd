@echo off
setlocal
cd /d "%~dp0"
if "%KYERP_AGENT_KEY%"=="" (
  echo [KY FILE HUB] KYERP_AGENT_KEY ortam degiskeni tanimli degil.
  echo Bu anahtar Worker FILE_HUB_AGENT_KEY secret degeriyle ayni olmali.
  pause
  exit /b 1
)
if "%KYERP_MAIN_COMPANY_SLUG%"=="" set "KYERP_MAIN_COMPANY_SLUG=mecit-hakan"
if "%KYERP_API_URL%"=="" set "KYERP_API_URL=https://api.kyerp.net"
if exist "%CD%\file-hub-agent.config.json" set "KYERP_FILE_HUB_CONFIG=%CD%\file-hub-agent.config.json"
echo [KY FILE HUB] Firma: %KYERP_MAIN_COMPANY_SLUG%
echo [KY FILE HUB] Yerel config yoksa kaynaklar KY ERP Dosya Merkezi ayarlarindan alinacak.
node "%CD%\file-hub-agent.mjs"
if errorlevel 1 pause
