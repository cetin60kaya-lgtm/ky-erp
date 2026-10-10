# KY PDKS — eski Hedef terminal ve kart yazıcısı keşfi.
# Salt okunurdur: COM register edilmez, OCX çalıştırılmaz, cihaz/FDB/TNF yazılmaz.
[CmdletBinding()]
param([string]$HedefRoot='C:\Hedef500')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($HedefRoot)
if(!(Test-Path -LiteralPath $root -PathType Container)){
    throw 'HEDEF_ROOT_NOT_FOUND'
}
$files=Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue
$components=@('FP_CLOCK.ocx','TMPCCOMM.dll')|ForEach-Object {
    $name=$_
    $found=@($files|Where-Object {$_.Name -ieq $name}|Select-Object -First 3)
    [PSCustomObject]@{
        component=$name
        present=($found.Count -gt 0)
        paths=@($found|ForEach-Object {$_.FullName})
    }
}
# Do not print settings contents (may contain operator passwords/SDK keys).
$candidates=@($files|Where-Object {
    $_.Extension -in @('.ini','.cfg','.config','.xml','.json') -and
    $_.Length -le 524288
}|Select-Object -First 150)
$matches=@()
foreach($file in $candidates){
    try{
        $body=Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop
        if($body -match '(?i)\b(Cihaz\s*[12]|FP_CLOCK|MachineId|IpAddress|CommPort)\b'){
            $matches+=([PSCustomObject]@{file=$file.FullName;needsManualProfileReview=$true})
        }
    }catch{continue}
}
$printers=@()
try{
    if(Get-Command Get-Printer -ErrorAction SilentlyContinue){
        $printers=@(Get-Printer -ErrorAction Stop|Select-Object Name,DriverName,PortName,PrinterStatus)
    }else{
        $printers=@(Get-CimInstance Win32_Printer -ErrorAction Stop |
          Select-Object Name,DriverName,PortName,PrinterStatus)
    }
}catch{
    # Printer list unavailable is NOT proof of no card printer.
}
$result=[PSCustomObject]@{
    title='KY_PDKS_LEGACY_READ_ONLY_DISCOVERY'
    root=$root
    foundComponents=$components
    potentialProfileFiles=$matches
    printers=$printers
    secondPhysicalProfileConfirmed=$false
    fpClockMethodSignatureConfirmed=$false
    deviceConnectionTestPerformed=$false
    personOrCardDataIncluded=$false
    rawLogDeleted=$false
    firebirdWritten=$false
    annualTnfWritten=$false
}
$result|ConvertTo-Json -Depth 6
Write-Output 'RESULT=READ_ONLY_DISCOVERY_NEEDS_X86_BRIDGE_AND_PHYSICAL_ACCEPTANCE'
