using System.Drawing.Drawing2D;

namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    Panel? modernShell;
    Panel? modernSidebar;
    Label? modernPageTitle;
    Label? modernPageHint;
    Label? modernDbState;
    Label? modernClock;
    System.Windows.Forms.Timer? modernClockTimer;
    Button? activeNavButton;

    static readonly Color ShellNavy = Color.FromArgb(17, 28, 49);
    static readonly Color ShellNavy2 = Color.FromArgb(25, 39, 66);
    static readonly Color ShellCanvas = Color.FromArgb(245, 247, 250);
    static readonly Color ShellText = Color.FromArgb(26, 38, 58);
    static readonly Color ShellMuted = Color.FromArgb(103, 116, 137);
    static readonly Color ShellPrimary = Color.FromArgb(37, 99, 235);
    static readonly Color ShellBorder = Color.FromArgb(226, 232, 240);

    void BuildModernShell()
    {
        if (modernShell is not null) return;

        MainMenuStrip!.Visible = false;
        tool.Visible = false;
        status.Visible = false;

        modernShell = new Panel { Dock = DockStyle.Fill, BackColor = ShellCanvas };
        modernSidebar = BuildModernSidebar();

        var main = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            BackColor = ShellCanvas,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
        main.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));

        main.Controls.Add(BuildModernTopbar(), 0, 0);

        var content = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = ShellCanvas,
            Padding = new Padding(18, 12, 18, 14),
            Margin = Padding.Empty
        };
        if (workspace.Parent is not null) workspace.Parent.Controls.Remove(workspace);
        workspace.Dock = DockStyle.Fill;
        content.Controls.Add(workspace);
        main.Controls.Add(content, 0, 1);
        main.Controls.Add(BuildModernFooter(), 0, 2);

        modernShell.Controls.Add(main);
        modernShell.Controls.Add(modernSidebar);

        Controls.Add(modernShell);
        modernShell.BringToFront();
        SetModernPage("Genel Bakış", "Günün personel hareketleri ve hızlı işlemler");
    }

    Panel BuildModernSidebar()
    {
        var sidebar = new Panel
        {
            Dock = DockStyle.Left,
            Width = 238,
            BackColor = ShellNavy,
            Padding = new Padding(12, 12, 12, 12)
        };

        var brand = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 74,
            ColumnCount = 2,
            BackColor = ShellNavy,
            Padding = new Padding(4, 3, 0, 8)
        };
        brand.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 50));
        brand.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var badge = new RoundedLabel
        {
            Text = "KY",
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 4, 8, 4),
            BackColor = ShellPrimary,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleCenter,
            Radius = 12
        };
        var brandText = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, BackColor = ShellNavy };
        brandText.RowStyles.Add(new RowStyle(SizeType.Percent, 58));
        brandText.RowStyles.Add(new RowStyle(SizeType.Percent, 42));
        brandText.Controls.Add(new Label
        {
            Text = "KY PDKS",
            Dock = DockStyle.Fill,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 12.5f, FontStyle.Bold),
            TextAlign = ContentAlignment.BottomLeft
        },0,0);
        brandText.Controls.Add(new Label
        {
            Text = "Personel Yönetimi",
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(155, 171, 196),
            Font = new Font("Segoe UI", 8.5f),
            TextAlign = ContentAlignment.TopLeft
        },0,1);
        brand.Controls.Add(badge,0,0);
        brand.Controls.Add(brandText,1,0);
        sidebar.Controls.Add(brand);

        var nav = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            BackColor = ShellNavy,
            Padding = new Padding(0, 10, 0, 0)
        };
        nav.SizeChanged += (_,_) =>
        {
            foreach (Control child in nav.Controls)
                if (child is Panel or Button) child.Width = Math.Max(160, nav.ClientSize.Width - 4);
        };

        nav.Controls.Add(NavButton("Genel Bakış", PdksToolbarIcon.Home, () => { ShowHome(); SetModernPage("Genel Bakış","Günün personel hareketleri ve hızlı işlemler"); }, true));
        nav.Controls.Add(NavSection("OPERASYON", PdksToolbarIcon.Live,
            ("Canlı Personel", (Action)(() => { OpenLiveAttendance(); SetModernPage("Canlı Personel","Anlık giriş, çıkış ve eksik kayıt denetimi"); })),
            ("Giriş / Çıkış", (Action)(() => { OpenLegacyGirisCikis(); SetModernPage("Giriş / Çıkış","Kart hareketlerini görüntüle ve düzenle"); })),
            ("Terminal", (Action)(() => { OpenTerminalCenter(); SetModernPage("Terminal Merkezi","Cihaz bağlantısı ve veri aktarımı"); })),
            ("Eksik / Hatalı Kayıtlar", (Action)(() => { ShowModule(new AttendanceHistoryForm(), PdksModule.GunlukOperasyon); SetModernPage("Kayıt Kontrolü","Eksik ve hatalı hareketlerin incelemesi"); }))
        ));
        nav.Controls.Add(NavSection("PERSONEL", PdksToolbarIcon.Personnel,
            ("Personel Kartları", (Action)(() => { OpenPersonel(); SetModernPage("Personel","Personel kartları ve özlük bilgileri"); })),
            ("İzinler", (Action)(() => { OpenLegacyIzin(); SetModernPage("İzinler","Personel izin kayıtları"); })),
            ("Kazanç / Kesinti / Avans", (Action)(() => { OpenLegacyKazancKesinti(); SetModernPage("Kazanç / Kesinti","Ek kazanç, kesinti ve avans işlemleri"); })),
            ("Ödeme Geçmişi", (Action)(() => { OpenPersonelTab(PdksModule.Bordro); SetModernPage("Personel Ödemeleri","Maaş ve ödeme geçmişi"); }))
        ));
        nav.Controls.Add(NavSection("PUANTAJ", PdksToolbarIcon.Timesheet,
            ("Günlük Puantaj", (Action)(() => { OpenPuantaj(0); SetModernPage("Günlük Puantaj","Gün bazında çalışma sonuçları"); })),
            ("Aylık Puantaj", (Action)(() => { OpenPuantaj(1); SetModernPage("Aylık Puantaj","Ay bazında çalışma ve eksik süre özeti"); })),
            ("Puantaj Sonuçları", (Action)(() => { OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj); SetModernPage("Puantaj Sonuçları","Hesaplanan puantaj sonuçları"); }))
        ));
        nav.Controls.Add(NavSection("BORDRO", PdksToolbarIcon.Payroll,
            ("Genel Bordro", (Action)(() => { OpenBordro(0); SetModernPage("Genel Bordro","Hakediş, resmî bordro ve banka tutarları"); })),
            ("Maaş Bordrosu", (Action)(() => { OpenBordro(2); SetModernPage("Maaş Bordrosu","Personel maaş bordrosu"); })),
            ("Mesai Bordrosu", (Action)(() => { OpenBordro(1); SetModernPage("Mesai Bordrosu","Fazla çalışma bordrosu"); })),
            ("Aylık Düzeltme", (Action)(() => { ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro); SetModernPage("Aylık Düzeltme","Hakediş ve resmî bordro kontrolü"); }))
        ));
        nav.Controls.Add(NavSection("RAPORLAR", PdksToolbarIcon.Results,
            ("Rapor Merkezi", (Action)(() => { OpenReportCenter(null); SetModernPage("Rapor Merkezi","Personel, puantaj ve bordro raporları"); })),
            ("Personel Raporu", (Action)(() => { OpenOperationalReport(LegacyOperationalReport.PersonnelList); SetModernPage("Personel Raporu","Personel listeleri ve çıktılar"); })),
            ("Bordro Raporları", (Action)(() => { OpenReportCenter("Bordro"); SetModernPage("Bordro Raporları","Bordro ve ödeme çıktıları"); }))
        ));
        nav.Controls.Add(NavSection("YÖNETİM", PdksToolbarIcon.Departments,
            ("Tanımlar", (Action)(() => { OpenDefinitions("Bölümler"); SetModernPage("Tanımlar","Organizasyon ve personel tanımları"); })),
            ("Dönemler", (Action)(() => { OpenDialogModule(PdksModule.Donemler); SetModernPage("Dönemler","Puantaj ve bordro dönemleri"); })),
            ("Entegrasyonlar", (Action)(() => new IntegrationCenterForm(this, currentUser).ShowDialog(this))),
            ("Sistem / Yetki", (Action)(() => { if (currentUser.IsAdmin) OpenUserManagement(); else MessageBox.Show("Bu işlem için yönetici yetkisi gerekir.","KY PDKS"); }))
        ));

        sidebar.Controls.Add(nav);

        var footer = new Label
        {
            Dock = DockStyle.Bottom,
            Height = 34,
            Text = "6.4  •  Hakan Emprime",
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = Color.FromArgb(119, 137, 166),
            Font = new Font("Segoe UI", 8f),
            Padding = new Padding(8,0,0,0)
        };
        sidebar.Controls.Add(footer);
        return sidebar;
    }

    Button NavButton(string text, PdksToolbarIcon icon, Action action, bool selected = false)
    {
        var button = new Button
        {
            Text = "   " + text,
            Image = PdksToolbarIcons.Create(icon),
            ImageAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText,
            Height = 48,
            Width = 205,
            FlatStyle = FlatStyle.Flat,
            BackColor = selected ? ShellNavy2 : ShellNavy,
            ForeColor = selected ? Color.White : Color.FromArgb(198, 210, 229),
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft,
            Cursor = Cursors.Hand,
            Margin = new Padding(0, 0, 0, 4),
            Padding = new Padding(12,0,8,0)
        };
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = ShellNavy2;
        button.FlatAppearance.MouseDownBackColor = Color.FromArgb(31, 49, 82);
        button.Click += (_,_) =>
        {
            if (activeNavButton is not null && !activeNavButton.IsDisposed)
            {
                activeNavButton.BackColor = ShellNavy;
                activeNavButton.ForeColor = Color.FromArgb(198, 210, 229);
            }
            activeNavButton = button;
            button.BackColor = ShellNavy2;
            button.ForeColor = Color.White;
            action();
        };
        if (selected) activeNavButton = button;
        return button;
    }

    Panel NavSection(string title, PdksToolbarIcon icon, params (string Text, Action Action)[] children)
    {
        var panel = new Panel
        {
            Width = 205,
            Height = 46,
            BackColor = ShellNavy,
            Margin = new Padding(0, 0, 0, 4)
        };
        var header = new Button
        {
            Dock = DockStyle.Top,
            Height = 46,
            Text = "   " + title + "                                      ▾",
            Image = PdksToolbarIcons.Create(icon),
            ImageAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText,
            TextAlign = ContentAlignment.MiddleLeft,
            FlatStyle = FlatStyle.Flat,
            BackColor = ShellNavy,
            ForeColor = Color.FromArgb(198, 210, 229),
            Font = new Font("Segoe UI", 9.2f, FontStyle.Bold),
            Padding = new Padding(12,0,8,0),
            Cursor = Cursors.Hand
        };
        header.FlatAppearance.BorderSize = 0;
        header.FlatAppearance.MouseOverBackColor = ShellNavy2;

        var body = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = children.Length * 36 + 6,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.FromArgb(14, 24, 43),
            Padding = new Padding(8, 4, 0, 2),
            Visible = false
        };
        foreach (var item in children)
        {
            var child = new Button
            {
                Text = item.Text,
                Width = 184,
                Height = 32,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(14, 24, 43),
                ForeColor = Color.FromArgb(174, 190, 214),
                Font = new Font("Segoe UI", 8.8f),
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(28,0,4,0),
                Cursor = Cursors.Hand,
                Margin = new Padding(0)
            };
            child.FlatAppearance.BorderSize = 0;
            child.FlatAppearance.MouseOverBackColor = ShellNavy2;
            child.Click += (_,_) => item.Action();
            body.Controls.Add(child);
        }

        header.Click += (_,_) =>
        {
            body.Visible = !body.Visible;
            panel.Height = body.Visible ? 46 + body.Height : 46;
            header.Text = "   " + title + (body.Visible ? "                                      ▴" : "                                      ▾");
        };

        panel.Controls.Add(body);
        panel.Controls.Add(header);
        body.Top = header.Bottom;
        return panel;
    }

    Control BuildModernTopbar()
    {
        var bar = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(22, 8, 22, 8) };
        bar.Paint += (_,e) =>
        {
            using var pen = new Pen(ShellBorder);
            e.Graphics.DrawLine(pen,0,bar.Height-1,bar.Width,bar.Height-1);
        };

        var left = new TableLayoutPanel { Dock = DockStyle.Left, Width = 720, RowCount = 2, BackColor = Color.White };
        left.RowStyles.Add(new RowStyle(SizeType.Percent,60));
        left.RowStyles.Add(new RowStyle(SizeType.Percent,40));
        modernPageTitle = new Label
        {
            Dock = DockStyle.Fill, Text = "Genel Bakış", TextAlign = ContentAlignment.BottomLeft,
            Font = new Font("Segoe UI", 15f, FontStyle.Bold), ForeColor = ShellText
        };
        modernPageHint = new Label
        {
            Dock = DockStyle.Fill, Text = "Günün personel hareketleri ve hızlı işlemler", TextAlign = ContentAlignment.TopLeft,
            Font = new Font("Segoe UI", 8.7f), ForeColor = ShellMuted
        };
        left.Controls.Add(modernPageTitle,0,0); left.Controls.Add(modernPageHint,0,1);

        var right = new FlowLayoutPanel
        {
            Dock = DockStyle.Right, Width = 540, FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false, BackColor = Color.White, Padding = new Padding(0, 10, 0, 0)
        };
        var user = new Label
        {
            AutoSize = false, Width = 176, Height = 36,
            Text = currentUser.UserName,
            TextAlign = ContentAlignment.MiddleCenter,
            BackColor = Color.FromArgb(244, 247, 251),
            ForeColor = ShellText,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Margin = new Padding(10,0,0,0)
        };
        modernClock = new Label
        {
            AutoSize = false, Width = 120, Height = 36,
            Text = DateTime.Now.ToString("HH:mm"),
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = ShellMuted,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        };
        var live = new Label
        {
            AutoSize = false, Width = 118, Height = 36,
            Text = "●  SİSTEM AKTİF",
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Color.FromArgb(22, 163, 74),
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold)
        };
        right.Controls.Add(user); right.Controls.Add(modernClock); right.Controls.Add(live);

        bar.Controls.Add(right);
        bar.Controls.Add(left);

        modernClockTimer = new System.Windows.Forms.Timer { Interval = 15000 };
        modernClockTimer.Tick += (_,_) => { if (modernClock is not null) modernClock.Text = DateTime.Now.ToString("HH:mm"); };
        modernClockTimer.Start();
        Disposed += (_,_) => modernClockTimer?.Stop();

        return bar;
    }

    Control BuildModernFooter()
    {
        var bar = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(20,0,20,0) };
        modernDbState = new Label
        {
            Dock = DockStyle.Left,
            Width = 700,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = ShellMuted,
            Font = new Font("Segoe UI", 8f)
        };
        var version = new Label
        {
            Dock = DockStyle.Right,
            Width = 190,
            Text = "KY PDKS 6.4",
            TextAlign = ContentAlignment.MiddleRight,
            ForeColor = ShellMuted,
            Font = new Font("Segoe UI", 8f)
        };
        bar.Controls.Add(version); bar.Controls.Add(modernDbState);
        RefreshModernDbState();
        return bar;
    }

    void SetModernPage(string title, string hint)
    {
        if (modernPageTitle is not null) modernPageTitle.Text = title;
        if (modernPageHint is not null) modernPageHint.Text = hint;
        RefreshModernDbState();
    }

    void RefreshModernDbState()
    {
        if (modernDbState is null) return;
        var path = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User)
            ?? Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH");
        modernDbState.Text = StartupConfiguration.IsReady()
            ? "●  Veritabanı bağlı   •   " + (Path.GetFileName(path) ?? "KY_PDKS_DATA.FDB")
            : "●  Veritabanı bağlantısı bekleniyor";
        modernDbState.ForeColor = StartupConfiguration.IsReady() ? Color.FromArgb(22, 163, 74) : Color.FromArgb(202, 118, 35);
    }

    sealed class RoundedLabel : Label
    {
        public int Radius { get; set; } = 10;
        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            using var path = RoundedRect(ClientRectangle, Radius);
            Region = new Region(path);
        }
        static GraphicsPath RoundedRect(Rectangle rect, int radius)
        {
            var d = Math.Max(2, radius * 2);
            var r = new Rectangle(rect.X,rect.Y,Math.Max(1,rect.Width-1),Math.Max(1,rect.Height-1));
            var p = new GraphicsPath();
            p.AddArc(r.Left,r.Top,d,d,180,90);
            p.AddArc(r.Right-d,r.Top,d,d,270,90);
            p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);
            p.AddArc(r.Left,r.Bottom-d,d,d,90,90);
            p.CloseFigure();
            return p;
        }
    }
}
