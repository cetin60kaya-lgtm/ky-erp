using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Payroll;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

public sealed class LegacyBordroForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly TextBox title = new() { Text = "Genel Maaş Bordrosu" };
    readonly TextBox cardStart = new() { Text = "00000" };
    readonly TextBox cardEnd = new() { Text = "99999" };
    readonly DateTimePicker start = new() { Format = DateTimePickerFormat.Short };
    readonly DateTimePicker end = new() { Format = DateTimePickerFormat.Short };
    readonly ComboBox group = Lookup(), department = Lookup(), service = Lookup(), duty = Lookup(), status = Lookup(), company = Lookup();
    readonly CheckBox cost = new() { Text = "Bölümler arası maliyet görünümü" };
    readonly RadioButton byCard = new() { Text = "Kart No", Checked = true };
    readonly RadioButton byName = new() { Text = "Ad Soyad" };
    readonly RadioButton bySurname = new() { Text = "Soyad Ad" };
    readonly RadioButton byHire = new() { Text = "İşe Giriş" };
    readonly CheckBox landscape = new() { Text = "Yatay sayfa", Checked = true };
    readonly DataGridView previewGrid = new();
    readonly Label summary = new();
    DataTable? lastPreview;
    public LegacyBordroForm()
    {
        Text = "Genel Maaş Bordrosu";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1180, 720);
        MinimumSize = new Size(920, 620);
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.FromArgb(246, 249, 253);
        Build();
        Shown += (_, _) => { Init(); RefreshPreview(); };
    }

    static ComboBox Lookup() => new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        DisplayMember = "TEXT",
        ValueMember = "KOD",
        Dock = DockStyle.Fill
    };

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1, Padding = new Padding(14) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var header = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(18, 8, 18, 8) };
        header.Controls.Add(new Label
        {
            Text = "GENEL MAAŞ BORDROSU",
            AutoSize = true,
            Location = new Point(18, 10),
            Font = new Font("Segoe UI", 17f, FontStyle.Bold),
            ForeColor = Color.FromArgb(27, 44, 68)
        });
        header.Controls.Add(new Label
        {
            Text = "Filtrele • Önizle • Yazdır • PDF / Excel",
            AutoSize = true,
            Location = new Point(20, 43),
            ForeColor = Color.FromArgb(88, 103, 124)
        });
        summary.Dock = DockStyle.Right;
        summary.Width = 300;
        summary.TextAlign = ContentAlignment.MiddleRight;
        summary.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
        summary.ForeColor = Color.FromArgb(36, 107, 230);
        header.Controls.Add(summary);
        root.Controls.Add(header, 0, 0);

        var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterDistance = 390, SplitterWidth = 8 };
        var filters = new TabControl { Dock = DockStyle.Fill };
        var filterPage = new TabPage("Filtreler") { Padding = new Padding(12), BackColor = Color.White };
        var filterGrid = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 2, RowCount = 10, AutoSize = true };
        filterGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 145));
        filterGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        AddRow(filterGrid, 0, "Rapor Başlığı", title);
        AddRow(filterGrid, 1, "Kart No Başlangıç", cardStart);
        AddRow(filterGrid, 2, "Kart No Bitiş", cardEnd);
        AddRow(filterGrid, 3, "Başlangıç Tarihi", start);
        AddRow(filterGrid, 4, "Bitiş Tarihi", end);
        AddRow(filterGrid, 5, "Grup", group);
        AddRow(filterGrid, 6, "Bölüm", department);
        AddRow(filterGrid, 7, "Servis", service);
        AddRow(filterGrid, 8, "Görev", duty);
        AddRow(filterGrid, 9, "Durum", status);
        filterPage.Controls.Add(filterGrid);

        var advanced = new TabPage("Gelişmiş") { Padding = new Padding(12), BackColor = Color.White };
        var advancedGrid = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 2, RowCount = 5, AutoSize = true };
        advancedGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 145));
        advancedGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        AddRow(advancedGrid, 0, "Firma", company);
        var sortPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, WrapContents = true };
        sortPanel.Controls.AddRange([byCard, byName, bySurname, byHire]);
        AddRow(advancedGrid, 1, "Sıralama", sortPanel);
        AddRow(advancedGrid, 2, "Sayfa", landscape);
        AddRow(advancedGrid, 3, "Maliyet", cost);
        advanced.Controls.Add(advancedGrid);
        filters.TabPages.Add(filterPage);
        filters.TabPages.Add(advanced);
        split.Panel1.Padding = new Padding(0, 0, 8, 0);
        split.Panel1.Controls.Add(filters);

        previewGrid.Dock = DockStyle.Fill;
        previewGrid.ReadOnly = true;
        previewGrid.AllowUserToAddRows = false;
        previewGrid.AllowUserToDeleteRows = false;
        previewGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        previewGrid.BackgroundColor = Color.White;
        previewGrid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        split.Panel2.Padding = new Padding(8, 0, 0, 0);
        split.Panel2.Controls.Add(previewGrid);
        root.Controls.Add(split, 0, 2);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 8, 0, 0), WrapContents = false };
        actions.Controls.Add(ActionButton("Excel Aktar", () => Export(true), 118));
        actions.Controls.Add(ActionButton("PDF Aktar", () => Export(false), 118));
        actions.Controls.Add(ActionButton("Yazdır", Print, 104));
        actions.Controls.Add(ActionButton("Önizle", PreviewReport, 104));
        actions.Controls.Add(ActionButton("Hesapla / Yenile", RefreshPreview, 138, true));
        root.Controls.Add(actions, 0, 1);
        Controls.Add(root);
    }
    static void AddRow(TableLayoutPanel table, int row, string label, Control control)
    {
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        table.Controls.Add(new Label
        {
            Text = label,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = Color.FromArgb(66, 82, 104)
        }, 0, row);
        control.Dock = DockStyle.Fill;
        control.Margin = new Padding(3, 5, 3, 5);
        table.Controls.Add(control, 1, row);
    }

    static Button ActionButton(string text, Action action, int width, bool primary = false)
    {
        var button = new Button
        {
            Text = text,
            Width = width,
            Height = 36,
            MinimumSize = new Size(width, 36),
            MaximumSize = new Size(width, 36),
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            BackColor = primary ? Color.FromArgb(36, 107, 230) : Color.White,
            ForeColor = primary ? Color.White : Color.FromArgb(27, 44, 68)
        };
        button.FlatAppearance.BorderColor = primary ? button.BackColor : Color.FromArgb(216, 225, 236);
        button.Click += (_, _) => action();
        return button;
    }
    void Init()
    {
        start.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        end.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1).AddMonths(1).AddDays(-1);
        LoadLookup(group, "GRUP");
        LoadLookup(department, "BOLUM");
        LoadLookup(service, "SERVIS");
        LoadLookup(duty, "GOREV");
        LoadLookup(status, "DURUM");
        LoadLookup(company, "FIRMA");
    }

    void LoadLookup(ComboBox c, string table)
    {
        var dt = db.Query($"select KOD,AD from {table} order by KOD");
        var r = dt.NewRow();
        r["KOD"] = -1;
        r["AD"] = "Tümü";
        dt.Rows.InsertAt(r, 0);
        dt.Columns.Add("TEXT", typeof(string), "AD");
        c.DataSource = dt;
        c.SelectedValue = -1;
    }

    static void AddFilter(List<string> where, List<FbParameter> parameters, string field, ComboBox combo, string key)
    {
        if (combo.SelectedValue is int value && value >= 0)
        {
            where.Add($"{field}=@{key}");
            parameters.Add(new FbParameter("@" + key, value));
        }
    }
    DataTable CalculatePreview()
    {
        if (end.Value.Date < start.Value.Date)
            throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");

        var where = new List<string> { "(k.ICTARIH is null or k.ICTARIH>=@A)", "(k.IGTARIH is null or k.IGTARIH<=@B)" };
        var parameters = new List<FbParameter> { new("@A", start.Value.Date), new("@B", end.Value.Date) };
        var startCard = cardStart.Text.Trim();
        var endCard = cardEnd.Text.Trim();
        if (startCard.Length > 0 && startCard != "00000") { where.Add("k.PKNO>=@KS"); parameters.Add(new("@KS", startCard.PadLeft(5, '0'))); }
        if (endCard.Length > 0 && endCard != "99999") { where.Add("k.PKNO<=@KB"); parameters.Add(new("@KB", endCard.PadLeft(5, '0'))); }
        AddFilter(where, parameters, "k.GRUP", group, "G");
        AddFilter(where, parameters, "k.BOLUM", department, "D");
        AddFilter(where, parameters, "k.SERVIS", service, "S");
        AddFilter(where, parameters, "k.GOREV", duty, "R");
        AddFilter(where, parameters, "k.DURUM", status, "U");
        AddFilter(where, parameters, "k.SIRKET", company, "F");
        var order = byHire.Checked ? "k.IGTARIH,k.PKNO" : byName.Checked ? "k.AD,k.SOYAD" : bySurname.Checked ? "k.SOYAD,k.AD" : "k.PKNO";
        var employees = db.Query($"select k.PKNO,k.SICILNO,k.AD,k.SOYAD,k.IGTARIH,k.MAAS,k.BOLUM from KIMLIK k where {string.Join(" and ", where)} order by {order}", parameters.ToArray());

        var result = new DataTable();
        result.Columns.Add("Kart No", typeof(string));
        result.Columns.Add("Sicil No", typeof(string));
        result.Columns.Add("Ad Soyad", typeof(string));
        result.Columns.Add("Gün", typeof(decimal));
        result.Columns.Add("Normal Çalışma", typeof(string));
        result.Columns.Add("%50 Mesai", typeof(string));
        result.Columns.Add("%100 Mesai", typeof(string));
        result.Columns.Add("Ücretsiz İzin", typeof(string));
        result.Columns.Add("Maaş", typeof(decimal));
        result.Columns.Add("Ek Kazanç", typeof(decimal));
        result.Columns.Add("Kesinti", typeof(decimal));
        result.Columns.Add("Avans", typeof(decimal));
        result.Columns.Add("Brüt", typeof(decimal));
        result.Columns.Add("Net Ödeme", typeof(decimal));
        result.Columns.Add("İmza", typeof(string));

        foreach (DataRow employee in employees.Rows)
        {
            var pk = Convert.ToString(employee["PKNO"]) ?? string.Empty;
            var attendance = db.Query(
                "select coalesce(sum(GUN1),0) GUN,coalesce(sum(DAKIKA1),0) NORMAL,coalesce(sum(DAKIKA2),0) M50,coalesce(sum(DAKIKA3),0) M100,coalesce(sum(DAKIKA4),0) UIZIN from PUANTAJ where PKNO=@P and TARIH>=@A and TARIH<@B",
                new FbParameter("@P", pk), new FbParameter("@A", start.Value.Date), new FbParameter("@B", end.Value.Date.AddDays(1)));
            var values = db.Query(
                "select coalesce(sum(case when upper(coalesce(v.TUR,'')) like '%AVANS%' then a.MIKTAR else 0 end),0) AVANS," +
                "coalesce(sum(case when v.ISARET='+' and upper(coalesce(v.TUR,'')) not like '%AVANS%' then a.MIKTAR else 0 end),0) KAZ," +
                "coalesce(sum(case when (v.ISARET<>'+' or v.ISARET is null) and upper(coalesce(v.TUR,'')) not like '%AVANS%' then a.MIKTAR else 0 end),0) KES " +
                "from AVANS a left join AVTUR v on v.KOD=a.TURKOD where a.PKNO=@P and a.TARIH>=@A and a.TARIH<@B",
                new FbParameter("@P", pk), new FbParameter("@A", start.Value.Date), new FbParameter("@B", end.Value.Date.AddDays(1)));

            var days = Convert.ToDecimal(attendance.Rows[0]["GUN"]);
            var normalMinutes = Convert.ToInt32(attendance.Rows[0]["NORMAL"]);
            var overtime50 = Convert.ToInt32(attendance.Rows[0]["M50"]);
            var overtime100 = Convert.ToInt32(attendance.Rows[0]["M100"]);
            var unpaid = Convert.ToInt32(attendance.Rows[0]["UIZIN"]);
            var earn = values.Rows.Count == 0 ? 0m : Convert.ToDecimal(values.Rows[0]["KAZ"]);
            var deduction = values.Rows.Count == 0 ? 0m : Convert.ToDecimal(values.Rows[0]["KES"]);
            var advance = values.Rows.Count == 0 ? 0m : Convert.ToDecimal(values.Rows[0]["AVANS"]);
            var salary = employee["MAAS"] == DBNull.Value ? 0m : Convert.ToDecimal(employee["MAAS"]);
            var calc = PayrollCalculator.Calculate(new PayrollInput(salary, days, overtime50, overtime100, earn, deduction, advance, 0));

            result.Rows.Add(
                pk,
                Convert.ToString(employee["SICILNO"]) ?? string.Empty,
                $"{employee["AD"]} {employee["SOYAD"]}".Trim(),
                days,
                KYERP.PDKS.Core.Payroll.DailyAttendanceResult.AsTime(normalMinutes),
                KYERP.PDKS.Core.Payroll.DailyAttendanceResult.AsTime(overtime50),
                KYERP.PDKS.Core.Payroll.DailyAttendanceResult.AsTime(overtime100),
                KYERP.PDKS.Core.Payroll.DailyAttendanceResult.AsTime(unpaid),
                salary,
                earn,
                deduction,
                advance,
                calc.GrossPay,
                calc.NetPay,
                string.Empty);
        }
        return result;
    }
    void RefreshPreview()
    {
        try
        {
            lastPreview = CalculatePreview();
            previewGrid.DataSource = lastPreview;
            if (previewGrid.Columns.Contains("Kart No")) previewGrid.Columns["Kart No"].FillWeight = 70;
            if (previewGrid.Columns.Contains("Ad Soyad")) previewGrid.Columns["Ad Soyad"].FillWeight = 180;
            var netTotal = lastPreview.Columns.Contains("Net Ödeme") ? lastPreview.AsEnumerable().Sum(r => r.Field<decimal>("Net Ödeme")) : 0m;
            summary.Text = $"{lastPreview.Rows.Count} personel  •  Net: {netTotal:N2} ₺  •  {start.Value:dd.MM.yyyy} - {end.Value:dd.MM.yyyy}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    ReportTable ToReport(DataTable table)
    {
        var columns = table.Columns.Cast<DataColumn>().Select(c => c.ColumnName).ToArray();
        var money = new HashSet<string>(new[] { "Maaş", "Ek Kazanç", "Kesinti", "Avans", "Brüt", "Net Ödeme" }, StringComparer.OrdinalIgnoreCase);
        string Format(DataRow row, DataColumn column)
        {
            if (row[column] == DBNull.Value) return string.Empty;
            if (money.Contains(column.ColumnName)) return Convert.ToDecimal(row[column]).ToString("N2");
            if (column.ColumnName == "Gün") return Convert.ToDecimal(row[column]).ToString("0.##");
            return Convert.ToString(row[column]) ?? string.Empty;
        }
        var rows = table.Rows.Cast<DataRow>()
            .Select(r => (IReadOnlyList<string>)table.Columns.Cast<DataColumn>().Select(c => Format(r, c)).ToArray())
            .ToList();
        if (table.Rows.Count > 0)
        {
            var total = new string[columns.Length];
            var nameIndex = Array.IndexOf(columns, "Ad Soyad");
            if (nameIndex >= 0) total[nameIndex] = "TOPLAM";
            foreach (var columnName in money)
            {
                var index = Array.IndexOf(columns, columnName);
                if (index >= 0) total[index] = table.AsEnumerable().Sum(r => r.Field<decimal>(columnName)).ToString("N2");
            }
            var dayIndex = Array.IndexOf(columns, "Gün");
            if (dayIndex >= 0) total[dayIndex] = table.AsEnumerable().Sum(r => r.Field<decimal>("Gün")).ToString("0.##");
            rows.Add(total);
        }
        var reportTitle = string.IsNullOrWhiteSpace(title.Text) ? "Genel Maaş Bordrosu" : title.Text.Trim();
        var reportTable = new ReportTable($"{reportTitle} • {start.Value:dd.MM.yyyy} - {end.Value:dd.MM.yyyy}", columns, rows);
        return CompanyBranding.Decorate(reportTable);
    }

    void PreviewReport()
    {
        try
        {
            lastPreview = CalculatePreview();
            ReportPrintHelper.Preview(this, ToReport(lastPreview), landscape.Checked);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    void Print()
    {
        try
        {
            lastPreview = CalculatePreview();
            ReportPrintHelper.Print(this, ToReport(lastPreview), landscape.Checked);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }
    void Export(bool excel)
    {
        try
        {
            lastPreview = CalculatePreview();
            using var dialog = new SaveFileDialog
            {
                Title = excel ? "Bordroyu Excel'e Aktar" : "Bordroyu PDF'e Aktar",
                Filter = excel ? "Excel Çalışma Kitabı (*.xlsx)|*.xlsx" : "PDF Belgesi (*.pdf)|*.pdf",
                FileName = $"Genel-Maas-Bordrosu-{start.Value:yyyyMM}." + (excel ? "xlsx" : "pdf"),
                DefaultExt = excel ? "xlsx" : "pdf",
                AddExtension = true
            };
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            var report = ToReport(lastPreview);
            if (excel) ReportExporter.ExportExcel(dialog.FileName, report);
            else ReportExporter.ExportPdf(dialog.FileName, report);
            MessageBox.Show("Rapor oluşturuldu:\n" + dialog.FileName, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }
}
