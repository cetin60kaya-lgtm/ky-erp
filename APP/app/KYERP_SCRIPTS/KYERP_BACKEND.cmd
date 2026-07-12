@echo off
setlocal
cd /d "D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\APP\app\ky-erp-backend"
echo [%date% %time%] BACKEND BASLADI >> "D:\KYERP-YEDEK\LOGS\KYERP_BACKEND.log"
call npm.cmd run start:dev >> "D:\KYERP-YEDEK\LOGS\KYERP_BACKEND.log" 2>&1
