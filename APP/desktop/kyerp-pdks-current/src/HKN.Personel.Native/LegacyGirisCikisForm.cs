using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyGirisCikisForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DataGridView grid = new(){ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,BackgroundColor=PdksAppearance.Current.Surface,AutoGenerateColumns=false};
    readonly TextBox cardStart = new(); readonly TextBox cardEnd = new(); readonly TextBox name = new();
    readonly ComboBox punch = new(){DropDownStyle=ComboBoxStyle.DropDownList};
    readonly DateTimePicker dateStart = D(); readonly DateTimePicker dateEnd = D();
    readonly TextBox inFirst = new(){PlaceholderText="08:20"}, inLast = new(){PlaceholderText="08:35"}, outFirst = new(){PlaceholderText="18:50"}, outLast = new(){PlaceholderText="19:10"};
    readonly CheckBox manual = new(){Text="Sadece manuel",AutoSize=true};
    readonly ComboBox group=C(), department=C(), company=C(), service=C(), status=C(), duty=C(), sort=new(){DropDownStyle=ComboBoxStyle.DropDownList};
    readonly ToolStripStatusLabel statusText = new(){Spring=true,TextAlign=ContentAlignment.MiddleLeft};
    DataTable current = new();
    readonly string? initialCard;
    readonly DateTime? initialDate;

    public LegacyGirisCikisForm(string? initialCard=null, DateTime? initialDate=null){this.initialCard=initialCard;this.initialDate=initialDate;Text="Giriş ve Çıkışlar";StartPosition=FormStartPosition.CenterScreen;Size=new Size(1220,740);MinimumSize=new Size(980,620);Font=new Font("Segoe UI",9f);BackColor=PdksAppearance.Current.Canvas;KeyPreview=true;Build();Shown+=(_,_)=>BeginInvoke((Action)Init);KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};}
    static DateTimePicker D()=>new(){Format=DateTimePickerFormat.Short};
    static DateTimePicker D(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy"};
    static Label L(string text,int x,int y)=>new(){Text=text,Location=new Point(x,y),AutoSize=true,ForeColor=PdksAppearance.Current.Muted};
    static ComboBox C()=>new(){DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="TEXT",ValueMember="KOD"};
    static Label L(string text)=>new(){Text=text,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=PdksAppearance.Current.Muted};
    static void Row(TableLayoutPanel t,int r,string label,Control c){t.RowStyles.Add(new RowStyle(SizeType.Absolute,36));t.Controls.Add(L(label),0,r);c.Dock=DockStyle.Fill;c.Margin=new Padding(3,5,3,5);t.Controls.Add(c,1,r);}
    static Button Btn(string text,int width=110)=>new(){Text=text,Width=width,Height=36,MinimumSize=new Size(width,36),MaximumSize=new Size(width,36),FlatStyle=FlatStyle.Flat,Font=new Font("Segoe UI",9f,FontStyle.Bold)};

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,ColumnCount=1,Padding=new Padding(16),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,238));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,56));

        var filterCard=PdksUiKit.Card(0);filterCard.Margin=new Padding(0,0,0,10);
        var filterRoot=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,Padding=new Padding(16),BackColor=p.Surface};
        filterRoot.RowStyles.Add(new RowStyle(SizeType.Absolute,34));
        filterRoot.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        filterRoot.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        filterRoot.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        filterRoot.Controls.Add(new Label{Text="Giriş / Çıkış Kayıtları",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=p.Text,TextAlign=ContentAlignment.MiddleLeft},0,0);

        var primary=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=6,RowCount=1};
        primary.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,14));
        primary.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,14));
        primary.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,18));
        primary.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,18));
        primary.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,20));
        primary.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,16));
        AddFilterField(primary,0,"Kart Başlangıç",cardStart);
        AddFilterField(primary,1,"Kart Bitiş",cardEnd);
        AddFilterField(primary,2,"Başlangıç Tarihi",dateStart);
        AddFilterField(primary,3,"Bitiş Tarihi",dateEnd);
        AddFilterField(primary,4,"Ad / Soyad",name);
        AddFilterField(primary,5,"Kart Basma",punch);
        filterRoot.Controls.Add(primary,0,1);

        var secondary=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=8,RowCount=1};
        for(var i=0;i<8;i++)secondary.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,12.5f));
        AddFilterField(secondary,0,"Grup",group);
        AddFilterField(secondary,1,"Bölüm",department);
        AddFilterField(secondary,2,"Servis",service);
        AddFilterField(secondary,3,"Durum",status);
        AddFilterField(secondary,4,"Görev",duty);
        AddFilterField(secondary,5,"Firma",company);
        AddFilterField(secondary,6,"Sıralama",sort);
        var manualHost=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(4,23,0,0),WrapContents=false};manual.AutoSize=true;manualHost.Controls.Add(manual);secondary.Controls.Add(manualHost,7,0);
        filterRoot.Controls.Add(secondary,0,2);

        var advanced=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=6,RowCount=1,Margin=Padding.Empty};
        advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,16));
        advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,16));
        advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,16));
        advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,16));
        advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,18));
        advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,18));
        AddFilterField(advanced,0,"Giriş Saati ≥",inFirst);
        AddFilterField(advanced,1,"Giriş Saati ≤",inLast);
        AddFilterField(advanced,2,"Çıkış Saati ≥",outFirst);
        AddFilterField(advanced,3,"Çıkış Saati ≤",outLast);
        var hint=new Label
        {
            Text="Saat filtreleri isteğe bağlıdır. Boş bırakırsanız tüm saatler listelenir.",
            Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=p.Muted,
            Font=new Font("Segoe UI",8.2f),Padding=new Padding(8,20,4,0)
        };
        advanced.Controls.Add(hint,4,0);
        advanced.SetColumnSpan(hint,2);
        filterRoot.Controls.Add(advanced,0,3);
        filterCard.Controls.Add(filterRoot);
        root.Controls.Add(filterCard,0,0);

        AddCol("PKNO","Kart No",70);AddCol("AD","Adı",110);AddCol("SOYAD","Soyadı",110);AddCol("GTARIH","Giriş Tarihi",96);AddCol("GSAAT","Giriş Saati",84);AddCol("GTUR","Giriş",58);AddCol("CTARIH","Çıkış Tarihi",96);AddCol("CSAAT","Çıkış Saati",84);AddCol("CTUR","Çıkış",58);AddCol("GRUPAD","Grubu",120);AddCol("BOLUMAD","Bölümü",120);
        grid.Dock=DockStyle.Fill;grid.Margin=new Padding(0);grid.BorderStyle=BorderStyle.None;grid.RowHeadersVisible=false;grid.RowTemplate.Height=30;grid.ColumnHeadersHeight=34;
        grid.CellDoubleClick+=(_,_)=>EditSelected();
        root.Controls.Add(grid,0,1);

        var bar=PdksUiKit.ActionBar(true,p.Canvas);
        var show=ModernGcButton("Göster",96,true);
        var add=ModernGcButton("+ Yeni Kayıt",112,true);
        var edit=ModernGcButton("Düzenle",92,false);
        var report=ModernGcButton("Rapor",88,false);
        var more=ModernGcButton("Diğer İşlemler ▾",132,false);
        show.Click+=(_,_)=>Reload();
        add.Click+=(_,_)=>EditRecord(null);
        edit.Click+=(_,_)=>EditSelected();
        report.Click+=(_,_)=>PrintList();
        var moreMenu=new ContextMenuStrip{Font=new Font("Segoe UI",9f),BackColor=p.Surface,ForeColor=p.Text};
        moreMenu.Items.Add(MI("Girişi Manuel Tamamla",()=>SetManualSide(true)));
        moreMenu.Items.Add(MI("Çıkışı Manuel Tamamla",()=>SetManualSide(false)));
        moreMenu.Items.Add(new ToolStripSeparator());
        moreMenu.Items.Add(MI("Seçili Kaydı Sil",DeleteSelected));
        moreMenu.Items.Add(MI("Listelenen Kayıtları Sil",DeleteListed));
        more.Click+=(_,_)=>moreMenu.Show(more,new Point(0,more.Height));
        bar.Controls.AddRange([more,report,edit,add,show]);
        root.Controls.Add(bar,0,2);
        Controls.Add(root);

        var ctx=new ContextMenuStrip();
        ctx.Items.AddRange([MI("Sil",DeleteSelected),MI("Listedeki Kayıtları Sil",DeleteListed),MI("Yeni Ekle",()=>EditRecord(null)),MI("Değiştir",EditSelected),MI("Girişi E Yap",()=>SetManualSide(true)),MI("Çıkışı E Yap",()=>SetManualSide(false)),MI("Rapor",PrintList)]);
        grid.ContextMenuStrip=ctx;
        name.KeyDown+=(_,e)=>{if(e.KeyCode==Keys.Enter)Reload();};
    }

    static void AddFilterField(TableLayoutPanel table,int column,string caption,Control control)
    {
        var host=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Margin=new Padding(0,0,10,0)};
        host.RowStyles.Add(new RowStyle(SizeType.Absolute,20));host.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        host.Controls.Add(new Label{Text=caption,Dock=DockStyle.Fill,Font=new Font("Segoe UI",8f,FontStyle.Bold),ForeColor=PdksAppearance.Current.Muted,TextAlign=ContentAlignment.MiddleLeft},0,0);
        control.Dock=DockStyle.Fill;control.Margin=new Padding(0,2,0,0);host.Controls.Add(control,0,1);table.Controls.Add(host,column,0);
    }

    static Button ModernGcButton(string text,int width,bool primary,bool danger=false)
        => PdksUiKit.Button(text,width,primary?PdksActionRole.Primary:danger?PdksActionRole.Danger:PdksActionRole.Secondary);

    static ToolStripMenuItem MI(string text,Action a){var m=new ToolStripMenuItem(text);m.Click+=(_,_)=>a();return m;}
    void AddCol(string n,string h,int w)=>grid.Columns.Add(new DataGridViewTextBoxColumn{Name=n,DataPropertyName=n,HeaderText=h,Width=w});
    void Init()
    {
        punch.Items.AddRange(["Tümü","Giriş","Çıkış"]);punch.SelectedIndex=0;sort.Items.AddRange(["Kart No","Ad Soyad","Giriş Tarihi","Çıkış Tarihi"]);sort.SelectedIndex=0;
        dateStart.Value=initialDate?.Date ?? DateTime.Today.AddDays(-30);dateEnd.Value=initialDate?.Date ?? DateTime.Today;
        if(!string.IsNullOrWhiteSpace(initialCard)){cardStart.Text=initialCard;cardEnd.Text=initialCard;}
        LoadLookup(group,"GRUP");LoadLookup(department,"BOLUM");LoadLookup(service,"SERVIS");LoadLookup(status,"DURUM");LoadLookup(duty,"GOREV");LoadLookup(company,"FIRMA");Reload();
    }

    void LoadLookup(ComboBox c,string table)
    {
        var src=db.Query($"select KOD,AD from {table} order by KOD");var all=src.NewRow();all["KOD"]=-1;all["AD"]="Tümü";src.Rows.InsertAt(all,0);src.Columns.Add("TEXT",typeof(string),"AD");c.DataSource=src;c.SelectedValue=-1;
    }

    void Reload()
    {
        try
        {
            var where=new List<string>{"g.GTARIH>=@A","g.GTARIH<@B"};var ps=new List<FbParameter>{new("@A",dateStart.Value.Date),new("@B",dateEnd.Value.Date.AddDays(1))};
            if(!string.IsNullOrWhiteSpace(cardStart.Text)){where.Add("g.PKNO>=@KS");ps.Add(new("@KS",cardStart.Text.Trim().PadLeft(5,'0')));} if(!string.IsNullOrWhiteSpace(cardEnd.Text)){where.Add("g.PKNO<=@KB");ps.Add(new("@KB",cardEnd.Text.Trim().PadLeft(5,'0')));}
            if(!string.IsNullOrWhiteSpace(name.Text)){where.Add("(upper(k.AD) containing upper(@N) or upper(k.SOYAD) containing upper(@N))");ps.Add(new("@N",name.Text.Trim()));}
            AddFilter(where,ps,"k.GRUP",group,"G");AddFilter(where,ps,"k.BOLUM",department,"D");AddFilter(where,ps,"k.SERVIS",service,"S");AddFilter(where,ps,"k.DURUM",status,"U");AddFilter(where,ps,"k.GOREV",duty,"R");AddFilter(where,ps,"k.SIRKET",company,"F");
            if(punch.SelectedIndex==1)where.Add("g.GSAAT is not null");if(punch.SelectedIndex==2)where.Add("g.CSAAT is not null");if(manual.Checked)where.Add("(coalesce(g.GTUR,'')='E' or coalesce(g.CTUR,'')='E')");
            AddTimeFilter(where,ps,"g.GDAKIKA",inFirst,true,"GIF");AddTimeFilter(where,ps,"g.GDAKIKA",inLast,false,"GIL");AddTimeFilter(where,ps,"g.CDAKIKA",outFirst,true,"GOF");AddTimeFilter(where,ps,"g.CDAKIKA",outLast,false,"GOL");
            var order=sort.SelectedIndex switch{1=>"k.AD,k.SOYAD,g.GTARIH",2=>"g.GTARIH,g.PKNO",3=>"g.CTARIH,g.PKNO",_=>"g.PKNO,g.GTARIH"};
            var sql=$"select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR,g.MKOD,g.BOLUM,gr.AD GRUPAD,b.AD BOLUMAD from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO left join GRUP gr on gr.KOD=k.GRUP left join BOLUM b on b.KOD=g.BOLUM where {string.Join(" and ",where)} order by {order}";
            current=db.Query(sql,ps.ToArray());grid.DataSource=current;statusText.Text=$"Kayıt Sayısı : {current.Rows.Count}";
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"EntryExit");}
    }

    static void AddFilter(List<string>w,List<FbParameter>p,string field,ComboBox c,string key){if(c.SelectedValue is int v&&v>=0){w.Add($"{field}=@{key}");p.Add(new FbParameter("@"+key,v));}}
    static void AddTimeFilter(List<string> where,List<FbParameter> parameters,string field,TextBox input,bool lowerBound,string key)
    {
        if(!TimeSpan.TryParse(input.Text.Trim(),out var time))return;
        where.Add($"{field}{(lowerBound?">=":"<=")}@{key}");
        parameters.Add(new FbParameter("@"+key,(int)time.TotalMinutes));
    }
    DataRow? Row()=>grid.CurrentRow?.DataBoundItem is DataRowView v?v.Row:null;
    void EditSelected(){var r=Row();if(r is null)return;EditRecord(r);}

    void EditRecord(DataRow? r)
    {
        var selectedId=r is null?(int?)null:Convert.ToInt32(r["SIRA"]);var selectedPk=r is null?"":Convert.ToString(r["PKNO"])??"";
        var oldKeys=new List<(string Card,DateTime Day)>();if(r is not null){if(r["GTARIH"]!=DBNull.Value)oldKeys.Add((selectedPk,Convert.ToDateTime(r["GTARIH"]).Date));if(r["CTARIH"]!=DBNull.Value)oldKeys.Add((selectedPk,Convert.ToDateTime(r["CTARIH"]).Date));}
        using var d=new Form{Text=r is null?"Giriş / Çıkış Ekleme":"Giriş / Çıkış Düzenle",StartPosition=FormStartPosition.CenterParent,ClientSize=new Size(500,300),MinimumSize=new Size(480,280),FormBorderStyle=FormBorderStyle.Sizable,MaximizeBox=false,MinimizeBox=false,Font=new Font("Segoe UI",9f),BackColor=PdksAppearance.Current.Canvas};
        var card=new TextBox{Location=new Point(130,18),Size=new Size(90,21),Text=selectedPk};var gd=D(130,52,180);var gt=new TextBox{Location=new Point(315,52),Size=new Size(55,21)};var cd=D(130,86,180);var ct=new TextBox{Location=new Point(315,86),Size=new Size(55,21)};
        if(r is not null){if(r["GTARIH"]!=DBNull.Value)gd.Value=Convert.ToDateTime(r["GTARIH"]);if(r["CTARIH"]!=DBNull.Value)cd.Value=Convert.ToDateTime(r["CTARIH"]);gt.Text=Convert.ToString(r["GSAAT"]);ct.Text=Convert.ToString(r["CSAAT"]);}else{gd.Value=cd.Value=DateTime.Today;}
        d.Controls.AddRange([L("Kart No",25,22),L("Giriş Tarihi / Saati",25,56),L("Çıkış Tarihi / Saati",25,90),card,gd,gt,cd,ct]);
        var ok=PdksUiKit.Button("Kaydet",100,PdksActionRole.Primary);
        var cancel=PdksUiKit.Button("Kapat",100,PdksActionRole.Quiet,()=>d.Close());
        ok.Location=new Point(250,190);cancel.Location=new Point(360,190);d.Controls.AddRange([ok,cancel]);
        ok.Click+=(_,_)=>{try{var pk=card.Text.Trim().PadLeft(5,'0');if(pk.Length!=5)throw new InvalidOperationException("Kart numarası 5 haneli olmalıdır.");if(!TimeSpan.TryParse(gt.Text.Trim(),out var ti)||!TimeSpan.TryParse(ct.Text.Trim(),out var to))throw new InvalidOperationException("Saatleri SS:dd biçiminde girin.");var dep=db.Scalar("select BOLUM from KIMLIK where PKNO=@P",new FbParameter("@P",pk));var pars=new[]{new FbParameter("@P",pk),new FbParameter("@GD",gd.Value.Date),new FbParameter("@GS",$"{ti.Hours:00}:{ti.Minutes:00}"),new FbParameter("@GDK",(int)ti.TotalMinutes),new FbParameter("@CD",cd.Value.Date),new FbParameter("@CS",$"{to.Hours:00}:{to.Minutes:00}"),new FbParameter("@CDK",(int)to.TotalMinutes),new FbParameter("@B",dep??DBNull.Value)};if(selectedId is null){var seq=Convert.ToInt32(db.Scalar("select coalesce(max(SIRA),0)+1 from GIRCIK")??1);db.Execute("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,CTARIH,CSAAT,CDAKIKA,CTUR,BOLUM) values (@Q,@P,@GD,@GS,@GDK,'E',@CD,@CS,@CDK,'E',@B)",[new FbParameter("@Q",seq),..pars]);ManualEditAudit.Record("INSERT",pk,gd.Value.Date,$"{ti.Hours:00}:{ti.Minutes:00}",$"{to.Hours:00}:{to.Minutes:00}");}else{db.Execute("update GIRCIK set PKNO=@P,GTARIH=@GD,GSAAT=@GS,GDAKIKA=@GDK,GTUR='E',CTARIH=@CD,CSAAT=@CS,CDAKIKA=@CDK,CTUR='E',BOLUM=@B where SIRA=@Q",[..pars,new FbParameter("@Q",selectedId.Value)]);ManualEditAudit.Record("UPDATE",pk,gd.Value.Date,$"{ti.Hours:00}:{ti.Minutes:00}",$"{to.Hours:00}:{to.Minutes:00}");}OperationalTnfSyncService.AlignPersonDays(db,oldKeys.Concat(new[]{(pk,gd.Value.Date),(pk,cd.Value.Date)}));d.DialogResult=DialogResult.OK;d.Close();}catch(Exception ex){PdksErrorPresenter.Show(d,ex,d.Text,MessageBoxIcon.Warning,"EntryExit.Editor");}};
        if(d.ShowDialog(this)==DialogResult.OK)Reload();
    }

    void SetManualSide(bool entry)
    {
        var r=Row(); if(r is null)return;
        var pk=Convert.ToString(r["PKNO"])??"";
        var dayValue=entry?r["GTARIH"]:r["CTARIH"];
        if(dayValue==DBNull.Value)throw new InvalidOperationException(entry?"Giriş tarihi yok.":"Çıkış tarihi yok.");
        var day=Convert.ToDateTime(dayValue).Date;
        var old=Convert.ToString(r[entry?"GSAAT":"CSAAT"])??"";
        using var d=new Form{Text=entry?"Manuel Giriş Saati":"Manuel Çıkış Saati",StartPosition=FormStartPosition.CenterParent,ClientSize=new Size(420,210),MinimumSize=new Size(400,190),FormBorderStyle=FormBorderStyle.Sizable,MaximizeBox=false,MinimizeBox=false,Font=new Font("Segoe UI",9f),BackColor=PdksAppearance.Current.Canvas};
        var box=new TextBox{Text=old,Location=new Point(140,48),Width=120};
        d.Controls.AddRange([new Label{Text="Saat (SS:dd)",Location=new Point(35,52),AutoSize=true,ForeColor=PdksAppearance.Current.Muted},box]);
        var ok=PdksUiKit.Button("Kaydet",100,PdksActionRole.Primary);ok.Location=new Point(140,112);ok.DialogResult=DialogResult.OK; d.Controls.Add(ok); d.AcceptButton=ok;
        if(d.ShowDialog(this)!=DialogResult.OK)return;
        if(!TimeSpan.TryParse(box.Text.Trim(),out var t))throw new InvalidOperationException("Saat SS:dd biçiminde olmalıdır.");
        var formatted=$"{t.Hours:00}:{t.Minutes:00}"; var minutes=(int)t.TotalMinutes; var id=Convert.ToInt32(r["SIRA"]);
        if(entry) db.Execute("update GIRCIK set GSAAT=@T,GDAKIKA=@M,GTUR='E' where SIRA=@Q",new FbParameter("@T",formatted),new FbParameter("@M",minutes),new FbParameter("@Q",id));
        else db.Execute("update GIRCIK set CSAAT=@T,CDAKIKA=@M,CTUR='E' where SIRA=@Q",new FbParameter("@T",formatted),new FbParameter("@M",minutes),new FbParameter("@Q",id));
        ManualEditAudit.Record(entry?"ENTRY_E":"EXIT_E",pk,day,entry?formatted:Convert.ToString(r["GSAAT"])??"",entry?Convert.ToString(r["CSAAT"])??"":formatted);
        OperationalTnfSyncService.AlignPersonDay(db,pk,day);
        Reload();
    }

    void DeleteSelected(){var r=Row();if(r is null)return;if(MessageBox.Show("Seçili giriş-çıkış kaydı silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;var pk=Convert.ToString(r["PKNO"])??"";var keys=new List<(string Card,DateTime Day)>();if(r["GTARIH"]!=DBNull.Value)keys.Add((pk,Convert.ToDateTime(r["GTARIH"]).Date));if(r["CTARIH"]!=DBNull.Value)keys.Add((pk,Convert.ToDateTime(r["CTARIH"]).Date));ManualEditAudit.Record("DELETE",pk,r["GTARIH"]==DBNull.Value?DateTime.Today:Convert.ToDateTime(r["GTARIH"]),Convert.ToString(r["GSAAT"])??"",Convert.ToString(r["CSAAT"])??"");db.Execute("delete from GIRCIK where SIRA=@Q",new FbParameter("@Q",Convert.ToInt32(r["SIRA"])));OperationalTnfSyncService.AlignPersonDays(db,keys);Reload();}
    void DeleteListed(){if(current.Rows.Count==0)return;if(MessageBox.Show($"Listede görünen {current.Rows.Count} kayıt silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;var keys=new List<(string Card,DateTime Day)>();foreach(DataRow row in current.Rows){var pk=Convert.ToString(row["PKNO"])??"";if(row["GTARIH"]!=DBNull.Value)keys.Add((pk,Convert.ToDateTime(row["GTARIH"]).Date));if(row["CTARIH"]!=DBNull.Value)keys.Add((pk,Convert.ToDateTime(row["CTARIH"]).Date));ManualEditAudit.Record("BULK_DELETE",pk,row["GTARIH"]==DBNull.Value?DateTime.Today:Convert.ToDateTime(row["GTARIH"]),Convert.ToString(row["GSAAT"])??"",Convert.ToString(row["CSAAT"])??"");}var ids=current.AsEnumerable().Where(x=>x["SIRA"]!=DBNull.Value).Select(x=>Convert.ToInt32(x["SIRA"])).ToArray();db.InTransaction((c,t)=>{foreach(var id in ids){using var cmd=FirebirdDatabase.CreateCommand(c,t,"delete from GIRCIK where SIRA=@Q",new FbParameter("@Q",id));cmd.ExecuteNonQuery();}return 0;});OperationalTnfSyncService.AlignPersonDays(db,keys);Reload();}
    void PrintList()
    {
        try
        {
            var columns=grid.Columns.Cast<DataGridViewColumn>().Where(c=>c.Visible).OrderBy(c=>c.DisplayIndex).ToArray();
            var rows=grid.Rows.Cast<DataGridViewRow>().Where(r=>!r.IsNewRow)
                .Select(r=>(IReadOnlyList<string>)columns.Select(c=>Convert.ToString(r.Cells[c.Index].FormattedValue)??string.Empty).ToArray()).ToArray();
            var report=new KYERP.PDKS.Core.Reports.ReportTable($"Giriş - Çıkış Raporu • {dateStart.Value:dd.MM.yyyy} - {dateEnd.Value:dd.MM.yyyy}",columns.Select(c=>c.HeaderText).ToArray(),rows);
            ReportPrintHelper.Preview(this,report,true);
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,"Giriş - Çıkış Raporu",MessageBoxIcon.Warning,"EntryExit.Report");}
    }
}
