@echo off
title KY ERP FRONTEND
cd /d "D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\APP\app\ky-erp-frontend"
echo [%date% %time%] Frontend basladi >> "D:\KYERP-YEDEK\LOGS\KYERP_FRONTEND.log"
call npm.cmd run dev -- --host 127.0.0.1 >> "D:\KYERP-YEDEK\LOGS\KYERP_FRONTEND.log" 2>&1
