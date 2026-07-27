$ErrorActionPreference = 'Continue'
Start-Process -FilePath $env:ComSpec -ArgumentList '/d','/c','"D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\APP\app\KYERP_SCRIPTS\KYERP_BACKEND.cmd"' -WindowStyle Hidden -Wait
