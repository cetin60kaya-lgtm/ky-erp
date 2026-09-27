@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
  echo [HATA] .env yok. .env.example dosyasini .env olarak kopyalayip DESINATOR yolunu ve KYERP_API_TOKEN degerini girin.
  pause
  exit /b 2
)
if not exist "node_modules\sharp" (
  echo [BILGI] Ilk kurulum yapiliyor...
  call npm install --omit=dev
  if errorlevel 1 (
    echo [HATA] npm kurulumu tamamlanamadi.
    pause
    exit /b 3
  )
)
node desen-sync.mjs
if errorlevel 1 pause
endlocal
