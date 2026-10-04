using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class AttendanceExceptionCenterForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly Action<PdksCommandId>? navigate;
    readonly DateTimePicker from = new() { Format = DateTimePickerFormat.Short, Width = 118 };
    readonly DateTimePicker to = new() { Format = DateTimePickerFormat.Short, Width = 118 };
    readonly ComboBox kind = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 190 };
    readonly TextBox card = new() { Width = 90 };
    readonly Label totalValue = Metric();
    readonly Label missingValue = Metric();
    readonly Label lateValue = Metric();
    readonly Label earlyValue = Metric();
    readonly Label absentValue = Metric();
    readonly Label overtimeValue = Metric();
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        MultiSelect = false
    };
    readonly Label status = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
    DataTable all = new();

    static readonly string[] Kinds =
    [
        "Tümü",
        "Eksik Çıkış",
        "Geç Giriş",
        "Erken Çıkış",
        "Devamsızlık",
        "Eksik Çalışma",
        "Fazla Mesai",
        "İzinli Günde Hareket"
    ];

    public AttendanceExceptionCenterForm(Action<PdksCommandId>? commandNavigator = null)
    {
        navigate = commandNavigator;
        Text = "İstisna Merkezi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1280, 760);
        MinimumSize = new Size(1050, 650);
        Font = new Font("Segoe UI", 9f);
        from.Value = DateTime.Today;
        to.Value = DateTime.Today;
        kind.Items.AddRange(Kinds);
        kind.SelectedIndex = 0;
        Build();
        Shown += (_, _) => RefreshData();
    }

    void Build()
    {
        var p = PdksAppearance.Current;
        BackColor = p.Canvas;
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            Padding = new Padding(16),
            BackColor = p.Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 108));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));

        root.Controls.Add(new Label
        {
            Text = "İstisna ve Uyuşmazlık Merkezi",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 17f, FontStyle.Bold),
            ForeColor = p.Text,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 0);

        var filters = PdksUiKit.Card(12);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Padding = new Padding(12, 11, 8, 8), BackColor = p.Surface };
        bar.Controls.Add(Field("Başlangıç", from));
        bar.Controls.Add(Field("Bitiş", to));
        bar.Controls.Add(Field("Tür", kind));
        bar.Controls.Add(Field("Kart", card));
        var refresh = PdksUiKit.Button("Yenile", 100, PdksActionRole.Primary, RefreshData);
        refresh.Margin = new Padding(8, 8, 0, 0);
        bar.Controls.Add(refresh);
        filters.Controls.Add(bar);
        root.Controls.Add(filters, 0, 1);

        var metrics = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 6, BackColor = p.Canvas, Padding = new Padding(0, 8, 0, 8) };
        for (var i = 0; i < 6; i++) metrics.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 16.666f));
        metrics.Controls.Add(MetricCard("Toplam İstisna", totalValue), 0, 0);
        metrics.Controls.Add(MetricCard("Eksik Çıkış", missingValue), 1, 0);
        metrics.Controls.Add(MetricCard("Geç Giriş", lateValue), 2, 0);
        metrics.Controls.Add(MetricCard("Erken Çıkış", earlyValue), 3, 0);
        metrics.Controls.Add(MetricCard("Devamsız", absentValue), 4, 0);
        metrics.Controls.Add(MetricCard("Mesai", overtimeValue), 5, 0);
        root.Controls.Add(metrics, 0, 2);

        grid.BackgroundColor = p.Surface;
        grid.BorderStyle = BorderStyle.None;
        grid.RowTemplate.Height = 30;
        grid.ColumnHeadersHeight = 36;
        root.Controls.Add(grid, 0, 3);

        var footer = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, BackColor = p.Canvas };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 138));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 138));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 138));
        status.ForeColor = p.Muted;
        footer.Controls.Add(status, 0, 0);
        var entry = PdksUiKit.Button("Giriş / Çıkışa Git", 128, PdksActionRole.Secondary, () => Open(PdksCommandId.EntryExit));
        var leave = PdksUiKit.Button("İzinlere Git", 128, PdksActionRole.Secondary, () => Open(PdksCommandId.Leave));
        var timesheet = PdksUiKit.Button("Puantaja Git", 128, PdksActionRole.Primary, () => Open(PdksCommandId.TimesheetMonthly));
        foreach (var b in new[] { entry, leave, timesheet }) { b.Dock = DockStyle.Fill; b.Margin = new Padding(6, 8, 0, 4); }
        footer.Controls.Add(entry, 1, 0);
        footer.Controls.Add(leave, 2, 0);
        footer.Controls.Add(timesheet, 3, 0);
        root.Controls.Add(footer, 0, 4);

        Controls.Add(root);
        kind.SelectedIndexChanged += (_, _) => ApplyFilter();
        card.KeyDown += (_, e) => { if (e.KeyCode == Keys.Enter) RefreshData(); };
        grid.CellDoubleClick += (_, _) => Open(PdksCommandId.EntryExit);
    }

    Control Field(string caption, Control control)
    {
        var p = PdksAppearance.Current;
        var panel = new TableLayoutPanel { Width = control.Width + 26, Height = 46, RowCount = 2, ColumnCount = 1, Margin = new Padding(0, 0, 10, 0), BackColor = p.Surface };
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
        value.Location = new Point(14, 11);
        value.Size = new Size(120, 31);
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

    void Open(PdksCommandId command)
    {
        if (navigate is null) return;
        Close();
        navigate(command);
    }

    FbParameter[] RangeParameters()
    {
        var list = new List<FbParameter>
        {
            new("@A", from.Value.Date),
            new("@B", to.Value.Date.AddDays(1))
        };
        if (!string.IsNullOrWhiteSpace(card.Text)) list.Add(new FbParameter("@P", card.Text.Trim().PadLeft(5, '0')));
        return list.ToArray();
    }

    string CardFilter(string alias) => string.IsNullOrWhiteSpace(card.Text) ? "1=1" : $"{alias}.PKNO=@P";

    void RefreshData()
    {
        try
        {
            var result = NewTable();
            AddMissingExits(result);
            AddPuantajExceptions(result);
            AddLeaveDayMovements(result);
            all = result;
            totalValue.Text = result.Rows.Count.ToString("N0");
            missingValue.Text = Count("Eksik Çıkış").ToString("N0");
            lateValue.Text = Count("Geç Giriş").ToString("N0");
            earlyValue.Text = Count("Erken Çıkış").ToString("N0");
            absentValue.Text = Count("Devamsızlık").ToString("N0");
            overtimeValue.Text = Count("Fazla Mesai").ToString("N0");
            ApplyFilter();
        }
        catch (Exception ex)
        {
            all = NewTable();
            grid.DataSource = all;
            status.Text = "İstisnalar alınamadı • " + PdksErrorPresenter.Report(ex, "AttendanceExceptionCenter.Refresh");
            status.ForeColor = PdksAppearance.Current.Danger;
        }
    }

    int Count(string type) => all.AsEnumerable().Count(r => string.Equals(r.Field<string>("Tür"), type, StringComparison.OrdinalIgnoreCase));

    static DataTable NewTable()
    {
        var dt = new DataTable();
        dt.Columns.Add("Tarih", typeof(DateTime));
        dt.Columns.Add("Kart No");
        dt.Columns.Add("Ad Soyad");
        dt.Columns.Add("Bölüm");
        dt.Columns.Add("Tür");
        dt.Columns.Add("Detay");
        dt.Columns.Add("Giriş");
        dt.Columns.Add("Çıkış");
        dt.Columns.Add("Dakika", typeof(int));
        return dt;
    }

    void AddMissingExits(DataTable target)
    {
        var dt = db.Query(
            "select g.GTARIH,g.PKNO,k.AD,k.SOYAD,b.AD BOLUM,g.GSAAT,g.CSAAT " +
            "from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO left join BOLUM b on b.KOD=k.BOLUM " +
            "where g.GTARIH>=@A and g.GTARIH<@B and " + CardFilter("g") + " and (g.CTARIH is null or g.CSAAT is null or trim(g.CSAAT)='') " +
            "order by g.GTARIH,g.PKNO", RangeParameters());
        foreach (DataRow r in dt.Rows)
            target.Rows.Add(Convert.ToDateTime(r["GTARIH"]).Date, r["PKNO"], PersonName(r), r["BOLUM"], "Eksik Çıkış", "Giriş var, çıkış tamamlanmamış", r["GSAAT"], "", 0);
    }

    void AddPuantajExceptions(DataTable target)
    {
        var dt = db.Query(
            "select p.TARIH,p.PKNO,k.AD,k.SOYAD,b.AD BOLUM,p.GIRIS,p.CIKIS,p.GECD,p.GECS,p.ERKEND,p.ERKENS,p.DEVAMSIZLIKD,p.DEVAMSIZLIKS,p.EKSIKD,p.EKSIKS,p.DAKIKA2,p.DAKIKA3 " +
            "from PUANTAJ p left join KIMLIK k on k.PKNO=p.PKNO left join BOLUM b on b.KOD=k.BOLUM " +
            "where p.TARIH>=@A and p.TARIH<@B and " + CardFilter("p") + " order by p.TARIH,p.PKNO", RangeParameters());
        foreach (DataRow r in dt.Rows)
        {
            var date = Convert.ToDateTime(r["TARIH"]).Date;
            var pk = r["PKNO"];
            var name = PersonName(r);
            var dep = r["BOLUM"];
            var entry = Convert.ToString(r["GIRIS"]) ?? "";
            var exit = Convert.ToString(r["CIKIS"]) ?? "";
            AddIf(target, date, pk, name, dep, "Geç Giriş", r["GECS"], Minutes(r["GECD"]), entry, exit);
            AddIf(target, date, pk, name, dep, "Erken Çıkış", r["ERKENS"], Minutes(r["ERKEND"]), entry, exit);
            AddIf(target, date, pk, name, dep, "Devamsızlık", r["DEVAMSIZLIKS"], Minutes(r["DEVAMSIZLIKD"]), entry, exit);
            AddIf(target, date, pk, name, dep, "Eksik Çalışma", r["EKSIKS"], Minutes(r["EKSIKD"]), entry, exit);
            var ot = Minutes(r["DAKIKA2"]) + Minutes(r["DAKIKA3"]);
            if (ot > 0) target.Rows.Add(date, pk, name, dep, "Fazla Mesai", $"Toplam {AsTime(ot)}", entry, exit, ot);
        }
    }

    void AddLeaveDayMovements(DataTable target)
    {
        var dt = db.Query(
            "select distinct o.TARIH,o.PKNO,k.AD,k.SOYAD,b.AD BOLUM,o.MAZERET,g.GSAAT,g.CSAAT " +
            "from OZELIZIN o join GIRCIK g on g.PKNO=o.PKNO and g.GTARIH>=o.TARIH and g.GTARIH<dateadd(1 day to o.TARIH) " +
            "left join KIMLIK k on k.PKNO=o.PKNO left join BOLUM b on b.KOD=k.BOLUM " +
            "where o.TARIH>=@A and o.TARIH<@B and " + CardFilter("o") + " order by o.TARIH,o.PKNO", RangeParameters());
        foreach (DataRow r in dt.Rows)
            target.Rows.Add(Convert.ToDateTime(r["TARIH"]).Date, r["PKNO"], PersonName(r), r["BOLUM"], "İzinli Günde Hareket", Convert.ToString(r["MAZERET"]) ?? "İzin", r["GSAAT"], r["CSAAT"], 0);
    }

    static void AddIf(DataTable target, DateTime date, object pk, string name, object department, string type, object detailValue, int minutes, string entry, string exit)
    {
        if (minutes <= 0) return;
        var detail = Convert.ToString(detailValue);
        if (string.IsNullOrWhiteSpace(detail)) detail = AsTime(minutes);
        target.Rows.Add(date, pk, name, department, type, detail, entry, exit, minutes);
    }

    static int Minutes(object value)
    {
        if (value is null || value == DBNull.Value) return 0;
        try { return Convert.ToInt32(value); } catch { return 0; }
    }

    static string AsTime(int minutes) => $"{minutes / 60:00}:{minutes % 60:00}";
    static string PersonName(DataRow r) => ($"{Convert.ToString(r["AD"])} {Convert.ToString(r["SOYAD"])}").Trim();

    void ApplyFilter()
    {
        if (all is null) return;
        var view = new DataView(all);
        var selected = Convert.ToString(kind.SelectedItem) ?? "Tümü";
        if (!selected.Equals("Tümü", StringComparison.OrdinalIgnoreCase))
            view.RowFilter = "[Tür] = '" + selected.Replace("'", "''") + "'";
        view.Sort = "Tarih DESC, [Kart No] ASC";
        grid.DataSource = view;
        foreach (DataGridViewColumn c in grid.Columns)
        {
            c.Width = c.Name switch
            {
                "Ad Soyad" => 170,
                "Bölüm" => 130,
                "Tür" => 150,
                "Detay" => 220,
                "Tarih" => 95,
                _ => 90
            };
        }
        status.ForeColor = PdksAppearance.Current.Muted;
        status.Text = $"{view.Count:N0} kayıt • Çift tıklama: giriş/çıkış düzeltmeye git";
    }
}
