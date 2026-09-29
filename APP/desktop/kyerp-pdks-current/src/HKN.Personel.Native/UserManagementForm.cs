namespace HKN.Personel.Native;

public sealed class UserManagementForm : Form
{
    readonly ListBox usersList = new() { Dock = DockStyle.Fill, BorderStyle = BorderStyle.FixedSingle };
    readonly TextBox userName = new() { Dock = DockStyle.Fill };
    readonly TextBox password = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
    readonly CheckBox active = new() { Text = "Aktif", AutoSize = true };
    readonly CheckBox admin = new() { Text = "Sistem Yöneticisi (Tam Yetki)", AutoSize = true };
    readonly DataGridView rights = new()
    {
        Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false,
        RowHeadersVisible = false, BackgroundColor = Color.White, AutoGenerateColumns = false,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect
    };
    List<LocalUser> users = [];
    LocalUser? selected;

    public UserManagementForm()
    {
        Text = "KYERP PDKS - Kullanıcı ve Yetki Yönetimi";
        Size = new Size(980, 680);
        MinimumSize = new Size(820, 560);
        StartPosition = FormStartPosition.CenterParent;
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.FromArgb(246, 249, 253);
        Build();
        ReloadUsers();
    }
    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(14) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 220));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var left = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, BackColor = Color.White };
        left.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        left.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        left.Controls.Add(usersList, 0, 0);
        var leftButtons = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(8), WrapContents = false };
        var add = Btn("Kullanıcı Ekle", 112, true); add.Click += (_, _) => NewUser();
        var remove = Btn("Sil", 70); remove.Click += (_, _) => DeleteUser();
        leftButtons.Controls.Add(add); leftButtons.Controls.Add(remove);
        left.Controls.Add(leftButtons, 0, 1);
        root.Controls.Add(left, 0, 0);

        var right = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 6, Padding = new Padding(16, 4, 0, 0) };
        right.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        right.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        right.Controls.Add(Label("Kullanıcı Adı"), 0, 0); right.Controls.Add(userName, 1, 0);
        right.Controls.Add(Label("Yeni Şifre"), 0, 1); right.Controls.Add(password, 1, 1);
        var flags = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
        flags.Controls.Add(active); flags.Controls.Add(admin);
        right.Controls.Add(Label("Durum"), 0, 2); right.Controls.Add(flags, 1, 2);

        rights.Columns.Add(new DataGridViewTextBoxColumn { Name = "Module", HeaderText = "Modül", ReadOnly = true, AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill });
        rights.Columns.Add(new DataGridViewCheckBoxColumn { Name = "Access", HeaderText = "Erişim", Width = 80 });
        rights.Columns.Add(new DataGridViewCheckBoxColumn { Name = "ReadOnly", HeaderText = "Sadece Görüntüleme", Width = 130 });
        foreach (var module in Enum.GetValues<PdksModule>().Where(x => x is not PdksModule.Home and not PdksModule.KullaniciYonetimi))
            rights.Rows.Add(Friendly(module), false, false);
        rights.CurrentCellDirtyStateChanged += (_, _) => { if (rights.IsCurrentCellDirty) rights.CommitEdit(DataGridViewDataErrorContexts.Commit); };
        rights.CellValueChanged += (_, e) => SyncRightRow(e.RowIndex, e.ColumnIndex);
        right.Controls.Add(Label("Erişim Yetkileri"), 0, 3); right.Controls.Add(rights, 1, 3);

        var hint = new Label
        {
            Text = "Erişim: modülü kullanabilir.  •  Sadece Görüntüleme: kayıtları ve raporları görüntüler; ekleme, güncelleme ve silme işlemleri devre dışıdır.",
            Dock = DockStyle.Fill, ForeColor = Color.FromArgb(85, 99, 118), TextAlign = ContentAlignment.MiddleLeft
        };
        right.Controls.Add(hint, 1, 4);
        var bottom = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 9, 0, 0) };
        var save = Btn("Kaydet", 110, true); save.Click += (_, _) => SaveUser();
        var close = Btn("Kapat", 96); close.Click += (_, _) => Close();
        bottom.Controls.Add(close); bottom.Controls.Add(save);
        right.Controls.Add(bottom, 1, 5);
        root.Controls.Add(right, 1, 0);
        Controls.Add(root);
        usersList.SelectedIndexChanged += (_, _) => LoadSelected();
        admin.CheckedChanged += (_, _) => rights.Enabled = !admin.Checked;
    }

    static Label Label(string text) => new()
    {
        Text = text, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = Color.FromArgb(54, 72, 96), Font = new Font("Segoe UI", 9f, FontStyle.Bold)
    };

    static Button Btn(string text, int width, bool primary = false)
    {
        var b = new Button { Text = text, Width = width, Height = 34, FlatStyle = FlatStyle.Flat,
            BackColor = primary ? Color.FromArgb(36, 107, 230) : Color.White,
            ForeColor = primary ? Color.White : Color.FromArgb(27, 44, 68), Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
        b.FlatAppearance.BorderColor = primary ? b.BackColor : Color.FromArgb(210, 220, 234);
        return b;
    }
    void ReloadUsers()
    {
        users = LocalAuthStore.Load();
        usersList.DataSource = null; usersList.DataSource = users;
        if (users.Count > 0) usersList.SelectedIndex = 0;
    }

    void NewUser()
    {
        selected = null; userName.Text = ""; password.Text = "";
        active.Checked = true; admin.Checked = false;
        SetRights(null); userName.Focus();
    }

    void LoadSelected()
    {
        if (usersList.SelectedItem is not LocalUser u) return;
        selected = u; userName.Text = u.UserName; password.Text = "";
        active.Checked = u.IsActive; admin.Checked = u.IsAdmin;
        SetRights(u);
    }

    void SetRights(LocalUser? user)
    {
        for (var i = 0; i < rights.Rows.Count; i++)
        {
            var module = ModuleAt(i);
            var access = user is not null && user.Can(module);
            var readOnly = user is not null && !user.IsAdmin && user.ReadOnlyPermissions.Contains(module.ToString(), StringComparer.OrdinalIgnoreCase);
            rights.Rows[i].Cells["Access"].Value = access;
            rights.Rows[i].Cells["ReadOnly"].Value = readOnly;
        }
    }
    void SyncRightRow(int row, int column)
    {
        if (row < 0 || row >= rights.Rows.Count) return;
        if (column == rights.Columns["ReadOnly"].Index && Convert.ToBoolean(rights.Rows[row].Cells["ReadOnly"].Value ?? false))
            rights.Rows[row].Cells["Access"].Value = true;
        if (column == rights.Columns["Access"].Index && !Convert.ToBoolean(rights.Rows[row].Cells["Access"].Value ?? false))
            rights.Rows[row].Cells["ReadOnly"].Value = false;
    }

    void SaveUser()
    {
        var name = userName.Text.Trim().ToUpperInvariant();
        if (name.Length < 2) { MessageBox.Show("Kullanıcı adı gerekli.", "KYERP PDKS"); return; }
        if (selected is null)
        {
            if (password.Text.Length < 4) { MessageBox.Show("Yeni kullanıcı için şifre gerekli.", "KYERP PDKS"); return; }
            if (users.Any(x => x.UserName.Equals(name, StringComparison.OrdinalIgnoreCase))) { MessageBox.Show("Bu kullanıcı zaten var.", "KYERP PDKS"); return; }
            selected = LocalAuthStore.CreateUser(name, password.Text, active.Checked, admin.Checked, AccessNames());
            selected.ReadOnlyPermissions = ReadOnlyNames().ToList();
            users.Add(selected);
        }
        else
        {
            if (selected.UserName.Equals("ADMIN", StringComparison.OrdinalIgnoreCase) && (!active.Checked || !admin.Checked)) { MessageBox.Show("ADMIN hesabı pasif veya yetkisiz yapılamaz.", "KYERP PDKS"); return; }
            selected.UserName = name; selected.IsActive = active.Checked; selected.IsAdmin = admin.Checked;
            selected.Permissions = AccessNames().ToList(); selected.ReadOnlyPermissions = admin.Checked ? [] : ReadOnlyNames().ToList();
            if (!string.IsNullOrWhiteSpace(password.Text)) LocalAuthStore.SetPassword(selected, password.Text);
        }
        LocalAuthStore.Save(users); ReloadUsers(); MessageBox.Show("Kullanıcı ve yetkileri kaydedildi.", "KYERP PDKS");
    }
    IEnumerable<string> AccessNames() => Enumerable.Range(0, rights.Rows.Count)
        .Where(i => Convert.ToBoolean(rights.Rows[i].Cells["Access"].Value ?? false))
        .Select(i => ModuleAt(i).ToString());

    IEnumerable<string> ReadOnlyNames() => Enumerable.Range(0, rights.Rows.Count)
        .Where(i => Convert.ToBoolean(rights.Rows[i].Cells["ReadOnly"].Value ?? false))
        .Select(i => ModuleAt(i).ToString());

    PdksModule ModuleAt(int row) => Enum.GetValues<PdksModule>()
        .Where(x => x is not PdksModule.Home and not PdksModule.KullaniciYonetimi).ElementAt(row);

    static string Friendly(PdksModule module) => module switch
    {
        PdksModule.Personel => "Personel Yönetimi",
        PdksModule.GirisCikis => "Giriş-Çıkış Kayıtları",
        PdksModule.Izinler => "İzin Yönetimi",
        PdksModule.EkKazancKesinti => "Ek Ödeme ve Kesinti İşlemleri",
        PdksModule.Puantaj => "Puantaj İşlemleri",
        PdksModule.Bordro => "Bordro ve Ödeme İşlemleri",
        PdksModule.GunlukOperasyon => "Canlı Devam Takibi",
        PdksModule.Tanimlar => "Sistem Yapılandırması",
        PdksModule.Donemler => "Dönem ve Çalışma Tarihi Yönetimi",
        PdksModule.Terminal => "Terminal ve Veri Aktarımı",
        PdksModule.Raporlar => "Raporlama ve Denetim",
        _ => module.ToString()
    };
    void DeleteUser()
    {
        if (usersList.SelectedItem is not LocalUser u) return;
        if (u.UserName.Equals("ADMIN", StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show("ADMIN hesabı silinemez.", "KYERP PDKS");
            return;
        }
        if (MessageBox.Show($"{u.UserName} kullanıcısı silinsin mi?", "KYERP PDKS", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        users.Remove(u); LocalAuthStore.Save(users); ReloadUsers();
    }
}
