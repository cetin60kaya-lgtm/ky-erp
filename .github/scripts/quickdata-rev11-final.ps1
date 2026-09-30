$ErrorActionPreference = 'Stop'
& "$PSScriptRoot/quickdata-rev10-clean-person.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$syncPath = Join-Path $tool 'DbTnfSyncInjector.cs'
$s = Get-Content $syncPath -Raw
$s = $s.Replace('Personeli DB+TNF Temizle', 'Geçersiz DB+TNF Temizle')

# Replace warning helper with ACTIVE/PASSIVE + IGTARIH/ICTARIH aware logic.
$warnPattern = '(?ms)^    static void MarkEmploymentPeriodWarnings\(DataTable table, FirebirdDatabase db\)\s*\{.*?^    \}\s*\r?\n\s*    static void AddDbEvent'
$warnReplacement = @'
    static bool? ParseEmploymentStatus(string statusName)
    {
        var s = (statusName ?? "").Trim().ToUpperInvariant()
            .Replace('İ','I').Replace('Ş','S').Replace('Ğ','G').Replace('Ü','U').Replace('Ö','O').Replace('Ç','C');
        if (s.Contains("AKTIF") || s.Contains("CALISIYOR") || s.Contains("ACTIVE")) return true;
        if (s.Contains("PASIF") || s.Contains("AYRIL") || s.Contains("PASSIVE")) return false;
        return null;
    }

    static string? InvalidEmploymentReason(bool? active, DateTime? hire, DateTime? exit, DateTime day)
    {
        day = day.Date;
        if (!active.HasValue) return "AKTİF/PASİF DURUMU BELİRSİZ";

        // PASİF: only movements strictly after the final exit date are invalid.
        if (active == false)
        {
            if (!exit.HasValue) return "PASİF AMA ÇIKIŞ TARİHİ YOK";
            if (hire.HasValue && hire.Value.Date > exit.Value.Date) return "PASİF AMA YENİ GİRİŞ TARİHİ ÇIKIŞTAN SONRA";
            return day > exit.Value.Date ? $"PASİF - ÇIKIŞ SONRASI ({exit:dd.MM.yyyy})" : null;
        }

        // AKTİF + same-card rehire: old exit A, new hire B. Only A < day < B is invalid.
        if (active == true && hire.HasValue && exit.HasValue && hire.Value.Date > exit.Value.Date)
            return day > exit.Value.Date && day < hire.Value.Date
                ? $"AKTİF - ESKİ ÇIKIŞ / YENİ GİRİŞ ARASI ({exit:dd.MM.yyyy} - {hire:dd.MM.yyyy})"
                : null;

        // Active staff outside a proven rehire gap are never auto-deleted.
        return null;
    }

    static void MarkEmploymentPeriodWarnings(DataTable table, FirebirdDatabase db)
    {
        var people = db.Query(@"select K.PKNO,K.IGTARIH,K.ICTARIH,
            coalesce((select AD from DURUM D where D.KOD=K.DURUM),'') DURUMAD
            from KIMLIK K");
        var rules = new Dictionary<string, (DateTime? Hire, DateTime? Exit, bool? Active, string Status)>(StringComparer.OrdinalIgnoreCase);
        foreach (DataRow r in people.Rows)
        {
            var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
            if (card.Length == 0) continue;
            var hire = r["IGTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["IGTARIH"]).Date;
            var exit = r["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["ICTARIH"]).Date;
            var status = Convert.ToString(r["DURUMAD"])?.Trim() ?? "";
            rules[card] = (hire, exit, ParseEmploymentStatus(status), status);
        }

        foreach (DataRow r in table.Rows)
        {
            var card = Convert.ToString(r["Kart No"])?.Trim() ?? "";
            if (!rules.TryGetValue(card, out var rule)) continue;
            if (!DateTime.TryParseExact(Convert.ToString(r["Tarih"]), "dd.MM.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) continue;
            var reason = InvalidEmploymentReason(rule.Active, rule.Hire, rule.Exit, d);
            if (reason is null) continue;
            r["Durum"] = "UYARI - " + reason + (rule.Status.Length > 0 ? $" [{rule.Status}]" : "");
            r["İşlem"] = "İNCELE";
        }
    }

    static void AddDbEvent'
@
$s2 = [regex]::Replace($s, $warnPattern, $warnReplacement)
if ($s2 -eq $s) { throw 'REV11 warning helper replacement failed.' }
$s = $s2

# Replace REV10 whole-month cleanup with invalid-window-only cleanup.
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

            var pt = db.Query(@"select K.AD,K.SOYAD,K.IGTARIH,K.ICTARIH,
                coalesce((select AD from DURUM D where D.KOD=K.DURUM),'') DURUMAD
                from KIMLIK K where K.PKNO=@P", new FbParameter("@P", card));
            if (pt.Rows.Count == 0) throw new InvalidOperationException("KIMLIK personel kaydı bulunamadı: " + card);
            var pr = pt.Rows[0];
            var name = $"{pr["AD"]} {pr["SOYAD"]}".Trim();
            var hire = pr["IGTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(pr["IGTARIH"]).Date;
            var exit = pr["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(pr["ICTARIH"]).Date;
            var statusName = Convert.ToString(pr["DURUMAD"])?.Trim() ?? "";
            var active = ParseEmploymentStatus(statusName);
            if (!active.HasValue) throw new InvalidOperationException($"Aktif/Pasif durumu net değil ({statusName}). Otomatik silme yapılmadı.");

            DateTime cleanA, cleanB;
            string ruleText;
            if (active == false)
            {
                if (!exit.HasValue) throw new InvalidOperationException("Personel PASİF fakat çıkış tarihi yok. Otomatik silme yapılmadı.");
                if (hire.HasValue && hire.Value > exit.Value) throw new InvalidOperationException("Personel PASİF görünüyor fakat yeni giriş tarihi çıkıştan sonra. Durum/tarih çelişkili; otomatik silme yapılmadı.");
                cleanA = exit.Value.AddDays(1) > a ? exit.Value.AddDays(1) : a;
                cleanB = b;
                ruleText = $"PASİF: yalnız {exit:dd.MM.yyyy} çıkış tarihinden SONRAKİ kayıtlar";
            }
            else if (hire.HasValue && exit.HasValue && hire.Value > exit.Value)
            {
                cleanA = exit.Value.AddDays(1) > a ? exit.Value.AddDays(1) : a;
                cleanB = hire.Value < b ? hire.Value : b;
                ruleText = $"AKTİF yeniden işe giriş: yalnız {exit:dd.MM.yyyy} eski çıkış ile {hire:dd.MM.yyyy} yeni giriş ARASINDAKİ kayıtlar";
            }
            else
            {
                throw new InvalidOperationException("Personel AKTİF ve güvenli şekilde silinecek çıkış-yeniden giriş boşluğu yok. Hiçbir kayıt silinmedi.");
            }
            if (cleanA >= cleanB) throw new InvalidOperationException("Seçili ay/yıl içinde geçersiz kayıt aralığı yok.");

            var dbRows = db.Query(@"select SIRA,PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK
                where PKNO=@P and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B)) order by SIRA",
                new FbParameter("@P", card), new FbParameter("@A", cleanA), new FbParameter("@B", cleanB));

            var encoding = DetectEncoding(src);
            var original = File.ReadAllLines(src, encoding).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
            var remove = new HashSet<int>();
            for (var i = 0; i < original.Count; i++)
                if (TryParseTnf(original[i], i, cfg, out var ev) && ev.Card == card && ev.Date >= cleanA && ev.Date < cleanB)
                    remove.Add(i);

            if (dbRows.Rows.Count == 0 && remove.Count == 0)
            {
                MessageBox.Show($"{card} {name}\n{ruleText}\n\nTemizlenecek kayıt yok.", "HKN PDKS");
                return;
            }

            var msg = $"{card}  {name}\nDurum: {statusName}\nGiriş: {(hire.HasValue ? hire.Value.ToString("dd.MM.yyyy") : "-")}\nÇıkış: {(exit.HasValue ? exit.Value.ToString("dd.MM.yyyy") : "-")}\n\n{ruleText}\n\nDB GIRCIK silinecek: {dbRows.Rows.Count}\nTNF/TXT silinecek: {remove.Count}\n\nGeçerli eski kayıtlar ve yeni işe girişten sonraki AKTİF kayıtlar KORUNACAK.\nDevam?";
            if (MessageBox.Show(msg, "GEÇERSİZ DB + TNF TEMİZLE", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

            var dir = Path.GetDirectoryName(src) ?? AppContext.BaseDirectory;
            var backupDir = Path.Combine(dir, "_YEDEK");
            Directory.CreateDirectory(backupDir);
            var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var tnfBackup = Path.Combine(backupDir, Path.GetFileName(src) + $".bak_GECERSIZ_{card}_{stamp}");
            File.Copy(src, tnfBackup, true);
            var dbDump = Path.Combine(backupDir, $"DB_GIRCIK_{card}_{stamp}.txt");
            File.WriteAllLines(dbDump, dbRows.AsEnumerable().Select(r => string.Join(";", new[] {
                Convert.ToString(r["SIRA"]) ?? "", Convert.ToString(r["PKNO"]) ?? "",
                Convert.ToString(r["GTARIH"]) ?? "", Convert.ToString(r["GSAAT"]) ?? "", Convert.ToString(r["GTUR"]) ?? "",
                Convert.ToString(r["CTARIH"]) ?? "", Convert.ToString(r["CSAAT"]) ?? "", Convert.ToString(r["CTUR"]) ?? ""
            })), Encoding.UTF8);

            var temp = src + ".tmp_REV11";
            using var c = db.OpenConnection();
            using var tx = c.BeginTransaction();
            try
            {
                foreach (DataRow r in dbRows.Rows)
                {
                    using var cmd = new FbCommand("delete from GIRCIK where SIRA=@S", c, tx);
                    cmd.Parameters.Add(new FbParameter("@S", Convert.ToInt32(r["SIRA"])));
                    cmd.ExecuteNonQuery();
                }
                var kept = original.Where((_, i) => !remove.Contains(i));
                File.WriteAllLines(temp, SortLines(kept, cfg), Encoding.GetEncoding(1254));
                File.Move(temp, src, true);
                tx.Commit();
            }
            catch
            {
                try { tx.Rollback(); } catch { }
                try { if (File.Exists(temp)) File.Delete(temp); } catch { }
                try { File.Copy(tnfBackup, src, true); } catch { }
                throw;
            }

            LoadAudit();
            RefreshPeople();
            MessageBox.Show($"Tamamlandı.\nDB silinen: {dbRows.Rows.Count}\nTNF silinen: {remove.Count}\n\nTNF yedeği: {tnfBackup}\nDB satır dökümü: {dbDump}", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
foreach ($token in @('Geçersiz DB+TNF Temizle','ParseEmploymentStatus','PASİF - ÇIKIŞ SONRASI','AKTİF - ESKİ ÇIKIŞ / YENİ GİRİŞ ARASI','new FbParameter("@A", cleanA)','delete from GIRCIK where SIRA=@S','yeni işe girişten sonraki AKTİF kayıtlar KORUNACAK'))
{
    if (-not $check.Contains($token)) { throw "REV11 audit token missing: $token" }
}
Write-Host 'REV11 FINAL audit OK.'
