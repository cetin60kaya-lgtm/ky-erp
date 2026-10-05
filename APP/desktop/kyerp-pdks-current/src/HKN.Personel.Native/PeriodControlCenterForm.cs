using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class PeriodControlCenterForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly Action<PdksCommandId>? navigate;
    readonly ComboBox month = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    readonly NumericUpDown year = new() { Minimum = 2000, Maximum = 2100, Width = 88 };
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None
    };
    readonly Label problemValue = Metric();
    readonly Label timesheetValue = Metric();
    readonly Label payrollValue = Metric();
    readonly Label paymentValue = Metric();
    readonly Label readyValue = Metric();
    readonly Label status = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };

    public PeriodControlCenterForm(Action<PdksCommandId>? commandNavigator = null)
    {
        navigate = commandNavigator;
        Text = "Dönem Kontrol Merkezi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1320, 760);
        MinimumSize = new Size(1100, 650);
        Font = new Font("Segoe UI", 9f);
        month.Items.AddRange(System.Globalization.DateTimeFormatInfo.GetInstance(new System.Globalization.CultureInfo("tr-TR")).MonthNames.Take(12).Select(x=>x.ToUpper(new System.Globalization.CultureInfo("tr-TR"))).Cast<object>().ToArray());
        month.SelectedIndex = DateTime.Today.Month-1;
        year.Value = DateTime.Today.Year;
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
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));

        root.Controls.Add(new Label
        {
            Text = "Dönem Kontrol Merkezi",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 17f, FontStyle.Bold),
            ForeColor = p.Text,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 0);

        var filters = PdksUiKit.Card(12);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Padding = new Padding(12, 10, 8, 8), BackColor = p.Surface };
        bar.Controls.Add(Field("Ay", month));
        bar.Controls.Add(Field("Yıl", year));
        var refresh = PdksUiKit.Button("Kontrol Et", 110, PdksActionRole.Primary, RefreshData);
        refresh.Margin = new Padding(8, 8, 0, 0);
        bar.Controls.Add(refresh);
        filters.Controls.Add(bar);
        root.Controls.Add(filters, 0, 1);

        var metrics = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 5, BackColor = p.Canvas, Padding = new Padding(0, 8, 0, 8) };
        for (var i = 0; i < 5; i++) metrics.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 20));
        metrics.Controls.Add(MetricCard("Düzeltilecek", problemValue), 0, 0);
        metrics.Controls.Add(MetricCard("Puantaj Hazır", timesheetValue), 1, 0);
        metrics.Controls.Add(MetricCard("Bordro Var", payrollValue), 2, 0);
        metrics.Controls.Add(MetricCard("Ödeme Var", paymentValue), 3, 0);
        metrics.Controls.Add(MetricCard("Tamam", readyValue), 4, 0);
        root.Controls.Add(metrics, 0, 2);

        root.Controls.Add(grid, 0, 3);

        var footer = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 5, BackColor = p.Canvas };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (var i = 1; i < 5; i++) footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 135));
        status.ForeColor = p.Muted;
        footer.Controls.Add(status, 0, 0);
        AddFooterButton(footer, 1, "İstisnalar", PdksCommandId.AttendanceExceptions, false);
        AddFooterButton(footer, 2, "Puantaj", PdksCommandId.TimesheetMonthly, false);
        AddFooterButton(footer, 3, "Bordro", PdksCommandId.PayrollAdjustment, false);
        AddFooterButton(footer, 4, "Raporlar", PdksCommandId.Reports, true);
        root.Controls.Add(footer, 0, 4);

        Controls.Add(root);
        grid.CellDoubleClick += (_, _) => Open(PdksCommandId.Personnel);
    }

    void AddFooterButton(TableLayoutPanel footer, int col, string text, PdksCommandId command, bool primary)
    {
        var button = PdksUiKit.Button(text, 125, primary ? PdksActionRole.Primary : PdksActionRole.Secondary, () => Open(command));
        button.Dock = DockStyle.Fill;
        button.Margin = new Padding(6, 8, 0, 4);
        footer.Controls.Add(button, col, 0);
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

    void Open(PdksCommandId command)
    {
        if (navigate is null) return;
        Close();
        navigate(command);
    }

    void RefreshData()
    {
        try
        {
            var a = new DateTime((int)year.Value, month.SelectedIndex + 1, 1);
            var b = a.AddMonths(1);
            var active = db.Query(
                "select k.PKNO,k.AD,k.SOYAD,k.GRUP,coalesce(g.AD,'') GRUPAD,coalesce(b.AD,'') BOLUM " +
                "from KIMLIK k left join BOLUM b on b.KOD=k.BOLUM left join GRUP g on g.KOD=k.GRUP " +
                "where coalesce(k.IGTARIH,@A)<@B and (k.ICTARIH is null or k.ICTARIH>=@A) order by k.PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b));

            var movement = db.Query(
                "select g.PKNO,count(*) HAREKET,count(distinct g.GTARIH) HAREKETGUN," +
                "sum(case when g.GSAAT is null or trim(g.GSAAT)='' or g.CSAAT is null or trim(g.CSAAT)='' then 1 else 0 end) EKSIK " +
                "from GIRCIK g where g.GTARIH>=@A and g.GTARIH<@B group by g.PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b));
            var punch = db.Query(
                "select p.PKNO,count(*) PUANTAJGUN,sum(coalesce(p.DAKIKA2,0)+coalesce(p.DAKIKA3,0)) MESAI," +
                "sum(coalesce(p.GECG,0)+coalesce(p.ERKENG,0)+coalesce(p.DEVAMSIZLIKG,0)+coalesce(p.EKSIKG,0)) ISTISNA " +
                "from PUANTAJ p where p.TARIH>=@A and p.TARIH<@B group by p.PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b));
            var leave = db.Query(
                "select PKNO,count(*) IZIN from OZELIZIN where TARIH>=@A and TARIH<@B group by PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b));
            var payroll = db.Query(
                "select PKNO,count(*) BORDRO from UCRETLER where BASTAR<@B and BITTAR>=@A group by PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b));
            var payment = db.Query(
                "select PKNO,count(*) ODEME from ODEME where BASTAR<@B and BITTAR>=@A group by PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b));

            var mov = Index(movement);
            var pun = Index(punch);
            var lev = Index(leave);
            var payr = Index(payroll);
            var paid = Index(payment);

            var table = new DataTable();
            foreach (var c in new[] { "Durum", "Kart No", "Ad Soyad", "Grup", "Kart Takibi", "Bölüm", "Hareket Gün", "Puantaj Gün", "Eksik Hareket", "İstisna", "İzin", "Mesai", "Bordro", "Ödeme" }) table.Columns.Add(c);

            var problems = 0;
            var punchReady = 0;
            var payrollReady = 0;
            var payments = 0;
            var complete = 0;

            var policies=AttendanceGroupPolicyStore.Load(db);
            foreach (DataRow person in active.Rows)
            {
                var pk = Convert.ToString(person["PKNO"])?.Trim() ?? "";
                var groupCode=person["GRUP"]==DBNull.Value?-1:Convert.ToInt32(person["GRUP"]);
                var groupName=Convert.ToString(person["GRUPAD"])?.Trim()??"";
                var tracked=AttendanceGroupPolicyStore.RequiresCardTracking(policies,groupCode,groupName);
                var m = Get(mov, pk);
                var p = Get(pun, pk);
                var l = Get(lev, pk);
                var pr = Get(payr, pk);
                var pd = Get(paid, pk);
                var movementDays = I(m, "HAREKETGUN");
                var punchDays = I(p, "PUANTAJGUN");
                var missing = I(m, "EKSIK");
                var exceptions = I(p, "ISTISNA");
                var overtime = I(p, "MESAI");
                var hasPayroll = I(pr, "BORDRO") > 0;
                var hasPayment = I(pd, "ODEME") > 0;

                string state;
                if (!tracked) state = "KART TAKİBİ YOK";
                else if (missing > 0) state = "DÜZELT";
                else if (movementDays > punchDays) state = "PUANTAJ EKSİK";
                else if (punchDays > 0 && !hasPayroll) state = "BORDRO BEKLİYOR";
                else if (hasPayroll && !hasPayment) state = "ÖDEME BEKLİYOR";
                else if (movementDays == 0 && punchDays == 0) state = "HAREKET YOK";
                else state = "TAMAM";

                if (tracked && state is ("DÜZELT" or "PUANTAJ EKSİK")) problems++;
                if (tracked && punchDays > 0 && movementDays <= punchDays && missing == 0) punchReady++;
                if (hasPayroll) payrollReady++;
                if (hasPayment) payments++;
                if (state == "TAMAM") complete++;

                table.Rows.Add(
                    state,
                    pk,
                    ($"{Convert.ToString(person["AD"])} {Convert.ToString(person["SOYAD"])}").Trim(),
                    groupName,
                    tracked ? "Zorunlu" : "Muaf",
                    Convert.ToString(person["BOLUM"]) ?? "",
                    movementDays,
                    punchDays,
                    missing,
                    exceptions,
                    I(l, "IZIN"),
                    AsTime(overtime),
                    hasPayroll ? "VAR" : "—",
                    hasPayment ? "VAR" : "—");
            }

            var view = new DataView(table) { Sort = "[Durum] ASC, [Kart No] ASC" };
            grid.DataSource = view;
            SetWidths();

            problemValue.Text = problems.ToString("N0");
            timesheetValue.Text = punchReady.ToString("N0");
            payrollValue.Text = payrollReady.ToString("N0");
            paymentValue.Text = payments.ToString("N0");
            readyValue.Text = complete.ToString("N0");
            status.ForeColor = PdksAppearance.Current.Muted;
            status.Text = $"{a:MMMM yyyy} • {active.Rows.Count:N0} personel • bordro öncesi kontrol listesi";
        }
        catch (Exception ex)
        {
            grid.DataSource = null;
            status.Text = "Dönem kontrolü alınamadı • " + PdksErrorPresenter.Report(ex, "PeriodControlCenter.Refresh");
            status.ForeColor = PdksAppearance.Current.Danger;
        }
    }

    void SetWidths()
    {
        foreach (DataGridViewColumn c in grid.Columns)
        {
            c.Width = c.Name switch
            {
                "Durum" => 125,
                "Kart No" => 78,
                "Ad Soyad" => 180,
                "Grup" => 135,
                "Kart Takibi" => 92,
                "Bölüm" => 135,
                _ => 92
            };
        }
    }

    static Dictionary<string, DataRow> Index(DataTable table)
    {
        var result = new Dictionary<string, DataRow>(StringComparer.OrdinalIgnoreCase);
        foreach (DataRow r in table.Rows)
        {
            var key = Convert.ToString(r["PKNO"])?.Trim();
            if (!string.IsNullOrWhiteSpace(key)) result[key] = r;
        }
        return result;
    }

    static DataRow? Get(Dictionary<string, DataRow> map, string key) => map.TryGetValue(key, out var row) ? row : null;

    static int I(DataRow? row, string name)
    {
        if (row is null || !row.Table.Columns.Contains(name) || row[name] is DBNull) return 0;
        try { return Convert.ToInt32(row[name]); } catch { return 0; }
    }

    static string AsTime(int minutes) => $"{minutes / 60:00}:{minutes % 60:00}";
}
