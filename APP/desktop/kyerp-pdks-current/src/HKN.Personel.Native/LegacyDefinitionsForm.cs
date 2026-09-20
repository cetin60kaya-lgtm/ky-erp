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
        Text="Çalışma Sistemleri"; StartPosition=FormStartPosition.CenterScreen; Size=new Size(609,450);
        FormBorderStyle=FormBorderStyle.FixedDialog; MaximizeBox=false; MinimizeBox=false; ShowInTaskbar=false;
        Font=new Font("Microsoft Sans Serif",8.25f); KeyPreview=true;
        Build();
        if(string.IsNullOrWhiteSpace(initialTab)) tabs.SelectedIndex=5; else SelectTab(initialTab);
        Shown+=(_,_)=>RefreshAll();
        KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    void Build()
    {
        tabs.TabPages.Add(BuildSimple("Bölümler","BOLUM","Bölüm Adı","BOLUM"));
        tabs.TabPages.Add(BuildSimple("Servisler","SERVIS","Servis Adı","SERVIS"));
        tabs.TabPages.Add(BuildSimple("Durum","DURUM","Durum Adı","DURUM"));
        tabs.TabPages.Add(BuildSimple("Görevler","GOREV","Görev Adı","GOREV"));
        tabs.TabPages.Add(BuildFirma());
        tabs.TabPages.Add(BuildBordro());
        Controls.Add(tabs);
        var close=new Button{Text="Kapa&t",Location=new Point(208,376),Size=new Size(185,35),ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold),UseVisualStyleBackColor=true};
        close.Click+=(_,_)=>Close(); Controls.Add(close);
    }

    TabPage BuildSimple(string title,string table,string fieldLabel,string kimlikColumn)
    {
        var page=new TabPage(title);
        var label=new Label{Text=fieldLabel,Location=new Point(24,16),AutoSize=true};
        var edit=new TextBox{Location=new Point(88,13),Size=new Size(241,21),MaxLength=50,ReadOnly=true};
        var grid=new DataGridView
        {
            Location=new Point(24,40),Size=new Size(329,297),ReadOnly=true,AllowUserToAddRows=false,
            AllowUserToDeleteRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,
            BackgroundColor=Color.White,RowHeadersWidth=20,AutoGenerateColumns=false
        };
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="AD",DataPropertyName="AD",HeaderText=fieldLabel,Width=285});
        var p=new SimpleDefinitionPage(db,table,kimlikColumn,edit,grid,Text); simple[title]=p;
        page.Controls.AddRange([label,edit,grid,p.SaveButton(416,40),p.AddButton(416,80),p.EditButton(416,120),p.DeleteButton(416,160),p.DeleteAllButton(416,200)]);
        return page;
    }

    TabPage BuildFirma()
    {
        var page=new TabPage("Firma");
        var combo=new ComboBox{Location=new Point(120,14),Size=new Size(441,21),DropDownStyle=ComboBoxStyle.DropDownList}; firma["SELECT"]=combo;
        page.Controls.Add(new Label{Text="Firma Adı",Location=new Point(48,16),AutoSize=true}); page.Controls.Add(combo);
        AddFirmaField(page,"Adres",48,56,"ADRES",120,48,417);
        AddFirmaField(page,"Telefon-1",48,88,"TEL1",120,80,105);
        AddFirmaField(page,"Telefon-2",231,88,"TEL2",280,80,113);
        AddFirmaField(page,"Fax",409,88,"FAX",432,80,105);
        AddFirmaField(page,"Bulunduğu İl",48,120,"IL",120,112,145);
        AddFirmaField(page,"İlçe",352,120,"ILCE",384,112,153);
        AddFirmaField(page,"SSK Numarası",48,152,"SSK",120,144,217);
        var def=new CheckBox{Text="İşlemlerde Bu Firmayı Varsayılan Olarak Göster",Location=new Point(48,176),Size=new Size(297,17)}; firma["AKTIF"]=def; page.Controls.Add(def);

        var save=Command("K&aydet",16,264); var add=Command("&Yeni Ekle",128,264); var edit=Command("&Değiştir",240,264); var del=Command("&Sil",352,264); var all=Command("Tü&münü Sil",464,264);
        page.Controls.AddRange([save,add,edit,del,all]); save.Enabled=false; SetFirmaEdit(false);
        combo.SelectedIndexChanged+=(_,_)=>{if(!save.Enabled)LoadFirma();};
        add.Click+=(_,_)=>BeginNewFirma(save);
        edit.Click+=(_,_)=>{if(firmaCode is null)return;SetFirmaEdit(true);save.Enabled=true;combo.Focus();};
        save.Click+=(_,_)=>SaveFirma(save);
        del.Click+=(_,_)=>DeleteFirma();
        all.Click+=(_,_)=>DeleteAllFirma();
        return page;
    }

    void AddFirmaField(TabPage page,string caption,int lx,int ly,string key,int x,int y,int w)
    {
        page.Controls.Add(new Label{Text=caption,Location=new Point(lx,ly),AutoSize=true});
        var box=new TextBox{Location=new Point(x,y),Size=new Size(w,21),ReadOnly=true}; firma[key]=box; page.Controls.Add(box);
    }

    TabPage BuildBordro()
    {
        var page=new TabPage("Bordro");
        var grid=new DataGridView
        {
            Location=new Point(8,8),Size=new Size(257,257),ReadOnly=true,AllowUserToAddRows=false,
            AllowUserToDeleteRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,
            BackgroundColor=Color.White,RowHeadersWidth=20,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.DisplayedCells
        }; bordro["GRID"]=grid; page.Controls.Add(grid);

        page.Controls.Add(new Label{Text="Alan Kodu",Location=new Point(280,24),AutoSize=true});
        var code=new Label{Location=new Point(336,24),AutoSize=true,BorderStyle=BorderStyle.Fixed3D}; bordro["KOD"]=code; page.Controls.Add(code);
        AddBordroText(page,"Alan Adı",280,64,"AD",336,56,241);
        AddBordroText(page,"Kısa Adı",280,96,"KAD",336,88,89);
        page.Controls.Add(new Label{Text="Alan Türü",Location=new Point(280,128),AutoSize=true});
        var type=new ComboBox{Location=new Point(336,120),Size=new Size(129,21),DropDownStyle=ComboBoxStyle.DropDownList};
        type.Items.AddRange(["Normal Mesai","Fazla Mesai","Ücretsiz İzin","Ücretli İzin"]); bordro["TIP"]=type; page.Controls.Add(type);
        page.Controls.Add(new Label{Text="Katsayı",Location=new Point(280,152),AutoSize=true});
        var factor=new TextBox{Location=new Point(336,144),Size=new Size(25,21),ReadOnly=true,MaxLength=3}; bordro["CARPAN"]=factor; page.Controls.Add(factor);
        page.Controls.Add(new Label{Text="Alan",Location=new Point(280,176),AutoSize=true});
        var field=new ComboBox{Location=new Point(336,168),Size=new Size(137,21),DropDownStyle=ComboBoxStyle.DropDownList};
        field.Items.AddRange(["Normal Çalışma","Fazla Mesai"]); bordro["CALAN"]=field; page.Controls.Add(field);
        var bcode=new TextBox{Visible=false}; bordro["BKOD"]=bcode; page.Controls.Add(bcode);

        var save=Command("K&aydet",32,280); var add=Command("&Yeni Ekle",176,280); var edit=Command("&Değiştir",312,280); var del=Command("&Sil",448,280);
        page.Controls.AddRange([save,add,edit,del]); save.Enabled=false; SetBordroEdit(false);
        grid.SelectionChanged+=(_,_)=>{if(!save.Enabled)LoadBordro();};
        add.Click+=(_,_)=>{bordroCode=null;ClearBordro();SetBordroEdit(true);save.Enabled=true;((TextBox)bordro["AD"]).Focus();};
        edit.Click+=(_,_)=>{if(bordroCode is null)return;SetBordroEdit(true);save.Enabled=true;((TextBox)bordro["AD"]).Focus();};
        save.Click+=(_,_)=>SaveBordro(save); del.Click+=(_,_)=>DeleteBordro();
        return page;
    }

    void AddBordroText(TabPage page,string caption,int lx,int ly,string key,int x,int y,int w)
    {
        page.Controls.Add(new Label{Text=caption,Location=new Point(lx,ly),AutoSize=true});
        var box=new TextBox{Location=new Point(x,y),Size=new Size(w,21),ReadOnly=true}; bordro[key]=box; page.Controls.Add(box);
    }

    static Button Command(string text,int x,int y,int width=105)=>new(){Text=text,Location=new Point(x,y),Size=new Size(width,33),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold),UseVisualStyleBackColor=true};

    public void SelectTab(string name)
    {
        foreach(TabPage p in tabs.TabPages)
            if(p.Text.Equals(name,StringComparison.OrdinalIgnoreCase)){tabs.SelectedTab=p;break;}
    }

    void RefreshAll()
    {
        foreach(var p in simple.Values)p.Reload();
        LoadFirmaList(); LoadBordroList();
    }

    void LoadFirmaList()
    {
        try
        {
            var dt=db.Query("select KOD,AD from FIRMA order by KOD"); var c=(ComboBox)firma["SELECT"];
            c.DropDownStyle=ComboBoxStyle.DropDownList; c.DataSource=dt; c.DisplayMember="AD"; c.ValueMember="KOD";
            if(dt.Rows.Count>0)c.SelectedIndex=0; else {firmaCode=null;ClearFirmaFields();}
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void LoadFirma()
    {
        try
        {
            var c=(ComboBox)firma["SELECT"]; if(c.SelectedValue is null||c.SelectedValue is DataRowView)return;
            firmaCode=Convert.ToInt32(c.SelectedValue);
            var dt=db.Query("select * from FIRMA where KOD=@K",new FbParameter("@K",firmaCode.Value)); if(dt.Rows.Count==0)return;
            var r=dt.Rows[0]; foreach(var k in new[]{"ADRES","TEL1","TEL2","FAX","IL","ILCE","SSK"})((TextBox)firma[k]).Text=r[k]==DBNull.Value?"":Convert.ToString(r[k])??"";
            ((CheckBox)firma["AKTIF"]).Checked=string.Equals(Convert.ToString(r["AKTIF"]),"E",StringComparison.OrdinalIgnoreCase)||Convert.ToString(r["AKTIF"])=="1";
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void BeginNewFirma(Button save)
    {
        firmaCode=null; ClearFirmaFields(); var c=(ComboBox)firma["SELECT"]; c.DataSource=null; c.DropDownStyle=ComboBoxStyle.DropDown; c.Text=""; SetFirmaEdit(true); save.Enabled=true; c.Focus();
    }

    void ClearFirmaFields()
    {
        foreach(var k in new[]{"ADRES","TEL1","TEL2","FAX","IL","ILCE","SSK"})((TextBox)firma[k]).Clear();
        ((CheckBox)firma["AKTIF"]).Checked=false;
    }

    void SetFirmaEdit(bool enabled)
    {
        var c=(ComboBox)firma["SELECT"]; if(enabled)c.DropDownStyle=ComboBoxStyle.DropDown;
        foreach(var k in new[]{"ADRES","TEL1","TEL2","FAX","IL","ILCE","SSK"})((TextBox)firma[k]).ReadOnly=!enabled;
        firma["AKTIF"].Enabled=enabled;
    }

    void SaveFirma(Button save)
    {
        try
        {
            var c=(ComboBox)firma["SELECT"]; var ad=c.Text.Trim(); if(ad.Length==0)throw new InvalidOperationException("Firma adı boş bırakılamaz.");
            object V(string key)=>string.IsNullOrWhiteSpace(((TextBox)firma[key]).Text)?DBNull.Value:((TextBox)firma[key]).Text.Trim();
            var aktif=((CheckBox)firma["AKTIF"]).Checked?"E":"H";
            if(((CheckBox)firma["AKTIF"]).Checked) db.Execute("update FIRMA set AKTIF='H' where AKTIF='E' or AKTIF='1'");
            if(firmaCode is null)
            {
                firmaCode=Convert.ToInt32(db.Scalar("select coalesce(max(KOD),0)+1 from FIRMA")??1);
                db.Execute("insert into FIRMA (KOD,AD,ADRES,TEL1,TEL2,FAX,IL,ILCE,SSK,AKTIF) values (@K,@AD,@ADR,@T1,@T2,@FAX,@IL,@ILCE,@SSK,@A)",
                    new FbParameter("@K",firmaCode),new FbParameter("@AD",ad),new FbParameter("@ADR",V("ADRES")),new FbParameter("@T1",V("TEL1")),new FbParameter("@T2",V("TEL2")),new FbParameter("@FAX",V("FAX")),new FbParameter("@IL",V("IL")),new FbParameter("@ILCE",V("ILCE")),new FbParameter("@SSK",V("SSK")),new FbParameter("@A",aktif));
            }
            else
            {
                db.Execute("update FIRMA set AD=@AD,ADRES=@ADR,TEL1=@T1,TEL2=@T2,FAX=@FAX,IL=@IL,ILCE=@ILCE,SSK=@SSK,AKTIF=@A where KOD=@K",
                    new FbParameter("@AD",ad),new FbParameter("@ADR",V("ADRES")),new FbParameter("@T1",V("TEL1")),new FbParameter("@T2",V("TEL2")),new FbParameter("@FAX",V("FAX")),new FbParameter("@IL",V("IL")),new FbParameter("@ILCE",V("ILCE")),new FbParameter("@SSK",V("SSK")),new FbParameter("@A",aktif),new FbParameter("@K",firmaCode));
            }
            save.Enabled=false; SetFirmaEdit(false); c.DropDownStyle=ComboBoxStyle.DropDownList; LoadFirmaList();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void DeleteFirma()
    {
        if(firmaCode is null)return;
        try
        {
            if(Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where SIRKET=@K",new FbParameter("@K",firmaCode))??0)>0)throw new InvalidOperationException("Firma personel kayıtlarında kullanılıyor.");
            if(MessageBox.Show("Seçili firma silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
            db.Execute("delete from FIRMA where KOD=@K",new FbParameter("@K",firmaCode)); firmaCode=null; LoadFirmaList();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void DeleteAllFirma()
    {
        try
        {
            if(Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where SIRKET is not null")??0)>0)throw new InvalidOperationException("Firmalar kullanımda olduğu için toplu silme yapılamaz.");
            if(MessageBox.Show("Tüm firmalar silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
            db.Execute("delete from FIRMA"); firmaCode=null; LoadFirmaList();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void LoadBordroList()
    {
        try
        {
            var g=(DataGridView)bordro["GRID"]; g.DataSource=db.Query("select KOD,AD,KAD,BKOD,CARPAN,CALAN,TIP from BORDRO order by KOD");
            if(g.Rows.Count>0)g.CurrentCell=g.Rows[0].Cells[0]; else {bordroCode=null;ClearBordro();}
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void LoadBordro()
    {
        var g=(DataGridView)bordro["GRID"]; if(g.CurrentRow?.DataBoundItem is not DataRowView v)return; var r=v.Row;
        bordroCode=Convert.ToInt32(r["KOD"]); ((Label)bordro["KOD"]).Text=Convert.ToString(r["KOD"])??"";
        ((TextBox)bordro["AD"]).Text=r["AD"]==DBNull.Value?"":Convert.ToString(r["AD"])??"";
        ((TextBox)bordro["KAD"]).Text=r["KAD"]==DBNull.Value?"":Convert.ToString(r["KAD"])??"";
        ((TextBox)bordro["BKOD"]).Text=r["BKOD"]==DBNull.Value?"":Convert.ToString(r["BKOD"])??"";
        ((TextBox)bordro["CARPAN"]).Text=r["CARPAN"]==DBNull.Value?"":Convert.ToString(r["CARPAN"])??"";
        ((ComboBox)bordro["TIP"]).SelectedIndex=IndexOrZero(r["TIP"],4);
        ((ComboBox)bordro["CALAN"]).SelectedIndex=IndexOrZero(r["CALAN"],2);
    }

    static int IndexOrZero(object value,int count)
    {
        if(value==DBNull.Value)return 0; var i=Convert.ToInt32(value); if(i>=1&&i<=count)return i-1; return Math.Clamp(i,0,count-1);
    }

    void ClearBordro()
    {
        ((Label)bordro["KOD"]).Text=""; ((TextBox)bordro["AD"]).Clear(); ((TextBox)bordro["KAD"]).Clear(); ((TextBox)bordro["BKOD"]).Clear(); ((TextBox)bordro["CARPAN"]).Clear();
        ((ComboBox)bordro["TIP"]).SelectedIndex=0; ((ComboBox)bordro["CALAN"]).SelectedIndex=0;
    }

    void SetBordroEdit(bool enabled)
    {
        ((TextBox)bordro["AD"]).ReadOnly=!enabled; ((TextBox)bordro["KAD"]).ReadOnly=!enabled; ((TextBox)bordro["CARPAN"]).ReadOnly=!enabled;
        bordro["TIP"].Enabled=enabled; bordro["CALAN"].Enabled=enabled;
    }

    static object NumOrDbNull(string s)=>int.TryParse(s.Trim(),out var n)?n:DBNull.Value;

    void SaveBordro(Button save)
    {
        try
        {
            int code=bordroCode??Convert.ToInt32(db.Scalar("select coalesce(max(KOD),0)+1 from BORDRO")??1);
            var ad=((TextBox)bordro["AD"]).Text.Trim(); if(ad.Length==0)throw new InvalidOperationException("Alan adı boş bırakılamaz.");
            var kad=((TextBox)bordro["KAD"]).Text.Trim(); var bkod=((TextBox)bordro["BKOD"]).Text.Trim(); var carpan=NumOrDbNull(((TextBox)bordro["CARPAN"]).Text);
            var tip=((ComboBox)bordro["TIP"]).SelectedIndex+1; var calan=((ComboBox)bordro["CALAN"]).SelectedIndex+1;
            if(bordroCode is null)
                db.Execute("insert into BORDRO (KOD,AD,KAD,BKOD,CARPAN,CALAN,TIP) values (@K,@AD,@KA,@BK,@C,@CA,@T)",new FbParameter("@K",code),new FbParameter("@AD",ad),new FbParameter("@KA",DbOrNull(kad)),new FbParameter("@BK",DbOrNull(bkod)),new FbParameter("@C",carpan),new FbParameter("@CA",calan),new FbParameter("@T",tip));
            else
                db.Execute("update BORDRO set AD=@AD,KAD=@KA,BKOD=@BK,CARPAN=@C,CALAN=@CA,TIP=@T where KOD=@K",new FbParameter("@AD",ad),new FbParameter("@KA",DbOrNull(kad)),new FbParameter("@BK",DbOrNull(bkod)),new FbParameter("@C",carpan),new FbParameter("@CA",calan),new FbParameter("@T",tip),new FbParameter("@K",bordroCode));
            bordroCode=code; SetBordroEdit(false); save.Enabled=false; LoadBordroList();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    static object DbOrNull(string s)=>string.IsNullOrWhiteSpace(s)?DBNull.Value:s;

    void DeleteBordro()
    {
        if(bordroCode is null)return;
        if(MessageBox.Show("Seçili bordro alanı silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
        try{db.Execute("delete from BORDRO where KOD=@K",new FbParameter("@K",bordroCode));bordroCode=null;LoadBordroList();}
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    sealed class SimpleDefinitionPage
    {
        readonly FirebirdDatabase db; readonly string table; readonly string kimlikColumn; readonly TextBox edit; readonly DataGridView grid; readonly string owner;
        int? code; bool editing;
        public SimpleDefinitionPage(FirebirdDatabase db,string table,string kimlikColumn,TextBox edit,DataGridView grid,string owner)
        {
            this.db=db;this.table=table;this.kimlikColumn=kimlikColumn;this.edit=edit;this.grid=grid;this.owner=owner;
            grid.SelectionChanged+=(_,_)=>{if(!editing)LoadSelection();};
        }
        Button B(string text,int x,int y)=>Command(text,x,y,121);
        public Button SaveButton(int x,int y){var b=B("K&aydet",x,y);b.Enabled=false;b.Click+=(_,_)=>Save(b);return b;}
        public Button AddButton(int x,int y){var b=B("&Yeni Ekle",x,y);b.Click+=(_,_)=>{code=null;edit.Clear();editing=true;edit.ReadOnly=false;FindSave()?.Let(s=>s.Enabled=true);edit.Focus();};return b;}
        public Button EditButton(int x,int y){var b=B("&Değiştir",x,y);b.Click+=(_,_)=>{if(code is null)return;editing=true;edit.ReadOnly=false;FindSave()?.Let(s=>s.Enabled=true);edit.Focus();};return b;}
        public Button DeleteButton(int x,int y){var b=B("&Sil",x,y);b.Click+=(_,_)=>Delete();return b;}
        public Button DeleteAllButton(int x,int y){var b=B("Tü&münü Sil",x,y);b.Click+=(_,_)=>DeleteAll();return b;}
        Button? FindSave()=>edit.Parent?.Controls.OfType<Button>().FirstOrDefault(x=>x.Text.Replace("&","")=="Kaydet");
        public void Reload(){try{grid.DataSource=db.Query($"select KOD,AD from {table} order by KOD");if(grid.Rows.Count>0)grid.CurrentCell=grid.Rows[0].Cells[0];else{code=null;edit.Clear();}}catch(Exception ex){MessageBox.Show(ex.Message,owner);}}
        void LoadSelection(){if(grid.CurrentRow?.DataBoundItem is not DataRowView v)return;code=Convert.ToInt32(v.Row["KOD"]);edit.Text=Convert.ToString(v.Row["AD"])??"";}
        void Save(Button save)
        {
            try
            {
                var ad=edit.Text.Trim();if(ad.Length==0)throw new InvalidOperationException("Ad alanı boş bırakılamaz.");
                if(code is null){code=Convert.ToInt32(db.Scalar($"select coalesce(max(KOD),0)+1 from {table}")??1);db.Execute($"insert into {table} (KOD,AD) values (@K,@A)",new FbParameter("@K",code),new FbParameter("@A",ad));}
                else db.Execute($"update {table} set AD=@A where KOD=@K",new FbParameter("@A",ad),new FbParameter("@K",code));
                editing=false;edit.ReadOnly=true;save.Enabled=false;Reload();
            }
            catch(Exception ex){MessageBox.Show(ex.Message,owner,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
        }
        int Usage(int? selected=null)=>Convert.ToInt32(db.Scalar($"select count(*) from KIMLIK where {kimlikColumn}"+(selected is null?" is not null":"=@K"),selected is null?[]:[new FbParameter("@K",selected.Value)])??0);
        void Delete()
        {
            if(code is null)return;
            try
            {
                if(Usage(code)>0)throw new InvalidOperationException("Seçili tanım personel kayıtlarında kullanılıyor; önce bağlı personeli değiştirin.");
                if(MessageBox.Show("Seçili kayıt silinsin mi?",owner,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
                db.Execute($"delete from {table} where KOD=@K",new FbParameter("@K",code));code=null;Reload();
            }
            catch(Exception ex){MessageBox.Show(ex.Message,owner,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
        }
        void DeleteAll()
        {
            try
            {
                if(Usage()>0)throw new InvalidOperationException("Bu tanımlar personel kayıtlarında kullanılıyor; toplu silme yapılamaz.");
                if(MessageBox.Show("Tüm kayıtlar silinsin mi?",owner,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
                db.Execute($"delete from {table}");code=null;Reload();
            }
            catch(Exception ex){MessageBox.Show(ex.Message,owner,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
        }
    }
}

static class LegacyControlExtensions
{
    public static void Let<T>(this T value,Action<T> action)=>action(value);
}
