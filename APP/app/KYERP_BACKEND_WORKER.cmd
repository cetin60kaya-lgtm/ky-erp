@echo off
title KY ERP BACKEND
cd /d "D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\APP\app\ky-erp-backend"
echo [%date% %time%] Backend basladi >> "D:\KYERP-YEDEK\LOGS\KYERP_BACKEND.log"
call npm.cmd run start:dev >> "D:\KYERP-YEDEK\LOGS\KYERP_BACKEND.log" 2>&1
