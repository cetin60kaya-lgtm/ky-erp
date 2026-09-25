namespace HKN.Personel.Native;

public sealed class LoginForm : Form
{
    readonly TextBox userName = new() { Text = "ADMIN", Dock = DockStyle.Fill, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 11f) };
    readonly TextBox password = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 11f) };
    public LocalUser? AuthenticatedUser { get; private set; }

    public LoginForm()
    {
        Text = "KYERP PDKS • Güvenli Giriş";
        Width = 720; Height = 430; StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false;
        BackColor = Color.FromArgb(245, 248, 252);
        Font = new Font("Segoe UI", 9f);

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(22) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 58));

        var brand = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(18, 65, 125), Margin = new Padding(0) };
        brand.Controls.Add(new Label {
            Text = "KY ERP\n\nTek giriş.\nCanlı sistem.",
            Dock = DockStyle.Fill, Padding = new Padding(30, 42, 22, 20),
            Font = new Font("Segoe UI", 22f, FontStyle.Bold), ForeColor = Color.White
        });
        brand.Controls.Add(new Label {
            Text = "PDKS • Personel Devam Kontrol Sistemi",
            Dock = DockStyle.Bottom, Height = 48, Padding = new Padding(30, 0, 0, 16),
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold), ForeColor = Color.FromArgb(185, 215, 250)
        });

        var card = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 8, ColumnCount = 1, Padding = new Padding(36, 28, 36, 24), BackColor = Color.White };
        card.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        card.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        card.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        card.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        card.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        card.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        card.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        card.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        card.Controls.Add(new Label { Text = "Kurumsal Giriş", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 19f, FontStyle.Bold), ForeColor = Color.FromArgb(24, 42, 68) }, 0, 0);
        card.Controls.Add(new Label { Text = "KY PDKS kullanıcı adınız ve şifrenizle giriş yapın.", Dock = DockStyle.Fill, ForeColor = Color.FromArgb(92, 105, 125), Font = new Font("Segoe UI", 9.5f) }, 0, 1);
        card.Controls.Add(new Label { Text = "Kullanıcı adı", Dock = DockStyle.Fill, TextAlign = ContentAlignment.BottomLeft, ForeColor = Color.FromArgb(55, 70, 92) }, 0, 2);
        card.Controls.Add(userName, 0, 3);
        card.Controls.Add(new Label { Text = "Şifre", Dock = DockStyle.Fill, TextAlign = ContentAlignment.BottomLeft, ForeColor = Color.FromArgb(55, 70, 92) }, 0, 4);
        card.Controls.Add(password, 0, 5);

        var login = new Button {
            Text = "Giriş Yap", Dock = DockStyle.Fill, FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(36, 107, 230), ForeColor = Color.White,
            Font = new Font("Segoe UI", 10.5f, FontStyle.Bold), Cursor = Cursors.Hand
        };
        login.FlatAppearance.BorderSize = 0;
        login.Click += (_, _) => TryLogin();
        card.Controls.Add(login, 0, 6);

        var note = new Label {
            Text = "●  Veritabanı bağlantısı otomatik hazırlanır. Kullanıcıdan teknik veritabanı parolası istenmez.",
            Dock = DockStyle.Fill, ForeColor = Color.FromArgb(35, 145, 88), Font = new Font("Segoe UI", 8.5f)
        };
        card.Controls.Add(note, 0, 7);

        root.Controls.Add(brand, 0, 0);
        root.Controls.Add(card, 1, 0);
        Controls.Add(root);
        AcceptButton = login;
        Shown += (_, _) => password.Focus();
    }

    void TryLogin()
    {
        if (LocalAuthStore.Validate(userName.Text, password.Text, out var user) && user is not null)
        {
            AuthenticatedUser = user;
            DialogResult = DialogResult.OK;
            Close();
            return;
        }

        MessageBox.Show("Kullanıcı adı veya şifre hatalı.", "KYERP PDKS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        password.SelectAll();
        password.Focus();
    }
}
