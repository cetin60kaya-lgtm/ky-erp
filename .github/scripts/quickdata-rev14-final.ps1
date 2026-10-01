$ErrorActionPreference = 'Stop'

# Start from the verified DB-first REV12 source.
& "$PSScriptRoot/quickdata-rev12-runfix.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$mainPath = Join-Path $tool 'MainForm.cs'
$syncPath = Join-Path $tool 'DbTnfSyncInjector.cs'

# 1) CONNECTION MUST BE LIGHTWEIGHT.
$m = Get-Content $mainPath -Raw
$heavy = '        LoadPeople(); LoadIo(); LoadPayroll(); LoadPayments(); LoadAdvances(); RebuildDays(); RebuildEDays(); LoadAudit();'
if (-not $m.Contains($heavy)) { throw 'REV14 heavy Connect marker not found.' }
$m = $m.Replace($heavy, '        // REV14: connection only. Heavy screens load on demand; DB-TNF is DB-first/lazy.')
Set-Content $mainPath $m -Encoding UTF8 -NoNewline

# 2) FINAL AUDIT = WHOLE TNF YEAR WHEN POSSIBLE.
$s = Get-Content $syncPath -Raw
$oldRange = @'
            auditStartOverride = dates.Min();
            auditEndOverride = dates.Max().AddDays(1);
            RefreshPeople();
            person.SelectedIndex = 0;
            LoadAudit();
            summary.Text = $"SON TAM KONTROL {auditStartOverride:dd.MM.yyyy}-{auditEndOverride.Value.AddDays(-1):dd.MM.yyyy} | " + summary.Text;
'@
$newRange = @'
            var parsedYears = dates.Select(x => x.Year).Distinct().OrderBy(x => x).ToList();
            var fileYearMatch = System.Text.RegularExpressions.Regex.Match(Path.GetFileNameWithoutExtension(src), @"(?<!\d)(20\d{2})(?!\d)");
            var fileYear = fileYearMatch.Success && int.TryParse(fileYearMatch.Groups[1].Value, out var fy) ? fy : (int?)null;
            if (fileYear.HasValue)
            {
                auditStartOverride = new DateTime(fileYear.Value, 1, 1);
                auditEndOverride = auditStartOverride.Value.AddYears(1);
            }
            else if (parsedYears.Count == 1)
            {
                auditStartOverride = new DateTime(parsedYears[0], 1, 1);
                auditEndOverride = auditStartOverride.Value.AddYears(1);
            }
            else
            {
                auditStartOverride = dates.Min();
                auditEndOverride = dates.Max().AddDays(1);
            }
            RefreshPeople();
            person.SelectedIndex = 0;
            LoadAudit();
            var errorCount = grid.Rows.Cast<DataGridViewRow>().Count(r => !r.IsNewRow && Cell(r, "İşlem") != "YOK");
            summary.Text = errorCount == 0
                ? $"✅ TAM UYUMLU - 0 HATA | {auditStartOverride:dd.MM.yyyy}-{auditEndOverride.Value.AddDays(-1):dd.MM.yyyy}"
                : $"SON TAM KONTROL {auditStartOverride:dd.MM.yyyy}-{auditEndOverride.Value.AddDays(-1):dd.MM.yyyy} | " + summary.Text;
'@
if (-not $s.Contains($oldRange)) { throw 'REV14 FinalFullAudit range marker not found.' }
$s = $s.Replace($oldRange, $newRange)

# 3) ONE USER-DRIVEN FIX BUTTON.
$buttonMarker = '        bar.Controls.Add(B("SON TAM KONTROL", FinalFullAudit, 145));'
$buttonAdd = '        bar.Controls.Add(B("SEÇİLİ HATALARI DÜZELT", ApplySelectedIssues, 190));'
if (-not $s.Contains($buttonMarker)) { throw 'REV14 SON TAM KONTROL button marker not found.' }
$s = $s.Replace($buttonMarker, $buttonMarker + "`r`n" + $buttonAdd)

$applyMarker = '    void ApplyMissing(bool selectedOnly)'
$selectedMethod = @'
    void ApplySelectedIssues()
    {
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "TNF EKLE", "TNF SİL FAZLA", "TNF SİL E", "TNF DÜZELT"
        };
        var rows = CurrentRows(true).Where(r => allowed.Contains(Cell(r, "İşlem"))).ToList();
        if (rows.Count == 0)
        {
            MessageBox.Show("Önce düzeltilecek hata satırlarını seçin. İNCELE satırları otomatik değiştirilmez.", "HKN PDKS");
            return;
        }
        ApplyRows(rows, $"Seçilen {rows.Count} güvenli hata DB'ye göre TNF üzerinde düzeltilecek.");
    }

    void ApplyMissing(bool selectedOnly)
'@
if (-not $s.Contains($applyMarker)) { throw 'REV14 ApplyMissing marker not found.' }
$s = $s.Replace($applyMarker, $selectedMethod)

# After any TNF modification, always perform the final whole-file DB comparison.
$oldAfterApply = @'
            File.WriteAllLines(temp, SortLines(lines, cfg), Encoding.GetEncoding(1254));
            File.Move(temp, src, true);
            LoadAudit();
            MessageBox.Show($"İşlem tamamlandı.\n\nTNF: {src}\nYedek: {backup}", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
'@
$newAfterApply = @'
            File.WriteAllLines(temp, SortLines(lines, cfg), Encoding.GetEncoding(1254));
            File.Move(temp, src, true);
            FinalFullAudit();
            MessageBox.Show($"İşlem tamamlandı. Son tam DB ↔ TNF kontrolü yeniden çalıştırıldı.\n\nTNF: {src}\nYedek: {backup}", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
'@
if (-not $s.Contains($oldAfterApply)) { throw 'REV14 ApplyRows completion marker not found.' }
$s = $s.Replace($oldAfterApply, $newAfterApply)

$s = $s.Replace(
    'DB sadece kaynak olarak okunur. Düzeltmeler seçili TNF/TXT dosyasına uygulanır; işlem öncesi _YEDEK alınır. Çoklu/belirsiz eşleşmeler otomatik değiştirilmez.',
    'DB ANA KAYNAKTIR. Önce DB hareketleri taranır; TNF DB ile birebir karşılaştırılır. Seçilen güvenli hatalar TNF üzerinde düzeltilir, İNCELE satırlarına dokunulmaz. Son işlem daima TAM KONTROLdür.')

Set-Content $syncPath $s -Encoding UTF8 -NoNewline

# 4) HARD AUDIT
$mc = Get-Content $mainPath -Raw
$sc = Get-Content $syncPath -Raw
if ($mc.Contains($heavy)) { throw 'REV14 heavy Connect chain still exists.' }
foreach ($token in @(
    'connection only. Heavy screens load on demand',
    'SEÇİLİ HATALARI DÜZELT',
    'ApplySelectedIssues',
    '✅ TAM UYUMLU - 0 HATA',
    'FinalFullAudit();',
    'DB ANA KAYNAKTIR',
    'Regex.Match(Path.GetFileNameWithoutExtension(src)'))
{
    if (-not (($mc + "`n" + $sc).Contains($token))) { throw "REV14 audit token missing: $token" }
}
Write-Host 'REV14 audit OK: lightweight connect + DB-first whole-year final audit + selected safe fix.'
