@echo off
title KY ERP BACKEND
cd /d "%~dp0ky-erp-backend"
echo [%date% %time%] Backend basladi >> "D:\KYERP-YEDEK\LOGS\KYERP_BACKEND.log"
call npm.cmd run start:dev >> "D:\KYERP-YEDEK\LOGS\KYERP_BACKEND.log" 2>&1
