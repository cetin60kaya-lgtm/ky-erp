$ErrorActionPreference = 'Stop'
& "$PSScriptRoot/quickdata-rev10-clean-person.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$syncPath = Join-Path $tool 'DbTnfSyncInjector.cs'
$s = Get-Content $syncPath -Raw
$s = $s.Replace('Personeli DB+TNF Temizle', 'Geçersiz DB+TNF Temizle')

# Person list query also reads ACTIVE/PASSIVE state.
$s = $s.Replace('select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,', 'select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,k.DURUM,')

# Employment rule helpers + warning logic.
$warnPattern = '(?ms)^    static void MarkEmploymentPeriodWarnings\(DataTable table, FirebirdDatabase db\)\s*\{.*?^    \}\s*\r?\n\s*    static void AddDbEvent'
$warnReplacement = @'
    static bool? ResolveActiveStatus(string raw)
    {
        var s = (raw ?? "").Trim().ToUpperInvariant()
            .Replace('İ','I').Replace('Ş','S').Replace('Ğ','G').Replace('Ü','U').Replace('Ö','O').Replace('Ç','C');
        if (s is "AKTIF" or "ACTIVE" or "A" or "1" or "TRUE" or "EVET" or "E") return true;
        if (s is "PASIF" or "PASSIVE" or "P" or "0" or "FALSE" or "HAYIR" or "H") return false;
        return null;
    }

    static string? InvalidEmploymentReason(string raw, DateTime? hire, DateTime? exit, DateTime day)
    {
        var active = ResolveActiveStatus(raw);
        if (!active.HasValue) return "AKTİF/PASİF DURUMU BELİRSİZ";
        day = day.Date;

        if (active == false)
        {
            if (!exit.HasValue) return "PASİF AMA ÇIKIŞ TARİHİ YOK";
            if (hire.HasValue && hire.Value.Date > exit.Value.Date) return "PASİF AMA YENİ GİRİŞ TARİHİ ÇIKIŞTAN SONRA";
            if (day > exit.Value.Date) return $"PASİF - ÇIKIŞ SONRASI ({exit:dd.MM.yyyy})";
            return null;
        }

        // ACTIVE + old exit + later new hire with same card: only the gap is invalid.
        if (hire.HasValue && exit.HasValue && hire.Value.Date > exit.Value.Date)
        {
            if (day > exit.Value.Date && day < hire.Value.Date)
                return $"AKTİF - ESKİ ÇIKIŞ / YENİ GİRİŞ ARASI ({exit:dd.MM.yyyy} - {hire:dd.MM.yyyy})";
            return null;
        }

        // Active person without a clear rehire window is never auto-deleted.
        return null;
    }

    static void MarkEmploymentPeriodWarnings(DataTable table, FirebirdDatabase db)
    {
        var people = db.Query("select PKNO,IGTARIH,ICTARIH,DURUM from KIMLIK");
        var rules = new Dictionary<string, (DateTime? Hire, DateTime? Exit, string Status)>(StringComparer.OrdinalIgnoreCase);
        foreach (DataRow r in people.Rows)
        {
            var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
            if (card.Length == 0) continue;
            var hire = r["IGTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["IGTARIH"]).Date;
            var exit = r["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["ICTARIH"]).Date;
            rules[card] = (hire, exit, Convert.ToString(r["DURUM"])?.Trim() ?? "");
        }

        foreach (DataRow r in table.Rows)
        {
            var card = Convert.ToString(r["Kart No"])?.Trim() ?? "";
            if (!rules.TryGetValue(card, out var rule)) continue;
            if (!DateTime.TryParseExact(Convert.ToString(r["Tarih"]), "dd.MM.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) continue;
            var reason = InvalidEmploymentReason(rule.Status, rule.Hire, rule.Exit, d);
            if (reason is null) continue;
            r["Durum"] = "UYARI - " + reason;
            r["İşlem"] = "İNCELE";
        }
    }

    static void AddDbEvent'
@
$s2 = [regex]::Replace($s, $warnPattern, $warnReplacement)
if ($s2 -eq $s) { throw 'REV11 warning replacement failed.' }
$s = $s2

# Replace whole cleanup method so only the invalid employment window is deleted.
$cleanPattern = '(?ms)^    void CleanSelectedPersonPeriod\(\)\s*\{.*?^    \}\s*\r?\n\s*    void ListTnf\(\)'
$cleanReplacement = @'
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

            var p = db.Query("select AD,SOYAD,IGTARIH,ICTARIH,DURUM from KIMLIK where PKNO=@P", new FbParameter("@P", card));
            if (p.Rows.Count == 0) throw new InvalidOperationException("KIMLIK kaydı bulunamadı.");
            var pr = p.Rows[0];
            var displayName = $"{pr["AD"]} {pr["SOYAD"]}".Trim();
            var hire = pr["IGTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(pr["IGTARIH"]).Date;
            var exit = pr["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(pr["ICTARIH"]).Date;
            var rawStatus = Convert.ToString(pr["DURUM"])?.Trim() ?? "";
            var active = ResolveActiveStatus(rawStatus);
            if (!active.HasValue) throw new InvalidOperationException("Aktif/Pasif bilgisi anlaşılmadı. Güvenlik için otomatik silme yapılmadı.");

            DateTime cleanA, cleanB;
            string cleanRule;
            if (active == false)
            {
                if (!exit.HasValue) throw new InvalidOperationException("Personel PASİF ama çıkış tarihi yok. Güvenlik için silme yapılmadı.");
                if (hire.HasValue && hire.Value > exit.Value)
                    throw new InvalidOperationException("Personel PASİF görünüyor fakat yeni giriş tarihi çıkış tarihinden sonra. Durum/tarih çelişkili; silme yapılmadı.");
                cleanA = exit.Value.AddDays(1) > a ? exit.Value.AddDays(1) : a;
                cleanB = b;
                cleanRule = $"PASİF: yalnız {exit:dd.MM.yyyy} çıkış tarihinden SONRASI";
            }
            else
            {
                if (!(hire.HasValue && exit.HasValue && hire.Value > exit.Value))
                    throw new InvalidOperationException("Aktif personelde güvenli eski çıkış / yeni giriş aralığı bulunamadı. Geçerli kayıtlara dokunulmadı.");
                cleanA = exit.Value.AddDays(1) > a ? exit.Value.AddDays(1) : a;
                cleanB = hire.Value < b ? hire.Value : b;
                cleanRule = $"AKTİF yeniden giriş: yalnız {exit:dd.MM.yyyy} eski çıkış ile {hire:dd.MM.yyyy} yeni giriş ARASI";
            }

            if (cleanA >= cleanB) throw new InvalidOperationException("Seçili ay/yıl içinde temizlenecek geçersiz tarih aralığı yok.");

            var countObj = db.Scalar(@"select count(*) from GIRCIK where PKNO=@P and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B))",
                new FbParameter("@P", card), new FbParameter("@A", cleanA), new FbParameter("@B", cleanB));
            var dbCount = Convert.ToInt32(countObj ?? 0);

            var encoding = DetectEncoding(src);
            var originalLines = File.ReadAllLines(src, encoding).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
            var removeIndexes = new HashSet<int>();
            for (var i = 0; i < originalLines.Count; i++)
            {
                if (TryParseTnf(originalLines[i], i, cfg, out var ev) && ev.Card == card && ev.Date >= cleanA && ev.Date < cleanB)
                    removeIndexes.Add(i);
            }
            var tnfCount = removeIndexes.Count;

            if (dbCount == 0 && tnfCount == 0)
            {
                MessageBox.Show($"{card} {displayName}\n{periodText}\n\n{cleanRule}\n\nTemizlenecek geçersiz DB/TNF kaydı yok.", "HKN PDKS");
                return;
            }

            var warning = $"{card}  {displayName}\nDönem: {periodText}\nDurum: {(active == true ? "AKTİF" : "PASİF")}\nGiriş: {(hire.HasValue ? hire.Value.ToString("dd.MM.yyyy") : "-")}\nÇıkış: {(exit.HasValue ? exit.Value.ToString("dd.MM.yyyy") : "-")}\n\nKURAL: {cleanRule}\n\nDB GIRCIK silinecek: {dbCount}\nTNF/TXT silinecek: {tnfCount}\n\nSadece bu GEÇERSİZ ARALIK hem DB'den hem TNF'den silinecek. Yeni işe girişten sonraki aktif kayıtlar ve eski geçerli geçmiş korunacak.\n\nDevam?";
            if (MessageBox.Show(warning, "GEÇERSİZ DB + TNF TEMİZLE", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

            var dir = Path.GetDirectoryName(src) ?? AppContext.BaseDirectory;
            var backupDir = Path.Combine(dir, "_YEDEK");
            Directory.CreateDirectory(backupDir);
            var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var backup = Path.Combine(backupDir, Path.GetFileName(src) + $".bak_GECERSIZ_{card}_{stamp}");
            File.Copy(src, backup, true);
            var temp = src + ".tmp_INVALID_CLEAN";

            using var c = db.OpenConnection();
            using var tx = c.BeginTransaction();
            try
            {
                using (var cmd = new FbCommand(@"delete from GIRCIK where PKNO=@P and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B))", c, tx))
                {
                    cmd.Parameters.Add(new FbParameter("@P", card));
                    cmd.Parameters.Add(new FbParameter("@A", cleanA));
                    cmd.Parameters.Add(new FbParameter("@B", cleanB));
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
            MessageBox.Show($"Temizleme tamamlandı.\n\nKart: {card} {displayName}\n{cleanRule}\nDB silinen GIRCIK: {dbCount}\nTNF silinen: {tnfCount}\n\nTNF yedeği: {backup}", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "GEÇERSİZ DB + TNF TEMİZLE", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void ListTnf()
'@
$s2 = [regex]::Replace($s, $cleanPattern, $cleanReplacement)
if ($s2 -eq $s) { throw 'REV11 cleanup replacement failed.' }
$s = $s2

Set-Content $syncPath $s -Encoding UTF8 -NoNewline
$check = Get-Content $syncPath -Raw
foreach ($token in @('Geçersiz DB+TNF Temizle','ResolveActiveStatus','PASİF - ÇIKIŞ SONRASI','AKTİF - ESKİ ÇIKIŞ / YENİ GİRİŞ ARASI','cleanA','cleanB','Yeni işe girişten sonraki aktif kayıtlar ve eski geçerli geçmiş korunacak'))
{
    if (-not $check.Contains($token)) { throw "REV11 audit token missing: $token" }
}
Write-Host 'REV11 audit OK: ACTIVE/PASSIVE + entry/exit + same-card rehire protected cleanup.'
