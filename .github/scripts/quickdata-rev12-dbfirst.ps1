$ErrorActionPreference = 'Stop'

# Start from verified REV9 single-EXE base; REV12 replaces the expensive full-person scans.
& "$PSScriptRoot/quickdata-rev9-final2-build.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$syncPath = Join-Path $tool 'DbTnfSyncInjector.cs'
$s = Get-Content $syncPath -Raw

# Add full-file audit override fields.
$oldFields = '    readonly string settingsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS", "TNF_FORMAT_AYAR.json");'
if (-not $s.Contains($oldFields)) { $oldFields = '    readonly string settingsPath = Path.Combine(AppContext.BaseDirectory, "TNF_FORMAT_AYAR.json");' }
$newFields = $oldFields + "`r`n    DateTime? auditStartOverride;`r`n    DateTime? auditEndOverride;"
if (-not $s.Contains($oldFields)) { throw 'REV12 settings field marker not found.' }
$s = $s.Replace($oldFields, $newFields)

# Refresh only period-relevant DB cards when year/month changes.
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
if (-not $s.Contains($oldCtor)) { throw 'REV12 constructor marker not found.' }
$s = $s.Replace($oldCtor, $newCtor)

# Add final full TNF button.
$oldBtn = '        bar.Controls.Add(B("Kontrol Et", LoadAudit, 105));'
$newBtn = "        bar.Controls.Add(B(\"Kontrol Et\", LoadAudit, 105));`r`n        bar.Controls.Add(B(\"SON TAM KONTROL\", FinalFullAudit, 145));"
if (-not $s.Contains($oldBtn)) { throw 'REV12 button marker not found.' }
$s = $s.Replace($oldBtn, $newBtn)

# Replace RefreshPeople: DB GIRCIK first, only cards that actually exist in the chosen DB period.
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
select distinct g.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,
       coalesce((select AD from DURUM d where d.KOD=k.DURUM),'') DURUMAD
from GIRCIK g
left join KIMLIK k on k.PKNO=g.PKNO
where ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))
order by g.PKNO", new FbParameter("@A", a), new FbParameter("@B", b));

            person.BeginUpdate();
            try
            {
                person.Items.Clear();
                person.Items.Add("Tümü");
                foreach (DataRow r in t.Rows)
                {
                    var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
                    if (card.Length == 0 || card == "00001") continue;
                    var name = $"{r["AD"]} {r["SOYAD"]}".Trim();
                    var status = Convert.ToString(r["DURUMAD"])?.Trim() ?? "";
                    var hire = r["IGTARIH"] == DBNull.Value ? "" : $" G:{Convert.ToDateTime(r["IGTARIH"]):dd.MM.yyyy}";
                    var exit = r["ICTARIH"] == DBNull.Value ? "" : $" Ç:{Convert.ToDateTime(r["ICTARIH"]):dd.MM.yyyy}";
                    var st = status.Length == 0 ? "" : $" [{status}]";
                    person.Items.Add($"{card}  {name}{st}{hire}{exit}");
                }
                var match = oldCard.Length == 0 ? null : person.Items.Cast<object>().Select(x => x.ToString() ?? "").FirstOrDefault(x => x.StartsWith(oldCard + " ", StringComparison.Ordinal));
                person.SelectedItem = match;
                if (person.SelectedIndex < 0) person.SelectedIndex = 0;
            }
            finally { person.EndUpdate(); }
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "DB - TNF Eşitle", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    (DateTime Start, DateTime End) Period()
'@
$s2 = [regex]::Replace($s, $refreshPattern, $refreshReplacement)
if ($s2 -eq $s) { throw 'REV12 RefreshPeople replacement failed.' }
$s = $s2

# Period supports a temporary full-TNF date range override.
$oldPeriod = @'
    (DateTime Start, DateTime End) Period()
    {
        var y = (int)year.Value;
        var m = month.SelectedIndex;
        var a = m == 0 ? new DateTime(y, 1, 1) : new DateTime(y, m, 1);
        var b = m == 0 ? a.AddYears(1) : a.AddMonths(1);
        return (a, b);
    }
'@
$newPeriod = @'
    (DateTime Start, DateTime End) Period()
    {
        if (auditStartOverride.HasValue && auditEndOverride.HasValue)
            return (auditStartOverride.Value.Date, auditEndOverride.Value.Date);
        var y = (int)year.Value;
        var m = month.SelectedIndex;
        var a = m == 0 ? new DateTime(y, 1, 1) : new DateTime(y, m, 1);
        var b = m == 0 ? a.AddYears(1) : a.AddMonths(1);
        return (a, b);
    }
'@
if (-not $s.Contains($oldPeriod)) { throw 'REV12 Period marker not found.' }
$s = $s.Replace($oldPeriod, $newPeriod)

# Avoid KIMLIK full scan: only names belonging to cards with DB movement in the active audit period.
$loadNamesPattern = '(?ms)^    static Dictionary<string, string> LoadNames\(FirebirdDatabase db\)\s*\{.*?^    \}'
$loadNamesReplacement = @'
    Dictionary<string, string> LoadNames(FirebirdDatabase db)
    {
        var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var (a, b) = Period();
        var t = db.Query(@"
select distinct g.PKNO,k.AD,k.SOYAD
from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO
where ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))",
            new FbParameter("@A", a), new FbParameter("@B", b));
        foreach (DataRow r in t.Rows)
        {
            var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
            if (card.Length > 0) d[card] = $"{r["AD"]} {r["SOYAD"]}".Trim();
        }
        return d;
    }
'@
$s2 = [regex]::Replace($s, $loadNamesPattern, $loadNamesReplacement)
if ($s2 -eq $s) { throw 'REV12 LoadNames replacement failed.' }
$s = $s2

# Insert full-file final audit. It reads TNF only to obtain its exact date range, then DB is queried for that range;
# no historical KIMLIK/personel sweep is performed.
$loadAuditMarker = '    void LoadAudit()'
$finalAudit = @'
    void FinalFullAudit()
    {
        try
        {
            var src = RequireTnfPath();
            var cfg = LoadSettings();
            var lines = File.ReadAllLines(src, DetectEncoding(src));
            var dates = new List<DateTime>();
            for (var i = 0; i < lines.Length; i++)
                if (!string.IsNullOrWhiteSpace(lines[i]) && TryParseTnf(lines[i], i, cfg, out var e)) dates.Add(e.Date.Date);
            if (dates.Count == 0) throw new InvalidOperationException("TNF/TXT içinde okunabilir kayıt bulunamadı.");

            auditStartOverride = dates.Min();
            auditEndOverride = dates.Max().AddDays(1);
            RefreshPeople();
            person.SelectedIndex = 0;
            LoadAudit();
            summary.Text = $"SON TAM KONTROL {auditStartOverride:dd.MM.yyyy}-{auditEndOverride.Value.AddDays(-1):dd.MM.yyyy} | " + summary.Text;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "SON TAM KONTROL", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            auditStartOverride = null;
            auditEndOverride = null;
        }
    }

    void LoadAudit()
'@
if (-not $s.Contains($loadAuditMarker)) { throw 'REV12 LoadAudit marker not found.' }
$s = $s.Replace($loadAuditMarker, $finalAudit)

Set-Content $syncPath $s -Encoding UTF8 -NoNewline

# Add optimized employment validator/cleaner. It looks only at cards already present in the current result grid.
$cleanupPath = Join-Path $tool 'EmploymentDbFirstCleanup.cs'
@'
using System.Data;
using System.Globalization;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal static class EmploymentDbFirstCleanup
{
    static bool injected;

    sealed record Rule(string Card, string Name, DateTime? Hire, DateTime? Exit, bool? Active, string Status)
    {
        public string? InvalidReason(DateTime day)
        {
            day = day.Date;
            if (!Active.HasValue) return "AKTİF/PASİF BELİRSİZ";

            if (Active == false)
            {
                if (!Hire.HasValue || !Exit.HasValue) return "PASİF TARİHLERİ EKSİK";
                if (Hire.Value.Date > Exit.Value.Date) return "PASİF TARİHLERİ ÇELİŞKİLİ";
                if (day < Hire.Value.Date) return $"İŞE GİRİŞ ÖNCESİ ({Hire:dd.MM.yyyy})";
                if (day > Exit.Value.Date) return $"İŞTEN ÇIKIŞ SONRASI ({Exit:dd.MM.yyyy})";
                return null;
            }

            if (Active == true && Hire.HasValue && Exit.HasValue && Hire.Value.Date > Exit.Value.Date)
            {
                // Aynı kartla yeniden işe giriş: eski geçmiş çıkış gününe kadar korunur,
                // sadece eski çıkış ile son işe giriş arasındaki boşluk geçersizdir.
                return day > Exit.Value.Date && day < Hire.Value.Date
                    ? $"ESKİ ÇIKIŞ / SON GİRİŞ ARASI ({Exit:dd.MM.yyyy}-{Hire:dd.MM.yyyy})"
                    : null;
            }

            if (Active == true && Hire.HasValue && !Exit.HasValue && day < Hire.Value.Date)
                return $"SON İŞE GİRİŞ ÖNCESİ ({Hire:dd.MM.yyyy})";

            if (Active == true && Hire.HasValue && Exit.HasValue && Exit.Value.Date >= Hire.Value.Date)
                return "AKTİF AMA ÇIKIŞ TARİHİ SON GİRİŞTEN SONRA - ELLE İNCELE";

            return null;
        }
    }

    [ModuleInitializer]
    internal static void Init() => Application.Idle += Inject;

    static void Inject(object? sender, EventArgs e)
    {
        if (injected) return;
        var sync = Application.OpenForms.Cast<Form>().SelectMany(Children).FirstOrDefault(x => x.GetType().Name == "DbTnfSyncControl");
        if (sync is null) return;
        var bar = Children(sync).OfType<FlowLayoutPanel>().FirstOrDefault();
        if (bar is null) return;

        var b = new Button { Text = "Geçersiz DB+TNF Temizle", Width = 190, Height = 32, FlatStyle = FlatStyle.Flat, Margin = new Padding(3,0,3,0) };
        b.Click += (_, _) => Clean(sync);
        bar.Controls.Add(b);

        var grid = Field<DataGridView>(sync, "grid");
        if (grid is not null) grid.DataBindingComplete += (_, _) => MarkOnlyVisibleCards(sync, grid);
        injected = true;
        Application.Idle -= Inject;
    }

    static IEnumerable<Control> Children(Control root)
    {
        foreach (Control c in root.Controls) { yield return c; foreach (var n in Children(c)) yield return n; }
    }

    static T? Field<T>(object o, string n) where T:class => o.GetType().GetField(n, BindingFlags.Instance|BindingFlags.NonPublic)?.GetValue(o) as T;
    static FirebirdDatabase Db(Control s) => s.GetType().GetProperty("Database", BindingFlags.Instance|BindingFlags.NonPublic)?.GetValue(s) as FirebirdDatabase ?? throw new InvalidOperationException("Önce DB bağlayın.");
    static string PathTnf(Control s) => Convert.ToString(s.GetType().GetMethod("RequireTnfPath", BindingFlags.Instance|BindingFlags.NonPublic)?.Invoke(s,null)) ?? throw new InvalidOperationException("TNF seçin.");
    static string Card(Control s)
    {
        var p = Field<ComboBox>(s,"person") ?? throw new InvalidOperationException("Personel alanı yok.");
        var x = p.SelectedItem?.ToString() ?? "";
        if (x.Length < 5 || x.StartsWith("Tümü", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Temizleme için tek personel/kart seçin.");
        return x[..5];
    }
    static bool? Status(string s)
    {
        var x=(s??"").Trim().ToUpperInvariant().Replace('İ','I').Replace('Ş','S').Replace('Ğ','G').Replace('Ü','U').Replace('Ö','O').Replace('Ç','C');
        if(x.Contains("AKTIF")||x.Contains("CALISAN")||x.Contains("CALISIYOR")||x.Contains("ACTIVE")) return true;
        if(x.Contains("PASIF")||x.Contains("AYRIL")||x.Contains("CIKTI")||x.Contains("PASSIVE")) return false;
        return null;
    }
    static DateTime? D(object v)=>v==DBNull.Value||v is null?null:Convert.ToDateTime(v).Date;

    static Rule RuleFor(FirebirdDatabase db,string card)
    {
        var t=db.Query(@"select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,coalesce((select AD from DURUM d where d.KOD=k.DURUM),'') DURUMAD from KIMLIK k where k.PKNO=@P",new FbParameter("@P",card));
        if(t.Rows.Count==0) throw new InvalidOperationException("KIMLIK kaydı yok: "+card);
        var r=t.Rows[0]; var st=Convert.ToString(r["DURUMAD"])?.Trim()??"";
        return new Rule(card,$"{r["AD"]} {r["SOYAD"]}".Trim(),D(r["IGTARIH"]),D(r["ICTARIH"]),Status(st),st);
    }

    static void MarkOnlyVisibleCards(Control sync, DataGridView grid)
    {
        try
        {
            if (!grid.Columns.Contains("Kart No") || !grid.Columns.Contains("Tarih") || !grid.Columns.Contains("Durum") || !grid.Columns.Contains("İşlem")) return;
            var db=Db(sync);
            var cards=grid.Rows.Cast<DataGridViewRow>().Where(r=>!r.IsNewRow).Select(r=>Convert.ToString(r.Cells["Kart No"].Value)?.Trim()??"").Where(x=>x.Length>0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            var rules=new Dictionary<string,Rule>(StringComparer.OrdinalIgnoreCase);
            foreach(var c in cards) { try { rules[c]=RuleFor(db,c); } catch { } }
            foreach(DataGridViewRow row in grid.Rows)
            {
                if(row.IsNewRow) continue;
                var c=Convert.ToString(row.Cells["Kart No"].Value)?.Trim()??"";
                if(!rules.TryGetValue(c,out var rule)) continue;
                if(!DateTime.TryParseExact(Convert.ToString(row.Cells["Tarih"].Value),"dd.MM.yyyy",CultureInfo.InvariantCulture,DateTimeStyles.None,out var dt)) continue;
                var reason=rule.InvalidReason(dt);
                if(reason is null) continue;
                row.Cells["Durum"].Value="UYARI - "+reason+(rule.Status.Length>0?$" [{rule.Status}]":"");
                row.Cells["İşlem"].Value="İNCELE";
                row.DefaultCellStyle.BackColor=Color.LightGray;
            }
        }
        catch { }
    }

    static Encoding Enc(string p){Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);return Encoding.GetEncoding(1254);}

    static void Clean(Control sync)
    {
        try
        {
            var db=Db(sync); var card=Card(sync); var src=PathTnf(sync); var rule=RuleFor(db,card);
            if(!rule.Active.HasValue) throw new InvalidOperationException("Aktif/Pasif net değil; otomatik silme yok.");

            var badDb=db.Query(@"select SIRA,PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK where PKNO=@P order by SIRA",new FbParameter("@P",card));
            var deleteSira=new List<int>();
            foreach(DataRow r in badDb.Rows)
            {
                bool bad=false;
                if(r["GTARIH"]!=DBNull.Value && rule.InvalidReason(Convert.ToDateTime(r["GTARIH"]).Date)!=null) bad=true;
                if(r["CTARIH"]!=DBNull.Value && rule.InvalidReason(Convert.ToDateTime(r["CTARIH"]).Date)!=null) bad=true;
                if(bad) deleteSira.Add(Convert.ToInt32(r["SIRA"]));
            }

            var cfg=sync.GetType().GetMethod("LoadSettings",BindingFlags.Instance|BindingFlags.NonPublic)?.Invoke(sync,null) ?? throw new InvalidOperationException("TNF ayarı okunamadı.");
            var parser=sync.GetType().GetMethod("TryParseTnf",BindingFlags.Static|BindingFlags.NonPublic) ?? throw new InvalidOperationException("TNF parser yok.");
            var lines=File.ReadAllLines(src,Enc(src)).Where(x=>!string.IsNullOrWhiteSpace(x)).ToList();
            var remove=new HashSet<int>();
            for(int i=0;i<lines.Count;i++)
            {
                var args=new object?[]{lines[i],i,cfg,null};
                if(parser.Invoke(null,args) is not bool ok || !ok || args[3] is null) continue;
                var ev=args[3]!;
                var ec=Convert.ToString(ev.GetType().GetProperty("Card")?.GetValue(ev))?.Trim()??"";
                if(ec!=card) continue;
                if(ev.GetType().GetProperty("Date")?.GetValue(ev) is DateTime dt && rule.InvalidReason(dt.Date)!=null) remove.Add(i);
            }

            if(deleteSira.Count==0 && remove.Count==0){MessageBox.Show("Geçersiz kayıt bulunmadı.");return;}
            var msg=$"{card} {rule.Name}\nDurum: {rule.Status}\nGiriş: {(rule.Hire.HasValue?rule.Hire.Value.ToString("dd.MM.yyyy"):"-")}\nÇıkış: {(rule.Exit.HasValue?rule.Exit.Value.ToString("dd.MM.yyyy"):"-")}\n\nDB silinecek: {deleteSira.Count}\nTNF silinecek: {remove.Count}\n\nSadece giriş/çıkış kurallarına göre geçersiz hareketler silinecek. Geçerli eski ve yeni dönemler korunacak. Devam?";
            if(MessageBox.Show(msg,"GEÇERSİZ DB+TNF TEMİZLE",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;

            var dir=System.IO.Path.GetDirectoryName(src)??AppContext.BaseDirectory; var y=System.IO.Path.Combine(dir,"_YEDEK");Directory.CreateDirectory(y);var stamp=DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var tb=System.IO.Path.Combine(y,System.IO.Path.GetFileName(src)+$".bak_REV12_{card}_{stamp}");File.Copy(src,tb,true);
            var dump=System.IO.Path.Combine(y,$"DB_GIRCIK_REV12_{card}_{stamp}.txt");File.WriteAllLines(dump,badDb.AsEnumerable().Where(r=>deleteSira.Contains(Convert.ToInt32(r["SIRA"]))).Select(r=>string.Join(";",r.ItemArray.Select(Convert.ToString))),Encoding.UTF8);
            var temp=src+".tmp_REV12";
            using var c=db.OpenConnection(); using var tx=c.BeginTransaction();
            try
            {
                foreach(var sira in deleteSira){using var cmd=new FbCommand("delete from GIRCIK where SIRA=@S",c,tx);cmd.Parameters.Add(new FbParameter("@S",sira));cmd.ExecuteNonQuery();}
                File.WriteAllLines(temp,lines.Where((_,i)=>!remove.Contains(i)),Enc(src));File.Move(temp,src,true);tx.Commit();
            }
            catch{try{tx.Rollback();}catch{}try{if(File.Exists(temp))File.Delete(temp);}catch{}try{File.Copy(tb,src,true);}catch{}throw;}

            sync.GetType().GetMethod("LoadAudit",BindingFlags.Instance|BindingFlags.NonPublic)?.Invoke(sync,null);
            MessageBox.Show($"Tamamlandı. DB silinen: {deleteSira.Count} | TNF silinen: {remove.Count}\nYedek: {tb}","HKN PDKS");
        }
        catch(TargetInvocationException ex){MessageBox.Show(ex.InnerException?.Message??ex.Message,"REV12",MessageBoxButtons.OK,MessageBoxIcon.Error);}
        catch(Exception ex){MessageBox.Show(ex.Message,"REV12",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }
}
'@ | Set-Content $cleanupPath -Encoding UTF8

# Audit source tokens.
$check = Get-Content $syncPath -Raw
foreach($token in @('select distinct g.PKNO','SON TAM KONTROL','auditStartOverride','from GIRCIK g','LoadNames(FirebirdDatabase db)')){if(-not $check.Contains($token)){throw "REV12 sync audit missing: $token"}}
$check2 = Get-Content $cleanupPath -Raw
foreach($token in @('Geçersiz DB+TNF Temizle','İŞTEN ÇIKIŞ SONRASI','ESKİ ÇIKIŞ / SON GİRİŞ ARASI','SON İŞE GİRİŞ ÖNCESİ','delete from GIRCIK where SIRA=@S')){if(-not $check2.Contains($token)){throw "REV12 cleanup audit missing: $token"}}
Write-Host 'REV12 DB-FIRST audit OK.'
