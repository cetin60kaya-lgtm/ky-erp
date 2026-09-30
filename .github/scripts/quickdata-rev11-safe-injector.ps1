$ErrorActionPreference = 'Stop'
& "$PSScriptRoot/quickdata-rev9-final2-build.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$out = Join-Path $tool 'EmploymentSafeCleanupInjector.cs'
@'
using System.Data;
using System.Globalization;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal static class EmploymentSafeCleanupInjector
{
    static bool injected;

    sealed record Rule(string Card, string Name, DateTime? Hire, DateTime? Exit, bool? Active, string StatusName)
    {
        public string? InvalidReason(DateTime day)
        {
            day = day.Date;
            if (!Active.HasValue) return "AKTİF/PASİF DURUMU BELİRSİZ";

            if (Active == false)
            {
                if (!Exit.HasValue) return "PASİF AMA ÇIKIŞ TARİHİ YOK";
                if (Hire.HasValue && Hire.Value.Date > Exit.Value.Date)
                    return "PASİF AMA YENİ GİRİŞ TARİHİ ÇIKIŞTAN SONRA";
                return day > Exit.Value.Date ? $"PASİF - ÇIKIŞ SONRASI ({Exit:dd.MM.yyyy})" : null;
            }

            // Aynı kartla yeniden işe giriş: eski çıkış A, yeni giriş B.
            // Sadece A < tarih < B geçersizdir. B ve sonrası korunur.
            if (Active == true && Hire.HasValue && Exit.HasValue && Hire.Value.Date > Exit.Value.Date)
                return day > Exit.Value.Date && day < Hire.Value.Date
                    ? $"AKTİF - ESKİ ÇIKIŞ / YENİ GİRİŞ ARASI ({Exit:dd.MM.yyyy} - {Hire:dd.MM.yyyy})"
                    : null;

            return null;
        }
    }

    [ModuleInitializer]
    internal static void Initialize() => Application.Idle += InjectOnce;

    static void InjectOnce(object? sender, EventArgs e)
    {
        if (injected) return;
        var sync = Application.OpenForms.Cast<Form>()
            .SelectMany(FindControls)
            .FirstOrDefault(c => c.GetType().Name == "DbTnfSyncControl");
        if (sync is null) return;

        var bar = FindControls(sync).OfType<FlowLayoutPanel>().FirstOrDefault();
        if (bar is null) return;

        // Eski/deneysel temizleme butonu varsa devre dışı bırakıp yerine güvenli buton koy.
        foreach (var old in FindControls(sync).OfType<Button>()
                     .Where(b => b.Text.Contains("DB+TNF Temizle", StringComparison.OrdinalIgnoreCase))
                     .ToList())
        {
            old.Visible = false;
            old.Enabled = false;
        }

        var safe = new Button
        {
            Text = "Geçersiz DB+TNF Temizle",
            Width = 185,
            Height = 32,
            FlatStyle = FlatStyle.Flat,
            Margin = new Padding(3, 0, 3, 0)
        };
        safe.Click += (_, _) => CleanInvalidWindow(sync);
        bar.Controls.Add(safe);

        var grid = GetField<DataGridView>(sync, "grid");
        if (grid is not null)
            grid.DataBindingComplete += (_, _) => ApplyEmploymentWarnings(sync, grid);

        injected = true;
        Application.Idle -= InjectOnce;
    }

    static IEnumerable<Control> FindControls(Control root)
    {
        foreach (Control child in root.Controls)
        {
            yield return child;
            foreach (var nested in FindControls(child)) yield return nested;
        }
    }

    static T? GetField<T>(object owner, string name) where T : class
        => owner.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(owner) as T;

    static FirebirdDatabase Database(Control sync)
        => sync.GetType().GetProperty("Database", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(sync) as FirebirdDatabase
           ?? throw new InvalidOperationException("Önce veritabanına bağlanın.");

    static string TnfPath(Control sync)
        => Convert.ToString(sync.GetType().GetMethod("RequireTnfPath", BindingFlags.Instance | BindingFlags.NonPublic)?.Invoke(sync, null))
           ?? throw new InvalidOperationException("Önce TNF/TXT dosyasını seçin.");

    static (DateTime A, DateTime B) Period(Control sync)
    {
        var year = GetField<NumericUpDown>(sync, "year") ?? throw new InvalidOperationException("Yıl alanı bulunamadı.");
        var month = GetField<ComboBox>(sync, "month") ?? throw new InvalidOperationException("Ay alanı bulunamadı.");
        var y = (int)year.Value;
        var m = month.SelectedIndex;
        var a = m == 0 ? new DateTime(y, 1, 1) : new DateTime(y, m, 1);
        return (a, m == 0 ? a.AddYears(1) : a.AddMonths(1));
    }

    static string SelectedCard(Control sync)
    {
        var person = GetField<ComboBox>(sync, "person") ?? throw new InvalidOperationException("Personel alanı bulunamadı.");
        var s = person.SelectedItem?.ToString() ?? "";
        if (s.Length < 5 || s.StartsWith("Tümü", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Önce tek bir personel/kart seçin. Tümü ile toplu silme yapılmaz.");
        return s[..5];
    }

    static bool? ParseStatus(string value)
    {
        var s = (value ?? "").Trim().ToUpperInvariant()
            .Replace('İ', 'I').Replace('Ş', 'S').Replace('Ğ', 'G')
            .Replace('Ü', 'U').Replace('Ö', 'O').Replace('Ç', 'C');
        if (s.Contains("AKTIF") || s.Contains("CALISIYOR") || s.Contains("CALISAN") || s.Contains("ACTIVE")) return true;
        if (s.Contains("PASIF") || s.Contains("AYRIL") || s.Contains("CIKTI") || s.Contains("PASSIVE")) return false;
        return null;
    }

    static DateTime? DateValue(object v)
        => v is null || v == DBNull.Value ? null : Convert.ToDateTime(v).Date;

    static Rule LoadRule(FirebirdDatabase db, string card)
    {
        var t = db.Query(@"select K.PKNO,K.AD,K.SOYAD,K.IGTARIH,K.ICTARIH,
            coalesce((select AD from DURUM D where D.KOD=K.DURUM),'') DURUMAD
            from KIMLIK K where K.PKNO=@P", new FbParameter("@P", card));
        if (t.Rows.Count == 0) throw new InvalidOperationException("KIMLIK kaydı bulunamadı: " + card);
        var r = t.Rows[0];
        var status = Convert.ToString(r["DURUMAD"])?.Trim() ?? "";
        return new Rule(card, $"{r["AD"]} {r["SOYAD"]}".Trim(), DateValue(r["IGTARIH"]), DateValue(r["ICTARIH"]), ParseStatus(status), status);
    }

    static Dictionary<string, Rule> LoadRules(FirebirdDatabase db)
    {
        var t = db.Query(@"select K.PKNO,K.AD,K.SOYAD,K.IGTARIH,K.ICTARIH,
            coalesce((select AD from DURUM D where D.KOD=K.DURUM),'') DURUMAD
            from KIMLIK K");
        var d = new Dictionary<string, Rule>(StringComparer.OrdinalIgnoreCase);
        foreach (DataRow r in t.Rows)
        {
            var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
            if (card.Length == 0) continue;
            var status = Convert.ToString(r["DURUMAD"])?.Trim() ?? "";
            d[card] = new Rule(card, $"{r["AD"]} {r["SOYAD"]}".Trim(), DateValue(r["IGTARIH"]), DateValue(r["ICTARIH"]), ParseStatus(status), status);
        }
        return d;
    }

    static void ApplyEmploymentWarnings(Control sync, DataGridView grid)
    {
        try
        {
            var rules = LoadRules(Database(sync));
            foreach (DataGridViewRow row in grid.Rows)
            {
                if (row.IsNewRow) continue;
                var card = Convert.ToString(row.Cells["Kart No"].Value)?.Trim() ?? "";
                if (!rules.TryGetValue(card, out var rule)) continue;
                if (!DateTime.TryParseExact(Convert.ToString(row.Cells["Tarih"].Value), "dd.MM.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) continue;
                var reason = rule.InvalidReason(date);
                if (reason is null) continue;
                row.Cells["Durum"].Value = "UYARI - " + reason + (rule.StatusName.Length > 0 ? $" [{rule.StatusName}]" : "");
                row.Cells["İşlem"].Value = "İNCELE";
                row.DefaultCellStyle.BackColor = Color.LightGray;
                row.DefaultCellStyle.SelectionBackColor = Color.Silver;
            }
        }
        catch { /* Audit görüntüsü açılmaya devam etsin; temizleme tarafı ayrıca kesin kontrol yapar. */ }
    }

    static (object Config, MethodInfo Parser) ParserTools(Control sync)
    {
        var type = sync.GetType();
        var load = type.GetMethod("LoadSettings", BindingFlags.Instance | BindingFlags.NonPublic)
                   ?? throw new InvalidOperationException("TNF format ayarı okunamadı.");
        var parser = type.GetMethod("TryParseTnf", BindingFlags.Static | BindingFlags.NonPublic)
                     ?? throw new InvalidOperationException("TNF okuyucu bulunamadı.");
        return (load.Invoke(sync, null) ?? throw new InvalidOperationException("TNF format ayarı boş."), parser);
    }

    static bool TryParse(MethodInfo parser, object config, string raw, int index, out string card, out DateTime date)
    {
        card = ""; date = default;
        var args = new object?[] { raw, index, config, null };
        if (parser.Invoke(null, args) is not bool ok || !ok || args[3] is null) return false;
        var ev = args[3]!;
        card = Convert.ToString(ev.GetType().GetProperty("Card")?.GetValue(ev))?.Trim() ?? "";
        var dv = ev.GetType().GetProperty("Date")?.GetValue(ev);
        if (dv is not DateTime dt) return false;
        date = dt.Date;
        return true;
    }

    static Encoding DetectEncoding(string path)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        using var fs = File.OpenRead(path);
        if (fs.Length >= 3)
        {
            var b = new byte[3]; fs.ReadExactly(b);
            if (b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF) return new UTF8Encoding(true);
        }
        return Encoding.GetEncoding(1254);
    }

    static void CleanInvalidWindow(Control sync)
    {
        try
        {
            var db = Database(sync);
            var src = TnfPath(sync);
            var card = SelectedCard(sync);
            var (periodA, periodB) = Period(sync);
            var rule = LoadRule(db, card);

            if (!rule.Active.HasValue)
                throw new InvalidOperationException($"Aktif/Pasif durumu net değil ({rule.StatusName}). Otomatik silme yapılmadı.");

            DateTime cleanA, cleanB;
            string ruleText;
            if (rule.Active == false)
            {
                if (!rule.Exit.HasValue) throw new InvalidOperationException("Personel PASİF fakat çıkış tarihi yok. Otomatik silme yapılmadı.");
                if (rule.Hire.HasValue && rule.Hire.Value > rule.Exit.Value)
                    throw new InvalidOperationException("Personel PASİF görünüyor fakat yeni giriş tarihi çıkıştan sonra. Durum/tarih çelişkili; otomatik silme yapılmadı.");
                cleanA = rule.Exit.Value.AddDays(1) > periodA ? rule.Exit.Value.AddDays(1) : periodA;
                cleanB = periodB;
                ruleText = $"PASİF: yalnız {rule.Exit:dd.MM.yyyy} çıkış tarihinden SONRAKİ kayıtlar";
            }
            else if (rule.Hire.HasValue && rule.Exit.HasValue && rule.Hire.Value > rule.Exit.Value)
            {
                cleanA = rule.Exit.Value.AddDays(1) > periodA ? rule.Exit.Value.AddDays(1) : periodA;
                cleanB = rule.Hire.Value < periodB ? rule.Hire.Value : periodB;
                ruleText = $"AKTİF yeniden işe giriş: yalnız {rule.Exit:dd.MM.yyyy} eski çıkış ile {rule.Hire:dd.MM.yyyy} yeni giriş ARASINDAKİ kayıtlar";
            }
            else
            {
                throw new InvalidOperationException("Personel AKTİF ve güvenli şekilde silinecek çıkış-yeniden giriş boşluğu yok. Hiçbir kayıt silinmedi.");
            }

            if (cleanA >= cleanB) throw new InvalidOperationException("Seçili ay/yıl içinde geçersiz kayıt aralığı yok.");

            var dbRows = db.Query(@"select SIRA,PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK
                where PKNO=@P and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B)) order by SIRA",
                new FbParameter("@P", card), new FbParameter("@A", cleanA), new FbParameter("@B", cleanB));

            var (config, parser) = ParserTools(sync);
            var enc = DetectEncoding(src);
            var original = File.ReadAllLines(src, enc).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
            var remove = new HashSet<int>();
            for (var i = 0; i < original.Count; i++)
                if (TryParse(parser, config, original[i], i, out var tc, out var td) && tc == card && td >= cleanA && td < cleanB)
                    remove.Add(i);

            if (dbRows.Rows.Count == 0 && remove.Count == 0)
            {
                MessageBox.Show($"{card} {rule.Name}\n{ruleText}\n\nTemizlenecek kayıt yok.", "HKN PDKS");
                return;
            }

            var message = $"{card}  {rule.Name}\nDurum: {rule.StatusName}\nGiriş: {(rule.Hire.HasValue ? rule.Hire.Value.ToString("dd.MM.yyyy") : "-")}\nÇıkış: {(rule.Exit.HasValue ? rule.Exit.Value.ToString("dd.MM.yyyy") : "-")}\n\n{ruleText}\n\nDB GIRCIK silinecek: {dbRows.Rows.Count}\nTNF/TXT silinecek: {remove.Count}\n\nGeçerli eski kayıtlar ve yeni işe girişten sonraki AKTİF kayıtlar KORUNACAK.\nDevam?";
            if (MessageBox.Show(message, "GEÇERSİZ DB + TNF TEMİZLE", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

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

                File.WriteAllLines(temp, original.Where((_, i) => !remove.Contains(i)), enc);
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

            // Yeniden kontrol et.
            sync.GetType().GetMethod("LoadAudit", BindingFlags.Instance | BindingFlags.NonPublic)?.Invoke(sync, null);
            MessageBox.Show($"Tamamlandı.\n\nDB silinen: {dbRows.Rows.Count}\nTNF silinen: {remove.Count}\nTNF yedeği: {tnfBackup}\nDB satır dökümü: {dbDump}", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (TargetInvocationException ex)
        {
            MessageBox.Show(ex.InnerException?.Message ?? ex.Message, "GEÇERSİZ DB + TNF TEMİZLE", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "GEÇERSİZ DB + TNF TEMİZLE", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
'@ | Set-Content $out -Encoding UTF8

$check = Get-Content $out -Raw
foreach ($token in @('Geçersiz DB+TNF Temizle','PASİF - ÇIKIŞ SONRASI','AKTİF - ESKİ ÇIKIŞ / YENİ GİRİŞ ARASI','delete from GIRCIK where SIRA=@S','yeni işe girişten sonraki AKTİF kayıtlar KORUNACAK','DURUMAD'))
{
    if (-not $check.Contains($token)) { throw "REV11 injector audit token missing: $token" }
}
Write-Host 'REV11 SAFE INJECTOR source audit OK.'
