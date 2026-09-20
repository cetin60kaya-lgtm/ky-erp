using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyDefinitionsForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly TabControl tabs = new(){Location=new Point(0,0),Size=new Size(593,369)};
    readonly Dictionary<string,SimpleDefinitionPage> simple = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string,Control> firma = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string,Control> bordro = new(StringComparer.OrdinalIgnoreCase);
    int? firmaCode;
    int? bordroCode;

    public LegacyDefinitionsForm(string? initialTab=null)
    {
        Text="Çalışma Sistemleri";StartPosition=FormStartPosition.CenterParent;ClientSize=new Size(609,450);
        FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;ShowInTaskbar=false;Font=new Font("Microsoft Sans Serif",8.25f);KeyPreview=true;
        Build();
        if(!string.IsNullOrWhiteSpace(initialTab))SelectTab(initialTab);
        Shown+=(_,_)=>RefreshAll();KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    void Build()
    {
        tabs.TabPages.Add(BuildSimple("Bölümler","BOLUM","Bölüm Adı"));
        tabs.TabPages.Add(BuildSimple("Servisler","SERVIS","Servis Adı"));
        tabs.TabPages.Add(BuildSimple("Durum","DURUM","Durum Adı"));
        tabs.TabPages.Add(BuildSimple("Görevler","GOREV","Görev Adı"));
        tabs.TabPages.Add(BuildFirma());
        tabs.TabPages.Add(BuildBordro());
        Controls.Add(tabs);
        var close=new Button{Text="Kapat",Location=new Point(464,379),Size=new Size(121,33),ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold),UseVisualStyleBackColor=true};close.Click+=(_,_)=>Close();Controls.Add(close);
    }

    TabPage BuildSimple(string title,string table,string fieldLabel)
    {
        var page=new TabPage(title);var label=new Label{Text=fieldLabel,Location=new Point(24,16),AutoSize=true};var edit=new TextBox{Location=new Point(88,13),Size=new Size(241,21),MaxLength=50};
        var grid=new DataGridView{Location=new Point(24,40),Size=new Size(329,297),ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,BackgroundColor=Color.White,RowHeadersWidth=20,AutoGenerateColumns=false};
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="AD",DataPropertyName="AD",HeaderText=fieldLabel,Width=285});
        var p=new SimpleDefinitionPage(db,table,edit,grid,Text);simple[title]=p;
        page.Controls.AddRange([label,edit,grid,p.SaveButton(416,40),p.AddButton(416,80),p.EditButton(416,120),p.DeleteButton(416,160),p.DeleteAllButton(416,200)]);
        return page;
    }

    TabPage BuildFirma()
    {
        var page=new TabPage("Firma");
        var combo=new ComboBox{Location=new Point(120,14),Size=new Size(441,21),DropDownStyle=ComboBoxStyle.DropDownList};firma["SELECT"]=combo;
        AddField(page,"Firma Adı",48,16,"AD",120,14,441);AddField(page,"Adres",48,56,"ADRES",120,48,417);AddField(page,"Telefon-1",48,88,"TEL1",120,80,105);AddField(page,"Telefon-2",231,88,"TEL2",280,80,113);AddField(page,"Fax",409,88,"FAX",432,80,105);AddField(page,"Bulunduğu İl",48,120,"IL",120,112,145);AddField(page,"İlçe",352,120,"ILCE",384,112,153);AddField(page,"SSK Numarası",48,152,"SSK",120,144,217);
        var def=new CheckBox{Text="İşlemlerde Bu Firmayı Varsayılan Olarak Göster",Location=new Point(48,176),Size=new Size(297,17)};firma["AKTIF"]=def;
        page.Controls.Add(combo);page.Controls.Add(def);
        var save=Command("Kaydet",16,264);var add=Command("Yeni Ekle",128,264);var edit=Command("Değiştir",240,264);var del=Command("Sil",352,264);var all=Command("Tümünü Sil",464,264);
        page.Controls.AddRange([save,add,edit,del,all]);
        save.Enabled=false;SetFirmaEdit(false);
        combo.SelectedIndexChanged+=(_,_)=>LoadFirma();
        add.Click+=(_,_)=>{firmaCode=null;ClearFirma();SetFirmaEdit(true);save.Enabled=true;};
        edit.Click+=(_,_)=>{if(firmaCode is null)return;SetFirmaEdit(true);save.Enabled=true;};
        save.Click+=(_,_)=>SaveFirma(save);del.Click+=(_,_)=>DeleteFirma();all.Click+=(_,_)=>DeleteAllFirma();
        return page;
    }

    void AddField(TabPage page,string caption,int lx,int ly,string key,int x,int y,int w)
    {
        page.Controls.Add(new Label{Text=caption,Location=new Point(lx,ly),AutoSize=true});var box=new TextBox{Location=new Point(x,y),Size=new Size(w,21)};firma[key]=box;page.Controls.Add(box);
    }

    TabPage BuildBordro()
    {
        var page=new TabPage("Bordro");var grid=new DataGridView{Location=new Point(8,8),Size=new Size(257,257),ReadOnly=true,AllowUserToAddRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,BackgroundColor=Color.White,RowHeadersWidth=20};bordro["GRID"]=grid;
        page.Controls.Add(grid);AddBordroField(page,"Alan Kodu",280,24,"KOD",336,16,89);AddBordroField(page,"Alan Adı",280,64,"AD",336,56,241);AddBordroField(page,"Kısa Adı",280,96,"KAD",336,88,89);AddBordroField(page,"Alan Türü",280,128,"TIP",336,120,129);AddBordroField(page,"Katsayı",280,152,"CARPAN",336,144,89);AddBordroField(page,"Alan",280,176,"CALAN",336,168,89);AddBordroField(page,"Bordro Kodu",280,208,"BKOD",336,200,89);
        var save=Command("Kaydet",16,280);var add=Command("Yeni Ekle",128,280);var edit=Command("Değiştir",240,280);var del=Command("Sil",352,280);var all=Command("Tümünü Sil",464,280);page.Controls.AddRange([save,add,edit,del,all]);save.Enabled=false;SetBordroEdit(false);
        grid.SelectionChanged+=(_,_)=>LoadBordro();add.Click+=(_,_)=>{bordroCode=null;ClearBordro();SetBordroEdit(true);save.Enabled=true;};edit.Click+=(_,_)=>{if(bordroCode is null)return;SetBordroEdit(true);save.Enabled=true;};save.Click+=(_,_)=>SaveBordro(save);del.Click+=(_,_)=>DeleteBordro();all.Click+=(_,_)=>DeleteAllBordro();
        return page;
    }

    void AddBordroField(TabPage page,string caption,int lx,int ly,string key,int x,int y,int w)
    {
        page.Controls.Add(new Label{Text=caption,Location=new Point(lx,ly),AutoSize=true});var box=new TextBox{Location=new Point(x,y),Size=new Size(w,21)};bordro[key]=box;page.Controls.Add(box);
    }

    static Button Command(string text,int x,int y)=>new(){Text=text,Location=new Point(x,y),Size=new Size(105,33),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold),UseVisualStyleBackColor=true};

    public void SelectTab(string name)
    {
        foreach(TabPage p in tabs.TabPages)if(p.Text.Equals(name,StringComparison.OrdinalIgnoreCase)){tabs.SelectedTab=p;break;}
    }

    void RefreshAll()
    {
        foreach(var p in simple.Values)p.Reload();LoadFirmaList();LoadBordroList();
    }

    void LoadFirmaList()
    {
        try
        {
            var dt=db.Query("select KOD,AD from FIRMA order by KOD");var c=(ComboBox)firma["SELECT"];c.DataSource=dt;c.DisplayMember="AD";c.ValueMember="KOD";if(dt.Rows.Count>0)c.SelectedIndex=0;
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text);}
    }
    void LoadFirma()
    {
        try
        {
            var c=(ComboBox)firma["SELECT"];if(c.SelectedValue is null||c.SelectedValue is DataRowView)return;firmaCode=Convert.ToInt32(c.SelectedValue);var dt=db.Query("select * from FIRMA where KOD=@K",new FbParameter("@K",firmaCode.Value));if(dt.Rows.Count==0)return;var r=dt.Rows[0];foreach(var k in new[]{"AD","ADRES","TEL1","TEL2","FAX","IL","ILCE","SSK"})((TextBox)firma[k]).Text=r[k]==DBNull.Value?"":Convert.ToString(r[k])??"";((CheckBox)firma["AKTIF"]).Checked=Convert.ToString(r["AKTIF"])=="1";
        }catch{}
    }
    void ClearFirma(){foreach(var k in new[]{"AD","ADRES","TEL1","TEL2","FAX","IL","ILCE","SSK"})((TextBox)firma[k]).Clear();((CheckBox)firma["AKTIF"]).Checked=false;}
    void SetFirmaEdit(bool v){foreach(var k in new[]{"AD","ADRES","TEL1","TEL2","FAX","IL","ILCE","SSK"})((TextBox)firma[k]).ReadOnly=!v;firma["AKTIF"].Enabled=v;}
    void SaveFirma(Button save)
    {
        try
        {
            var vals=new[]{"AD","ADRES","TEL1","TEL2","FAX","IL","ILCE","SSK"}.ToDictionary(k=>k,k=>(object)(((TextBox)firma[k]).Text.Trim().Length==0?DBNull.Value:((TextBox)firma[k]).Text.Trim()));
            vals["AKTIF"]=((CheckBox)firma["AKTIF"]).Checked?"1":"0";
            if(firmaCode is null){firmaCode=Convert.ToInt32(db.Scalar("select coalesce(max(KOD),0)+1 from FIRMA")??1);db.Execute("insert into FIRMA (KOD,AD,ADRES,TEL1,TEL2,FAX,IL,ILCE,SSK,AKTIF) values (@K,@AD,@ADR,@T1,@T2,@FAX,@IL,@ILCE,@SSK,@A)",new FbParameter("@K",firmaCode),new FbParameter("@AD",vals["AD"]),new FbParameter("@ADR",vals["ADRES"]),new FbParameter("@T1",vals["TEL1"]),new FbParameter("@T2",vals["TEL2"]),new FbParameter("@FAX",vals["FAX"]),new FbParameter("@IL",vals["IL"]),new FbParameter("@ILCE",vals["ILCE"]),new FbParameter("@SSK",vals["SSK"]),new FbParameter("@A",vals["AKTIF"]));}
            else db.Execute("update FIRMA set AD=@AD,ADRES=@ADR,TEL1=@T1,TEL2=@T2,FAX=@FAX,IL=@IL,ILCE=@ILCE,SSK=@SSK,AKTIF=@A where KOD=@K",new FbParameter("@AD",vals["AD"]),new FbParameter("@ADR",vals["ADRES"]),new FbParameter("@T1",vals["TEL1"]),new FbParameter("@T2",vals["TEL2"]),new FbParameter("@FAX",vals["FAX"]),new FbParameter("@IL",vals["IL"]),new FbParameter("@ILCE",vals["ILCE"]),new FbParameter("@SSK",vals["SSK"]),new FbParameter("@A",vals["AKTIF"]),new FbParameter("@K",firmaCode));
            SetFirmaEdit(false);save.Enabled=false;LoadFirmaList();
        }catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
    void DeleteFirma(){if(firmaCode is null)return;try{if(Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where SIRKET=@K",new FbParameter("@K",firmaCode))??0)>0)throw new InvalidOperationException("Firma personel kayıtlarında kullanılıyor.");if(MessageBox.Show("Seçili firma silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;db.Execute("delete from FIRMA where KOD=@K",new FbParameter("@K",firmaCode));firmaCode=null;LoadFirmaList();}catch(Exception ex){MessageBox.Show(ex.Message,Text);}}
    void DeleteAllFirma(){try{if(Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where SIRKET is not null")??0)>0)throw new InvalidOperationException("Firmalar kullanımda olduğu için toplu silme yapılamaz.");if(MessageBox.Show("Tüm firmalar silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;db.Execute("delete from FIRMA");LoadFirmaList();}catch(Exception ex){MessageBox.Show(ex.Message,Text);}}

    void LoadBordroList(){try{var g=(DataGridView)bordro["GRID"];g.DataSource=db.Query("select KOD,AD,KAD,BKOD,CARPAN,CALAN,TIP from BORDRO order by KOD");if(g.Rows.Count>0)g.CurrentCell=g.Rows[0].Cells[0];}catch(Exception ex){MessageBox.Show(ex.Message,Text);}}
    void LoadBordro(){var g=(DataGridView)bordro["GRID"];if(g.CurrentRow?.DataBoundItem is not DataRowView v)return;var r=v.Row;bordroCode=Convert.ToInt32(r["KOD"]);foreach(var k in new[]{"KOD","AD","KAD","BKOD","CARPAN","CALAN","TIP"})((TextBox)bordro[k]).Text=r[k]==DBNull.Value?"":Convert.ToString(r[k])??"";}
    void ClearBordro(){foreach(var k in new[]{"KOD","AD","KAD","BKOD","CARPAN","CALAN","TIP"})((TextBox)bordro[k]).Clear();}
    void SetBordroEdit(bool v){foreach(var k in new[]{"KOD","AD","KAD","BKOD","CARPAN","CALAN","TIP"})((TextBox)bordro[k]).ReadOnly=!v;}
    static object NumOrDbNull(string s)=>int.TryParse(s.Trim(),out var n)?n:DBNull.Value;
    void SaveBordro(Button save)
    {
        try
        {
            int code=bordroCode??(int)Convert.ToInt64(db.Scalar("select coalesce(max(KOD),0)+1 from BORDRO")??1);var ad=((TextBox)bordro["AD"]).Text.Trim();if(ad.Length==0)throw new InvalidOperationException("Alan adı boş bırakılamaz.");
            if(bordroCode is null)db.Execute("insert into BORDRO (KOD,AD,KAD,BKOD,CARPAN,CALAN,TIP) values (@K,@AD,@KA,@BK,@C,@CA,@T)",new FbParameter("@K",code),new FbParameter("@AD",ad),new FbParameter("@KA",((TextBox)bordro["KAD"]).Text),new FbParameter("@BK",((TextBox)bordro["BKOD"]).Text),new FbParameter("@C",NumOrDbNull(((TextBox)bordro["CARPAN"]).Text)),new FbParameter("@CA",NumOrDbNull(((TextBox)bordro["CALAN"]).Text)),new FbParameter("@T",NumOrDbNull(((TextBox)bordro["TIP"]).Text)));
            else db.Execute("update BORDRO set AD=@AD,KAD=@KA,BKOD=@BK,CARPAN=@C,CALAN=@CA,TIP=@T where KOD=@K",new FbParameter("@AD",ad),new FbParameter("@KA",((TextBox)bordro["KAD"]).Text),new FbParameter("@BK",((TextBox)bordro["BKOD"]).Text),new FbParameter("@C",NumOrDbNull(((TextBox)bordro["CARPAN"]).Text)),new FbParameter("@CA",NumOrDbNull(((TextBox)bordro["CALAN"]).Text)),new FbParameter("@T",NumOrDbNull(((TextBox)bordro["TIP"]).Text)),new FbParameter("@K",bordroCode));
            bordroCode=code;SetBordroEdit(false);save.Enabled=false;LoadBordroList();
        }catch(Exception ex){MessageBox.Show(ex.Message,Text);}
    }
    void DeleteBordro(){if(bordroCode is null)return;if(MessageBox.Show("Seçili bordro alanı silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;try{db.Execute("delete from BORDRO where KOD=@K",new FbParameter("@K",bordroCode));bordroCode=null;LoadBordroList();}catch(Exception ex){MessageBox.Show(ex.Message,Text);}}
    void DeleteAllBordro(){if(MessageBox.Show("Tüm bordro alanları silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;try{db.Execute("delete from BORDRO");LoadBordroList();}catch(Exception ex){MessageBox.Show(ex.Message,Text);}}

    sealed class SimpleDefinitionPage
    {
        readonly FirebirdDatabase db;readonly string table;readonly TextBox edit;readonly DataGridView grid;readonly string owner;int? code;bool editing;
        public SimpleDefinitionPage(FirebirdDatabase db,string table,TextBox edit,DataGridView grid,string owner){this.db=db;this.table=table;this.edit=edit;this.grid=grid;this.owner=owner;grid.SelectionChanged+=(_,_)=>{if(!editing)LoadSelection();};edit.ReadOnly=true;}
        Button B(string text,int x,int y){var b=Command(text,x,y);return b;}
        public Button SaveButton(int x,int y){var b=B("Kaydet",x,y);b.Enabled=false;b.Click+=(_,_)=>Save(b);return b;}
        public Button AddButton(int x,int y){var b=B("Yeni Ekle",x,y);b.Click+=(_,_)=>{code=null;edit.Clear();editing=true;edit.ReadOnly=false;FindButton("Kaydet")?.Let(x=>x.Enabled=true);edit.Focus();};return b;}
        public Button EditButton(int x,int y){var b=B("Değiştir",x,y);b.Click+=(_,_)=>{if(code is null)return;editing=true;edit.ReadOnly=false;FindButton("Kaydet")?.Let(x=>x.Enabled=true);edit.Focus();};return b;}
        public Button DeleteButton(int x,int y){var b=B("Sil",x,y);b.Click+=(_,_)=>Delete();return b;}
        public Button DeleteAllButton(int x,int y){var b=B("Tümünü Sil",x,y);b.Click+=(_,_)=>DeleteAll();return b;}
        Button? FindButton(string text)=>edit.Parent?.Controls.OfType<Button>().FirstOrDefault(x=>x.Text==text);
        public void Reload(){try{grid.DataSource=db.Query($"select KOD,AD from {table} order by KOD");if(grid.Rows.Count>0)grid.CurrentCell=grid.Rows[0].Cells[0];}catch(Exception ex){MessageBox.Show(ex.Message,owner);}}
        void LoadSelection(){if(grid.CurrentRow?.DataBoundItem is not DataRowView v)return;code=Convert.ToInt32(v.Row["KOD"]);edit.Text=Convert.ToString(v.Row["AD"])??"";}
        void Save(Button save){try{var ad=edit.Text.Trim();if(ad.Length==0)throw new InvalidOperationException("Ad alanı boş bırakılamaz.");if(code is null){code=Convert.ToInt32(db.Scalar($"select coalesce(max(KOD),0)+1 from {table}")??1);db.Execute($"insert into {table} (KOD,AD) values (@K,@A)",new FbParameter("@K",code),new FbParameter("@A",ad));}else db.Execute($"update {table} set AD=@A where KOD=@K",new FbParameter("@A",ad),new FbParameter("@K",code));editing=false;edit.ReadOnly=true;save.Enabled=false;Reload();}catch(Exception ex){MessageBox.Show(ex.Message,owner);}}
        void Delete(){if(code is null)return;try{if(MessageBox.Show("Seçili kayıt silinsin mi?",owner,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;db.Execute($"delete from {table} where KOD=@K",new FbParameter("@K",code));code=null;Reload();}catch(Exception ex){MessageBox.Show(ex.Message,owner);}}
        void DeleteAll(){try{if(MessageBox.Show("Tüm kayıtlar silinsin mi?",owner,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;db.Execute($"delete from {table}");code=null;Reload();}catch(Exception ex){MessageBox.Show(ex.Message,owner);}}
    }
}

static class LegacyControlExtensions
{
    public static void Let<T>(this T value,Action<T> action)=>action(value);
}
