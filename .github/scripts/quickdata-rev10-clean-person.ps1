$ErrorActionPreference = 'Stop'

# Build on the verified REV9 single-EXE source patches.
& "$PSScriptRoot/quickdata-rev9-final2-build.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$syncPath = Join-Path $tool 'DbTnfSyncInjector.cs'
$s = Get-Content $syncPath -Raw

# 1) Refresh person selector when period changes.
$oldCtor = @'
        Build();
        VisibleChanged += (_, _) => { if (Visible) RefreshPeople(); };
'@
$newCtor = @'
        Build();
        VisibleChanged += (_, _) => { if (Visible) RefreshPeople(); };
        year.ValueChanged += (_, _) => RefreshPeople();
        month.SelectedIndexChanged += (_, _) => RefreshPeople();
'@
if (-not $s.Contains($oldCtor)) { throw 'REV10 constructor marker not found.' }
$s = $s.Replace($oldCtor, $newCtor)

# 2) Add manual cleanup button.
$oldButtons = @'
        bar.Controls.Add(B("Fazla TNF Temizle", CleanExtras, 145));
        bar.Controls.Add(B("Saat Farkını Düzelt", FixTimes, 155));
        bar.Controls.Add(B("TNF Listele", ListTnf, 105));
        bar.Controls.Add(summary);
'@
$newButtons = @'
        bar.Controls.Add(B("Fazla TNF Temizle", CleanExtras, 145));
        bar.Controls.Add(B("Saat Farkını Düzelt", FixTimes, 155));
        bar.Controls.Add(B("Personeli DB+TNF Temizle", CleanSelectedPersonPeriod, 185));
        bar.Controls.Add(B("TNF Listele", ListTnf, 105));
        bar.Controls.Add(summary);
'@
if (-not $s.Contains($oldButtons)) { throw 'REV10 button marker not found.' }
$s = $s.Replace($oldButtons, $newButtons)

# 3) Person selector: normal period employees + out-of-period people ONLY when they actually have DB movements in selected period.
$refreshPattern = '(?ms)^    void RefreshPeople\(\)\s*\{.*?^    \}\s*\r?\n\s*    \(DateTime Start, DateTime End\) Period\(\)'
$refreshReplacement = @'
    void RefreshPeople()
    {
        try
        {
            var db = Database;
            if (db is null) return;
            var oldCard = SelectedCard();
            var (a, b) = Period();
            var t = db.Query(@"
select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,
       (select count(*) from GIRCIK g
         where g.PKNO=k.PKNO
           and ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))) as DONEM_KAYIT
from KIMLIK k
order by k.PKNO", new FbParameter("@A", a), new FbParameter("@B", b));

            person.Items.Clear();
            person.Items.Add("Tümü");
            foreach (DataRow r in t.Rows)
            {
                var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
                if (card.Length == 0 || card == "00001") continue;
                var hire = r["IGTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["IGTARIH"]).Date;
                var exit = r["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["ICTARIH"]).Date;
                var overlaps = (!hire.HasValue || hire.Value < b) && (!exit.HasValue || exit.Value >= a);
                var movementCount = Convert.ToInt32(r["DONEM_KAYIT"] == DBNull.Value ? 0 : r["DONEM_KAYIT"]);
                if (!overlaps && movementCount == 0) continue;

                var name = $"{r["AD"]} {r["SOYAD"]}".Trim();
                if (overlaps)
                {
                    var suffix = exit.HasValue ? $"  [Çıkış {exit:dd.MM.yyyy}]" : "";
                    person.Items.Add($"{card}  {name}{suffix}");
                }
                else
                {
                    var exitText = exit.HasValue ? $"Çıkış {exit:dd.MM.yyyy}" : "dönem dışında";
                    person.Items.Add($"{card}  ⚠ {name}  [{exitText} - DÖNEM DIŞI KAYIT]");
                }
            }

            if (oldCard.Length > 0)
            {
                var match = person.Items.Cast<object>().Select(x => x.ToString() ?? "").FirstOrDefault(x => x.StartsWith(oldCard + " ", StringComparison.Ordinal));
                if (match is not null) person.SelectedItem = match; else person.SelectedIndex = 0;
            }
            else person.SelectedIndex = 0;
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "DB - TNF Eşitle", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    (DateTime Start, DateTime End) Period()
'@
$s2 = [regex]::Replace($s, $refreshPattern, $refreshReplacement)
if ($s2 -eq $s) { throw 'REV10 RefreshPeople replacement failed.' }
$s = $s2

# 4) After audit comparison, mark employment-period violations as INCELE so automatic sync never adds/deletes them.
$oldAuditTail = @'
            foreach (var x in bad)
                table.Rows.Add("", "", "", "", "", "", "", x.Raw, "BOZUK TNF / İNCELE", "İNCELE");

            grid.DataSource = table;
'@
$newAuditTail = @'
            foreach (var x in bad)
                table.Rows.Add("", "", "", "", "", "", "", x.Raw, "BOZUK TNF / İNCELE", "İNCELE");

            MarkEmploymentPeriodWarnings(table, db);
            grid.DataSource = table;
'@
if (-not $s.Contains($oldAuditTail)) { throw 'REV10 audit tail marker not found.' }
$s = $s.Replace($oldAuditTail, $newAuditTail)

$marker = '    static void AddDbEvent(List<DbEvent> list, string card, string name, object dateObj, object timeObj, string tur, string side, DateTime a, DateTime b)'
$warningHelper = @'
    static void MarkEmploymentPeriodWarnings(DataTable table, FirebirdDatabase db)
    {
        var people = db.Query("select PKNO,IGTARIH,ICTARIH from KIMLIK");
        var periods = new Dictionary<string, (DateTime? Hire, DateTime? Exit)>(StringComparer.OrdinalIgnoreCase);
        foreach (DataRow r in people.Rows)
        {
            var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
            if (card.Length == 0) continue;
            var hire = r["IGTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["IGTARIH"]).Date;
            var exit = r["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["ICTARIH"]).Date;
            periods[card] = (hire, exit);
        }

        foreach (DataRow r in table.Rows)
        {
            var card = Convert.ToString(r["Kart No"])?.Trim() ?? "";
            if (!periods.TryGetValue(card, out var p)) continue;
            if (!DateTime.TryParseExact(Convert.ToString(r["Tarih"]), "dd.MM.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) continue;
            var outside = (p.Hire.HasValue && d.Date < p.Hire.Value) || (p.Exit.HasValue && d.Date > p.Exit.Value);
            if (!outside) continue;
            var detail = p.Exit.HasValue && d.Date > p.Exit.Value
                ? $"UYARI - İŞTEN ÇIKIŞ SONRASI ({p.Exit:dd.MM.yyyy})"
                : p.Hire.HasValue ? $"UYARI - İŞE GİRİŞ ÖNCESİ ({p.Hire:dd.MM.yyyy})" : "UYARI - DÖNEM DIŞI";
            r["Durum"] = detail;
            r["İşlem"] = "İNCELE";
        }
    }

    static void AddDbEvent(List<DbEvent> list, string card, string name, object dateObj, object timeObj, string tur, string side, DateTime a, DateTime b)
'@
if (-not $s.Contains($marker)) { throw 'REV10 AddDbEvent marker not found.' }
$s = $s.Replace($marker, $warningHelper)

# 5) Safe person-period cleanup: GIRCIK + selected TNF/TXT only. KIMLIK master record is preserved.
$cleanMarker = '    void ListTnf()'
$cleanMethod = @'
    void CleanSelectedPersonPeriod()
    {
        try
        {
            var db = Database ?? throw new InvalidOperationException("Önce Firebird veritabanına bağlanın.");
            var src = RequireTnfPath();
            var cfg = LoadSettings();
            var card = SelectedCard();
            if (card.Length == 0) throw new InvalidOperationException("Önce temizlenecek personeli/kartı seçin. 'Tümü' ile toplu silme yapılmaz.");
            var (a, b) = Period();
            var periodText = month.SelectedIndex == 0 ? $"{a:yyyy} yılı" : $"{a:MMMM yyyy}";

            var nameTable = db.Query("select AD,SOYAD,IGTARIH,ICTARIH from KIMLIK where PKNO=@P", new FbParameter("@P", card));
            var displayName = nameTable.Rows.Count == 0 ? "(KIMLIK kaydı yok)" : $"{nameTable.Rows[0]["AD"]} {nameTable.Rows[0]["SOYAD"]}".Trim();

            var countObj = db.Scalar(@"select count(*) from GIRCIK where PKNO=@P and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B))",
                new FbParameter("@P", card), new FbParameter("@A", a), new FbParameter("@B", b));
            var dbCount = Convert.ToInt32(countObj ?? 0);

            var encoding = DetectEncoding(src);
            var originalLines = File.ReadAllLines(src, encoding).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
            var removeIndexes = new HashSet<int>();
            for (var i = 0; i < originalLines.Count; i++)
            {
                if (TryParseTnf(originalLines[i], i, cfg, out var ev) && ev.Card == card && ev.Date >= a && ev.Date < b)
                    removeIndexes.Add(i);
            }
            var tnfCount = removeIndexes.Count;

            if (dbCount == 0 && tnfCount == 0)
            {
                MessageBox.Show($"{card} {displayName}\n{periodText}: DB veya TNF'de temizlenecek kayıt yok.", "HKN PDKS");
                return;
            }

            var warning = $"{card}  {displayName}\nDönem: {periodText}\n\nDB GIRCIK satırı: {dbCount}\nTNF/TXT satırı: {tnfCount}\n\nBu dönemdeki kart hareketleri HEM DB'DEN HEM TNF'DEN silinecek.\nKIMLIK/personel kartı ve eski dönem geçmişi SİLİNMEYECEK.\n\nDevam?";
            if (MessageBox.Show(warning, "PERSONELİ DB + TNF TEMİZLE", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

            var dir = Path.GetDirectoryName(src) ?? AppContext.BaseDirectory;
            var backupDir = Path.Combine(dir, "_YEDEK");
            Directory.CreateDirectory(backupDir);
            var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var backup = Path.Combine(backupDir, Path.GetFileName(src) + $".bak_PERSONEL_{card}_{stamp}");
            File.Copy(src, backup, true);
            var temp = src + ".tmp_PERSON_CLEAN";

            using var c = db.OpenConnection();
            using var tx = c.BeginTransaction();
            try
            {
                using (var cmd = new FbCommand(@"delete from GIRCIK where PKNO=@P and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B))", c, tx))
                {
                    cmd.Parameters.Add(new FbParameter("@P", card));
                    cmd.Parameters.Add(new FbParameter("@A", a));
                    cmd.Parameters.Add(new FbParameter("@B", b));
                    cmd.ExecuteNonQuery();
                }

                var kept = originalLines.Where((_, i) => !removeIndexes.Contains(i));
                File.WriteAllLines(temp, SortLines(kept, cfg), Encoding.GetEncoding(1254));
                File.Move(temp, src, true);
                tx.Commit();
            }
            catch
            {
                try { tx.Rollback(); } catch { }
                try { if (File.Exists(temp)) File.Delete(temp); } catch { }
                try { File.Copy(backup, src, true); } catch { }
                throw;
            }

            LoadAudit();
            RefreshPeople();
            MessageBox.Show($"Temizleme tamamlandı.\n\nKart: {card} {displayName}\nDönem: {periodText}\nDB silinen GIRCIK: {dbCount}\nTNF silinen: {tnfCount}\n\nTNF yedeği: {backup}", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "PERSONELİ DB + TNF TEMİZLE", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void ListTnf()
'@
if (-not $s.Contains($cleanMarker)) { throw 'REV10 ListTnf marker not found.' }
$s = $s.Replace($cleanMarker, $cleanMethod)

Set-Content $syncPath $s -Encoding UTF8 -NoNewline

# Hard audit.
$check = Get-Content $syncPath -Raw
foreach ($token in @(
    'Personeli DB+TNF Temizle',
    'CleanSelectedPersonPeriod',
    'delete from GIRCIK where PKNO=@P',
    'KIMLIK/personel kartı ve eski dönem geçmişi SİLİNMEYECEK',
    'MarkEmploymentPeriodWarnings',
    'İŞTEN ÇIKIŞ SONRASI',
    'DÖNEM DIŞI KAYIT',
    'year.ValueChanged += (_, _) => RefreshPeople();'))
{
    if (-not $check.Contains($token)) { throw "REV10 audit token missing: $token" }
}
Write-Host 'REV10 audit OK: person-period DB+TNF cleanup + employment-period anomaly guard.'
