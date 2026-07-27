$lifecycle = Join-Path $PSScriptRoot "KYERP_LIFECYCLE.ps1"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $lifecycle stop -NoBrowser
exit $LASTEXITCODE
