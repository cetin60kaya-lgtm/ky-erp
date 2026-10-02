$ErrorActionPreference = 'Stop'

# Start from the successful REV12 DB-first source.
& "$PSScriptRoot/quickdata-rev12-runfix.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$main = Join-Path $tool 'MainForm.cs'
$tnf  = Join-Path $tool 'TnfPrepareInjector.cs'
$sync = Join-Path $tool 'DbTnfSyncInjector.cs'
$clean = Join-Path $tool 'EmploymentDbFirstCleanup.cs'

# 1) Deterministic minute generation across application restarts.
foreach($p in @($main,$tnf))
{
    $x = Get-Content $p -Raw
    $old = 'var rng = new Random(HashCode.Combine(day.Year, day.DayOfYear, salt, count));'
    $new = 'var rng = new Random(unchecked(day.Year * 1000003 + day.DayOfYear * 9176 + salt * 131 + count));'
    if(-not $x.Contains($old)){ throw "REV13 deterministic seed marker missing: $p" }
    $x = $x.Replace($old,$new)
    Set-Content $p $x -Encoding UTF8 -NoNewline
}

# 2) After every normal TNF correction, run the whole-file DB comparison again.
$s = Get-Content $sync -Raw
$oldApply = @'
            File.Move(temp, src, true);
            LoadAudit();
            MessageBox.Show($"İşlem tamamlandı.\n\nTNF: {src}\nYedek: {backup}", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
'@
$newApply = @'
            File.Move(temp, src, true);
            FinalFullAudit();
            MessageBox.Show($"İşlem tamamlandı.\n\nTNF: {src}\nYedek: {backup}\n\nSON TAM KONTROL otomatik çalıştırıldı.", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
'@
if(-not $s.Contains($oldApply)){ throw 'REV13 ApplyRows final audit marker missing.' }
$s = $s.Replace($oldApply,$newApply)

# 3) Make summary explicit when the final comparison is clean.
$oldSummary = '        summary.Text = $"Uyumlu {ok} | Eksik {Count("TNF EKLE")} | Fazla/E {Count("TNF SİL FAZLA") + Count("TNF SİL E")} | Saat {Count("TNF DÜZELT")} | İncele {Count("İNCELE")}";'
$newSummary = @'
        var missing = Count("TNF EKLE");
        var extra = Count("TNF SİL FAZLA") + Count("TNF SİL E");
        var time = Count("TNF DÜZELT");
        var inspect = Count("İNCELE");
        summary.Text = $"Uyumlu {ok} | Eksik {missing} | Fazla/E {extra} | Saat {time} | İncele {inspect}" +
            (missing == 0 && extra == 0 && time == 0 && inspect == 0 ? " | TAM UYUMLU - 0 HATA" : "");
'@
if(-not $s.Contains($oldSummary)){ throw 'REV13 summary marker missing.' }
$s = $s.Replace($oldSummary,$newSummary)
Set-Content $sync $s -Encoding UTF8 -NoNewline

# 4) Employment cleanup: add row-level manual cleanup and automatic whole-file recheck.
$c = Get-Content $clean -Raw

$oldButtons = @'
        var b = new Button { Text = "Geçersiz DB+TNF Temizle", Width = 190, Height = 32, FlatStyle = FlatStyle.Flat, Margin = new Padding(3,0,3,0) };
        b.Click += (_, _) => Clean(sync);
        bar.Controls.Add(b);
'@
$newButtons = @'
        var b = new Button { Text = "Geçersiz DB+TNF Temizle", Width = 190, Height = 32, FlatStyle = FlatStyle.Flat, Margin = new Padding(3,0,3,0) };
        b.Click += (_, _) => Clean(sync);
        bar.Controls.Add(b);

        var selected = new Button { Text = "Seçili Geçersizleri Temizle", Width = 190, Height = 32, FlatStyle = FlatStyle.Flat, Margin = new Padding(3,0,3,0) };
        selected.Click += (_, _) => CleanSelected(sync);
        bar.Controls.Add(selected);
'@
if(-not $c.Contains($oldButtons)){ throw 'REV13 cleanup button marker missing.' }
$c = $c.Replace($oldButtons,$newButtons)

$oldRefresh = '            sync.GetType().GetMethod("LoadAudit",BindingFlags.Instance|BindingFlags.NonPublic)?.Invoke(sync,null);'
$newRefresh = '            RunFinalAudit(sync);'
if(-not $c.Contains($oldRefresh)){ throw 'REV13 cleanup recheck marker missing.' }
$c = $c.Replace($oldRefresh,$newRefresh)

# Insert helpers + selected-row cleaner immediately before existing Clean method.
$cleanMarker = '    static void Clean(Control sync)'
$selectedCleaner = @'
    static string Cell(DataGridViewRow r, string name)
        => r.DataGridView?.Columns.Contains(name) == true ? Convert.ToString(r.Cells[name].Value)?.Trim() ?? "" : "";

    static void RunFinalAudit(Control sync)
    {
        var m = sync.GetType().GetMethod("FinalFullAudit", BindingFlags.Instance|BindingFlags.NonPublic);
        if (m is not null) m.Invoke(sync, null);
        else sync.GetType().GetMethod("LoadAudit", BindingFlags.Instance|BindingFlags.NonPublic)?.Invoke(sync, null);
    }

    static void CleanSelected(Control sync)
    {
        try
        {
            var grid = Field<DataGridView>(sync, "grid") ?? throw new InvalidOperationException("Kontrol tablosu bulunamadı.");
            var chosen = grid.SelectedRows.Cast<DataGridViewRow>().Where(r => !r.IsNewRow).ToList();
            if (chosen.Count == 0) throw new InvalidOperationException("Önce temizlenecek satırları seçin.");

            var db = Db(sync);
            var src = PathTnf(sync);
            var valid = new List<(DataGridViewRow Row, Rule Rule, DateTime Day)>();
            foreach (var r in chosen)
            {
                var card = Cell(r, "Kart No");
                if (card.Length == 0) continue;
                if (!DateTime.TryParseExact(Cell(r, "Tarih"), "dd.MM.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) continue;
                var rule = RuleFor(db, card);
                var reason = rule.InvalidReason(day.Date);
                if (reason is null) continue; // never delete a row that employment rules consider valid
                valid.Add((r, rule, day.Date));
            }
            if (valid.Count == 0)
                throw new InvalidOperationException("Seçilen satırlarda işe giriş/çıkış kuralına göre güvenli silinebilir kayıt yok.");

            var deleteSira = new HashSet<int>();
            var dbDumpRows = new List<DataRow>();
            foreach (var g in valid.GroupBy(x => (x.Rule.Card, x.Day)))
            {
                var t = db.Query(@"select SIRA,PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK
where PKNO=@P and ((GTARIH=@D) or (CTARIH=@D)) order by SIRA",
                    new FbParameter("@P", g.Key.Card), new FbParameter("@D", g.Key.Day));
                foreach (DataRow dr in t.Rows)
                {
                    var rule = g.First().Rule;
                    var bad = (dr["GTARIH"] != DBNull.Value && rule.InvalidReason(Convert.ToDateTime(dr["GTARIH"]).Date) != null)
                           || (dr["CTARIH"] != DBNull.Value && rule.InvalidReason(Convert.ToDateTime(dr["CTARIH"]).Date) != null);
                    if (!bad) continue;
                    var sira = Convert.ToInt32(dr["SIRA"]);
                    if (deleteSira.Add(sira)) dbDumpRows.Add(dr);
                }
            }

            var rawTargets = valid.Select(x => Cell(x.Row, "TNF Karşılığı")).Where(x => x.Length > 0).ToList();
            var enc = Enc(src);
            var lines = File.ReadAllLines(src, enc).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
            var remove = new HashSet<int>();
            foreach (var raw in rawTargets)
            {
                var ix = lines.FindIndex(x => string.Equals(x, raw, StringComparison.Ordinal));
                if (ix >= 0) remove.Add(ix);
            }

            if (deleteSira.Count == 0 && remove.Count == 0)
                throw new InvalidOperationException("Seçilen satırlarda DB veya TNF'de silinecek kayıt bulunamadı.");

            var preview = string.Join("\n", valid.Take(12).Select(x =>
                $"{x.Rule.Card} {x.Day:dd.MM.yyyy} - {x.Rule.InvalidReason(x.Day)}"));
            if (valid.Count > 12) preview += $"\n... +{valid.Count-12} satır";
            var msg = $"Seçili geçersiz satırlar temizlenecek.\n\n{preview}\n\nDB satırı: {deleteSira.Count}\nTNF satırı: {remove.Count}\n\nGeçerli kayıtlar korunur. Devam?";
            if (MessageBox.Show(msg, "SEÇİLİ GEÇERSİZLER", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

            var dir = System.IO.Path.GetDirectoryName(src) ?? AppContext.BaseDirectory;
            var y = System.IO.Path.Combine(dir, "_YEDEK");
            Directory.CreateDirectory(y);
            var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var tb = System.IO.Path.Combine(y, System.IO.Path.GetFileName(src) + $".bak_REV13_SECILI_{stamp}");
            File.Copy(src, tb, true);
            var dump = System.IO.Path.Combine(y, $"DB_GIRCIK_REV13_SECILI_{stamp}.txt");
            File.WriteAllLines(dump, dbDumpRows.Select(r => string.Join(";", r.ItemArray.Select(Convert.ToString))), Encoding.UTF8);

            var temp = src + ".tmp_REV13";
            using var conn = db.OpenConnection();
            using var tx = conn.BeginTransaction();
            try
            {
                foreach (var sira in deleteSira)
                {
                    using var cmd = new FbCommand("delete from GIRCIK where SIRA=@S", conn, tx);
                    cmd.Parameters.Add(new FbParameter("@S", sira));
                    cmd.ExecuteNonQuery();
                }
                File.WriteAllLines(temp, lines.Where((_,i) => !remove.Contains(i)), enc);
                File.Move(temp, src, true);
                tx.Commit();
            }
            catch
            {
                try { tx.Rollback(); } catch {}
                try { if(File.Exists(temp)) File.Delete(temp); } catch {}
                try { File.Copy(tb, src, true); } catch {}
                throw;
            }

            RunFinalAudit(sync);
            MessageBox.Show($"Tamamlandı. DB: {deleteSira.Count} | TNF: {remove.Count}\nSON TAM KONTROL otomatik çalıştırıldı.\nYedek: {tb}", "HKN PDKS");
        }
        catch (TargetInvocationException ex) { MessageBox.Show(ex.InnerException?.Message ?? ex.Message, "REV13", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "REV13", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    static void Clean(Control sync)
'@
if(-not $c.Contains($cleanMarker)){ throw 'REV13 selected cleaner insertion marker missing.' }
$c = $c.Replace($cleanMarker,$selectedCleaner)

Set-Content $clean $c -Encoding UTF8 -NoNewline

# Hard source audit.
$mainCheck = Get-Content $main -Raw
$tnfCheck = Get-Content $tnf -Raw
$syncCheck = Get-Content $sync -Raw
$cleanCheck = Get-Content $clean -Raw
foreach($tok in @('day.Year * 1000003','DistributedMinutes')) { if(-not $mainCheck.Contains($tok)){throw "REV13 main audit missing: $tok"} }
foreach($tok in @('day.Year * 1000003','DistributedMinutes')) { if(-not $tnfCheck.Contains($tok)){throw "REV13 TNF audit missing: $tok"} }
foreach($tok in @('FinalFullAudit();','TAM UYUMLU - 0 HATA','SON TAM KONTROL otomatik çalıştırıldı')) { if(-not $syncCheck.Contains($tok)){throw "REV13 sync audit missing: $tok"} }
foreach($tok in @('Seçili Geçersizleri Temizle','CleanSelected','RunFinalAudit','delete from GIRCIK where SIRA=@S','bak_REV13_SECILI')) { if(-not $cleanCheck.Contains($tok)){throw "REV13 cleanup audit missing: $tok"} }

Write-Host 'REV13 FINALIZATION source audit OK.'
