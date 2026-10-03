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
        RowHeadersVisible = false, BackgroundColor = PdksAppearance.Current.Surface, AutoGenerateColumns = false,
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
        BackColor = PdksAppearance.Current.Canvas;
        Build();
        ReloadUsers();
    }
    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1,
            Padding = new Padding(16),
            BackColor=p.Canvas
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 260));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 12));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var leftCard=PdksUiKit.Card();
        var left = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding=new Padding(14), BackColor = p.Surface };
        left.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        left.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        left.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        left.Controls.Add(PdksUiKit.SectionTitle("Kullanıcılar"),0,0);
        usersList.BorderStyle=BorderStyle.None;usersList.BackColor=p.Surface;usersList.ForeColor=p.Text;
        left.Controls.Add(usersList, 0, 1);
        var leftButtons = PdksUiKit.ActionBar(false,p.Surface);
        var add = Btn("Yeni Kullanıcı", 112, true); add.Click += (_, _) => NewUser();
        var remove = Btn("Sil", 70); remove.Click += (_, _) => DeleteUser();
        leftButtons.Controls.Add(add); leftButtons.Controls.Add(remove);
        left.Controls.Add(leftButtons, 0, 2);
        leftCard.Controls.Add(left);
        root.Controls.Add(leftCard, 0, 0);
        root.Controls.Add(new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas},1,0);

        var rightCard=PdksUiKit.Card();
        var right = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 6, Padding = new Padding(18), BackColor=p.Surface };
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 104));
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));

        right.Controls.Add(PdksUiKit.SectionTitle("Kullanıcı ve Yetki Bilgileri"),0,0);

        var fields=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=2,BackColor=p.Surface};
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,110));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        fields.RowStyles.Add(new RowStyle(SizeType.Absolute,44));
        fields.RowStyles.Add(new RowStyle(SizeType.Absolute,44));
        fields.Controls.Add(Label("Kullanıcı Adı"),0,0);fields.Controls.Add(userName,1,0);
        fields.Controls.Add(Label("Yeni Şifre"),2,0);fields.Controls.Add(password,3,0);
        var flags=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,BackColor=p.Surface,Padding=new Padding(0,7,0,0)};
        flags.Controls.Add(active);flags.Controls.Add(admin);
        fields.Controls.Add(Label("Durum"),0,1);fields.Controls.Add(flags,1,1);fields.SetColumnSpan(flags,3);
        right.Controls.Add(fields,0,1);

        right.Controls.Add(new Label
        {
            Text="Modül Yetkileri",
            Dock=DockStyle.Fill,
            TextAlign=ContentAlignment.MiddleLeft,
            Font=new Font("Segoe UI",9f,FontStyle.Bold),
            ForeColor=p.Text
        },0,2);

        rights.Columns.Add(new DataGridViewTextBoxColumn { Name = "Module", HeaderText = "Modül", ReadOnly = true, AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill });
        rights.Columns.Add(new DataGridViewCheckBoxColumn { Name = "Access", HeaderText = "Erişim", Width = 80 });
        rights.Columns.Add(new DataGridViewCheckBoxColumn { Name = "ReadOnly", HeaderText = "Sadece Görüntüleme", Width = 145 });
        foreach (var module in Enum.GetValues<PdksModule>().Where(x => x is not PdksModule.Home and not PdksModule.KullaniciYonetimi))
            rights.Rows.Add(Friendly(module), false, false);
        rights.BorderStyle=BorderStyle.None;rights.BackgroundColor=p.Surface;rights.RowTemplate.Height=31;rights.ColumnHeadersHeight=35;
        rights.CurrentCellDirtyStateChanged += (_, _) => { if (rights.IsCurrentCellDirty) rights.CommitEdit(DataGridViewDataErrorContexts.Commit); };
        rights.CellValueChanged += (_, e) => SyncRightRow(e.RowIndex, e.ColumnIndex);
        right.Controls.Add(rights,0,3);

        var hint = new Label
        {
            Text = "Erişim: modülü kullanabilir.  •  Sadece Görüntüleme: kayıtları ve raporları görüntüler; ekleme, güncelleme ve silme işlemleri kapalıdır.",
            Dock = DockStyle.Fill, ForeColor = p.Muted, TextAlign = ContentAlignment.MiddleLeft
        };
        right.Controls.Add(hint,0,4);

        var bottom = PdksUiKit.ActionBar(true,p.Surface);
        var save = Btn("Kaydet", 110, true); save.Click += (_, _) => SaveUser();
        var close = Btn("Kapat", 96); close.Click += (_, _) => Close();
        bottom.Controls.Add(close); bottom.Controls.Add(save);
        right.Controls.Add(bottom,0,5);

        rightCard.Controls.Add(right);
        root.Controls.Add(rightCard,2,0);
        Controls.Add(root);

        usersList.SelectedIndexChanged += (_, _) => LoadSelected();
        admin.CheckedChanged += (_, _) => rights.Enabled = !admin.Checked;
    }

    static Label Label(string text) => PdksUiKit.FieldLabel(text);

    static Button Btn(string text, int width, bool primary = false)
    {
        var role = primary ? PdksActionRole.Primary :
            text.Contains("Sil", StringComparison.OrdinalIgnoreCase) ? PdksActionRole.Danger :
            text.Contains("Kapat", StringComparison.OrdinalIgnoreCase) ? PdksActionRole.Quiet :
            PdksActionRole.Secondary;
        return PdksUiKit.Button(text, width, role);
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
