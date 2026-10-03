using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyDefinitionsForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly TabControl tabs = new(){Dock=DockStyle.Fill};
    readonly Dictionary<string,SimpleDefinitionPage> simple = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string,Control> firma = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string,Control> bordro = new(StringComparer.OrdinalIgnoreCase);
    int? firmaCode;
    int? bordroCode;

    public LegacyDefinitionsForm(string? initialTab=null)
    {
        Text="Tanımlar"; StartPosition=FormStartPosition.CenterScreen; Size=new Size(1120,700); MinimumSize=new Size(900,600);
        FormBorderStyle=FormBorderStyle.Sizable; MaximizeBox=true; MinimizeBox=true; ShowInTaskbar=false;
        Font=new Font("Segoe UI",9f); BackColor=PdksAppearance.Current.Canvas; KeyPreview=true;
        Build();
        if(string.IsNullOrWhiteSpace(initialTab)) tabs.SelectedIndex=5; else SelectTab(initialTab);
        Shown+=(_,_)=>RefreshAll();
        KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        tabs.Padding=new Point(18,9);
        tabs.BackColor=p.Canvas;
        tabs.TabPages.Add(BuildSimple("Bölümler","BOLUM","Bölüm Adı","BOLUM"));
        tabs.TabPages.Add(BuildSimple("Servisler","SERVIS","Servis Adı","SERVIS"));
        tabs.TabPages.Add(BuildSimple("Durum","DURUM","Durum Adı","DURUM"));
        tabs.TabPages.Add(BuildSimple("Görevler","GOREV","Görev Adı","GOREV"));
        tabs.TabPages.Add(BuildFirma());
        tabs.TabPages.Add(BuildBordro());
        Controls.Add(tabs);
    }

    TabPage BuildSimple(string title,string table,string fieldLabel,string kimlikColumn)
    {
        var palette=PdksAppearance.Current;
        var page=new TabPage(title){Padding=new Padding(16),BackColor=palette.Canvas};
        var card=PdksUiKit.Card();

        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,ColumnCount=1,Padding=new Padding(18),BackColor=palette.Surface};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,38));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,54));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,54));
        root.Controls.Add(new Label{Text=title,Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=palette.Text,TextAlign=ContentAlignment.MiddleLeft},0,0);

        var editor=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Padding=new Padding(0,4,0,4)};
        editor.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,120));editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        editor.Controls.Add(new Label{Text=fieldLabel,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=palette.Muted,Font=new Font("Segoe UI",8.5f,FontStyle.Bold)},0,0);
        var edit=new TextBox{Dock=DockStyle.Fill,MaxLength=50,ReadOnly=true,Margin=new Padding(0,7,0,7)};editor.Controls.Add(edit,1,0);root.Controls.Add(editor,0,1);

        var grid=new DataGridView{Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,BackgroundColor=palette.Surface,RowHeadersVisible=false,AutoGenerateColumns=false,BorderStyle=BorderStyle.None};
        grid.RowTemplate.Height=31;grid.ColumnHeadersHeight=35;grid.EnableHeadersVisualStyles=false;grid.ColumnHeadersDefaultCellStyle.BackColor=palette.GridHeader;grid.ColumnHeadersDefaultCellStyle.ForeColor=palette.Text;
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="AD",DataPropertyName="AD",HeaderText=fieldLabel,AutoSizeMode=DataGridViewAutoSizeColumnMode.Fill});root.Controls.Add(grid,0,2);

        var p=new SimpleDefinitionPage(db,table,kimlikColumn,edit,grid,Text);simple[title]=p;
        var actions=PdksUiKit.ActionBar(true,palette.Surface);
        var save=p.SaveButton(0,0);var delAll=p.DeleteAllButton(0,0);var del=p.DeleteButton(0,0);var change=p.EditButton(0,0);var add=p.AddButton(0,0);
        foreach(var b in new[]{save,delAll,del,change,add}){b.Height=34;b.FlatStyle=FlatStyle.Flat;b.Font=new Font("Segoe UI",8.8f,FontStyle.Bold);}
        PdksUiKit.ApplyButtonPalette(add,palette,PdksActionRole.Primary);
        PdksUiKit.ApplyButtonPalette(change,palette,PdksActionRole.Secondary);
        PdksUiKit.ApplyButtonPalette(del,palette,PdksActionRole.Danger);
        PdksUiKit.ApplyButtonPalette(delAll,palette,PdksActionRole.Danger);
        PdksUiKit.ApplyButtonPalette(save,palette,PdksActionRole.Primary);
        actions.Controls.Add(save);actions.Controls.Add(delAll);actions.Controls.Add(del);actions.Controls.Add(change);actions.Controls.Add(add);root.Controls.Add(actions,0,3);
        card.Controls.Add(root);page.Controls.Add(card);return page;
    }
    TabPage BuildFirma()
    {
        var p=PdksAppearance.Current;
        var page=new TabPage("Firma"){Padding=new Padding(16),BackColor=p.Canvas};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,ColumnCount=1,BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));

        var card=PdksUiKit.Card();
        var editor=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=8,Padding=new Padding(20),BackColor=p.Surface};
        editor.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,120));editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        editor.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,110));editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        editor.RowStyles.Add(new RowStyle(SizeType.Absolute,38));
        for(var row=1;row<8;row++)editor.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        editor.Controls.Add(PdksUiKit.SectionTitle("Firma Bilgileri"),0,0);editor.SetColumnSpan(editor.GetControlFromPosition(0,0)!,4);

        var combo=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList,Margin=new Padding(0,6,0,6)};firma["SELECT"]=combo;
        editor.Controls.Add(PdksUiKit.FieldLabel("Firma Adı"),0,1);editor.Controls.Add(combo,1,1);editor.SetColumnSpan(combo,3);

        var address=new TextBox{Dock=DockStyle.Fill,ReadOnly=true,Margin=new Padding(0,6,0,6)};firma["ADRES"]=address;
        editor.Controls.Add(PdksUiKit.FieldLabel("Adres"),0,2);editor.Controls.Add(address,1,2);editor.SetColumnSpan(address,3);

        string[] labels={"Telefon-1","Telefon-2","Fax","Bulunduğu İl","İlçe","SSK Numarası"};
        string[] keys={"TEL1","TEL2","FAX","IL","ILCE","SSK"};
        for(int i=0;i<keys.Length;i++)
        {
            int row=3+i/2,col=(i%2)*2;
            var box=new TextBox{Dock=DockStyle.Fill,ReadOnly=true,Margin=new Padding(0,6,12,6)};
            firma[keys[i]]=box;
            editor.Controls.Add(PdksUiKit.FieldLabel(labels[i]),col,row);
            editor.Controls.Add(box,col+1,row);
        }

        var def=new CheckBox{Text="İşlemlerde bu firmayı varsayılan olarak göster",Dock=DockStyle.Fill,AutoSize=true,Padding=new Padding(0,8,0,0)};
        firma["AKTIF"]=def;editor.Controls.Add(def,1,6);editor.SetColumnSpan(def,3);
        card.Controls.Add(editor);root.Controls.Add(card,0,0);

        var actions=PdksUiKit.ActionBar();
        var save=PdksUiKit.Button("Kaydet",108,PdksActionRole.Primary);
        var add=PdksUiKit.Button("Yeni Firma",108,PdksActionRole.Secondary);
        var edit=PdksUiKit.Button("Düzenle",96,PdksActionRole.Secondary);
        var del=PdksUiKit.Button("Sil",82,PdksActionRole.Danger);
        var all=PdksUiKit.Button("Tümünü Sil",108,PdksActionRole.Danger);
        actions.Controls.AddRange([save,all,del,edit,add]);root.Controls.Add(actions,0,1);page.Controls.Add(root);
        save.Enabled=false;SetFirmaEdit(false);

        combo.SelectedIndexChanged+=(_,_)=>{if(!save.Enabled)LoadFirma();};
        add.Click+=(_,_)=>BeginNewFirma(save);
        edit.Click+=(_,_)=>{if(firmaCode is null)return;SetFirmaEdit(true);save.Enabled=true;combo.Focus();};
        save.Click+=(_,_)=>SaveFirma(save);
        del.Click+=(_,_)=>DeleteFirma();
        all.Click+=(_,_)=>DeleteAllFirma();
        return page;
    }

    TabPage BuildBordro()
    {
        var p=PdksAppearance.Current;
        var page=new TabPage("Bordro"){Padding=new Padding(16),BackColor=p.Canvas};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,ColumnCount=1,BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));

        var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=1,BackColor=p.Canvas};
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,40));body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,12));body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,60));

        var listCard=PdksUiKit.Card();
        var listLayout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Padding=new Padding(16),BackColor=p.Surface};
        listLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,38));listLayout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        listLayout.Controls.Add(PdksUiKit.SectionTitle("Bordro Alanları"),0,0);
        var grid=new DataGridView{Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,BackgroundColor=p.Surface,RowHeadersVisible=false,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,BorderStyle=BorderStyle.None};
        grid.RowTemplate.Height=31;grid.ColumnHeadersHeight=35;
        bordro["GRID"]=grid;listLayout.Controls.Add(grid,0,1);listCard.Controls.Add(listLayout);body.Controls.Add(listCard,0,0);
        body.Controls.Add(new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas},1,0);

        var editCard=PdksUiKit.Card();
        var editor=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=8,Padding=new Padding(20),BackColor=p.Surface};
        editor.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,135));editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        editor.RowStyles.Clear();
        editor.RowStyles.Add(new RowStyle(SizeType.Absolute,38));
        for(var row=1;row<7;row++)editor.RowStyles.Add(new RowStyle(SizeType.Absolute,40));
        editor.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        editor.Controls.Add(PdksUiKit.SectionTitle("Alan Bilgileri"),0,0);editor.SetColumnSpan(editor.GetControlFromPosition(0,0)!,2);

        var code=new Label{Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",10f,FontStyle.Bold),ForeColor=p.Text};bordro["KOD"]=code;DefRow(editor,1,"Alan Kodu",code);
        var ad=new TextBox{Dock=DockStyle.Fill,ReadOnly=true};bordro["AD"]=ad;DefRow(editor,2,"Alan Adı",ad);
        var kad=new TextBox{Dock=DockStyle.Fill,ReadOnly=true};bordro["KAD"]=kad;DefRow(editor,3,"Kısa Adı",kad);
        var type=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList};type.Items.AddRange(["Normal Mesai","Fazla Mesai","Ücretsiz İzin","Ücretli İzin"]);bordro["TIP"]=type;DefRow(editor,4,"Alan Türü",type);
        var factor=new TextBox{Dock=DockStyle.Fill,ReadOnly=true,MaxLength=3};bordro["CARPAN"]=factor;DefRow(editor,5,"Katsayı",factor);
        var field=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList};field.Items.AddRange(["Normal Çalışma","Fazla Mesai"]);bordro["CALAN"]=field;DefRow(editor,6,"Alan",field);
        var bcode=new TextBox{Visible=false};bordro["BKOD"]=bcode;
        editCard.Controls.Add(editor);body.Controls.Add(editCard,2,0);root.Controls.Add(body,0,0);

        var actions=PdksUiKit.ActionBar();
        var save=PdksUiKit.Button("Kaydet",108,PdksActionRole.Primary);
        var add=PdksUiKit.Button("Yeni Alan",108,PdksActionRole.Secondary);
        var edit=PdksUiKit.Button("Düzenle",96,PdksActionRole.Secondary);
        var del=PdksUiKit.Button("Sil",82,PdksActionRole.Danger);
        actions.Controls.AddRange([save,del,edit,add]);root.Controls.Add(actions,0,1);page.Controls.Add(root);
        save.Enabled=false;SetBordroEdit(false);

        grid.SelectionChanged+=(_,_)=>{if(!save.Enabled)LoadBordro();};
        add.Click+=(_,_)=>{bordroCode=null;ClearBordro();SetBordroEdit(true);save.Enabled=true;((TextBox)bordro["AD"]).Focus();};
        edit.Click+=(_,_)=>{if(bordroCode is null)return;SetBordroEdit(true);save.Enabled=true;((TextBox)bordro["AD"]).Focus();};
        save.Click+=(_,_)=>SaveBordro(save);
        del.Click+=(_,_)=>DeleteBordro();
        return page;
    }

    static void DefRow(TableLayoutPanel table,int row,string text,Control control)
    {
        table.Controls.Add(PdksUiKit.FieldLabel(text),0,row);
        control.Dock=DockStyle.Fill;control.Margin=new Padding(0,6,0,6);table.Controls.Add(control,1,row);
    }

    static Button Command(string text,int x,int y,int width=105)
        => PdksUiKit.Button(text,Math.Max(width,100),PdksUiKit.InferRole(new Button{Text=text}));
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
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions");}
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
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions");}
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
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions");}
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
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions");}
    }

    void DeleteAllFirma()
    {
        try
        {
            if(Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where SIRKET is not null")??0)>0)throw new InvalidOperationException("Firmalar kullanımda olduğu için toplu silme yapılamaz.");
            if(MessageBox.Show("Tüm firmalar silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
            db.Execute("delete from FIRMA"); firmaCode=null; LoadFirmaList();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions");}
    }

    void LoadBordroList()
    {
        try
        {
            var g=(DataGridView)bordro["GRID"]; g.DataSource=db.Query("select KOD,AD,KAD,BKOD,CARPAN,CALAN,TIP from BORDRO order by KOD");
            if(g.Rows.Count>0)g.CurrentCell=g.Rows[0].Cells[0]; else {bordroCode=null;ClearBordro();}
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions");}
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
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions");}
    }

    static object DbOrNull(string s)=>string.IsNullOrWhiteSpace(s)?DBNull.Value:s;

    void DeleteBordro()
    {
        if(bordroCode is null)return;
        if(MessageBox.Show("Seçili bordro alanı silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
        try{db.Execute("delete from BORDRO where KOD=@K",new FbParameter("@K",bordroCode));bordroCode=null;LoadBordroList();}
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions");}
    }

    sealed class SimpleDefinitionPage
    {
        readonly FirebirdDatabase db; readonly string table; readonly string kimlikColumn; readonly TextBox edit; readonly DataGridView grid; readonly string owner;
        int? code; bool editing; Button? saveButton;
        public SimpleDefinitionPage(FirebirdDatabase db,string table,string kimlikColumn,TextBox edit,DataGridView grid,string owner)
        {
            this.db=db;this.table=table;this.kimlikColumn=kimlikColumn;this.edit=edit;this.grid=grid;this.owner=owner;
            grid.SelectionChanged+=(_,_)=>{if(!editing)LoadSelection();};
        }
        Button B(string text,int x,int y)=>Command(text,x,y,121);
        public Button SaveButton(int x,int y){var b=B("K&aydet",x,y);b.Enabled=false;b.Click+=(_,_)=>Save(b);saveButton=b;return b;}
        public Button AddButton(int x,int y){var b=B("&Yeni Ekle",x,y);b.Click+=(_,_)=>{code=null;edit.Clear();editing=true;edit.ReadOnly=false;if(saveButton is not null)saveButton.Enabled=true;edit.Focus();};return b;}
        public Button EditButton(int x,int y){var b=B("&Değiştir",x,y);b.Click+=(_,_)=>{if(code is null)return;editing=true;edit.ReadOnly=false;if(saveButton is not null)saveButton.Enabled=true;edit.Focus();};return b;}
        public Button DeleteButton(int x,int y){var b=B("&Sil",x,y);b.Click+=(_,_)=>Delete();return b;}
        public Button DeleteAllButton(int x,int y){var b=B("Tü&münü Sil",x,y);b.Click+=(_,_)=>DeleteAll();return b;}
        public void Reload(){try{grid.DataSource=db.Query($"select KOD,AD from {table} order by KOD");if(grid.Rows.Count>0)grid.CurrentCell=grid.Rows[0].Cells[0];else{code=null;edit.Clear();}}catch(Exception ex){PdksErrorPresenter.Show(null,ex,owner,MessageBoxIcon.Warning,"Definitions.Simple");}}
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
            catch(Exception ex){PdksErrorPresenter.Show(null,ex,owner,MessageBoxIcon.Warning,"Definitions.Simple");}
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
            catch(Exception ex){PdksErrorPresenter.Show(null,ex,owner,MessageBoxIcon.Warning,"Definitions.Simple");}
        }
        void DeleteAll()
        {
            try
            {
                if(Usage()>0)throw new InvalidOperationException("Bu tanımlar personel kayıtlarında kullanılıyor; toplu silme yapılamaz.");
                if(MessageBox.Show("Tüm kayıtlar silinsin mi?",owner,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
                db.Execute($"delete from {table}");code=null;Reload();
            }
            catch(Exception ex){PdksErrorPresenter.Show(null,ex,owner,MessageBoxIcon.Warning,"Definitions.Simple");}
        }
    }
}

static class LegacyControlExtensions
{
    public static void Let<T>(this T value,Action<T> action)=>action(value);
}
