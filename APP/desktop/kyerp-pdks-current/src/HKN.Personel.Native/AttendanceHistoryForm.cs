using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class AttendanceHistoryForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DateTimePicker from = new() { Format = DateTimePickerFormat.Short, Width = 115 };
    readonly DateTimePicker to = new() { Format = DateTimePickerFormat.Short, Width = 115 };
    readonly DataGridView summary = Grid();
    readonly DataGridView detail = Grid();
    readonly Label archiveInfo = new() { AutoSize = false, Height = 38, TextAlign = ContentAlignment.MiddleLeft };
    readonly Label status = new() { AutoSize = false, Height = 32, TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.FromArgb(55, 70, 92) };
    bool loading;
    readonly bool allowArchiveCleanup;

    sealed record EmployeeRow(string Code, string Name, DateTime Hire, DateTime? Exit);
    sealed record MovementRow(string Code, DateTime Day, TimeSpan? Entry, TimeSpan? Exit);
    sealed record DayState(DateTime Day, string Code, string Name, string Entry, string Exit, string State);

    public AttendanceHistoryForm(bool allowArchiveCleanup = false)
    {
        this.allowArchiveCleanup = allowArchiveCleanup;
        Text = "Kart Basma Kontrolü • 7 Gün / Aylık / Tarih Aralığı";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1280, 780);
        MinimumSize = new Size(1080, 680);
        Font = new Font("Segoe UI", 9f);
        BackColor = PdksAppearance.Current.Canvas;
        from.Value = DateTime.Today.AddDays(-6);
        to.Value = DateTime.Today;
        Build();
        Shown += async (_, _) => await RefreshAllAsync(seedArchive: true);
        summary.SelectionChanged += (_, _) => LoadSelectedDetail();
    }

    static DataGridView Grid()
    {
        var p=PdksAppearance.Current;
        return new DataGridView
        {
            Dock = DockStyle.Fill,
            ReadOnly = true,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            MultiSelect = false,
            RowHeadersVisible = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            BackgroundColor = p.Surface,
            BorderStyle = BorderStyle.None,
            RowTemplate = { Height = 31 },
            ColumnHeadersHeight = 36
        };
    }

    static Button B(string text, int width, EventHandler click)
    {
        var role = text.Contains("TEMİZLE",StringComparison.OrdinalIgnoreCase) ? PdksActionRole.Danger :
                   text.Contains("Cihazdan Al",StringComparison.OrdinalIgnoreCase) || text.Equals("Yenile",StringComparison.OrdinalIgnoreCase) ? PdksActionRole.Primary :
                   PdksActionRole.Secondary;
        var b = PdksUiKit.Button(text,width,role);
        b.Height=32;b.MinimumSize=new Size(width,32);b.MaximumSize=new Size(width,32);
        b.Click += click;
        return b;
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 5, Padding = new Padding(16), BackColor = p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 84));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 64));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 62));

        var header = PdksUiKit.Card(16);
        var headerLayout=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,BackColor=p.Surface};
        headerLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,58));
        headerLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,42));
        headerLayout.Controls.Add(new Label
        {
            Text = "Kart Basma Kontrol Merkezi",
            Dock = DockStyle.Top,
            Height=28,
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            ForeColor = p.Text,
            TextAlign=ContentAlignment.MiddleLeft
        }, 0, 0);
        headerLayout.Controls.Add(new Label
        {
            Text = "Fiziksel cihaz CANLI arşivi üzerinden kişi ve gün bazlı kontrol",
            Dock = DockStyle.Bottom,
            Height=24,
            Font = new Font("Segoe UI", 8.7f),
            ForeColor = p.Muted,
            TextAlign=ContentAlignment.MiddleLeft
        }, 0, 0);
        archiveInfo.Dock = DockStyle.Fill;
        archiveInfo.TextAlign = ContentAlignment.MiddleRight;
        archiveInfo.ForeColor = p.Success;
        headerLayout.Controls.Add(archiveInfo, 1, 0);
        header.Controls.Add(headerLayout);
        root.Controls.Add(header, 0, 0);

        var filterCard=PdksUiKit.Card(10);
        var filters = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(6, 4, 6, 0), BackColor=p.Surface };
        filters.Controls.Add(new Label { Text = "Başlangıç", AutoSize = true, Padding = new Padding(0, 8, 0, 0), ForeColor=p.Muted });
        filters.Controls.Add(from);
        filters.Controls.Add(new Label { Text = "Bitiş", AutoSize = true, Padding = new Padding(8, 8, 0, 0), ForeColor=p.Muted });
        filters.Controls.Add(to);
        filters.Controls.Add(B("Bugün", 70, async (_, _) => { from.Value = to.Value = DateTime.Today; await RefreshAllAsync(true); }));
        filters.Controls.Add(B("Son 7 Gün", 88, async (_, _) => { from.Value = DateTime.Today.AddDays(-6); to.Value = DateTime.Today; await RefreshAllAsync(true); }));
        filters.Controls.Add(B("Bu Ay", 72, async (_, _) => { from.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1); to.Value = DateTime.Today; await RefreshAllAsync(true); }));
        filters.Controls.Add(B("Son 30 Gün", 92, async (_, _) => { from.Value = DateTime.Today.AddDays(-29); to.Value = DateTime.Today; await RefreshAllAsync(true); }));
        filters.Controls.Add(B("Yenile", 78, async (_, _) => await RefreshAllAsync(true)));
        filters.Controls.Add(B("Şimdi Cihazdan Al", 138, async (_, _) => await SyncNowAsync()));
        filterCard.Controls.Add(filters);
        root.Controls.Add(filterCard, 0, 1);

        var topCard=PdksUiKit.Card();
        var topLayout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Padding=new Padding(14),BackColor=p.Surface};
        topLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,34));topLayout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        topLayout.Controls.Add(PdksUiKit.SectionTitle("Personel Özeti"),0,0);
        topLayout.Controls.Add(summary,0,1);topCard.Controls.Add(topLayout);root.Controls.Add(topCard,0,2);

        var detailCard=PdksUiKit.Card();
        detailCard.Margin=new Padding(0,10,0,0);
        var detailLayout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Padding=new Padding(14),BackColor=p.Surface};
        detailLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,34));detailLayout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        detailLayout.Controls.Add(PdksUiKit.SectionTitle("Seçili Personel • Gün Gün Kart Hareketi"),0,0);
        detailLayout.Controls.Add(detail,0,1);detailCard.Controls.Add(detailLayout);root.Controls.Add(detailCard,0,3);

        var actions = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, BackColor=p.Canvas };
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 62));
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38));
        status.Dock = DockStyle.Fill;status.ForeColor=p.Muted;
        actions.Controls.Add(status, 0, 0);
        var clean = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false, BackColor=p.Canvas, Padding=new Padding(0,8,0,0) };
        if (allowArchiveCleanup)
        {
            clean.Controls.Add(B("CANLI ARŞİVİ KOMPLE TEMİZLE", 210, (_, _) => ClearAllArchive()));
            clean.Controls.Add(B("TARİH ARALIĞINI TEMİZLE", 190, (_, _) => ClearRange()));
        }
        actions.Controls.Add(clean, 1, 0);
        root.Controls.Add(actions, 0, 4);

        Controls.Add(root);
    }

    async Task SyncNowAsync()
    {
        if (loading) return;
        loading = true;
        try
        {
            status.Text = "Kart cihazı okunuyor…";
            var result = await TerminalSyncService.CaptureLiveAsync("Kart Basma Kontrolü");
            status.Text = result.Message;
            await RefreshAllAsync(seedArchive: true, keepLoading: true);
        }
        finally { loading = false; }
    }

    async Task RefreshAllAsync(bool seedArchive, bool keepLoading = false)
    {
        if (loading && !keepLoading) return;
        if (!keepLoading) loading = true;
        try
        {
            var a = from.Value.Date;
            var b = to.Value.Date;
            if (b < a) (a, b) = (b, a);
            if ((b - a).TotalDays > 370)
            {
                MessageBox.Show("Tek kontrolde en fazla 1 yıllık tarih aralığı seçin.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            status.Text = "Veriler hazırlanıyor…";
            var rows = LoadPeriod(a, b);
            BindSummary(rows, a, b);
            UpdateArchiveInfo(a, b);
            status.ForeColor = PdksAppearance.Current.Muted;
            status.Text = $"{a:dd.MM.yyyy} - {b:dd.MM.yyyy} kontrol edildi. {rows.Count:N0} kişi-gün satırı.";
            await Task.CompletedTask;
        }
        catch (Exception ex)
        {
            status.Text = "Kontrol hatası • " + PdksErrorPresenter.Report(ex,"AttendanceHistory.Refresh");
            status.ForeColor = PdksAppearance.Current.Danger;
        }
        finally { if (!keepLoading) loading = false; }
    }

    List<DayState> LoadPeriod(DateTime a, DateTime b)
    {
        var employeesTable = db.Query(@"select PKNO,AD,SOYAD,IGTARIH,ICTARIH from KIMLIK
            where (IGTARIH is null or IGTARIH<=@B) and (ICTARIH is null or ICTARIH>=@A) order by PKNO",
            new FbParameter("@A", a), new FbParameter("@B", b.AddDays(1)));
        var employees = employeesTable.AsEnumerable().Select(r => new EmployeeRow(
            S(r, "PKNO"), $"{S(r, "AD")} {S(r, "SOYAD")}".Trim(),
            D(r, "IGTARIH") ?? a, D(r, "ICTARIH"))).Where(x => !string.IsNullOrWhiteSpace(x.Code)).ToArray();

        var movements = TerminalLiveArchiveService.ReadPhysicalPunches(a, b)
            .GroupBy(x => (x.EmployeeCode, x.OccurredAt.Date))
            .ToDictionary(g => g.Key, g => MergePhysicalMovement(g));

        var leaveDays = new HashSet<(string Code, DateTime Day)>();
        try
        {
            var leaveTable = db.Query(@"select PKNO,TARIH from OZELIZIN where TARIH>=@A and TARIH<@B",
                new FbParameter("@A", a), new FbParameter("@B", b.AddDays(1)));
            foreach (DataRow r in leaveTable.Rows)
            {
                var day = D(r, "TARIH");
                var code = S(r, "PKNO");
                if (day.HasValue && code.Length > 0) leaveDays.Add((code, day.Value.Date));
            }
        }
        catch { }

        var holidayDays = new HashSet<(string Code, DateTime Day)>();
        try
        {
            var holidayTable = db.Query(@"select PKNO,TARIH from PERPLANTAT where TARIH>=@A and TARIH<@B",
                new FbParameter("@A", a), new FbParameter("@B", b.AddDays(1)));
            foreach (DataRow r in holidayTable.Rows)
            {
                var day = D(r, "TARIH");
                var code = S(r, "PKNO");
                if (day.HasValue && code.Length > 0) holidayDays.Add((code, day.Value.Date));
            }
        }
        catch { }
        var result = new List<DayState>();
        foreach (var employee in employees)
        {
            var start = employee.Hire.Date > a ? employee.Hire.Date : a;
            var end = employee.Exit.HasValue && employee.Exit.Value.Date < b ? employee.Exit.Value.Date : b;
            for (var day = start; day <= end; day = day.AddDays(1))
            {
                movements.TryGetValue((employee.Code, day), out var move);
                var leave = leaveDays.Contains((employee.Code, day));
                var weekend = day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
                var holiday = holidayDays.Contains((employee.Code, day));
                var state = weekend ? "Hafta Sonu"
                    : holiday ? "Tatil"
                    : leave ? "İzinli"
                    : move is null ? "Kart Basmadı"
                    : move.Entry.HasValue && move.Exit.HasValue ? "Tamam"
                    : move.Entry.HasValue ? "Çıkış Eksik"
                    : "Giriş Eksik";
                result.Add(new(day, employee.Code, employee.Name,
                    move?.Entry is null ? "" : move.Entry.Value.ToString(@"hh\:mm"),
                    move?.Exit is null ? "" : move.Exit.Value.ToString(@"hh\:mm"), state));
            }
        }
        return result;
    }

    void BindSummary(List<DayState> rows, DateTime a, DateTime b)
    {
        var table = new DataTable();
        foreach (var c in new[] { "Kart No", "Ad Soyad", "Çalışma Günü", "Kart Basılan", "Kart Basmayan", "Eksik Çıkış", "Giriş Eksik", "İzinli", "Son Giriş", "Son Çıkış" }) table.Columns.Add(c);
        foreach (var g in rows.GroupBy(x => new { x.Code, x.Name }).OrderBy(x => x.Key.Code))
        {
            var work = g.Count(x => x.State != "Hafta Sonu" && x.State != "Tatil" && x.State != "İzinli");
            var punched = g.Count(x => x.State is "Tamam" or "Çıkış Eksik" or "Giriş Eksik");
            var missing = g.Count(x => x.State == "Kart Basmadı");
            var exitMissing = g.Count(x => x.State == "Çıkış Eksik");
            var entryMissing = g.Count(x => x.State == "Giriş Eksik");
            var leave = g.Count(x => x.State == "İzinli");
            var lastEntry = g.Where(x => x.Entry.Length > 0).OrderByDescending(x => x.Day).FirstOrDefault()?.Entry ?? "";
            var lastExit = g.Where(x => x.Exit.Length > 0).OrderByDescending(x => x.Day).FirstOrDefault()?.Exit ?? "";
            table.Rows.Add(g.Key.Code, g.Key.Name, work, punched, missing, exitMissing, entryMissing, leave, lastEntry, lastExit);
        }
        summary.Tag = rows;
        summary.DataSource = table;
        if (summary.Columns.Contains("Kart Basmayan")) summary.Columns["Kart Basmayan"].DefaultCellStyle.BackColor = PdksAppearance.Current.DangerSoft;
        if (summary.Rows.Count > 0) summary.Rows[0].Selected = true;
        LoadSelectedDetail();
    }

    void LoadSelectedDetail()
    {
        if (summary.Tag is not List<DayState> rows || summary.CurrentRow is null) return;
        var code = Convert.ToString(summary.CurrentRow.Cells["Kart No"].Value) ?? "";
        var table = new DataTable();
        foreach (var c in new[] { "Tarih", "Gün", "Kart No", "Ad Soyad", "Giriş", "Çıkış", "Durum" }) table.Columns.Add(c);
        foreach (var row in rows.Where(x => x.Code == code).OrderByDescending(x => x.Day))
            table.Rows.Add(row.Day.ToString("dd.MM.yyyy"), row.Day.ToString("dddd"), row.Code, row.Name, row.Entry, row.Exit, row.State);
        detail.DataSource = table;
        foreach (DataGridViewRow r in detail.Rows)
        {
            var state = Convert.ToString(r.Cells["Durum"].Value);
            if (state == "Kart Basmadı" || state == "Çıkış Eksik" || state == "Giriş Eksik") r.DefaultCellStyle.BackColor = PdksAppearance.Current.DangerSoft;
            else if (state is "İzinli" or "Tatil") r.DefaultCellStyle.BackColor = PdksAppearance.Current.IsDark ? Color.FromArgb(69,52,21) : Color.FromArgb(255,248,204);
        }
    }

    void UpdateArchiveInfo(DateTime a, DateTime b)
    {
        var info = TerminalLiveArchiveService.GetStats(a, b);
        archiveInfo.Text = $"CANLI TNF: {info.RecordCount:N0} kayıt • {info.EmployeeCount:N0} kart\nSaklama hedefi: 365 gün • otomatik silme kapalı";
    }

    void ClearRange()
    {
        var a = from.Value.Date; var b = to.Value.Date; if (b < a) (a, b) = (b, a);
        var text = $"{a:dd.MM.yyyy} - {b:dd.MM.yyyy} arasındaki CANLI arşiv temizlensin mi?\n\nAna TNF ve FDB kayıtlarına dokunulmaz.";
        if (MessageBox.Show(text, "Canlı Veri Temizliği", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var removed = TerminalLiveArchiveService.DeleteRange(a, b);
        UpdateArchiveInfo(a, b);
        status.Text = $"Canlı arşivden {removed:N0} kayıt temizlendi. Ana TNF/FDB korunuyor.";
    }

    void ClearAllArchive()
    {
        if (MessageBox.Show("CANLI TNF ve ham canlı arşivin TAMAMI temizlensin mi?\n\nAna TNF ve FDB silinmez. Bu işlem yalnız canlı arşivi temizler.",
            "Canlı Arşivi Komple Temizle", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        if (MessageBox.Show("İkinci onay: CANLI ARŞİVİN TAMAMI temizlenecek. Devam edilsin mi?", "Kesin Onay",
            MessageBoxButtons.YesNo, MessageBoxIcon.Stop) != DialogResult.Yes) return;
        var removed = TerminalLiveArchiveService.ClearAll();
        UpdateArchiveInfo(from.Value.Date, to.Value.Date);
        status.Text = $"Canlı arşiv temizlendi: {removed:N0} kayıt. Ana TNF/FDB korunuyor.";
    }

    static MovementRow MergePhysicalMovement(IEnumerable<TerminalDevicePunch> rows)
    {
        var ordered = rows.OrderBy(x => x.OccurredAt).ToArray();
        var first = ordered[0];
        var morning = ordered.Where(x => x.OccurredAt.TimeOfDay < TimeSpan.FromHours(12)).Select(x => x.OccurredAt.TimeOfDay).ToArray();
        var later = ordered.Where(x => x.OccurredAt.TimeOfDay >= TimeSpan.FromHours(12)).Select(x => x.OccurredAt.TimeOfDay).ToArray();
        return new(first.EmployeeCode, first.OccurredAt.Date, morning.Length == 0 ? null : morning.Min(), later.Length == 0 ? null : later.Max());
    }

    static MovementRow? ToMovement(DataRow r)
    {
        var code = S(r, "PKNO");
        var gday = D(r, "GTARIH");
        var cday = D(r, "CTARIH");
        var day = gday ?? cday;
        if (day is null || code.Length == 0) return null;
        var entry = ReadClock(r, "GSAAT", "GDAKIKA");
        var exit = ReadClock(r, "CSAAT", "CDAKIKA");
        return new(code, day.Value.Date, entry, exit);
    }

    static MovementRow MergeMovement(IEnumerable<MovementRow> rows)
    {
        var first = rows.First();
        var entries = rows.Where(x => x.Entry.HasValue).Select(x => x.Entry!.Value).OrderBy(x => x).ToArray();
        var exits = rows.Where(x => x.Exit.HasValue).Select(x => x.Exit!.Value).OrderBy(x => x).ToArray();
        return new(first.Code, first.Day, entries.Length == 0 ? null : entries[0], exits.Length == 0 ? null : exits[^1]);
    }

    static TimeSpan? ReadClock(DataRow r, string hourColumn, string minuteColumn)
    {
        if (!r.Table.Columns.Contains(hourColumn) || r[hourColumn] == DBNull.Value) return null;
        var raw = Convert.ToString(r[hourColumn])?.Trim() ?? string.Empty;
        if (TimeSpan.TryParse(raw, out var parsed)) return new TimeSpan(parsed.Hours, parsed.Minutes, 0);
        if (DateTime.TryParse(raw, out var dateParsed)) return new TimeSpan(dateParsed.Hour, dateParsed.Minute, 0);
        if (!int.TryParse(raw, out var hour)) return null;
        var minute = I(r, minuteColumn);
        if (hour is < 0 or > 23 || minute is < 0 or > 59) return null;
        return new TimeSpan(hour, minute, 0);
    }
    static string S(DataRow r, string c) => r.Table.Columns.Contains(c) && r[c] != DBNull.Value ? Convert.ToString(r[c])?.Trim() ?? "" : "";
    static int I(DataRow r, string c) => r.Table.Columns.Contains(c) && r[c] != DBNull.Value ? Convert.ToInt32(r[c]) : 0;
    static DateTime? D(DataRow r, string c) => r.Table.Columns.Contains(c) && r[c] != DBNull.Value ? Convert.ToDateTime(r[c]) : null;
}
