using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Reports;
using KYERP.PDKS.Core.Payroll;

namespace HKN.Personel.Native;

public sealed class LegacyBordroForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly ComboBox year = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 112, FlatStyle = FlatStyle.Flat };
    readonly ComboBox month = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 145, FlatStyle = FlatStyle.Flat };
    readonly ComboBox type = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 190, FlatStyle = FlatStyle.Flat };
    readonly DataGridView grid = new() { Name = "BordroGrid", Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToOrderColumns = true, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None, BackgroundColor = Color.White, BorderStyle = BorderStyle.None, RowHeadersVisible = false };
    readonly Label summary = new() { AutoSize = true, Padding = new Padding(14, 10, 8, 0), Font = new Font("Segoe UI", 9f, FontStyle.Bold), ForeColor = Color.FromArgb(42, 70, 105) };
    readonly System.Windows.Forms.Timer reloadTimer = new() { Interval = 140 };
    DataTable data = new();
    bool loading;
    string LayoutKey => "bordro-" + (type.SelectedItem?.ToString() ?? "genel").Replace(' ', '-');

    static readonly string[] MonthNames =
    [
        "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
        "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
    ];

    public LegacyBordroForm(int initialType = 0)
    {
        Text = "Bordro";
        Size = new Size(1360, 760);
        MinimumSize = new Size(1000, 620);
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.FromArgb(246, 249, 253);
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        grid.RowTemplate.Height = 31;
        grid.ColumnHeadersHeight = 36;
        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(248,250,252);
        grid.ColumnHeadersDefaultCellStyle.ForeColor = Color.FromArgb(71,85,105);
        grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI",8.5f,FontStyle.Bold);
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(219,234,254);
        grid.DefaultCellStyle.SelectionForeColor = Color.FromArgb(15,23,42);

        type.Items.AddRange(["Genel Maaş Bordrosu", "Mesai Bordrosu", "Maaş Pusulası"]);
        type.SelectedIndex = Math.Clamp(initialType, 0, type.Items.Count - 1);

        var currentYear = DateTime.Today.Year;
        for (var y = currentYear + 1; y >= 2015; y--) year.Items.Add(y);
        year.SelectedItem = currentYear;
        month.Items.AddRange(MonthNames.Cast<object>().ToArray());
        month.SelectedIndex = DateTime.Today.Month - 1;

        reloadTimer.Tick += (_, _) => { reloadTimer.Stop(); LoadData(); };
        Build();
        Shown += (_, _) => { GridLayoutPersistence.Attach(grid, LayoutKey); LoadData(); };
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(16), BackColor = Color.FromArgb(244,247,251) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 132));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));

        var periodCard = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(18, 12, 18, 10), Margin = new Padding(0, 0, 0, 10) };
        periodCard.Paint += (_,e) => { using var pen = new Pen(Color.FromArgb(226,232,240)); e.Graphics.DrawRectangle(pen,0,0,Math.Max(0,periodCard.Width-1),Math.Max(0,periodCard.Height-1)); };
        var periodLayout = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, BackColor = Color.White };
        periodLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        periodLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        periodLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        periodLayout.Controls.Add(new Label { Text = "Bordro Merkezi", Dock = DockStyle.Fill, Font = new Font("Segoe UI",11f,FontStyle.Bold), ForeColor = Color.FromArgb(15,23,42), TextAlign = ContentAlignment.MiddleLeft },0,0);

        var filters = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 9, RowCount = 1, BackColor = Color.White };
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 42));
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 38));
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 126));
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 86));
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 96));
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        filters.Controls.Add(Caption("Yıl"),0,0); year.Dock=DockStyle.Fill; year.Margin=new Padding(0,4,10,6); filters.Controls.Add(year,1,0);
        filters.Controls.Add(Caption("Ay"),2,0); month.Dock=DockStyle.Fill; month.Margin=new Padding(0,4,10,6); filters.Controls.Add(month,3,0);
        filters.Controls.Add(Caption("Tür"),4,0); type.Dock=DockStyle.Fill; type.Margin=new Padding(0,4,10,6); filters.Controls.Add(type,5,0);

        var show = Btn("Göster", LoadData, 88, true); show.Dock=DockStyle.Fill; show.Margin=new Padding(0,4,8,6); filters.Controls.Add(show,6,0);
        var layout = Btn("Alanlar / Sıralama", () => GridLayoutPersistence.ShowEditor(this, grid, LayoutKey, "Bordro Alanları / Sıralama"), 140); layout.Dock=DockStyle.Fill; layout.Margin=new Padding(0,4,8,6); filters.Controls.Add(layout,7,0);
        var lockButton = Btn("Düzeni Kilitle", ToggleLock, 118); lockButton.Dock=DockStyle.Left; lockButton.Margin=new Padding(0,4,8,6); filters.Controls.Add(lockButton,8,0);
        periodLayout.Controls.Add(filters,0,1);

        summary.Dock = DockStyle.Fill;
        summary.Padding = new Padding(2,4,0,0);
        summary.ForeColor = Color.FromArgb(100,116,139);
        periodLayout.Controls.Add(summary,0,2);
        periodCard.Controls.Add(periodLayout);
        root.Controls.Add(periodCard, 0, 0);

        var gridCard = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(1) };
        gridCard.Controls.Add(grid);
        root.Controls.Add(gridCard, 0, 1);

        var bottom = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 10, 0, 0), BackColor = BackColor };
        bottom.Controls.Add(Btn("Excel Aktar", () => Export(true), 118));
        bottom.Controls.Add(Btn("PDF Aktar", () => Export(false), 118));
        bottom.Controls.Add(Btn("Yazdır", Print, 104));
        bottom.Controls.Add(Btn("Önizle", Preview, 104));
        root.Controls.Add(bottom, 0, 2);
        Controls.Add(root);

        type.SelectedIndexChanged += (_, _) => { if (IsHandleCreated) { GridLayoutPersistence.Apply(grid, LayoutKey); QueueReload(); } };
        year.SelectedIndexChanged += (_, _) => { if (IsHandleCreated) QueueReload(); };
        month.SelectedIndexChanged += (_, _) => { if (IsHandleCreated) QueueReload(); };
    }

    static Label Caption(string text, int left = 0) => new()
    {
        Text = text,
        AutoSize = true,
        Margin = new Padding(left, 0, 6, 0),
        Padding = new Padding(0, 8, 0, 0),
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        ForeColor = Color.FromArgb(52, 73, 99)
    };

    static Button Btn(string text, Action action, int width, bool primary = false)
    {
        var b = new Button
        {
            Text = text,
            Width = width,
            Height = 34,
            Margin = new Padding(10, 0, 0, 0),
            FlatStyle = FlatStyle.Flat,
            BackColor = primary ? Color.FromArgb(31, 111, 235) : Color.White,
            ForeColor = primary ? Color.White : Color.FromArgb(35, 61, 90),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        };
        b.FlatAppearance.BorderColor = primary ? Color.FromArgb(31, 111, 235) : Color.FromArgb(211, 220, 233);
        b.Click += (_, _) => action();
        return b;
    }

    void QueueReload()
    {
        reloadTimer.Stop();
        reloadTimer.Start();
    }

    DateTime PeriodStart()
    {
        var y = year.SelectedItem is int selectedYear ? selectedYear : DateTime.Today.Year;
        var m = month.SelectedIndex >= 0 ? month.SelectedIndex + 1 : DateTime.Today.Month;
        return new DateTime(y, m, 1);
    }

    string RoadExpression()
    {
        foreach (var field in new[] { "GUNYOLUCRET", "GUNYOLUCRETI", "YOLUCRET", "YOLUCRETI" })
        {
            var found = db.Query("select count(*) ADET from RDB$RELATION_FIELDS where RDB$RELATION_NAME=@T and RDB$FIELD_NAME=@F",
                new FbParameter("@T", "KIMLIK".PadRight(31)), new FbParameter("@F", field.PadRight(31)));
            if (found.Rows.Count > 0 && Convert.ToInt32(found.Rows[0][0]) > 0) return $"coalesce(k.{field},0)";
        }
        return "cast(0 as numeric(15,2))";
    }

    static readonly (string Technical, string Caption)[] ColumnMap =
    [
        ("KART_NO", "Kart No"), ("IGT", "İ.G.T"), ("AD_SOYAD", "Ad Soyad"), ("MAAS", "Maaş"), ("YOL", "Yol"),
        ("NORMAL_GUN", "Normal Gün"), ("NORMAL_SAAT", "Normal Saat"), ("MESAI50_SAAT", "%50 Mesai Saat"),
        ("MESAI100_SAAT", "%100 Mesai Saat"), ("MESAI_SAAT", "Mesai Saat"), ("MESAI", "Mesai"),
        ("UCRETSIZ_IZIN_GUN", "Ücretsiz İzin Gün"), ("UCRETLI_IZIN_GUN", "Ücretli İzin Gün"), ("YILLIK_IZIN_GUN", "Yıllık İzin Gün"),
        ("DEVAMSIZ_GUN", "Devamsız Gün"), ("DEVAMSIZ_SAAT", "Devamsız Saat"), ("GEC_SAAT", "Geç Saat"), ("EKSIK_SAAT", "Eksik Saat"),
        ("EK_KAZANC", "Ek Kazanç"), ("KESINTI", "Kesinti"), ("AVANS", "Avans"), ("BANKA", "Banka Kayıtlı"), ("BES", "BES"), ("ICRA", "İcra"),
        ("MAAS_ODEME", "Maaş Ödeme"), ("MESAI_ODEME", "Mesai Ödeme"), ("TOPLAM", "Hak Edilen Net"), ("ELDEN", "Kayıtlı Fark"),
        ("PEK_BRUT", "Hesaplanan PEK"), ("RESMI_NET", "Resmî Bordro Neti"), ("FARK", "Aradaki Fark"), ("BANKA_OTOMATIK", "Bankaya Ödenecek"), ("IMZA", "İmza")
    ];

    void LoadData()
    {
        if (loading) return;
        try
        {
            loading = true;
            UseWaitCursor = true;
            summary.Text = "Yükleniyor...";
            var a = PeriodStart();
            var b = a.AddMonths(1);
            var road = RoadExpression();

            var raw = db.Query(
                "select u.PKNO KART_NO,k.IGTARIH IGT,(trim(coalesce(k.AD,''))||' '||trim(coalesce(k.SOYAD,''))) AD_SOYAD," +
                "u.DMAAS MAAS," + road + " YOL,u.GUN1 NORMAL_GUN,u.SAAT1 NORMAL_SAAT," +
                "u.SAAT2 MESAI50_SAAT,u.SAAT3 MESAI100_SAAT,u.SAAT8 MESAI_SAAT,u.UCRET8 MESAI," +
                "u.GUN4 UCRETSIZ_IZIN_GUN,u.GUN5 UCRETLI_IZIN_GUN,u.GUN9 YILLIK_IZIN_GUN," +
                "u.DEVG DEVAMSIZ_GUN,u.DEVS DEVAMSIZ_SAAT,u.GECS GEC_SAAT,u.EKS EKSIK_SAAT," +
                "u.EKKAZ EK_KAZANC,u.EKKES KESINTI,u.EX1 AVANS,u.EX2 BANKA,u.EX3 BES,u.EX4 ICRA," +
                "u.NCKALAN MAAS_ODEME,u.FMKALAN MESAI_ODEME," +
                "(coalesce(u.NCKALAN,0)+coalesce(u.FMKALAN,0)) TOPLAM," +
                "((coalesce(u.NCKALAN,0)+coalesce(u.FMKALAN,0))-coalesce(u.EX2,0)) ELDEN,'' IMZA," +
                "u.BASTAR DONEM_BASLANGIC " +
                "from UCRETLER u join KIMLIK k on k.PKNO=u.PKNO " +
                "where k.ICTARIH is null and u.BASTAR<@B and coalesce(u.BITTAR,u.BASTAR)>=@A " +
                "order by u.PKNO,u.BASTAR desc",
                new FbParameter("@A", a), new FbParameter("@B", b));

            data = raw.Clone();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (DataRow row in raw.Rows)
            {
                var card = Convert.ToString(row["KART_NO"])?.Trim() ?? string.Empty;
                if (card.Length == 0 || !seen.Add(card)) continue;
                data.ImportRow(row);
            }
            if (data.Columns.Contains("DONEM_BASLANGIC")) data.Columns.Remove("DONEM_BASLANGIC");
            ApplyOfficialPayrollColumns(data, a.Year);

            foreach (var (technical, caption) in ColumnMap)
                if (data.Columns.Contains(technical)) data.Columns[technical]!.ColumnName = caption;

            var serial = new DataColumn("S.No", typeof(int));
            data.Columns.Add(serial); serial.SetOrdinal(0);
            for (var i = 0; i < data.Rows.Count; i++) data.Rows[i][serial] = i + 1;

            grid.SuspendLayout();
            grid.DataSource = data;
            foreach (DataGridViewColumn c in grid.Columns)
            {
                c.Width = c.HeaderText == "Ad Soyad" ? 175 : c.HeaderText == "İmza" ? 120 : c.HeaderText == "S.No" ? 50 : c.HeaderText.Contains("Gün") ? 68 : 88;
                c.SortMode = DataGridViewColumnSortMode.NotSortable;
            }
            typeof(DataGridView).GetProperty("DoubleBuffered", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)?.SetValue(grid, true);
            GridLayoutPersistence.Apply(grid, LayoutKey);
            grid.ResumeLayout();

            var total = data.AsEnumerable().Sum(r => r["Toplam"] == DBNull.Value ? 0m : Convert.ToDecimal(r["Toplam"]));
            summary.Text = $"Aktif personel: {data.Rows.Count}  •  {MonthNames[a.Month - 1]} {a.Year}  •  {total:N2} ₺";
        }
        catch (Exception ex)
        {
            data = new DataTable();
            grid.DataSource = data;
            summary.Text = "Bordro yüklenemedi";
            MessageBox.Show("Bordro verisi okunamadı.\r\n\r\n" + ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally
        {
            UseWaitCursor = false;
            loading = false;
        }
    }

    static void ApplyOfficialPayrollColumns(DataTable table, int payrollYear)
    {
        foreach (var name in new[] { "PEK_BRUT", "RESMI_NET", "FARK", "BANKA_OTOMATIK" })
            if (!table.Columns.Contains(name)) table.Columns.Add(name, typeof(decimal));

        foreach (DataRow row in table.Rows)
        {
            try
            {
                var card=Convert.ToString(row["KART_NO"])?.Trim()??string.Empty;
                var entitlement=Money(row,"TOPLAM");
                var fallback=Money(row,"MAAS");
                var profile=PayrollProfileStore.Load(card,fallback);
                var unpaid=Money(row,"UCRETSIZ_IZIN_GUN");
                var absent=Money(row,"DEVAMSIZ_GUN");
                var payableDays=Math.Clamp((int)Math.Round(30m-unpaid-absent,MidpointRounding.AwayFromZero),0,30);
                if(entitlement<=0m||payableDays==0)
                {
                    row["PEK_BRUT"]=0m;row["RESMI_NET"]=0m;row["FARK"]=entitlement;row["BANKA_OTOMATIK"]=0m;continue;
                }

                var rules=TurkishPayrollRules.ForYear(payrollYear);
                var requiredGross=TurkishPayrollCalculator.GrossForTargetNet(entitlement,payrollYear,0m,payableDays);
                var gross=profile.PekMode==PekMode.Manual
                    ? Math.Round(profile.ManualPekGross*payableDays/30m,2,MidpointRounding.AwayFromZero)
                    : requiredGross;
                var official=TurkishPayrollCalculator.Calculate(new OfficialPayrollInput(gross,0m,payableDays),rules);
                row["PEK_BRUT"]=official.PrimeEarnings;
                row["RESMI_NET"]=official.NetWage;
                row["FARK"]=Math.Round(entitlement-official.NetWage,2,MidpointRounding.AwayFromZero);
                row["BANKA_OTOMATIK"]=official.NetWage;
            }
            catch(NotSupportedException)
            {
                row["PEK_BRUT"]=0m;row["RESMI_NET"]=0m;row["FARK"]=Money(row,"TOPLAM");row["BANKA_OTOMATIK"]=0m;
            }
        }
    }

    static decimal Money(DataRow row, string column)
    {
        if(!row.Table.Columns.Contains(column)||row[column]==DBNull.Value)return 0m;
        try{return Convert.ToDecimal(row[column]);}catch{return 0m;}
    }

    void ToggleLock()
    {
        var locked = !GridLayoutPersistence.IsLocked(LayoutKey);
        GridLayoutPersistence.SetLocked(grid, LayoutKey, locked);
        MessageBox.Show(locked ? "Düzen kilitlendi." : "Düzen açıldı.", Text);
    }

    ReportTable Report()
    {
        var a = PeriodStart();
        var z = a.AddMonths(1).AddDays(-1);
        return GridReportAdapter.ToReport(grid, data, $"{a:dd.MM.yyyy} - {z:dd.MM.yyyy} {type.SelectedItem}");
    }

    IReadOnlyList<int> Widths() => GridReportAdapter.VisibleWidths(grid);
    void Preview() { LoadData(); ReportPrintHelper.Preview(this, Report(), true, Widths()); }
    void Print() { LoadData(); ReportPrintHelper.Print(this, Report(), true, Widths()); }

    void Export(bool excel)
    {
        LoadData();
        var p = PeriodStart();
        using var save = new SaveFileDialog { Filter = excel ? "Excel (*.xlsx)|*.xlsx" : "PDF (*.pdf)|*.pdf", DefaultExt = excel ? "xlsx" : "pdf", FileName = $"{type.SelectedItem}-{p:yyyyMM}".Replace(' ', '-') };
        if (save.ShowDialog(this) != DialogResult.OK) return;
        if (excel) ReportExporter.ExportExcel(save.FileName, Report()); else ReportExporter.ExportPdf(save.FileName, Report());
    }
}
