@echo off
title KY ERP - CANLIYA YUKLE
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DEPLOY\KYERP_DIRECT_PRODUCTION.ps1"
