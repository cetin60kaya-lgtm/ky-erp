namespace HKN.Personel.Native;

public sealed class UserManagementFormV2 : Form
{
    readonly ListBox usersList = new() { Dock = DockStyle.Fill, BorderStyle = BorderStyle.FixedSingle };
    readonly TextBox userName = new() { Dock = DockStyle.Fill };
    readonly TextBox password = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
    readonly CheckBox active = new() { Text = "Aktif", AutoSize = true };
    readonly CheckBox admin = new() { Text = "Yönetici / Tam Yetki", AutoSize = true };
    readonly TableLayoutPanel rights = new() { Dock = DockStyle.Fill, ColumnCount = 3, AutoScroll = true };
    readonly Dictionary<PdksModule,(CheckBox View,CheckBox Edit)> permissionBoxes = [];
    List<LocalUser> users = [];
    LocalUser? selected;

    public UserManagementFormV2()
    {
        Text = "KYERP PDKS - Kullanıcı ve Yetki Yönetimi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1040,700); MinimumSize = new Size(880,600);
        Font = new Font("Segoe UI",9f); BackColor = Color.FromArgb(246,249,253);
        Build(); ReloadUsers();
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, RowCount=2, Padding=new Padding(18) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,240)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,66)); root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var header = new Label { Text="Kullanıcı ve Yetki Yönetimi", Dock=DockStyle.Fill, Font=new Font("Segoe UI",18f,FontStyle.Bold), ForeColor=Color.FromArgb(27,44,68), TextAlign=ContentAlignment.MiddleLeft };
        root.Controls.Add(header,0,0); root.SetColumnSpan(header,2);

        var left = new TableLayoutPanel { Dock=DockStyle.Fill, RowCount=2, BackColor=Color.White, Padding=new Padding(10) };
        left.RowStyles.Add(new RowStyle(SizeType.Percent,100)); left.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
        left.Controls.Add(usersList,0,0);
        var lb = new FlowLayoutPanel { Dock=DockStyle.Fill, FlowDirection=FlowDirection.LeftToRight };
        var add=Btn("Yeni",90,true); var remove=Btn("Sil",90,false); add.Click+=(_,_)=>NewUser(); remove.Click+=(_,_)=>DeleteUser(); lb.Controls.Add(add);lb.Controls.Add(remove);left.Controls.Add(lb,0,1);root.Controls.Add(left,0,1);

        var editor = new TableLayoutPanel { Dock=DockStyle.Fill, RowCount=5, ColumnCount=1, BackColor=Color.White, Padding=new Padding(18) };
        editor.RowStyles.Add(new RowStyle(SizeType.Absolute,86)); editor.RowStyles.Add(new RowStyle(SizeType.Absolute,44)); editor.RowStyles.Add(new RowStyle(SizeType.Absolute,34)); editor.RowStyles.Add(new RowStyle(SizeType.Percent,100)); editor.RowStyles.Add(new RowStyle(SizeType.Absolute,52));
        var fields=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=2}; fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,110));fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,90));fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        fields.Controls.Add(L("Kullanıcı"),0,0);fields.Controls.Add(userName,1,0);fields.Controls.Add(L("Yeni Şifre"),2,0);fields.Controls.Add(password,3,0);
        var flags=new FlowLayoutPanel{Dock=DockStyle.Fill};flags.Controls.Add(active);flags.Controls.Add(admin);fields.Controls.Add(L("Durum"),0,1);fields.Controls.Add(flags,1,1);fields.SetColumnSpan(flags,3); editor.Controls.Add(fields,0,0);
        editor.Controls.Add(new Label{Text="Yetki modeli: Görüntüle açıksa menü görünür. Düzenle kapalıysa kullanıcı yalnız inceleyebilir/rapor alabilir.",Dock=DockStyle.Fill,ForeColor=Color.FromArgb(70,86,108),TextAlign=ContentAlignment.MiddleLeft},0,1);
        editor.Controls.Add(new Label{Text="Modül                                              Görüntüle      Düzenle",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold),ForeColor=Color.FromArgb(36,107,230)},0,2);
        BuildRights(); editor.Controls.Add(rights,0,3);
        var bottom=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft};var save=Btn("Kaydet",120,true);var close=Btn("Kapat",100,false);save.Click+=(_,_)=>SaveUser();close.Click+=(_,_)=>Close();bottom.Controls.Add(close);bottom.Controls.Add(save);editor.Controls.Add(bottom,0,4);root.Controls.Add(editor,1,1);
        Controls.Add(root); usersList.SelectedIndexChanged+=(_,_)=>LoadSelected(); admin.CheckedChanged+=(_,_)=>RefreshAdminState();
    }

    void BuildRights()
    {
        rights.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));rights.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,100));rights.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,100));
        var modules=Enum.GetValues<PdksModule>().Where(x=>x is not PdksModule.Home and not PdksModule.KullaniciYonetimi).ToArray(); rights.RowCount=modules.Length;
        for(int i=0;i<modules.Length;i++){
            var m=modules[i];var view=new CheckBox{Text="Evet",AutoSize=true,Anchor=AnchorStyles.Left};var edit=new CheckBox{Text="Evet",AutoSize=true,Anchor=AnchorStyles.Left}; view.CheckedChanged+=(_,_)=>{if(!view.Checked)edit.Checked=false;edit.Enabled=view.Checked&&!admin.Checked;};
            rights.Controls.Add(new Label{Text=Friendly(m),Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Padding=new Padding(4),BackColor=i%2==0?Color.FromArgb(249,251,254):Color.White},0,i);rights.Controls.Add(view,1,i);rights.Controls.Add(edit,2,i);permissionBoxes[m]=(view,edit);
        }
    }

    static string Friendly(PdksModule m)=>m switch{PdksModule.GunlukOperasyon=>"Canlı / Günlük Operasyon",PdksModule.GirisCikis=>"Giriş - Çıkış",PdksModule.Personel=>"Personel Kartları",PdksModule.Izinler=>"İzinler",PdksModule.EkKazancKesinti=>"Avans / Ek Kazanç / Kesinti",PdksModule.Puantaj=>"Puantaj",PdksModule.Bordro=>"Bordro / Ödemeler",PdksModule.Raporlar=>"Raporlar / Denetim",PdksModule.Terminal=>"Terminal / Kart Aktarım",PdksModule.Tanimlar=>"Tanımlar / Organizasyon",PdksModule.Donemler=>"Dönem / Çalışma Tarihi",_=>m.ToString()};
    static Label L(string t)=>new(){Text=t,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=Color.FromArgb(66,82,104)};
    static Button Btn(string t,int w,bool primary)=>new(){Text=t,Width=w,Height=34,FlatStyle=FlatStyle.Flat,BackColor=primary?Color.FromArgb(36,107,230):Color.White,ForeColor=primary?Color.White:Color.FromArgb(27,44,68),Font=new Font("Segoe UI",9f,FontStyle.Bold)};

    void ReloadUsers(){users=LocalAuthStore.Load();usersList.DataSource=null;usersList.DataSource=users;if(users.Count>0)usersList.SelectedIndex=0;}
    void NewUser(){selected=null;userName.Text="";password.Text="";active.Checked=true;admin.Checked=false;foreach(var pair in permissionBoxes.Values){pair.View.Checked=false;pair.Edit.Checked=false;}userName.Focus();}
    void LoadSelected(){if(usersList.SelectedItem is not LocalUser u)return;selected=u;userName.Text=u.UserName;password.Text="";active.Checked=u.IsActive;admin.Checked=u.IsAdmin;foreach(var (m,p) in permissionBoxes){var allowed=u.IsAdmin||u.Permissions.Contains(m.ToString(),StringComparer.OrdinalIgnoreCase);p.View.Checked=allowed;p.Edit.Checked=u.IsAdmin||(allowed&&!u.ReadOnlyPermissions.Contains(m.ToString(),StringComparer.OrdinalIgnoreCase));}RefreshAdminState();}
    void RefreshAdminState(){foreach(var p in permissionBoxes.Values){p.View.Enabled=!admin.Checked;p.Edit.Enabled=!admin.Checked&&p.View.Checked;if(admin.Checked){p.View.Checked=true;p.Edit.Checked=true;}}}

    void SaveUser()
    {
        var name=userName.Text.Trim().ToUpperInvariant();if(name.Length<2){MessageBox.Show("Kullanıcı adı gerekli.",Text);return;}
        var allowed=permissionBoxes.Where(x=>x.Value.View.Checked).Select(x=>x.Key.ToString()).ToList();var readOnly=permissionBoxes.Where(x=>x.Value.View.Checked&&!x.Value.Edit.Checked).Select(x=>x.Key.ToString()).ToList();
        if(selected is null){if(password.Text.Length<4){MessageBox.Show("Yeni kullanıcı için şifre gerekli.",Text);return;}if(users.Any(x=>x.UserName.Equals(name,StringComparison.OrdinalIgnoreCase))){MessageBox.Show("Bu kullanıcı zaten var.",Text);return;}selected=LocalAuthStore.CreateUser(name,password.Text,active.Checked,admin.Checked,allowed);selected.ReadOnlyPermissions=readOnly;users.Add(selected);}
        else{if(selected.UserName.Equals("ADMIN",StringComparison.OrdinalIgnoreCase)&&(!active.Checked||!admin.Checked)){MessageBox.Show("ADMIN hesabı pasif veya yetkisiz yapılamaz.",Text);return;}selected.UserName=name;selected.IsActive=active.Checked;selected.IsAdmin=admin.Checked;selected.Permissions=allowed;selected.ReadOnlyPermissions=readOnly;if(!string.IsNullOrWhiteSpace(password.Text))LocalAuthStore.SetPassword(selected,password.Text);}
        LocalAuthStore.Save(users);ReloadUsers();MessageBox.Show("Kullanıcı ve yetkiler kaydedildi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
    }
    void DeleteUser(){if(usersList.SelectedItem is not LocalUser u)return;if(u.UserName.Equals("ADMIN",StringComparison.OrdinalIgnoreCase)){MessageBox.Show("ADMIN hesabı silinemez.",Text);return;}if(MessageBox.Show($"{u.UserName} kullanıcısı silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;users.Remove(u);LocalAuthStore.Save(users);ReloadUsers();}
}
