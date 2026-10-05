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
        BackgroundColor = PdksAppearance.Current.Surface
    };

    public LiveArchiveControlForm()
    {
        Text = "Canlı Veri Arşivi / Kontrol";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(980, 680);
        MinimumSize = new Size(860, 560);
        Font = new Font("Segoe UI", 9f);
        BackColor = PdksAppearance.Current.Canvas;
        from.Value = DateTime.Today.AddDays(-6);
        to.Value = DateTime.Today;
        Build();
        Shown += (_, _) => RefreshView();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 5, Padding = new Padding(14), BackColor=p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 74));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));

        var head = PdksUiKit.Card(14);
        head.Controls.Add(new Label
        {
            Text = "CANLI VERİ ARŞİVİ",
            AutoSize = true,
            Font = new Font("Segoe UI", 15f, FontStyle.Bold),
            Location = new Point(12, 7),
            ForeColor = p.Text
        });
        head.Controls.Add(new Label
        {
            Text = "CANLI çalışma arşivi. CİHAZ kanıt arşivi ayrıdır; CANLI temizlense bile tarih/saatli cihaz TNF ve HAM dosyaları korunur.",
            AutoSize = true,
            ForeColor = p.Muted,
            Location = new Point(14, 38)
        });
        root.Controls.Add(head, 0, 0);

        var filter = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(6, 10, 6, 0), WrapContents = false, BackColor=p.Canvas };
        filter.Controls.Add(new Label { Text = "Başlangıç", AutoSize = true, Padding = new Padding(0, 7, 4, 0) });
        filter.Controls.Add(from);
        filter.Controls.Add(new Label { Text = "Bitiş", AutoSize = true, Padding = new Padding(12, 7, 4, 0) });
        filter.Controls.Add(to);
        filter.Controls.Add(B("Son 7 Gün", () => { from.Value = DateTime.Today.AddDays(-6); to.Value = DateTime.Today; RefreshView(); }));
        filter.Controls.Add(B("Bu Ay", () => { from.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1); to.Value = DateTime.Today; RefreshView(); }));
        filter.Controls.Add(B("Son 365 Gün", () => { from.Value = DateTime.Today.AddDays(-364); to.Value = DateTime.Today; RefreshView(); }));
        filter.Controls.Add(B("Kontrol Et", RefreshView));
        root.Controls.Add(filter, 0, 1);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(6, 8, 6, 0), WrapContents = false, BackColor=p.Canvas };
        actions.Controls.Add(B("Tarih Aralığını Temizle", DeleteRange, 170));
        actions.Controls.Add(B("Canlı Veriyi Komple Temizle", ClearAll, 190));
        summary.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        summary.Padding = new Padding(18, 8, 4, 0);
        actions.Controls.Add(summary);
        root.Controls.Add(actions, 0, 2);

        grid.Columns.Add("Durum", "Durum");
        grid.Columns.Add("Deger", "Değer");
        root.Controls.Add(grid, 0, 3);

        var bottom = PdksUiKit.ActionBar(true,p.Canvas);
        var close = B("Kapat", Close, 110);
        bottom.Controls.Add(close);
        bottom.Controls.Add(new Label
        {
            Text = "Temizleme yalnız CANLI'yı etkiler; DATA/FDB, yıllık TRYYYY.Tnf ve CİHAZ kanıt arşivi korunur.",
            AutoSize = true,
            Padding = new Padding(8, 8, 18, 0),
            ForeColor = p.Success,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        });
        root.Controls.Add(bottom, 0, 4);
        Controls.Add(root);
    }

    static Button B(string text, Action action, int width = 110)
    {
        var role=text.Contains("Temizle",StringComparison.OrdinalIgnoreCase)
            ? PdksActionRole.Danger
            : text.Contains("Kontrol",StringComparison.OrdinalIgnoreCase)
                ? PdksActionRole.Primary
                : text.Contains("Kapat",StringComparison.OrdinalIgnoreCase)
                    ? PdksActionRole.Quiet
                    : PdksActionRole.Secondary;
        var b=PdksUiKit.Button(text,width,role,action);
        b.Height=32;b.MinimumSize=new Size(width,32);b.MaximumSize=new Size(width,32);
        b.Margin=new Padding(5,0,5,0);
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
        if (MessageBox.Show($"CANLI ARŞİV içinden {a:dd.MM.yyyy} - {b:dd.MM.yyyy} tarih aralığı silinsin mi?\n\nDATA/FDB, yıllık TNF ve CİHAZ arşivi etkilenmez.", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var removed = TerminalLiveArchiveService.DeleteRange(a, b);
        RefreshView();
        MessageBox.Show($"Canlı arşivden {removed:N0} kayıt temizlendi.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    void ClearAll()
    {
        if (MessageBox.Show("CANLI TNF + ham canlı arşivin TAMAMI temizlensin mi?\n\nDATA/FDB, yıllık TNF ve CİHAZ arşivi etkilenmez.", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        if (MessageBox.Show("Bu işlem geri alınamaz. Canlı arşivin tamamını temizlemek istediğinize emin misiniz?", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var removed = TerminalLiveArchiveService.ClearAll();
        RefreshView();
        MessageBox.Show($"Canlı arşiv temizlendi. Silinen CANLI TNF kaydı: {removed:N0}", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }
}
