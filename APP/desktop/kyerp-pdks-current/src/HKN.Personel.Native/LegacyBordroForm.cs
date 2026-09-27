using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

public sealed class LegacyBordroForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DateTimePicker period = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "MMMM yyyy", ShowUpDown = true, Width = 145 };
    readonly ComboBox reportType = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 180 };
    readonly TextBox card = new() { Width = 90 };
    readonly DataGridView grid = new()
    {
        Name = "BordroGrid",
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        AllowUserToOrderColumns = true,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None,
        BackgroundColor = Color.White,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect
    };
    readonly Label summary = new() { AutoSize = true, Padding = new Padding(8, 9, 8, 0), Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
    DataTable data = new();
    string LayoutKey => "bordro-" + (reportType.SelectedItem?.ToString() ?? "genel").Replace(' ', '-');

    public LegacyBordroForm()
    {
        Text = "Bordro";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1360, 760);
        MinimumSize = new Size(1050, 620);
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.FromArgb(246, 249, 253);
        reportType.Items.AddRange(["Genel Maaş Bordrosu", "Mesai Bordrosu", "Maaş Pusulası"]);
        reportType.SelectedIndex = 0;
        period.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        Build();
        Shown += (_, _) => { GridLayoutPersistence.Attach(grid, LayoutKey); LoadData(); };
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, Padding = new Padding(12) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 68));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));

        var header = new Panel { Dock = DockStyle.Fill, BackColor = Color.White };
        header.Controls.Add(new Label
        {
            Text = "BORDRO",
            AutoSize = true,
            Location = new Point(18, 10),
            Font = new Font("Segoe UI", 17f, FontStyle.Bold),
            ForeColor = Color.FromArgb(27, 44, 68)
        });
        header.Controls.Add(new Label
        {
            Text = "Ayı ve bordro türünü seç • alanları sırala • kolon genişliklerini bir kez ayarla ve kalıcı kullan",
            AutoSize = true,
            Location = new Point(20, 43),
            ForeColor = Color.FromArgb(88, 103, 124)
        });
        root.Controls.Add(header, 0, 0);

        var filters = new FlowLayoutPanel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(14, 9, 0, 0), WrapContents = false };
        filters.Controls.Add(Label("Dönem"));
        filters.Controls.Add(period);
        filters.Controls.Add(Label("Bordro Türü"));
        filters.Controls.Add(reportType);
        filters.Controls.Add(Label("Kart No"));
        filters.Controls.Add(card);
        filters.Controls.Add(Button("Göster", LoadData, 92, true));
        filters.Controls.Add(Button("Alanlar / Sıralama", EditLayout, 145));
        filters.Controls.Add(Button("Düzeni Kilitle", ToggleLock, 125));
        filters.Controls.Add(summary);
        root.Controls.Add(filters, 0, 1);

        grid.ColumnHeadersHeight = 34;
        grid.RowTemplate.Height = 26;
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(225, 238, 255);
        grid.DefaultCellStyle.SelectionForeColor = Color.Black;
        root.Controls.Add(grid, 0, 2);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 10, 0, 0), WrapContents = false };
        actions.Controls.Add(Button("Excel Aktar", () => Export(true), 118));
        actions.Controls.Add(Button("PDF Aktar", () => Export(false), 118));
        actions.Controls.Add(Button("Yazdır", Print, 104));
        actions.Controls.Add(Button("Önizle", Preview, 104));
        root.Controls.Add(actions, 0, 3);
        Controls.Add(root);

        reportType.SelectedIndexChanged += (_, _) =>
        {
            if (!IsHandleCreated) return;
            GridLayoutPersistence.Apply(grid, LayoutKey);
            LoadData();
        };
        period.ValueChanged += (_, _) => { if (IsHandleCreated) LoadData(); };
    }

    static Label Label(string text) => new() { Text = text, AutoSize = true, Padding = new Padding(8, 8, 3, 0), ForeColor = Color.FromArgb(66, 82, 104) };

    static Button Button(string text, Action action, int width, bool primary = false)
    {
        var b = new Button
        {
            Text = text,
            Width = width,
            Height = 34,
            FlatStyle = FlatStyle.Flat,
            BackColor = primary ? Color.FromArgb(36, 107, 230) : Color.White,
            ForeColor = primary ? Color.White : Color.FromArgb(27, 44, 68),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        };
        b.FlatAppearance.BorderColor = primary ? b.BackColor : Color.FromArgb(216, 225, 236);
        b.Click += (_, _) => action();
        return b;
    }

    void LoadData()
    {
        try
        {
            var first = new DateTime(period.Value.Year, period.Value.Month, 1);
            var next = first.AddMonths(1);
            var whereCard = string.IsNullOrWhiteSpace(card.Text) ? "1=1" : "u.PKNO=@P";
            var parameters = new List<FbParameter> { new("@A", first), new("@B", next) };
            if (!string.IsNullOrWhiteSpace(card.Text)) parameters.Add(new FbParameter("@P", card.Text.Trim().PadLeft(5, '0')));

            data = db.Query(
                "select " +
                "u.PKNO \"Kart No\",k.IGTARIH \"İ.G.T\",trim(coalesce(k.AD,'')||' '||coalesce(k.SOYAD,'')) \"Ad Soyad\"," +
                "u.DMAAS Maaş,u.GUN1 \"Normal Gün\",u.SAAT1 \"Normal Saat\"," +
                "u.SAAT2 \"%50 Mesai Saat\",u.SAAT3 \"%100 Mesai Saat\"," +
                "u.GUN4 \"Ücretsiz İzin Gün\",u.GUN5 \"Ücretli İzin Gün\",u.GUN9 \"Yıllık İzin Gün\"," +
                "u.DEVG \"Devamsız Gün\",u.DEVS \"Devamsız Saat\",u.GECS \"Geç Saat\",u.EKS \"Eksik Saat\"," +
                "u.EX1 Avans,u.EX2 Banka,u.EX3 BES,u.EX4 İcra," +
                "u.NCKALAN \"Maaş Ödeme\",u.FMKALAN \"Mesai Ödeme\"," +
                "(coalesce(u.NCKALAN,0)+coalesce(u.FMKALAN,0)) Toplam," +
                "((coalesce(u.NCKALAN,0)+coalesce(u.FMKALAN,0))-coalesce(u.EX2,0)) Elden," +
                "cast('' as varchar(30)) İmza " +
                "from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO " +
                "where u.BASTAR<@B and coalesce(u.BITTAR,u.BASTAR)>=@A and " + whereCard + " order by u.PKNO",
                parameters.ToArray());

            if (!data.Columns.Contains("S.No"))
            {
                var serial = new DataColumn("S.No", typeof(int));
                data.Columns.Add(serial);
                serial.SetOrdinal(0);
                for (var i = 0; i < data.Rows.Count; i++) data.Rows[i][serial] = i + 1;
            }

            grid.DataSource = data;
            ApplyReasonableWidths();
            GridLayoutPersistence.Apply(grid, LayoutKey);
            var total = data.AsEnumerable().Sum(r => r["Toplam"] == DBNull.Value ? 0m : Convert.ToDecimal(r["Toplam"]));
            summary.Text = $"{data.Rows.Count} personel • Toplam {total:N2} ₺";
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    void ApplyReasonableWidths()
    {
        foreach (DataGridViewColumn c in grid.Columns)
        {
            c.Width = c.HeaderText switch
            {
                "S.No" => 50,
                "Kart No" => 70,
                "İ.G.T" => 88,
                "Ad Soyad" => 170,
                "İmza" => 120,
                _ when c.HeaderText.Contains("Saat", StringComparison.OrdinalIgnoreCase) => 80,
                _ when c.HeaderText.Contains("Gün", StringComparison.OrdinalIgnoreCase) => 65,
                _ => 90
            };
        }
    }

    void EditLayout()
    {
        GridLayoutPersistence.ShowEditor(this, grid, LayoutKey, "Bordro Alanları / Sıralama");
        GridLayoutPersistence.Apply(grid, LayoutKey);
    }

    void ToggleLock()
    {
        var next = !GridLayoutPersistence.IsLocked(LayoutKey);
        GridLayoutPersistence.SetLocked(grid, LayoutKey, next);
        MessageBox.Show(next ? "Bordro düzeni kilitlendi." : "Bordro düzeni düzenlemeye açıldı.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    ReportTable CurrentReport()
    {
        var first = new DateTime(period.Value.Year, period.Value.Month, 1);
        var last = first.AddMonths(1).AddDays(-1);
        var name = reportType.SelectedItem?.ToString() ?? "Bordro";
        return GridReportAdapter.ToReport(grid, data, $"{first:dd.MM.yyyy} - {last:dd.MM.yyyy} {name}");
    }

    void Preview()
    {
        try { LoadData(); ReportPrintHelper.Preview(this, CurrentReport(), true); }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    void Print()
    {
        try { LoadData(); ReportPrintHelper.Print(this, CurrentReport(), true); }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    void Export(bool excel)
    {
        try
        {
            LoadData();
            using var save = new SaveFileDialog
            {
                Filter = excel ? "Excel (*.xlsx)|*.xlsx" : "PDF (*.pdf)|*.pdf",
                DefaultExt = excel ? "xlsx" : "pdf",
                FileName = $"{reportType.SelectedItem}-{period.Value:yyyyMM}".Replace(' ', '-')
            };
            if (save.ShowDialog(this) != DialogResult.OK) return;
            var report = CurrentReport();
            if (excel) ReportExporter.ExportExcel(save.FileName, report); else ReportExporter.ExportPdf(save.FileName, report);
            MessageBox.Show("Çıktı oluşturuldu:\n" + save.FileName, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }
}
