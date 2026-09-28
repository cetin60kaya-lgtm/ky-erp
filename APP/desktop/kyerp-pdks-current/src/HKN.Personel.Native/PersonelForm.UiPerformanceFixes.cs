using System.Reflection;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    bool modernTabLayoutApplied;

    void ApplyModernTabLayoutAndPerformance()
    {
        if (modernTabLayoutApplied) return;
        modernTabLayoutApplied = true;

        BeginInvoke(new Action(() =>
        {
            try
            {
                ReplacePeriodHeader("Giriş ve Çıkışları", periodG, gFrom, gTo);
                ReplacePeriodHeader("İzinler", periodI, iFrom, iTo);
                ReplacePeriodHeader("Ek Kazanç Ve Kesintiler", periodE, eFrom, eTo);
                ReplacePaymentHeader();
                EnableSmoothGrid(list);
                EnableSmoothGrid(gGiris);
                EnableSmoothGrid(gIzin);
                EnableSmoothGrid(gEkk);
                EnableSmoothGrid(gBilgi);
                EnableSmoothGrid(gOdeme);
            }
            catch
            {
                // Görsel iyileştirme ana işleyişi engellememeli.
            }
        }));
    }

    void ReplacePeriodHeader(string tabTitle, ComboBox periodBox, DateTimePicker from, DateTimePicker to)
    {
        var page = tabs.TabPages.Cast<TabPage>()
            .FirstOrDefault(x => x.Text.Equals(tabTitle, StringComparison.OrdinalIgnoreCase));
        if (page?.Controls.OfType<TableLayoutPanel>().FirstOrDefault() is not TableLayoutPanel layout) return;
        if (layout.RowStyles.Count < 1) return;

        var old = layout.GetControlFromPosition(0, 0);
        if (old is not null) layout.Controls.Remove(old);
        layout.RowStyles[0].SizeType = SizeType.Absolute;
        layout.RowStyles[0].Height = 78;

        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 7,
            RowCount = 2,
            BackColor = Color.White,
            Padding = new Padding(12, 8, 12, 7),
            Margin = Padding.Empty
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 86));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 230));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 28));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 28));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        header.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        header.RowStyles.Add(new RowStyle(SizeType.Percent, 50));

        header.Controls.Add(HeaderLabel("Dönem"), 0, 0);
        periodBox.Dock = DockStyle.Fill;
        periodBox.Margin = new Padding(0, 1, 8, 2);
        periodBox.FlatStyle = FlatStyle.Flat;
        header.Controls.Add(periodBox, 1, 0);

        var show = ModernHeaderButton("Seçili Dönemi Göster", 160);
        show.Dock = DockStyle.Right;
        show.Click += (_, _) => RefreshFullTabs();
        header.Controls.Add(show, 6, 0);
        header.SetRowSpan(show, 2);

        header.Controls.Add(HeaderLabel("Tarih Aralığı"), 0, 1);
        from.Dock = DockStyle.Fill;
        from.Margin = new Padding(0, 1, 0, 1);
        to.Dock = DockStyle.Fill;
        to.Margin = new Padding(0, 1, 0, 1);
        header.Controls.Add(from, 1, 1);
        header.Controls.Add(new Label { Text = "—", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.FromArgb(90, 105, 125) }, 2, 1);
        header.Controls.Add(to, 3, 1);
        header.SetColumnSpan(to, 2);

        layout.Controls.Add(header, 0, 0);
        old?.Dispose();
    }

    void ReplacePaymentHeader()
    {
        var page = tabs.TabPages.Cast<TabPage>()
            .FirstOrDefault(x => x.Text.Equals("Ödemeler", StringComparison.OrdinalIgnoreCase));
        if (page?.Controls.OfType<TableLayoutPanel>().FirstOrDefault() is not TableLayoutPanel layout) return;
        if (layout.RowStyles.Count < 1) return;

        var old = layout.GetControlFromPosition(0, 0);
        if (old is not null) layout.Controls.Remove(old);
        layout.RowStyles[0].SizeType = SizeType.Absolute;
        layout.RowStyles[0].Height = 62;

        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            RowCount = 1,
            BackColor = Color.White,
            Padding = new Padding(14, 11, 14, 10),
            Margin = Padding.Empty
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 70));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 260));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 112));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        header.Controls.Add(HeaderLabel("Dönem"), 0, 0);
        periodO.Dock = DockStyle.Fill;
        periodO.Margin = new Padding(0, 1, 12, 1);
        periodO.FlatStyle = FlatStyle.Flat;
        header.Controls.Add(periodO, 1, 0);

        var refresh = ModernHeaderButton("Yenile", 96);
        refresh.Dock = DockStyle.Fill;
        refresh.Margin = new Padding(0, 0, 8, 0);
        refresh.Click += (_, _) => RefreshFullTabs();
        header.Controls.Add(refresh, 2, 0);

        layout.Controls.Add(header, 0, 0);
        old?.Dispose();
    }

    static Label HeaderLabel(string text) => new()
    {
        Text = text,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        ForeColor = Color.FromArgb(48, 69, 96),
        Margin = Padding.Empty
    };

    static Button ModernHeaderButton(string text, int width)
    {
        var button = new Button
        {
            Text = text,
            Width = width,
            Height = 34,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(31, 111, 235),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        button.FlatAppearance.BorderSize = 0;
        return button;
    }

    static void EnableSmoothGrid(DataGridView grid)
    {
        typeof(DataGridView)
            .GetProperty("DoubleBuffered", BindingFlags.Instance | BindingFlags.NonPublic)?
            .SetValue(grid, true);
        grid.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None;
        grid.RowTemplate.Height = Math.Max(20, grid.RowTemplate.Height);
    }
}
