namespace HKN.Personel.Native;

public sealed class LoginForm : Form
{
    readonly TextBox userName = new() { Text = "ADMIN", Dock = DockStyle.Fill };
    readonly TextBox password = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
    public LocalUser? AuthenticatedUser { get; private set; }

    public LoginForm()
    {
        Text = "KYERP PDKS - Giriş";
        Width = 440; Height = 260; StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 5, Padding = new Padding(26) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,120)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var title = new Label { Text = "KYERP PDKS", Font = new Font("Segoe UI", 18, FontStyle.Bold), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        root.Controls.Add(title, 0, 0); root.SetColumnSpan(title, 2);
        root.Controls.Add(new Label { Text = "Kullanıcı Adı", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, 1); root.Controls.Add(userName, 1, 1);
        root.Controls.Add(new Label { Text = "Şifre", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, 2); root.Controls.Add(password, 1, 2);
        root.Controls.Add(new Label { Text = "Yerel PDKS hesabı ile giriş", ForeColor = SystemColors.GrayText, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 1, 3);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var cancel = new Button { Text = "Kapat", Width = 90, DialogResult = DialogResult.Cancel };
        var login = new Button { Text = "Giriş", Width = 100 };
        login.Click += (_, _) => TryLogin(); buttons.Controls.Add(cancel); buttons.Controls.Add(login); root.Controls.Add(buttons, 1, 4);
        Controls.Add(root); AcceptButton = login; CancelButton = cancel; Shown += (_, _) => password.Focus();
    }

    void TryLogin()
    {
        if (LocalAuthStore.Validate(userName.Text, password.Text, out var user) && user is not null)
        {
            AuthenticatedUser = user; DialogResult = DialogResult.OK; Close(); return;
        }
        MessageBox.Show("Kullanıcı adı veya şifre hatalı.", "KYERP PDKS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        password.SelectAll(); password.Focus();
    }
}
