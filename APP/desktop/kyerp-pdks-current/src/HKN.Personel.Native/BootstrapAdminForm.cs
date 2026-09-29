namespace HKN.Personel.Native;

public sealed class BootstrapAdminForm : Form
{
    readonly TextBox password = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
    readonly TextBox confirm = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true };

    public BootstrapAdminForm()
    {
        Text = "KYERP PDKS - İlk Yönetici";
        Width = 470; Height = 270; StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 5, Padding = new Padding(24) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,145)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var title = new Label { Text = "ADMIN hesabını oluştur", Font = new Font("Segoe UI", 14, FontStyle.Bold), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
        root.Controls.Add(title,0,0); root.SetColumnSpan(title,2);
        root.Controls.Add(new Label { Text = "Kullanıcı", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft },0,1);
        root.Controls.Add(new TextBox { Text = "ADMIN", ReadOnly = true, Dock = DockStyle.Fill },1,1);
        root.Controls.Add(new Label { Text = "Şifre", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft },0,2); root.Controls.Add(password,1,2);
        root.Controls.Add(new Label { Text = "Şifre Tekrar", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft },0,3); root.Controls.Add(confirm,1,3);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var save = new Button { Text = "Oluştur", Width = 105 };
        var cancel = new Button { Text = "Kapat", Width = 90, DialogResult = DialogResult.Cancel };
        save.Click += (_,_) => SaveAdmin(); buttons.Controls.Add(cancel); buttons.Controls.Add(save); root.Controls.Add(buttons,1,4);
        Controls.Add(root); AcceptButton = save; CancelButton = cancel;
    }

    void SaveAdmin()
    {
        if (password.Text.Length < 4) { MessageBox.Show("Şifre en az 4 karakter olmalı.", "KYERP PDKS"); return; }
        if (password.Text != confirm.Text) { MessageBox.Show("Şifreler aynı değil.", "KYERP PDKS"); return; }
        var admin = LocalAuthStore.CreateUser("ADMIN", password.Text, true, true, Enum.GetNames<PdksModule>());
        LocalAuthStore.Save([admin]); DialogResult = DialogResult.OK; Close();
    }
}
