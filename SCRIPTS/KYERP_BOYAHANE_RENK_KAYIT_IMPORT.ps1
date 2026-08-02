param(
    [string]$FilePath = "",
    [string]$ApiBase = "http://127.0.0.1:8788",
    [string]$CompanySlug = "mecit-hakan"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

try { chcp 65001 | Out-Null } catch {}
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $Utf8
[Console]::OutputEncoding = $Utf8
$OutputEncoding = $Utf8

$Repo = Split-Path -Parent $PSScriptRoot

function Find-RenkKayitFile {
    param([string]$RequestedPath)

    if ($RequestedPath -and (Test-Path -LiteralPath $RequestedPath)) {
        return (Resolve-Path -LiteralPath $RequestedPath).Path
    }

    $DirectCandidates = @(
        (Join-Path $Repo "Renk Kayıt.xlsm"),
        (Join-Path $Repo "DATA\Renk Kayıt.xlsm"),
        (Join-Path $env:USERPROFILE "Desktop\Renk Kayıt.xlsm"),
        (Join-Path $env:USERPROFILE "OneDrive\Renk Kayıt.xlsm"),
        "D:\Onedrive-Hkn\OneDrive\Renk Kayıt.xlsm",
        "D:\Onedrive-Hkn\OneDrive\Masaüstü\Renk Kayıt.xlsm"
    )

    foreach ($Candidate in $DirectCandidates) {
        if ($Candidate -and (Test-Path -LiteralPath $Candidate)) {
            return (Resolve-Path -LiteralPath $Candidate).Path
        }
    }

    $SearchRoots = @(
        (Join-Path $env:USERPROFILE "OneDrive"),
        "D:\Onedrive-Hkn\OneDrive"
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($Root in $SearchRoots) {
        $Found = Get-ChildItem -LiteralPath $Root -Filter "Renk Kayıt.xlsm" -File -Recurse -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($Found) {
            return $Found.FullName
        }
    }

    return ""
}

function Convert-ExcelDate {
    param($Value)

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return ""
    }

    if ($Value -is [double] -or $Value -is [int] -or $Value -is [decimal]) {
        try {
            return [DateTime]::FromOADate([double]$Value).ToString("yyyy-MM-dd")
        } catch {
            return ""
        }
    }

    $Parsed = [DateTime]::MinValue
    if ([DateTime]::TryParse([string]$Value, [ref]$Parsed)) {
        return $Parsed.ToString("yyyy-MM-dd")
    }

    return [string]$Value
}

function Get-FallbackRecipes {
    return @(
        [pscustomobject]@{
            sourceRow = 900001
            colorName = "SAKS"
            pantone = "19-4151"
            paintType = "SUBAZLI"
            modelName = "MARK"
            sourceDate = "2020-12-07"
            recordType = "NUMUNE"
            ingredients = @(
                [pscustomobject]@{ productName = "S 10 ŞEFFAF URAS"; grams = 100.0 },
                [pscustomobject]@{ productName = "S 20 BEYAZ URAS"; grams = 30.0 },
                [pscustomobject]@{ productName = "MAVİ KBT URAS"; grams = 12.6 },
                [pscustomobject]@{ productName = "FUŞYA KB URAS"; grams = 2.15 }
            )
        },
        [pscustomobject]@{
            sourceRow = 900002
            colorName = "KAVUN"
            pantone = "13-1030"
            paintType = "SUBAZLI"
            modelName = "X-OPENED"
            sourceDate = "2021-02-04"
            recordType = "NUMUNE"
            ingredients = @(
                [pscustomobject]@{ productName = "S 10 ŞEFFAF URAS"; grams = 30.0 },
                [pscustomobject]@{ productName = "S 20 BEYAZ URAS"; grams = 120.0 },
                [pscustomobject]@{ productName = "GOLD KFT URAS"; grams = 3.0 },
                [pscustomobject]@{ productName = "KIRMIZI KGC URAS"; grams = 0.32 }
            )
        },
        [pscustomobject]@{
            sourceRow = 900003
            colorName = "LACİVERT"
            pantone = "19-4057"
            paintType = "SUBAZLI"
            modelName = "SAFARI"
            sourceDate = "2021-01-05"
            recordType = "NUMUNE"
            ingredients = @(
                [pscustomobject]@{ productName = "S 10 ŞEFFAF URAS"; grams = 100.0 },
                [pscustomobject]@{ productName = "S 20 BEYAZ URAS"; grams = 17.0 },
                [pscustomobject]@{ productName = "MAVİ KBT URAS"; grams = 9.35 },
                [pscustomobject]@{ productName = "FUŞYA KB URAS"; grams = 3.7 }
            )
        },
        [pscustomobject]@{
            sourceRow = 900004
            colorName = "SİYAH"
            pantone = "19-4205"
            paintType = "SUBAZLI"
            modelName = "RENK KAYIT TEST"
            sourceDate = "2021-01-01"
            recordType = "NUMUNE"
            ingredients = @(
                [pscustomobject]@{ productName = "S 10 ŞEFFAF URAS"; grams = 1000.0 },
                [pscustomobject]@{ productName = "SİYAH KNG URAS"; grams = 60.0 }
            )
        }
    )
}

function Read-WorkbookRecipes {
    param([string]$Path)

    $Excel = $null
    $Workbook = $null
    $Worksheet = $null
    $UsedRange = $null

    try {
        $Excel = New-Object -ComObject Excel.Application
        $Excel.Visible = $false
        $Excel.DisplayAlerts = $false
        $Workbook = $Excel.Workbooks.Open($Path, 0, $true)
        $Worksheet = $Workbook.Worksheets.Item("PANTONE FORMUL")
        $UsedRange = $Worksheet.UsedRange
        $Values = $UsedRange.Value2
        $RowCount = [int]$UsedRange.Rows.Count
        $Rows = New-Object System.Collections.Generic.List[object]

        for ($RowIndex = 2; $RowIndex -le $RowCount; $RowIndex++) {
            $Ingredients = New-Object System.Collections.Generic.List[object]

            for ($ItemIndex = 0; $ItemIndex -lt 10; $ItemIndex++) {
                $ProductName = [string]$Values[$RowIndex, (7 + $ItemIndex)]
                $GramValue = $Values[$RowIndex, (17 + $ItemIndex)]
                $Grams = 0.0
                if ($null -ne $GramValue) {
                    try {
                        $Grams = [double]$GramValue
                    } catch {
                        [double]::TryParse([string]$GramValue, [ref]$Grams) | Out-Null
                    }
                }

                if (-not [string]::IsNullOrWhiteSpace($ProductName) -and $Grams -gt 0) {
                    $Ingredients.Add([pscustomobject]@{
                        productName = ($ProductName -replace '\s+', ' ').Trim()
                        grams = [Math]::Round($Grams, 4)
                    })
                }
            }

            if ($Ingredients.Count -eq 0) {
                continue
            }

            $Rows.Add([pscustomobject]@{
                sourceRow = $RowIndex
                colorName = ([string]$Values[$RowIndex, 1]).Trim()
                pantone = ([string]$Values[$RowIndex, 2]).Trim()
                paintType = ([string]$Values[$RowIndex, 3]).Trim()
                modelName = ([string]$Values[$RowIndex, 4]).Trim()
                sourceDate = Convert-ExcelDate $Values[$RowIndex, 5]
                recordType = ([string]$Values[$RowIndex, 6]).Trim()
                ingredients = @($Ingredients)
            })
        }

        return @($Rows)
    } finally {
        if ($Workbook) { $Workbook.Close($false) | Out-Null }
        if ($Excel) { $Excel.Quit() | Out-Null }
        foreach ($ComObject in @($UsedRange, $Worksheet, $Workbook, $Excel)) {
            if ($ComObject) {
                [Runtime.InteropServices.Marshal]::FinalReleaseComObject($ComObject) | Out-Null
            }
        }
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
}

function Send-RecipeBatches {
    param([object[]]$Rows)

    $BatchSize = 75
    $TotalProducts = 0
    $TotalColors = 0
    $TotalRecipes = 0

    for ($Start = 0; $Start -lt $Rows.Count; $Start += $BatchSize) {
        $End = [Math]::Min($Start + $BatchSize - 1, $Rows.Count - 1)
        $Batch = @($Rows[$Start..$End])
        $Body = @{
            mainCompanySlug = $CompanySlug
            rows = $Batch
            seedKnownLots = ($Start -eq 0)
        } | ConvertTo-Json -Depth 10 -Compress

        $Result = Invoke-RestMethod `
            -Uri "$ApiBase/api/boyahane/import/recipes/batch" `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body ([Text.Encoding]::UTF8.GetBytes($Body)) `
            -TimeoutSec 180

        if (-not $Result.ok) {
            throw "Reçete aktarım grubu başarısız: $Start-$End"
        }

        $TotalProducts += [int]$Result.data.productsCreated
        $TotalColors += [int]$Result.data.colorsCreated
        $TotalRecipes += [int]$Result.data.recipesCreated
        Write-Host "Aktarıldı: $($End + 1) / $($Rows.Count)" -ForegroundColor Cyan
    }

    return [pscustomobject]@{
        productsCreated = $TotalProducts
        colorsCreated = $TotalColors
        recipesCreated = $TotalRecipes
    }
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host " BOYAHANE RENK KAYIT EXCEL AKTARIMI" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor DarkCyan

$ResolvedFile = Find-RenkKayitFile -RequestedPath $FilePath
if ($ResolvedFile) {
    Write-Host "Kaynak: $ResolvedFile" -ForegroundColor Green
    try {
        $Recipes = @(Read-WorkbookRecipes -Path $ResolvedFile)
    } catch {
        Write-Host "Excel okunamadı; doğrulanmış dört örnek reçeteyle devam ediliyor." -ForegroundColor Yellow
        Write-Host $_.Exception.Message -ForegroundColor Yellow
        $Recipes = @(Get-FallbackRecipes)
    }
} else {
    Write-Host "Renk Kayıt.xlsm otomatik bulunamadı." -ForegroundColor Yellow
    Write-Host "Doğrulanmış dört örnek reçete yerel kontrole aktarılacak." -ForegroundColor Yellow
    Write-Host "Tam aktarım için dosyayı repo köküne kopyalayabilir veya -FilePath parametresi verebilirsiniz." -ForegroundColor Yellow
    $Recipes = @(Get-FallbackRecipes)
}

if (-not $Recipes.Count) {
    throw "Aktarılabilir reçete bulunamadı."
}

$Recipes = @(
    $Recipes |
    Sort-Object @{ Expression = { $_.sourceDate }; Ascending = $true }, @{ Expression = { $_.sourceRow }; Ascending = $true }
)

$Totals = Send-RecipeBatches -Rows $Recipes
$Status = Invoke-RestMethod -Uri "$ApiBase/api/boyahane/import/recipes/status?mainCompanySlug=$CompanySlug" -Method Get -TimeoutSec 60

Write-Host ""
Write-Host "Aktarım tamamlandı." -ForegroundColor Green
Write-Host "Kaynak reçete : $($Recipes.Count)"
Write-Host "Yeni ürün     : $($Totals.productsCreated)"
Write-Host "Yeni renk     : $($Totals.colorsCreated)"
Write-Host "Yeni reçete   : $($Totals.recipesCreated)"
if ($Status.ok) {
    Write-Host "Yerel toplam  : $($Status.data.products) ürün | $($Status.data.colors) renk | $($Status.data.recipes) reçete" -ForegroundColor Green
}
