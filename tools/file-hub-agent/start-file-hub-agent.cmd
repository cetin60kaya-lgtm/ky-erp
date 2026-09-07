@echo off
setlocal
cd /d "%~dp0"

if "%KYERP_AGENT_KEY%"=="" (
  echo [KY FILE HUB] KYERP_AGENT_KEY ortam degiskeni tanimli degil.
  exit /b 1
)
if "%KYERP_MAIN_COMPANY_SLUG%"=="" set "KYERP_MAIN_COMPANY_SLUG=mecit-hakan"
if "%KYERP_API_URL%"=="" set "KYERP_API_URL=https://api.kyerp.net"
if exist "%CD%\file-hub-agent.config.json" set "KYERP_FILE_HUB_CONFIG=%CD%\file-hub-agent.config.json"

set "NODE_EXE=%KYERP_FILE_AGENT_NODE%"
if not "%NODE_EXE%"=="" if not exist "%NODE_EXE%" set "NODE_EXE="
if "%NODE_EXE%"=="" if exist "%CD%\runtime\node.exe" set "NODE_EXE=%CD%\runtime\node.exe"
if "%NODE_EXE%"=="" (
  for %%N in (node.exe) do set "NODE_EXE=%%~$PATH:N"
)
if "%NODE_EXE%"=="" (
  echo [KY FILE HUB] Node runtime bulunamadi.
  exit /b 2
)

echo [KY FILE HUB] Firma: %KYERP_MAIN_COMPANY_SLUG%
echo [KY FILE HUB] Node: %NODE_EXE%
echo [KY FILE HUB] Muhasebe arsiv worker baslatiliyor...
start "KY Muhasebe Arsiv Worker" /min "%NODE_EXE%" "%CD%\accounting-archive-worker.mjs"
"%NODE_EXE%" "%CD%\file-hub-agent.mjs"
exit /b %ERRORLEVEL%
