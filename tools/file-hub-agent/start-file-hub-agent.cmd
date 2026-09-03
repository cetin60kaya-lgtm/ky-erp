@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=%CD%\runtime\node.exe"
if not exist "%NODE_EXE%" (
  for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined NODE_FALLBACK set "NODE_FALLBACK=%%N"
  if defined NODE_FALLBACK set "NODE_EXE=%NODE_FALLBACK%"
)
if not exist "%NODE_EXE%" (
  echo [KY FILE HUB] Node runtime bulunamadi.
  exit /b 2
)

if "%KYERP_AGENT_KEY%"=="" (
  echo [KY FILE HUB] Agent anahtari henuz tanimli degil. KY ERP ^> Depolama ^> Baglantilar ekranindan Agent anahtarini yenileyin.
  exit /b 3
)
if "%KYERP_MAIN_COMPANY_SLUG%"=="" set "KYERP_MAIN_COMPANY_SLUG=mecit-hakan"
if "%KYERP_API_URL%"=="" set "KYERP_API_URL=https://api.kyerp.net"
if exist "%CD%\file-hub-agent.config.json" set "KYERP_FILE_HUB_CONFIG=%CD%\file-hub-agent.config.json"

echo [KY FILE HUB] Firma: %KYERP_MAIN_COMPANY_SLUG%
echo [KY FILE HUB] Kaynaklar KY ERP Dosya Merkezi ayarlarindan okunuyor.
start "KY Muhasebe Arsiv Worker" /min "%NODE_EXE%" "%CD%\accounting-archive-worker.mjs"
"%NODE_EXE%" "%CD%\file-hub-agent.mjs"
exit /b %ERRORLEVEL%