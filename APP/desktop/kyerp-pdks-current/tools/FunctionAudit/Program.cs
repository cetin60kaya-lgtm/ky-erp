using System.Runtime.InteropServices;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using HKN.Personel.Native;
using KYERP.PDKS.Core;
using FirebirdSql.Data.FirebirdClient;

ApplicationConfiguration.Initialize();
foreach (var key in new[] { "KY_PDKS_DB_PATH", "KY_PDKS_DB_HOST", "KY_PDKS_DB_PORT", "KY_PDKS_DB_USER", "KY_PDKS_DB_PASSWORD", "KYERP_PDKS_ROOT", "KY_PDKS_RUNTIME_ROOT", "KY_PDKS_REPORT_ROOT", "KY_PDKS_PERSONEL_EXE" })
{
    if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))) continue;
    var value = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.User);
    if (!string.IsNullOrWhiteSpace(value)) Environment.SetEnvironmentVariable(key, value, EnvironmentVariableTarget.Process);
}
PdksTheme.Install();
Environment.SetEnvironmentVariable("KY_PDKS_UI_AUDIT", "1", EnvironmentVariableTarget.Process);

var errors = new List<string>();
var results = new List<string>();
RunLiveAttendanceChecks(errors, results);
RunLiveIsolationChecks(errors, results);
RunOperationalTnfChecks(errors, results);
RunBulkCorrectionChecks(errors, results);
RunPersonEditorValueChecks(errors, results);
RunReportCenterChecks(errors, results);
Application.ThreadException += (_, e) => errors.Add("UI: " + e.Exception.GetBaseException().Message);

var user = new LocalUser
{
    UserName = "ADMIN",
    IsAdmin = true,
    IsActive = true,
    IsCompanyResponsible = true,
    Permissions = Enum.GetNames<PdksModule>().ToList()
};

using var shell = new MainShellForm(user)
{
    StartPosition = FormStartPosition.Manual,
    Location = new Point(20, 20),
    Size = new Size(1500, 900)
};
shell.Show();
Pump(900);

var visibleButtons = FindControls<Button>(shell)
    .Where(x => x.Visible)
    .Select(x => Clean(x.Text))
    .Where(x => x.Length > 0)
    .ToArray();
foreach (var primary in PdksCommandCatalog.Primary)
    if (!visibleButtons.Contains(primary.Title, StringComparer.OrdinalIgnoreCase))
        errors.Add("Eksik ana navigasyon: " + primary.Title);

var commands = PdksCommandCatalog.All
    .Where(x => x.Id != PdksCommandId.Home)
    .OrderBy(x => x.Order)
    .ToArray();

foreach (var command in commands)
{
    var path = command.Group + " > " + command.Title;
    Console.WriteLine("RUN|" + path);
    Console.Out.Flush();
    var beforeErrors = errors.Count;
    using var closer = new System.Windows.Forms.Timer { Interval = 450 };
    closer.Tick += (_, _) =>
    {
        NativeDialogs.CloseOwnMessageBoxes();
        foreach (Form form in Application.OpenForms.Cast<Form>().ToArray())
        {
            if (ReferenceEquals(form, shell) || !form.Modal) continue;
            try { form.Close(); } catch { }
        }
    };
    closer.Start();
    try
    {
        shell.NavigateToCommand(command.Id);
        Pump(850);
        if (errors.Count == beforeErrors) results.Add("PASS|" + path);
        else results.Add("FAIL|" + path + "|" + errors[^1]);
    }
    catch (Exception ex)
    {
        var message = ex.GetBaseException().Message;
        errors.Add(path + ": " + message);
        results.Add("FAIL|" + path + "|" + message);
    }
    finally
    {
        closer.Stop();
        NativeDialogs.CloseOwnMessageBoxes();
        foreach (Form form in Application.OpenForms.Cast<Form>().ToArray())
        {
            if (ReferenceEquals(form, shell) || !form.Modal) continue;
            try { form.Close(); } catch { }
        }
        Pump(100);
    }
}

foreach (var line in results) Console.WriteLine(line);
foreach (var error in errors.Distinct()) Console.WriteLine("ERROR|" + error);
Console.WriteLine($"FUNCTION_AUDIT_COMMANDS={commands.Length}");
Console.WriteLine($"FUNCTION_AUDIT_ERRORS={errors.Distinct().Count()}");
Console.WriteLine(errors.Count == 0 ? "FUNCTION_AUDIT_PASS" : "FUNCTION_AUDIT_FAIL");
shell.Close();
Environment.Exit(errors.Count == 0 ? 0 : 1);

static void RunPersonEditorValueChecks(List<string> errors, List<string> results)
{
    try
    {
        using var form = new PersonelForm();
        var method = typeof(PersonelForm).GetMethod("EditorDbValue", BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("Personel editor değer dönüştürücü bulunamadı.");
        var esdrm = method.Invoke(form, new object[] { "ESDRM", "" });
        var ccks = method.Invoke(form, new object[] { "CCKSAY", "" });
        var normal = method.Invoke(form, new object[] { "ADRES", "" });
        if (Convert.ToDecimal(esdrm) != 0m || Convert.ToDecimal(ccks) != 0m || normal != DBNull.Value)
            throw new InvalidOperationException("Boş sayısal alan varsayılanları doğru değil.");
        results.Add("PASS|Personel editör boş zorunlu sayısal alanları 0 olarak kaydediyor");
    }
    catch (Exception ex)
    {
        var e = ex is TargetInvocationException tie && tie.InnerException is not null ? tie.InnerException.GetBaseException() : ex.GetBaseException();
        errors.Add("Personel editör değer testi: " + e.Message);
        results.Add("FAIL|Personel editör boş sayısal alan testi|" + e.Message);
    }
}

static void RunReportCenterChecks(List<string> errors, List<string> results)
{
    try
    {
        using var form = new ReportCenterForm();
        var type = typeof(ReportCenterForm);
        var reportsField = type.GetField("Reports", BindingFlags.Static | BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("Rapor kataloğu bulunamadı.");
        var query = type.GetMethod("Query", BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("Rapor sorgu metodu bulunamadı.");
        var reports = reportsField.GetValue(null) as string[]
            ?? throw new InvalidOperationException("Rapor kataloğu okunamadı.");

        var failed = 0;
        var totalRows = 0;
        foreach (var report in reports)
        {
            try
            {
                var table = query.Invoke(form, new object[] { report }) as System.Data.DataTable
                    ?? throw new InvalidOperationException("Rapor DataTable döndürmedi.");
                totalRows += table.Rows.Count;
                results.Add($"PASS|RAPOR > {report}|{table.Rows.Count} kayıt");
            }
            catch (Exception ex)
            {
                failed++;
                var baseError = ex is TargetInvocationException tie && tie.InnerException is not null
                    ? tie.InnerException.GetBaseException()
                    : ex.GetBaseException();
                errors.Add($"Rapor sorgusu [{report}]: {baseError.Message}");
                results.Add($"FAIL|RAPOR > {report}|{baseError.Message}");
            }
        }

        results.Add(failed == 0
            ? $"PASS|Rapor merkezi tüm sorgular|{reports.Length} rapor, {totalRows} toplam satır"
            : $"FAIL|Rapor merkezi tüm sorgular|{failed}/{reports.Length} hata");
    }
    catch (Exception ex)
    {
        errors.Add("Rapor merkezi toplu sorgu testi: " + ex.GetBaseException().Message);
    }
}

static void RunBulkCorrectionChecks(List<string> errors, List<string> results)
{
    var database = new FirebirdDatabase(PdksOptions.FromEnvironment());
    var day = new DateTime(2097, 11, 15);
    var card = "";
    var id = 0;
    try
    {
        var people = database.Query("select first 1 PKNO from KIMLIK order by PKNO");
        card = Convert.ToString(people.Rows[0][0])?.Trim() ?? throw new InvalidOperationException("Test personeli yok.");
        database.Execute("delete from GIRCIK where PKNO=@P and ((GTARIH=@D) or (CTARIH=@D))",
            new FbParameter("@P",card),new FbParameter("@D",day));
        id = Convert.ToInt32(database.Scalar("select coalesce(max(SIRA),0)+1 from GIRCIK") ?? 1);
        database.Execute("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,CTARIH,CSAAT,CDAKIKA,CTUR,MKOD) values (@I,@P,@D,'09:45',585,'',@D,'17:30',1050,'','000')",
            new FbParameter("@I",id),new FbParameter("@P",card),new FbParameter("@D",day));

        var service=typeof(LiveAttendanceForm).Assembly.GetType("HKN.Personel.Native.AttendanceBulkCorrectionService")
            ?? throw new InvalidOperationException("Toplu düzeltme servisi bulunamadı.");
        var entry=service.GetMethod("NormalizeEntries",BindingFlags.Static|BindingFlags.Public|BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("Geç giriş düzeltme metodu bulunamadı.");
        var exit=service.GetMethod("NormalizeExits",BindingFlags.Static|BindingFlags.Public|BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("Erken çıkış düzeltme metodu bulunamadı.");
        entry.Invoke(null,new object[]{database,new[]{card},day,new TimeSpan(8,20,0),new TimeSpan(8,35,0)});
        exit.Invoke(null,new object[]{database,new[]{card},day,new TimeSpan(18,50,0),new TimeSpan(19,5,0)});

        var row=database.Query("select GSAAT,GDAKIKA,GTUR,CSAAT,CDAKIKA,CTUR from GIRCIK where SIRA=@I",
            new FbParameter("@I",id)).Rows[0];
        var gm=Convert.ToInt32(row["GDAKIKA"]);var cm=Convert.ToInt32(row["CDAKIKA"]);
        if(gm<500||gm>515||cm<1130||cm>1145)errors.Add("Toplu saat düzeltme aralık kuralı bozuk.");
        if(string.Equals(Convert.ToString(row["GTUR"])?.Trim(),"E",StringComparison.OrdinalIgnoreCase)||
           string.Equals(Convert.ToString(row["CTUR"])?.Trim(),"E",StringComparison.OrdinalIgnoreCase))
            errors.Add("Normal saat düzeltmesi yanlışlıkla E oluşturdu.");

        var tnf=Path.Combine(Environment.GetEnvironmentVariable("KYERP_PDKS_ROOT")??string.Empty,"TNF","TR2097.Tnf");
        var lines=File.Exists(tnf)?File.ReadAllLines(tnf):[];
        var gs=Convert.ToString(row["GSAAT"])?.Trim();var cs=Convert.ToString(row["CSAAT"])?.Trim();
        if(!lines.Any(x=>x.StartsWith($"{card},{gs},151197,1,001",StringComparison.Ordinal))||
           !lines.Any(x=>x.StartsWith($"{card},{cs},151197,1,001",StringComparison.Ordinal)))
            errors.Add("Toplu düzeltme sonrası DATA-TNF dakika eşitliği kurulamadı.");

        var addNormal=service.GetMethod("AddNormalEntries",BindingFlags.Static|BindingFlags.Public|BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("Normal eksik giriş ekleme metodu bulunamadı.");
        var addE=service.GetMethod("AddManualEntries",BindingFlags.Static|BindingFlags.Public|BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("E giriş ekleme metodu bulunamadı.");
        var tnfService=typeof(LiveAttendanceForm).Assembly.GetType("HKN.Personel.Native.OperationalTnfSyncService")
            ?? throw new InvalidOperationException("TNF eşitleme servisi bulunamadı.");
        var align=tnfService.GetMethod("AlignPersonDay",BindingFlags.Static|BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("Kişi/gün TNF eşitleme metodu bulunamadı.");

        database.Execute("update GIRCIK set GTARIH=null,GSAAT=null,GDAKIKA=null,GTUR=null where SIRA=@I",new FbParameter("@I",id));
        align.Invoke(null,new object[]{database,card,day});
        addNormal.Invoke(null,new object[]{database,new[]{card},day,new TimeSpan(8,20,0),new TimeSpan(8,35,0)});
        row=database.Query("select GSAAT,GTUR,CSAAT,CTUR from GIRCIK where SIRA=@I",new FbParameter("@I",id)).Rows[0];
        gs=Convert.ToString(row["GSAAT"])?.Trim();cs=Convert.ToString(row["CSAAT"])?.Trim();
        lines=File.Exists(tnf)?File.ReadAllLines(tnf):[];
        if(string.Equals(Convert.ToString(row["GTUR"])?.Trim(),"E",StringComparison.OrdinalIgnoreCase))
            errors.Add("Normal eksik giriş ekleme yanlışlıkla E oluşturdu.");
        if(!lines.Any(x=>x.StartsWith($"{card},{gs},151197,1,001",StringComparison.Ordinal)))
            errors.Add("Normal eksik giriş DATA-TNF'ye birlikte yazılmadı.");

        database.Execute("update GIRCIK set GTARIH=null,GSAAT=null,GDAKIKA=null,GTUR=null where SIRA=@I",new FbParameter("@I",id));
        align.Invoke(null,new object[]{database,card,day});
        addE.Invoke(null,new object[]{database,new[]{card},day,new TimeSpan(8,20,0),new TimeSpan(8,35,0)});
        row=database.Query("select GSAAT,GTUR,CSAAT,CTUR from GIRCIK where SIRA=@I",new FbParameter("@I",id)).Rows[0];
        gs=Convert.ToString(row["GSAAT"])?.Trim();cs=Convert.ToString(row["CSAAT"])?.Trim();
        lines=File.Exists(tnf)?File.ReadAllLines(tnf):[];
        if(!string.Equals(Convert.ToString(row["GTUR"])?.Trim(),"E",StringComparison.OrdinalIgnoreCase))
            errors.Add("E giriş yalnız açık ADMIN işlemiyle üretilemedi.");
        if(lines.Any(x=>x.StartsWith($"{card},{gs},151197,1,001",StringComparison.Ordinal))||
           !lines.Any(x=>x.StartsWith($"{card},{cs},151197,1,001",StringComparison.Ordinal)))
            errors.Add("E giriş TNF dışı kalmadı veya normal çıkış TNF'den kayboldu.");

        var failed=errors.Any(x=>x.Contains("Toplu saat",StringComparison.OrdinalIgnoreCase)||
                                x.Contains("Normal saat",StringComparison.OrdinalIgnoreCase)||
                                x.Contains("Toplu düzeltme",StringComparison.OrdinalIgnoreCase)||
                                x.Contains("Normal eksik giriş",StringComparison.OrdinalIgnoreCase)||
                                x.Contains("E giriş",StringComparison.OrdinalIgnoreCase));
        results.Add(failed?"FAIL|Toplu kart düzeltme / E ayrımı ve DATA-TNF eşitleme":"PASS|Normal eksik/düzeltme DATA+TNF, E ise yalnız DATA kuralı doğru");
    }
    catch(Exception ex){errors.Add("Toplu düzeltme regresyon testi: "+ex.GetBaseException().Message);}
    finally
    {
        if(id!=0)try
        {
            database.Execute("delete from GIRCIK where SIRA=@I",new FbParameter("@I",id));
            var service=typeof(LiveAttendanceForm).Assembly.GetType("HKN.Personel.Native.OperationalTnfSyncService");
            service?.GetMethod("AlignPersonDay",BindingFlags.Static|BindingFlags.NonPublic)?.Invoke(null,new object[]{database,card,day});
        }catch{}
    }
}

static void RunOperationalTnfChecks(List<string> errors, List<string> results)
{
    var database = new FirebirdDatabase(PdksOptions.FromEnvironment());
    var day = new DateTime(2098, 12, 15);
    var workspace = Environment.GetEnvironmentVariable("KYERP_PDKS_ROOT") ?? string.Empty;
    var tnfPath = Path.Combine(workspace, "TNF", "TR2098.Tnf");
    var card = ""; var id = 0;
    try
    {
        var people = database.Query("select first 1 PKNO from KIMLIK order by PKNO");
        card = Convert.ToString(people.Rows[0][0])?.Trim() ?? throw new InvalidOperationException("Test personeli yok.");
        var max = database.Query("select coalesce(max(SIRA),0)+1 N from GIRCIK"); id = Convert.ToInt32(max.Rows[0][0]);
        database.Execute("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,CTARIH,CSAAT,CDAKIKA,CTUR,MKOD) values (@I,@P,@D,'08:30',510,'E',@D,'19:00',1140,'','000')",
            new FbParameter("@I", id), new FbParameter("@P", card), new FbParameter("@D", day));
        var service = typeof(LiveAttendanceForm).Assembly.GetType("HKN.Personel.Native.OperationalTnfSyncService") ?? throw new InvalidOperationException("Operasyon TNF servisi bulunamadı.");
        var align = service.GetMethod("AlignPersonDay", BindingFlags.Static | BindingFlags.NonPublic) ?? throw new InvalidOperationException("TNF hizalama metodu bulunamadı.");
        align.Invoke(null, new object[] { database, card, day });
        var lines = File.Exists(tnfPath) ? File.ReadAllLines(tnfPath) : [];
        if (lines.Any(x => x.StartsWith(card + ",08:30,151298,")) || !lines.Any(x => x.StartsWith(card + ",19:00,151298,")))
            errors.Add("E tarafı TNF kuralı bozuk: sabah E dışlanmadı veya normal akşam kayboldu.");
        database.Execute("update GIRCIK set GTUR='' where SIRA=@I", new FbParameter("@I", id));
        align.Invoke(null, new object[] { database, card, day });
        lines = File.ReadAllLines(tnfPath);
        if (!lines.Any(x => x.StartsWith(card + ",08:30,151298,")) || !lines.Any(x => x.StartsWith(card + ",19:00,151298,")))
            errors.Add("E normale çevrildiğinde DB-TNF tek işlem hizalaması başarısız.");
        database.Execute("delete from GIRCIK where SIRA=@I", new FbParameter("@I", id)); id = 0;
        align.Invoke(null, new object[] { database, card, day });
        lines = File.ReadAllLines(tnfPath);
        if (lines.Any(x => x.StartsWith(card + ",", StringComparison.Ordinal) && x.Contains(",151298,1,001", StringComparison.Ordinal))) errors.Add("DB kaydı silindikten sonra TNF karşılığı kaldı.");
        var failed = errors.Any(x => x.Contains("TNF kuralı", StringComparison.OrdinalIgnoreCase) || x.Contains("DB-TNF", StringComparison.OrdinalIgnoreCase) || x.Contains("TNF karşılığı", StringComparison.OrdinalIgnoreCase));
        results.Add(failed ? "FAIL|E ve manuel DB-TNF tek işlem regresyonu" : "PASS|E ve manuel değişiklikler ana TNF ile tek işlem hizalanıyor");
    }
    catch (Exception ex) { errors.Add("Operasyon TNF regresyon testi: " + ex.GetBaseException().Message); }
    finally { if (id != 0) try { database.Execute("delete from GIRCIK where SIRA=@I", new FbParameter("@I", id)); } catch { } }
}

static void RunLiveIsolationChecks(List<string> errors, List<string> results)
{
    try
    {
        var workspace = Environment.GetEnvironmentVariable("KYERP_PDKS_ROOT") ?? string.Empty;
        var dbPath = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH") ?? string.Empty;
        var tnfPath = Path.Combine(workspace, "TNF", $"TR{DateTime.Today.Year}.Tnf");
        string Hash(string path) => File.Exists(path) ? Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))) : "MISSING";
        string DbFingerprint()
        {
            var database = new FirebirdDatabase(PdksOptions.FromEnvironment());
            var builder = new StringBuilder();
            foreach (var sql in new[] {
                "select SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,CTARIH,CSAAT,CDAKIKA,CTUR from GIRCIK order by SIRA",
                "select PKNO,IGTARIH,ICTARIH from KIMLIK order by PKNO" })
            {
                var table = database.Query(sql);
                foreach (System.Data.DataRow row in table.Rows)
                    builder.AppendLine(string.Join("|", row.ItemArray.Select(value => value == DBNull.Value ? "<NULL>" : Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture))));
            }
            return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString())));
        }
        var dbBefore = DbFingerprint(); var tnfBefore = Hash(tnfPath);
        var assembly = typeof(LiveAttendanceForm).Assembly;
        var archive = assembly.GetType("HKN.Personel.Native.TerminalLiveArchiveService") ?? throw new InvalidOperationException("Canlı arşiv servisi bulunamadı.");
        archive.GetMethod("ClearAll", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)!.Invoke(null, null);
        using (var history = new AttendanceHistoryForm()) { history.Show(); Pump(900); history.Close(); }
        var stats = archive.GetMethod("GetStats", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)!.Invoke(null, new object[] { DateTime.Today.AddDays(-6), DateTime.Today });
        var count = Convert.ToInt32(stats!.GetType().GetProperty("RecordCount")!.GetValue(stats));
        if (count != 0) errors.Add("Canlı kontrol ana TNF'den kendiliğinden doldu; fiziksel arşiv bağımsız değil.");
        var sync = assembly.GetType("HKN.Personel.Native.TerminalSyncService") ?? throw new InvalidOperationException("Canlı terminal servisi bulunamadı.");
        var capture = sync.GetMethod("CaptureLiveAsync", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)!;
        var task = (Task)capture.Invoke(null, new object[] { "FunctionAudit canlı izolasyon", CancellationToken.None })!;
        task.GetAwaiter().GetResult();
        if (DbFingerprint() != dbBefore) errors.Add("Canlı cihaz okuması ana FDB verisini değiştirdi.");
        if (Hash(tnfPath) != tnfBefore) errors.Add("Canlı cihaz okuması ana TNF'yi değiştirdi.");
        var failed = errors.Any(x => x.Contains("Canlı kontrol", StringComparison.OrdinalIgnoreCase) || x.Contains("Canlı cihaz", StringComparison.OrdinalIgnoreCase));
        results.Add(failed ? "FAIL|Canlı kontrol fiziksel arşiv izolasyonu" : "PASS|Canlı kontrol fiziksel arşivi FDB/TNF'den bağımsız");
    }
    catch (Exception ex) { errors.Add("Canlı kontrol izolasyon testi: " + ex.GetBaseException().Message); }
}

static void RunLiveAttendanceChecks(List<string> errors, List<string> results)
{
    try
    {
        using var form = new LiveAttendanceForm();
        var tabs = FindControls<TabControl>(form).FirstOrDefault();
        var names = tabs?.TabPages.Cast<TabPage>().Select(x => x.Text).ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];
        foreach (var required in new[] { "Giriş Eksik", "Geç Giriş", "Erken Çıkış" })
            if (!names.Contains(required)) errors.Add("Canlı denetim sekmesi eksik: " + required);
        var scheduleType = typeof(LiveAttendanceForm).GetNestedType("Schedule", BindingFlags.NonPublic);
        var status = typeof(LiveAttendanceForm).GetMethod("Status", BindingFlags.NonPublic | BindingFlags.Static);
        if (scheduleType is null || status is null) errors.Add("Canlı denetim durum sınıflandırıcısı bulunamadı.");
        else
        {
            var schedule = Activator.CreateInstance(scheduleType, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic, null,
                new object[] { "Test", 510, 525, 1140, 1110, 450 }, null);
            var day = DateTime.Today.AddDays(-1);
            var exitOnly = status.Invoke(null, new object?[] { day, schedule, true, false, null, day.AddHours(19) }) as string;
            if (!string.Equals(exitOnly, "Giriş Kartı Yok", StringComparison.Ordinal)) errors.Add("Exit-only canlı hareket yanlış sınıflandı: " + exitOnly);
        }
        var failed = errors.Any(x => x.Contains("Canlı denetim", StringComparison.OrdinalIgnoreCase) || x.Contains("Exit-only", StringComparison.OrdinalIgnoreCase));
        results.Add(failed ? "FAIL|Canlı denetim durum/sekme regresyonu" : "PASS|Canlı denetim giriş-çıkış ve geç/erken filtreleri");
    }
    catch (Exception ex) { errors.Add("Canlı denetim regresyon testi: " + ex.GetBaseException().Message); }
}

static IEnumerable<T> FindControls<T>(Control root) where T : Control
{
    foreach (Control child in root.Controls)
    {
        if (child is T match) yield return match;
        foreach (var nested in FindControls<T>(child)) yield return nested;
    }
}
static void Collect(ToolStripMenuItem parent, string path, List<(string Path, ToolStripMenuItem Item)> leaves)
{
    var children = parent.DropDownItems.OfType<ToolStripMenuItem>().ToArray();
    if (children.Length == 0)
    {
        leaves.Add((path, parent));
        return;
    }
    foreach (var child in children) Collect(child, path + " > " + Clean(child.Text), leaves);
}

static string Clean(string? text) => (text ?? string.Empty).Replace("&&", "&").Trim();

static void Pump(int milliseconds)
{
    var until = Environment.TickCount64 + milliseconds;
    while (Environment.TickCount64 < until)
    {
        Application.DoEvents();
        Thread.Sleep(25);
    }
}

static class NativeDialogs
{
    const uint WM_CLOSE = 0x0010;
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    public static void CloseOwnMessageBoxes()
    {
        var pid = (uint)Environment.ProcessId;
        EnumWindows((hWnd, ignored) =>
        {
            GetWindowThreadProcessId(hWnd, out var ownerPid);
            if (ownerPid != pid) return true;
            var name = new StringBuilder(64);
            _ = GetClassName(hWnd, name, name.Capacity);
            if (name.ToString() == "#32770") _ = PostMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);
    }
}
