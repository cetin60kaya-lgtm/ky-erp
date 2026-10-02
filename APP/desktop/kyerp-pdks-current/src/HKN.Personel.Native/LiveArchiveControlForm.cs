namespace HKN.Personel.Native;

public sealed class LiveArchiveControlForm : Form
{
    readonly DateTimePicker from = new() { Format = DateTimePickerFormat.Short, Width = 120 };
    readonly DateTimePicker to = new() { Format = DateTimePickerFormat.Short, Width = 120 };
    readonly Label summary = new() { AutoSize = false, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        BackgroundColor = Color.White
    };

    public LiveArchiveControlForm()
    {
        Text = "Canlı Veri Arşivi / Kontrol";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(980, 680);
        MinimumSize = new Size(860, 560);
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.FromArgb(246, 249, 253);
        from.Value = DateTime.Today.AddDays(-6);
        to.Value = DateTime.Today;
        Build();
        Shown += (_, _) => RefreshView();
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 5, Padding = new Padding(14) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 74));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));

        var head = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(14) };
        head.Controls.Add(new Label
        {
            Text = "CANLI VERİ ARŞİVİ",
            AutoSize = true,
            Font = new Font("Segoe UI", 15f, FontStyle.Bold),
            Location = new Point(12, 7)
        });
        head.Controls.Add(new Label
        {
            Text = "Yalnız fiziksel cihazdan okunan kart basımları. Uygulama düzeltmeleri ve ana TNF/FDB bu arşivi değiştirmez.",
            AutoSize = true,
            ForeColor = Color.FromArgb(75, 88, 105),
            Location = new Point(14, 38)
        });
        root.Controls.Add(head, 0, 0);

        var filter = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(6, 10, 6, 0), WrapContents = false };
        filter.Controls.Add(new Label { Text = "Başlangıç", AutoSize = true, Padding = new Padding(0, 7, 4, 0) });
        filter.Controls.Add(from);
        filter.Controls.Add(new Label { Text = "Bitiş", AutoSize = true, Padding = new Padding(12, 7, 4, 0) });
        filter.Controls.Add(to);
        filter.Controls.Add(B("Son 7 Gün", () => { from.Value = DateTime.Today.AddDays(-6); to.Value = DateTime.Today; RefreshView(); }));
        filter.Controls.Add(B("Bu Ay", () => { from.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1); to.Value = DateTime.Today; RefreshView(); }));
        filter.Controls.Add(B("Son 365 Gün", () => { from.Value = DateTime.Today.AddDays(-364); to.Value = DateTime.Today; RefreshView(); }));
        filter.Controls.Add(B("Kontrol Et", RefreshView));
        root.Controls.Add(filter, 0, 1);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(6, 8, 6, 0), WrapContents = false };
        actions.Controls.Add(B("Tarih Aralığını Temizle", DeleteRange, 170));
        actions.Controls.Add(B("Canlı Veriyi Komple Temizle", ClearAll, 190));
        summary.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        summary.Padding = new Padding(18, 8, 4, 0);
        actions.Controls.Add(summary);
        root.Controls.Add(actions, 0, 2);

        grid.Columns.Add("Durum", "Durum");
        grid.Columns.Add("Deger", "Değer");
        root.Controls.Add(grid, 0, 3);

        var bottom = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 8, 0, 0) };
        var close = B("Kapat", Close, 110);
        bottom.Controls.Add(close);
        bottom.Controls.Add(new Label
        {
            Text = "Temizleme yalnız CANLI ARŞİV'i etkiler; FDB ve ana TRYYYY.Tnf dosyasını silmez/değiştirmez.",
            AutoSize = true,
            Padding = new Padding(8, 8, 18, 0),
            ForeColor = Color.DarkGreen,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        });
        root.Controls.Add(bottom, 0, 4);
        Controls.Add(root);
    }

    static Button B(string text, Action action, int width = 110)
    {
        var b = new Button { Text = text, Width = width, Height = 32, Margin = new Padding(5, 0, 5, 0) };
        b.Click += (_, _) => action();
        return b;
    }

    void RefreshView()
    {
        var a = from.Value.Date;
        var b = to.Value.Date;
        var s = TerminalLiveArchiveService.GetStats(a, b);
        summary.Text = $"Kayıt {s.RecordCount:N0} • Personel {s.EmployeeCount:N0}";
        grid.Rows.Clear();
        grid.Rows.Add("Seçili tarih aralığı", $"{a:dd.MM.yyyy} - {b:dd.MM.yyyy}");
        grid.Rows.Add("Kart basım kaydı", s.RecordCount.ToString("N0"));
        grid.Rows.Add("Kart numarası görülen personel", s.EmployeeCount.ToString("N0"));
        grid.Rows.Add("İlk kayıt", s.FirstAt?.ToString("dd.MM.yyyy HH:mm") ?? "Yok");
        grid.Rows.Add("Son kayıt", s.LastAt?.ToString("dd.MM.yyyy HH:mm") ?? "Yok");
        grid.Rows.Add("Canlı TNF", s.TnfPath);
        grid.Rows.Add("Ham arşiv", s.RawFolder);
        grid.Rows.Add("Kaynak", "Yalnız fiziksel kart cihazı");
        grid.Rows.Add("Saklama standardı", "En az 365 gün / otomatik silme kapalı");
    }

    void DeleteRange()
    {
        var a = from.Value.Date;
        var b = to.Value.Date;
        if (MessageBox.Show($"CANLI ARŞİV içinden {a:dd.MM.yyyy} - {b:dd.MM.yyyy} tarih aralığı silinsin mi?\n\nAna TNF ve FDB etkilenmez.", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var removed = TerminalLiveArchiveService.DeleteRange(a, b);
        RefreshView();
        MessageBox.Show($"Canlı arşivden {removed:N0} kayıt temizlendi.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    void ClearAll()
    {
        if (MessageBox.Show("CANLI TNF + ham canlı arşivin TAMAMI temizlensin mi?\n\nAna TNF ve FDB etkilenmez.", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        if (MessageBox.Show("Bu işlem geri alınamaz. Canlı arşivin tamamını temizlemek istediğinize emin misiniz?", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var removed = TerminalLiveArchiveService.ClearAll();
        RefreshView();
        MessageBox.Show($"Canlı arşiv temizlendi. Silinen CANLI TNF kaydı: {removed:N0}", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }
}
