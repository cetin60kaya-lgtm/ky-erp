using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class DepartmentAttendanceAnalyticsForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DateTimePicker from = new() { Format = DateTimePickerFormat.Short, Width = 118 };
    readonly DateTimePicker to = new() { Format = DateTimePickerFormat.Short, Width = 118 };
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect
    };
    readonly Label activeValue = Metric();
    readonly Label arrivedValue = Metric();
    readonly Label lateValue = Metric();
    readonly Label absentValue = Metric();
    readonly Label overtimeValue = Metric();
    readonly Label status = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };

    public DepartmentAttendanceAnalyticsForm()
    {
        Text = "Bölüm Devam Analizi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1240, 720);
        MinimumSize = new Size(1050, 620);
        Font = new Font("Segoe UI", 9f);
        var start = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        from.Value = start;
        to.Value = DateTime.Today;
        Build();
        Shown += (_, _) => RefreshData();
    }

    void Build()
    {
        var p = PdksAppearance.Current;
        BackColor = p.Canvas;
        grid.BackgroundColor = p.Surface;
        grid.BorderStyle = BorderStyle.None;
        grid.RowTemplate.Height = 31;
        grid.ColumnHeadersHeight = 38;

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            Padding = new Padding(16),
            BackColor = p.Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 82));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 105));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));

        root.Controls.Add(new Label
        {
            Text = "Bölüm Devam Analizi",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 17f, FontStyle.Bold),
            ForeColor = p.Text,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 0);

        var filters = PdksUiKit.Card(12);
        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(12, 10, 8, 8),
            BackColor = p.Surface
        };
        bar.Controls.Add(Field("Başlangıç", from));
        bar.Controls.Add(Field("Bitiş", to));
        var refresh = PdksUiKit.Button("Yenile", 105, PdksActionRole.Primary, RefreshData);
        refresh.Margin = new Padding(8, 8, 0, 0);
        bar.Controls.Add(refresh);
        filters.Controls.Add(bar);
        root.Controls.Add(filters, 0, 1);

        var metrics = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 5, BackColor = p.Canvas, Padding = new Padding(0, 8, 0, 8) };
        for (var i = 0; i < 5; i++) metrics.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 20));
        metrics.Controls.Add(MetricCard("Aktif Personel", activeValue), 0, 0);
        metrics.Controls.Add(MetricCard("Dönemde Gelen", arrivedValue), 1, 0);
        metrics.Controls.Add(MetricCard("Geç Gün", lateValue), 2, 0);
        metrics.Controls.Add(MetricCard("Devamsız Gün", absentValue), 3, 0);
        metrics.Controls.Add(MetricCard("Mesai", overtimeValue), 4, 0);
        root.Controls.Add(metrics, 0, 2);

        root.Controls.Add(grid, 0, 3);
        status.ForeColor = p.Muted;
        root.Controls.Add(status, 0, 4);
        Controls.Add(root);
    }

    Control Field(string caption, Control control)
    {
        var p = PdksAppearance.Current;
        var panel = new TableLayoutPanel { Width = control.Width + 28, Height = 45, RowCount = 2, ColumnCount = 1, Margin = new Padding(0, 0, 10, 0), BackColor = p.Surface };
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 17));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        panel.Controls.Add(new Label { Text = caption, Dock = DockStyle.Fill, ForeColor = p.Muted, Font = new Font("Segoe UI", 8f) }, 0, 0);
        control.Dock = DockStyle.Fill;
        panel.Controls.Add(control, 0, 1);
        return panel;
    }

    Control MetricCard(string title, Label value)
    {
        var p = PdksAppearance.Current;
        var panel = PdksUiKit.Card(10);
        panel.Margin = new Padding(0, 0, 8, 0);
        value.Location = new Point(14, 10);
        value.Size = new Size(145, 32);
        panel.Controls.Add(value);
        panel.Controls.Add(new Label { Text = title, Location = new Point(14, 47), AutoSize = true, Font = new Font("Segoe UI", 8.3f, FontStyle.Bold), ForeColor = p.Muted });
        return panel;
    }

    static Label Metric() => new()
    {
        Text = "—",
        AutoSize = false,
        Font = new Font("Segoe UI", 18f, FontStyle.Bold),
        ForeColor = PdksAppearance.Current.Text,
        TextAlign = ContentAlignment.MiddleLeft
    };

    void RefreshData()
    {
        try
        {
            var a = from.Value.Date;
            var b = to.Value.Date.AddDays(1);
            if (b <= a) throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");

            var rows = new Dictionary<string, DepartmentRow>(StringComparer.OrdinalIgnoreCase);

            var head = db.Query(
                "select coalesce(b.AD,'(Bölümsüz)') BOLUM,count(*) AKTIF " +
                "from KIMLIK k left join BOLUM b on b.KOD=k.BOLUM " +
                "where coalesce(k.IGTARIH,@A)<@B and (k.ICTARIH is null or k.ICTARIH>=@A) " +
                "group by b.AD order by b.AD",
                new FbParameter("@A", a), new FbParameter("@B", b));
            foreach (DataRow r in head.Rows)
            {
                var key = Convert.ToString(r["BOLUM"]) ?? "(Bölümsüz)";
                rows[key] = new DepartmentRow(key) { Active = Convert.ToInt32(r["AKTIF"]) };
            }

            var arrived = db.Query(
                "select coalesce(b.AD,'(Bölümsüz)') BOLUM,count(distinct g.PKNO) GELEN,count(*) HAREKET " +
                "from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO left join BOLUM b on b.KOD=k.BOLUM " +
                "where g.GTARIH>=@A and g.GTARIH<@B group by b.AD",
                new FbParameter("@A", a), new FbParameter("@B", b));
            foreach (DataRow r in arrived.Rows)
            {
                var key = Convert.ToString(r["BOLUM"]) ?? "(Bölümsüz)";
                if (!rows.TryGetValue(key, out var item)) rows[key] = item = new DepartmentRow(key);
                item.Arrived = Convert.ToInt32(r["GELEN"]);
                item.Movements = Convert.ToInt32(r["HAREKET"]);
            }

            var punch = db.Query(
                "select coalesce(b.AD,'(Bölümsüz)') BOLUM," +
                "count(*) PUANTAJ," +
                "sum(coalesce(p.GECG,0)) GECG,sum(coalesce(p.ERKENG,0)) ERKENG,sum(coalesce(p.DEVAMSIZLIKG,0)) DEVG,sum(coalesce(p.EKSIKG,0)) EKSIKG," +
                "sum(coalesce(p.GECD,0)) GECD,sum(coalesce(p.ERKEND,0)) ERKEND,sum(coalesce(p.EKSIKD,0)) EKSIKD," +
                "sum(coalesce(p.DAKIKA2,0)+coalesce(p.DAKIKA3,0)) MESAI " +
                "from PUANTAJ p left join KIMLIK k on k.PKNO=p.PKNO left join BOLUM b on b.KOD=k.BOLUM " +
                "where p.TARIH>=@A and p.TARIH<@B group by b.AD",
                new FbParameter("@A", a), new FbParameter("@B", b));
            foreach (DataRow r in punch.Rows)
            {
                var key = Convert.ToString(r["BOLUM"]) ?? "(Bölümsüz)";
                if (!rows.TryGetValue(key, out var item)) rows[key] = item = new DepartmentRow(key);
                item.TimesheetDays = I(r, "PUANTAJ");
                item.LateDays = I(r, "GECG");
                item.EarlyDays = I(r, "ERKENG");
                item.AbsentDays = I(r, "DEVG");
                item.MissingDays = I(r, "EKSIKG");
                item.LateMinutes = I(r, "GECD");
                item.EarlyMinutes = I(r, "ERKEND");
                item.MissingMinutes = I(r, "EKSIKD");
                item.OvertimeMinutes = I(r, "MESAI");
            }

            var table = new DataTable();
            foreach (var c in new[] { "Bölüm", "Aktif", "Gelen", "Hareket", "Puantaj Gün", "Geç Gün", "Erken Gün", "Devamsız Gün", "Eksik Gün", "Geç Süre", "Erken Süre", "Eksik Süre", "Mesai" }) table.Columns.Add(c);
            foreach (var x in rows.Values.OrderBy(x => x.Department))
                table.Rows.Add(x.Department, x.Active, x.Arrived, x.Movements, x.TimesheetDays, x.LateDays, x.EarlyDays, x.AbsentDays, x.MissingDays,
                    AsTime(x.LateMinutes), AsTime(x.EarlyMinutes), AsTime(x.MissingMinutes), AsTime(x.OvertimeMinutes));
            grid.DataSource = table;

            activeValue.Text = rows.Values.Sum(x => x.Active).ToString("N0");
            arrivedValue.Text = rows.Values.Sum(x => x.Arrived).ToString("N0");
            lateValue.Text = rows.Values.Sum(x => x.LateDays).ToString("N0");
            absentValue.Text = rows.Values.Sum(x => x.AbsentDays).ToString("N0");
            overtimeValue.Text = AsTime(rows.Values.Sum(x => x.OvertimeMinutes));
            status.Text = $"{a:dd.MM.yyyy} - {to.Value.Date:dd.MM.yyyy} • {rows.Count:N0} bölüm • devam/mesai karşılaştırması";
        }
        catch (Exception ex)
        {
            grid.DataSource = null;
            status.Text = "Analiz alınamadı • " + PdksErrorPresenter.Report(ex, "DepartmentAttendanceAnalytics.Refresh");
            status.ForeColor = PdksAppearance.Current.Danger;
        }
    }

    static int I(DataRow row, string name)
    {
        if (!row.Table.Columns.Contains(name) || row[name] is DBNull) return 0;
        try { return Convert.ToInt32(row[name]); } catch { return 0; }
    }

    static string AsTime(int minutes) => $"{minutes / 60:00}:{minutes % 60:00}";

    sealed class DepartmentRow(string department)
    {
        public string Department { get; } = department;
        public int Active { get; set; }
        public int Arrived { get; set; }
        public int Movements { get; set; }
        public int TimesheetDays { get; set; }
        public int LateDays { get; set; }
        public int EarlyDays { get; set; }
        public int AbsentDays { get; set; }
        public int MissingDays { get; set; }
        public int LateMinutes { get; set; }
        public int EarlyMinutes { get; set; }
        public int MissingMinutes { get; set; }
        public int OvertimeMinutes { get; set; }
    }
}
