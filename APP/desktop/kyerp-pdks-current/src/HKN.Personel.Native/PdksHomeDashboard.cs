using System.Diagnostics;
using System.Drawing.Drawing2D;

namespace HKN.Personel.Native;

internal sealed class PdksHomeDashboard : UserControl
{
    readonly Label liveStatus = new();
    readonly Label clock = new();
    readonly System.Windows.Forms.Timer timer = new() { Interval = 1000 };
    readonly System.Windows.Forms.Timer deviceTimer = new() { Interval = 10000 };
    bool deviceBusy;

    public PdksHomeDashboard(
        Action liveAttendance, Action terminalTransfer, Action entryExit, Action timesheet,
        Action results, Action personnel, Action reports)
    {
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(249, 251, 254);
        Font = new Font("Segoe UI", 9f);
        DoubleBuffered = true;

        var stage = new WavePanel { Dock = DockStyle.Fill };
        var layout = new TableLayoutPanel {
            Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5,
            BackColor = Color.Transparent, Padding = new Padding(24, 18, 24, 18)
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 34));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 185));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 235));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 66));

        layout.Controls.Add(TopStatus(), 0, 0);
        layout.Controls.Add(new Panel { Dock = DockStyle.Fill, BackColor = Color.Transparent }, 0, 1);
        layout.Controls.Add(Brand(), 0, 2);
        layout.Controls.Add(Cards(liveAttendance, personnel, timesheet, reports), 0, 3);

        stage.Controls.Add(layout);
        Controls.Add(stage);

        timer.Tick += (_, _) => clock.Text = DateTime.Now.ToString("HH:mm:ss");
        deviceTimer.Tick += async (_, _) => await UpdateDeviceAsync();
        timer.Start(); deviceTimer.Start();
        clock.Text = DateTime.Now.ToString("HH:mm:ss");
        _ = UpdateDeviceAsync();
        Disposed += (_, _) => { timer.Stop(); deviceTimer.Stop(); };
    }

    Control TopStatus()
    {
        var row = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, BackColor = Color.Transparent };
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 235));
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100));

        liveStatus.Text = "●  CANLI";
        liveStatus.Dock = DockStyle.Fill;
        liveStatus.TextAlign = ContentAlignment.MiddleRight;
        liveStatus.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        liveStatus.ForeColor = Color.FromArgb(24, 145, 84);

        clock.Dock = DockStyle.Fill;
        clock.TextAlign = ContentAlignment.MiddleRight;
        clock.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
        clock.ForeColor = Color.FromArgb(62, 78, 101);

        row.Controls.Add(liveStatus, 1, 0);
        row.Controls.Add(clock, 2, 0);
        return row;
    }

    Control Brand()
    {
        var box = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, ColumnCount = 1, BackColor = Color.Transparent };
        box.RowStyles.Add(new RowStyle(SizeType.Absolute, 78));
        box.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        box.RowStyles.Add(new RowStyle(SizeType.Absolute, 20));
        box.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var logo = new FlowLayoutPanel {
            Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false,
            BackColor = Color.Transparent, AutoSize = false
        };
        var ky = LogoLink("KY", Color.FromArgb(24, 111, 205));
        var erp = LogoLink("ERP", Color.FromArgb(34, 38, 45));
        logo.Controls.Add(ky); logo.Controls.Add(erp);
        logo.Resize += (_, _) =>
        {
            var total = ky.PreferredSize.Width + erp.PreferredSize.Width + 4;
            logo.Padding = new Padding(Math.Max(0, (logo.ClientSize.Width - total) / 2), 0, 0, 0);
        };
        box.Controls.Add(logo, 0, 0);

        var pdks = new LinkLabel {
            Text = "P  D  K  S", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 24f, FontStyle.Bold), LinkBehavior = LinkBehavior.NeverUnderline,
            LinkColor = Color.FromArgb(88, 92, 100), ActiveLinkColor = Color.FromArgb(24, 111, 205),
            Cursor = Cursors.Hand
        };
        pdks.LinkClicked += (_, _) => OpenErp();
        box.Controls.Add(pdks, 0, 1);

        var accent = new Panel { Width = 58, Height = 3, BackColor = Color.FromArgb(39, 126, 235), Anchor = AnchorStyles.None, Margin = new Padding(0, 8, 0, 7) };
        box.Controls.Add(accent, 0, 2);

        var subtitle = new LinkLabel {
            Text = "Personel Devam Kontrol Sistemi  ↗", Dock = DockStyle.Fill, TextAlign = ContentAlignment.TopCenter,
            Font = new Font("Segoe UI", 10.5f), LinkBehavior = LinkBehavior.NeverUnderline,
            LinkColor = Color.FromArgb(42, 64, 91), ActiveLinkColor = Color.FromArgb(24, 111, 205), Cursor = Cursors.Hand
        };
        subtitle.LinkClicked += (_, _) => OpenErp();
        box.Controls.Add(subtitle, 0, 3);
        return box;
    }    LinkLabel LogoLink(string text, Color color)
    {
        var link = new LinkLabel {
            Text = text, AutoSize = true, Font = new Font("Segoe UI", 44f, FontStyle.Bold),
            LinkBehavior = LinkBehavior.NeverUnderline, LinkColor = color, ActiveLinkColor = Color.FromArgb(12, 82, 170),
            Cursor = Cursors.Hand, Margin = Padding.Empty
        };
        link.LinkClicked += (_, _) => OpenErp();
        return link;
    }

    Control Cards(Action liveAttendance, Action personnel, Action timesheet, Action reports)
    {
        var host = new TableLayoutPanel {
            Dock = DockStyle.Fill, ColumnCount = 6, RowCount = 1, BackColor = Color.Transparent,
            Padding = new Padding(0, 8, 0, 10)
        };
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 15));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 17.5f));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 17.5f));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 17.5f));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 17.5f));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 15));

        host.Controls.Add(new HomeCard(
            "Canlı Denetim", "Günlük giriş-çıkışları\nanlık takip edin.",
            PdksToolbarIcons.Create(PdksToolbarIcon.Live), Color.FromArgb(235, 245, 255), Color.FromArgb(31, 119, 222), liveAttendance), 1, 0);
        host.Controls.Add(new HomeCard(
            "Personel Bilgileri", "Personel kartlarını\nyönetin.",
            PdksToolbarIcons.Create(PdksToolbarIcon.Personnel), Color.FromArgb(237, 250, 241), Color.FromArgb(24, 157, 75), personnel), 2, 0);
        host.Controls.Add(new HomeCard(
            "Puantaj", "Aylık puantaj hesaplarını\ngörüntüleyin.",
            PdksToolbarIcons.Create(PdksToolbarIcon.Timesheet), Color.FromArgb(255, 247, 231), Color.FromArgb(226, 139, 28), timesheet), 3, 0);
        host.Controls.Add(new HomeCard(
            "Raporlar", "Detaylı raporları\noluşturun.",
            PdksToolbarIcons.Create(PdksToolbarIcon.Results), Color.FromArgb(246, 239, 255), Color.FromArgb(116, 82, 211), reports), 4, 0);
        return host;
    }

    async Task UpdateDeviceAsync()
    {
        if (deviceBusy || IsDisposed) return;
        deviceBusy = true;
        try
        {
            var s = await TerminalDeviceClient.ReadAsync(false);
            if (IsDisposed) return;
            liveStatus.Text = s.Connected
                ? $"●  CANLI   •   Kart cihazı bağlı   •   Yeni kayıt {Math.Max(0, s.NewLogCount)}"
                : "●  CANLI   •   Kart cihazı bekleniyor";
            liveStatus.ForeColor = s.Connected ? Color.FromArgb(24, 145, 84) : Color.FromArgb(202, 118, 35);
        }
        catch
        {
            if (!IsDisposed)
            {
                liveStatus.Text = "●  CANLI   •   Kart cihazı bekleniyor";
                liveStatus.ForeColor = Color.FromArgb(202, 118, 35);
            }
        }
        finally { deviceBusy = false; }
    }

    static void OpenErp()
    {
        try { Process.Start(new ProcessStartInfo("https://kyerp.net") { UseShellExecute = true }); }
        catch { }
    }
    sealed class HomeCard : Panel
    {
        readonly Color normal;
        readonly Color hover;

        public HomeCard(string title, string description, Image icon, Color back, Color accent, Action action)
        {
            normal = back;
            hover = ControlPaint.Light(back, .22f);
            Dock = DockStyle.Fill;
            Margin = new Padding(7, 0, 7, 0);
            BackColor = normal;
            Cursor = Cursors.Hand;
            Padding = new Padding(18, 18, 18, 12);

            var grid = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, ColumnCount = 1, BackColor = Color.Transparent };
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 68));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
            grid.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 4));

            var pic = new PictureBox { Image = icon, SizeMode = PictureBoxSizeMode.CenterImage, Dock = DockStyle.Fill, BackColor = Color.Transparent };
            var t = new Label { Text = title, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Segoe UI", 12f, FontStyle.Bold), ForeColor = Color.FromArgb(23, 47, 78), BackColor = Color.Transparent };
            var d = new Label { Text = description, Dock = DockStyle.Fill, TextAlign = ContentAlignment.TopCenter, Font = new Font("Segoe UI", 9.5f), ForeColor = Color.FromArgb(79, 96, 119), BackColor = Color.Transparent };
            var line = new Panel { Dock = DockStyle.Fill, BackColor = accent, Margin = new Padding(36, 0, 36, 0) };
            grid.Controls.Add(pic, 0, 0); grid.Controls.Add(t, 0, 1); grid.Controls.Add(d, 0, 2); grid.Controls.Add(line, 0, 3);
            Controls.Add(grid);

            void ClickAll(object? _, EventArgs __) => action();
            Click += ClickAll; grid.Click += ClickAll; pic.Click += ClickAll; t.Click += ClickAll; d.Click += ClickAll;
            foreach (Control c in new Control[] { this, grid, pic, t, d })
            {
                c.MouseEnter += (_, _) => BackColor = hover;
                c.MouseLeave += (_, _) => BackColor = normal;
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            using var pen = new Pen(Color.FromArgb(220, 229, 240));
            e.Graphics.DrawRectangle(pen, 0, 0, Math.Max(0, Width - 1), Math.Max(0, Height - 1));
        }
    }

    sealed class WavePanel : Panel
    {
        public WavePanel()
        {
            BackColor = Color.FromArgb(251, 253, 255);
            DoubleBuffered = true;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

            using var watermark = new SolidBrush(Color.FromArgb(16, 42, 104, 180));
            using var font = new Font("Segoe UI", Math.Max(110, Width / 8f), FontStyle.Bold);
            var size = e.Graphics.MeasureString("KY", font);
            e.Graphics.DrawString("KY", font, watermark, Width - size.Width - 35, Math.Max(90, Height * .20f));

            DrawWave(e.Graphics, Height * .66f, Color.FromArgb(34, 214, 232, 250), 0.15f);
            DrawWave(e.Graphics, Height * .73f, Color.FromArgb(44, 198, 220, 247), 0.22f);
            DrawWave(e.Graphics, Height * .82f, Color.FromArgb(54, 182, 210, 244), 0.30f);
        }

        void DrawWave(Graphics g, float y, Color color, float bend)
        {
            using var path = new GraphicsPath();
            path.StartFigure();
            path.AddBezier(-40, y, Width * .22f, y - Height * bend, Width * .56f, y + Height * bend, Width + 40, y - Height * bend * .25f);
            path.AddLine(Width + 40, y - Height * bend * .25f, Width + 40, Height + 40);
            path.AddLine(Width + 40, Height + 40, -40, Height + 40);
            path.CloseFigure();
            using var brush = new SolidBrush(color);
            g.FillPath(brush, path);
        }
    }
}
