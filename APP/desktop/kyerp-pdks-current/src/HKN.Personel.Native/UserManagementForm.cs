namespace HKN.Personel.Native;

public sealed class UserManagementForm : Form
{
    readonly ListBox usersList = new() { Dock = DockStyle.Fill };
    readonly TextBox userName = new() { Dock = DockStyle.Fill };
    readonly TextBox password = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
    readonly CheckBox active = new() { Text = "Aktif", AutoSize = true };
    readonly CheckBox admin = new() { Text = "Yönetici", AutoSize = true };
    readonly CheckedListBox permissions = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    List<LocalUser> users = [];
    LocalUser? selected;

    public UserManagementForm()
    {
        Text = "KYERP PDKS - Kullanıcı Yönetimi";
        Width = 780; Height = 560; StartPosition = FormStartPosition.CenterParent;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Padding = new Padding(10) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,220)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var left = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2 };
        left.RowStyles.Add(new RowStyle(SizeType.Percent,100)); left.RowStyles.Add(new RowStyle(SizeType.Absolute,44));
        left.Controls.Add(usersList,0,0);
        var leftButtons = new FlowLayoutPanel { Dock = DockStyle.Fill };
        var add = new Button { Text = "Yeni", Width = 90 }; add.Click += (_,_) => NewUser();
        var remove = new Button { Text = "Sil", Width = 90 }; remove.Click += (_,_) => DeleteUser();
        leftButtons.Controls.Add(add); leftButtons.Controls.Add(remove); left.Controls.Add(leftButtons,0,1);
        root.Controls.Add(left,0,0);

        var right = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 7, Padding = new Padding(12,0,0,0) };
        right.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,120)); right.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        right.Controls.Add(new Label { Text="Kullanıcı Adı", Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleLeft },0,0); right.Controls.Add(userName,1,0);
        right.Controls.Add(new Label { Text="Yeni Şifre", Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleLeft },0,1); right.Controls.Add(password,1,1);
        var flags = new FlowLayoutPanel { Dock=DockStyle.Fill }; flags.Controls.Add(active); flags.Controls.Add(admin); right.Controls.Add(new Label { Text="Durum", Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleLeft },0,2); right.Controls.Add(flags,1,2);
        right.Controls.Add(new Label { Text="Yetkiler", Dock=DockStyle.Fill, TextAlign=ContentAlignment.TopLeft },0,3); right.Controls.Add(permissions,1,3);
        right.SetRowSpan(permissions,3);
        var save = new Button { Text="Kaydet", Width=110, Height=32 }; save.Click += (_,_) => SaveUser();
        var close = new Button { Text="Kapat", Width=100, Height=32 }; close.Click += (_,_) => Close();
        var bottom = new FlowLayoutPanel { Dock=DockStyle.Fill, FlowDirection=FlowDirection.RightToLeft }; bottom.Controls.Add(close); bottom.Controls.Add(save); right.Controls.Add(bottom,1,6);
        root.Controls.Add(right,1,0); Controls.Add(root);
        foreach (var p in Enum.GetValues<PdksModule>().Where(x => x is not PdksModule.Home and not PdksModule.KullaniciYonetimi)) permissions.Items.Add(p);
        usersList.SelectedIndexChanged += (_,_) => LoadSelected();
        ReloadUsers();
    }

    void ReloadUsers()
    {
        users = LocalAuthStore.Load(); usersList.DataSource = null; usersList.DataSource = users;
        if (users.Count > 0) usersList.SelectedIndex = 0;
    }

    void NewUser()
    {
        selected = null; userName.Text = ""; password.Text = ""; active.Checked = true; admin.Checked = false;
        for (var i=0;i<permissions.Items.Count;i++) permissions.SetItemChecked(i,false);
        userName.Focus();
    }

    void LoadSelected()
    {
        if (usersList.SelectedItem is not LocalUser u) return; selected = u;
        userName.Text = u.UserName; password.Text = ""; active.Checked = u.IsActive; admin.Checked = u.IsAdmin;
        for (var i=0;i<permissions.Items.Count;i++) permissions.SetItemChecked(i, u.Permissions.Contains(permissions.Items[i]!.ToString()!, StringComparer.OrdinalIgnoreCase));
    }

    void SaveUser()
    {
        var name = userName.Text.Trim().ToUpperInvariant();
        if (name.Length < 2) { MessageBox.Show("Kullanıcı adı gerekli.", "KYERP PDKS"); return; }
        if (selected is null)
        {
            if (password.Text.Length < 4) { MessageBox.Show("Yeni kullanıcı için şifre gerekli.", "KYERP PDKS"); return; }
            if (users.Any(x => x.UserName.Equals(name,StringComparison.OrdinalIgnoreCase))) { MessageBox.Show("Bu kullanıcı zaten var.", "KYERP PDKS"); return; }
            selected = LocalAuthStore.CreateUser(name, password.Text, active.Checked, admin.Checked, CheckedPermissionNames()); users.Add(selected);
        }
        else
        {
            if (selected.UserName.Equals("ADMIN",StringComparison.OrdinalIgnoreCase) && (!active.Checked || !admin.Checked)) { MessageBox.Show("ADMIN hesabı pasif veya yetkisiz yapılamaz.", "KYERP PDKS"); return; }
            selected.UserName = name; selected.IsActive = active.Checked; selected.IsAdmin = admin.Checked; selected.Permissions = CheckedPermissionNames().ToList();
            if (!string.IsNullOrWhiteSpace(password.Text)) LocalAuthStore.SetPassword(selected,password.Text);
        }
        LocalAuthStore.Save(users); ReloadUsers(); MessageBox.Show("Kullanıcı kaydedildi.", "KYERP PDKS");
    }

    IEnumerable<string> CheckedPermissionNames() => permissions.CheckedItems.Cast<object>().Select(x => x.ToString()!).Where(x => !string.IsNullOrWhiteSpace(x));

    void DeleteUser()
    {
        if (usersList.SelectedItem is not LocalUser u) return;
        if (u.UserName.Equals("ADMIN",StringComparison.OrdinalIgnoreCase)) { MessageBox.Show("ADMIN hesabı silinemez.", "KYERP PDKS"); return; }
        if (MessageBox.Show($"{u.UserName} kullanıcısı silinsin mi?","KYERP PDKS",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes) return;
        users.Remove(u); LocalAuthStore.Save(users); ReloadUsers();
    }
}
