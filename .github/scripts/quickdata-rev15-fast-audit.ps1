$ErrorActionPreference = 'Stop'

& "$PSScriptRoot/quickdata-rev14-final.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$syncPath = Join-Path $tool 'DbTnfSyncInjector.cs'
$s = Get-Content $syncPath -Raw

# FINAL audit does not need a second person-list DB query. Force Tümü if available.
$oldFinal = @'
            RefreshPeople();
            person.SelectedIndex = 0;
            LoadAudit();
'@
$newFinal = @'
            var allIndex = person.Items.IndexOf("Tümü");
            if (allIndex >= 0) person.SelectedIndex = allIndex;
            LoadAudit();
'@
if (-not $s.Contains($oldFinal)) { throw 'REV15 final refresh marker not found.' }
$s = $s.Replace($oldFinal, $newFinal)

# Replace O(N x groups) repeated Where scans with one-time dictionaries.
$oldGroups = @'
            var table = CreateAuditTable();
            var names = LoadNames(db);
            var keys = dbEvents.Select(x => (x.Card, x.Date.Date)).Union(parsed.Select(x => (x.Card, x.Date.Date))).Distinct().OrderBy(x => x.Date).ThenBy(x => x.Card);
            foreach (var key in keys)
            {
                var dg = dbEvents.Where(x => x.Card == key.Card && x.Date.Date == key.Date).OrderBy(x => ToMinute(x.Time)).ToList();
                var tg = parsed.Where(x => x.Card == key.Card && x.Date.Date == key.Date).OrderBy(x => ToMinute(x.Time)).ThenBy(x => x.Index).ToList();
                CompareGroup(table, dg, tg, names.TryGetValue(key.Card, out var n) ? n : "");
            }
'@
$newGroups = @'
            var table = CreateAuditTable();
            var names = dbEvents
                .Where(x => !string.IsNullOrWhiteSpace(x.Card))
                .GroupBy(x => x.Card, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Select(x => x.Name).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? "", StringComparer.OrdinalIgnoreCase);
            var dbGroups = dbEvents
                .GroupBy(x => (x.Card, x.Date.Date))
                .ToDictionary(g => g.Key, g => g.OrderBy(x => ToMinute(x.Time)).ToList());
            var tnfGroups = parsed
                .GroupBy(x => (x.Card, x.Date.Date))
                .ToDictionary(g => g.Key, g => g.OrderBy(x => ToMinute(x.Time)).ThenBy(x => x.Index).ToList());
            var keys = dbGroups.Keys.Union(tnfGroups.Keys).OrderBy(x => x.Item2).ThenBy(x => x.Item1).ToList();
            foreach (var key in keys)
            {
                var dg = dbGroups.TryGetValue(key, out var dgl) ? dgl : new List<DbEvent>();
                var tg = tnfGroups.TryGetValue(key, out var tgl) ? tgl : new List<TnfEvent>();
                CompareGroup(table, dg, tg, names.TryGetValue(key.Item1, out var n) ? n : "");
            }
'@
if (-not $s.Contains($oldGroups)) { throw 'REV15 grouping marker not found.' }
$s = $s.Replace($oldGroups, $newGroups)

Set-Content $syncPath $s -Encoding UTF8 -NoNewline

$check = Get-Content $syncPath -Raw
foreach ($token in @('dbGroups = dbEvents','tnfGroups = parsed','person.Items.IndexOf("Tümü")','SEÇİLİ HATALARI DÜZELT','✅ TAM UYUMLU - 0 HATA')) {
  if (-not $check.Contains($token)) { throw "REV15 audit token missing: $token" }
}
Write-Host 'REV15 audit OK: full DB-TNF scan optimized to grouped lookups.'
