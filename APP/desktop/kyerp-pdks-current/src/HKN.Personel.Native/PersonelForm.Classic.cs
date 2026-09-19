using System.Data;
using System.Globalization;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    readonly ComboBox searchField = new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=74};
    readonly TextBox searchText = new(){Width=164};
    readonly FlowLayoutPanel sortPanel = new(){Dock=DockStyle.Fill,FlowDirection=FlowDirection.LeftToRight,WrapContents=false};
    readonly Label stActive = new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};
    readonly Label stLeft = new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};
    readonly Label stTotal = new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};
    readonly Label stListed = new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};
    readonly PictureBox photo = new(){Dock=DockStyle.Fill,BorderStyle=BorderStyle.FixedSingle,SizeMode=PictureBoxSizeMode.Zoom,BackColor=Color.White};

    void BuildUiClassic()
    {
        AutoScaleMode=AutoScaleMode.None;
        MinimumSize=new Size(961,572); Size=new Size(961,572);
        Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Regular,GraphicsUnit.Point);
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=3,Padding=new Padding(6,25,6,0),Margin=Padding.Empty};
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,390)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,77)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,22));
        BuildClassicList(); root.Controls.Add(list,0,0); BuildClassicRight(root); root.Controls.Add(BuildClassicSearch(),0,1); var st=BuildClassicStatus(); root.Controls.Add(st,0,2); root.SetColumnSpan(st,2);
        Controls.Add(root);
        list.DataBindingComplete += (_,_)=>{ConfigureListColumns();UpdateClassicStats();};
        tabs.SelectedIndexChanged += (_,_)=>ApplyClassicGridStyles();
    }

    Control BuildClassicStatusPlaceholder()=>new Panel{Visible=false};
    void BuildClassicList()
    {
        list.Dock=DockStyle.Fill; list.Margin=new Padding(0); list.BorderStyle=BorderStyle.FixedSingle; list.BackgroundColor=SystemColors.Control;
        list.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.None; list.RowHeadersWidth=18; list.RowHeadersVisible=true;
        list.ColumnHeadersHeight=20; list.RowTemplate.Height=20; list.AllowUserToResizeRows=false; list.MultiSelect=false;
        list.DefaultCellStyle.Font=Font; list.ColumnHeadersDefaultCellStyle.Font=Font; list.SelectionMode=DataGridViewSelectionMode.FullRowSelect;
        list.SelectionChanged += (_,_)=>{if(list.CurrentRow?.Cells["PKNO"].Value is object v)LoadPerson(v.ToString()!);};
    }

    void ConfigureListColumns()
    {
        if(list.Columns.Count==0)return;
        string[] names={"PKNO","AD","SOYAD","IGTARIH","ICTARIH"}; int[] widths={48,76,86,84,84}; string[] heads={"Kart No","Adı","Soyadı","İş. Gir. Tar.","İş. Çıkış Tar."};
        for(int i=0;i<names.Length;i++)if(list.Columns.Contains(names[i])){var c=list.Columns[names[i]];c.HeaderText=heads[i];c.Width=widths[i];c.DefaultCellStyle.NullValue="";}
        foreach(DataGridViewColumn c in list.Columns)c.SortMode=DataGridViewColumnSortMode.NotSortable;
    }

    void BuildClassicRight(TableLayoutPanel root)
    {
        var right=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Margin=new Padding(4,0,0,0)};
        right.RowStyles.Add(new RowStyle(SizeType.Absolute,137)); right.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        right.Controls.Add(BuildClassicHeader(),0,0); BuildTabsClassic(); right.Controls.Add(tabs,0,1); root.Controls.Add(right,1,0);
        var buttons=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(6,12,52,0),WrapContents=false};
        buttons.Controls.Add(ClassicButton("Per. Bilgisi",100,()=>{if(currentPk!="")LoadPerson(currentPk);})); buttons.Controls.Add(ClassicButton("Sil",100,MarkExit));
        buttons.Controls.Add(ClassicButton("Değiştir",100,()=>OpenPersonEditor(false))); buttons.Controls.Add(ClassicButton("Yeni Ekle",100,()=>OpenPersonEditor(true))); root.Controls.Add(buttons,1,1); Action syncTabLayout=()=>{bool info=tabs.SelectedIndex<=0||tabs.SelectedTab?.Text=="Personel Bilgileri";buttons.Visible=info;root.SetRowSpan(right,info?1:2);}; tabs.SelectedIndexChanged+=(_,_)=>syncTabLayout(); syncTabLayout();
    }

    Button ClassicButton(string text,int w,Action a){var b=new Button{Text=text,Width=w,Height=31,Font=new Font(Font,FontStyle.Bold),ForeColor=Color.Navy,Image=ClassicGlyph(text),ImageAlign=ContentAlignment.MiddleLeft,UseVisualStyleBackColor=true};b.Click+=(_,_)=>a();return b;}
    Control BuildClassicHeader()
    {
        var p=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=5,RowCount=6,Padding=new Padding(5,3,5,3),Margin=Padding.Empty};
        p.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,78)); p.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,92)); p.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,58)); p.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100)); p.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,96));
        for(int i=0;i<6;i++)p.RowStyles.Add(new RowStyle(SizeType.Percent,16.66f));
        HeaderField(p,0,"Kart Numarası","PKNO"); HeaderField(p,1,"Grubu","GRUPAD",false); HeaderField(p,2,"Adı","AD"); HeaderField(p,3,"Bölümü","BOLUMAD",false);
        HeaderField(p,4,"Soyadı","SOYAD"); HeaderField(p,5,"Durum","DURUMAD",false); HeaderField(p,6,"Maaşı","MAAS"); HeaderField(p,7,"Servis","SERVISAD",false);
        HeaderField(p,8,"İşe Giriş Tarihi","IGTARIH"); HeaderField(p,9,"Görev","GOREVAD",false); HeaderField(p,10,"Çıkış Tarihi","ICTARIH"); HeaderField(p,11,"Firma","FIRMAAD",false);
        p.Controls.Add(photo,4,0); p.SetRowSpan(photo,6); return p;
    }

    void HeaderField(TableLayoutPanel p,int i,string label,string key,bool edit=true)
    {
        int row=i/2;int col=(i%2)*2;var l=new Label{Text=label,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Margin=new Padding(0,1,2,1)};
        var t=new TextBox{Dock=DockStyle.Fill,ReadOnly=!edit,Margin=new Padding(0,1,2,1),BorderStyle=BorderStyle.FixedSingle};f[key]=t;p.Controls.Add(l,col,row);p.Controls.Add(t,col+1,row);
    }

    void BuildTabsClassic()
    {
        tabs.TabPages.Clear(); tabs.Margin=Padding.Empty; tabs.Padding=new Point(7,3); tabs.Font=Font;
        var info=new TabPage("Personel Bilgileri");var inner=new TabControl{Dock=DockStyle.Fill,Font=Font,Padding=new Point(7,3)};
        inner.TabPages.Add(BuildKimlikClassic()); inner.TabPages.Add(BuildKisiselClassic()); info.Controls.Add(inner);
        tabs.TabPages.Add(info); tabs.TabPages.Add(BuildGirisClassic()); tabs.TabPages.Add(BuildIzinClassic()); tabs.TabPages.Add(BuildEkkClassic()); tabs.TabPages.Add(BuildBilgiClassic()); tabs.TabPages.Add(BuildOdemeClassic());
        ApplyClassicGridStyles();
    }

    TabPage BuildKimlikClassic()
    {
        var page=new TabPage("Kimlik Bilgileri");var t=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=9,Padding=new Padding(4)};
        t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,42));t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,58));
        string[] z={"Ulusal Kimlik No","UKNO","Cinsiyeti","CINSIYET","Nüfusa Kayıtlı Olduğu İl","IL","Kan Grubu","KGB","Nüfusa Kayıtlı Olduğu İlçe","ILCE","Cilt No","CILTNO","Doğum Tarihi","DTARIH","Sayfa No","SAYFANO","Doğum Yeri","DYER","Kayıt No","KAYITNO","Baba Adı","BABAAD","Kütük Sıra No","KSIRANO","Ana Adı","ANAAD","N. C. Verildiği Yer","VYER","Medeni Hali","MEDHAL","N. C. Verildiği Tarih","NCVTAR","Uyruğu","UYRUK","N. C. Veriliş Nedeni","NCVNED"};
        FillPairs(t,z);page.Controls.Add(t);return page;
    }
    TabPage BuildKisiselClassic()
    {
        var page=new TabPage("Kişisel Bilgiler");var t=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=12,Padding=new Padding(4)};
        t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,42));t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,58));
        string[] z={"Vergi Kimlik No","VKNO","SSK No","SSKNO","Askerlik Durumu","ASDURUM","Elbise Beden No","ELBNO","Eğitim Durumu","EGTDURUM","Ayakkabı No","AYNO","Yabancı Dil","YDIL","Kullandığı İzin","KULIZIN","Uzmanlık Alanı","UALAN","Çocuk Sayısı","CCKSAY","Ehliyetin Sınıfı","ESINIF","Ev Telefonu","EVTEL","Ehliyetin Verildiği İl/İlçe","EVILILCE","Cep Telefonu","GSM","Ehliyet Belge Numarası","EBELGENO","Fazla Mesai Ücreti","MSUCRET","Ehliyetin Verildiği Tarih","EVTAR","Günlük Yemek Ücreti","GYEMUCRET","Kullandığı Cihaz","EKC","Günlük Yol Ücreti","GYUCRET","Eski Maaşı","EMAAS","İşten Çıkış Sebebi","ICIKSEBEB","","","Adres","ADRES"};
        FillPairs(t,z);page.Controls.Add(t);return page;
    }

    void FillPairs(TableLayoutPanel t,string[] z)
    {
        for(int i=0;i<z.Length;i+=2){int n=i/2,row=n/2,col=(n%2)*2;if(string.IsNullOrWhiteSpace(z[i]))continue;
            var l=new Label{Text=z[i],Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Margin=new Padding(0,0,2,0)};var b=new TextBox{Dock=DockStyle.Fill,BorderStyle=BorderStyle.FixedSingle,Margin=new Padding(0,0,3,1)};
            if(!string.IsNullOrEmpty(z[i+1]))f[z[i+1]]=b;t.Controls.Add(l,col,row);t.Controls.Add(b,col+1,row);}
    }

    Control BuildClassicSearch()
    {
        var outer=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Padding=new Padding(0,4,0,0),Margin=Padding.Empty};outer.RowStyles.Add(new RowStyle(SizeType.Absolute,30));outer.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var row=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Margin=Padding.Empty};var prev=NavButton("◀",-1);var next=NavButton("▶",1);searchField.Items.AddRange(new object[]{"Kart No","Ad","Soyad","İşe Giriş Tarihi","İşten Çıkış Tarihi"});searchField.SelectedIndex=0;
        row.Controls.Add(prev);row.Controls.Add(new Label{Text="Arama Alanı",AutoSize=true,Padding=new Padding(5,7,3,0)});row.Controls.Add(searchField);row.Controls.Add(searchText);row.Controls.Add(next);outer.Controls.Add(row,0,0);
        var g=new GroupBox{Text="Sıralama Şekli",Dock=DockStyle.Fill,Padding=new Padding(5,0,0,0)};string[] names={"Kart No","Ad","Soyad","İşe Giriş Tarihi","İşten Çıkış Tarihi"};string[] cols={"PKNO","AD","SOYAD","IGTARIH","ICTARIH"};
        for(int i=0;i<names.Length;i++){var r=new RadioButton{Text=names[i],AutoSize=true,Checked=i==0,Tag=cols[i],Margin=new Padding(2,3,4,0)};r.CheckedChanged+=SortChanged;sortPanel.Controls.Add(r);}g.Controls.Add(sortPanel);outer.Controls.Add(g,0,1);
        searchText.TextChanged+=(_,_)=>ApplyClassicSearch();searchField.SelectedIndexChanged+=(_,_)=>ApplyClassicSearch();return outer;
    }
    Button NavButton(string text,int delta){var b=new Button{Text=text,Width=24,Height=23,Margin=new Padding(1,1,1,0),ForeColor=Color.RoyalBlue};b.Click+=(_,_)=>MoveRow(delta);return b;}
    void MoveRow(int d){if(list.Rows.Count==0)return;int i=list.CurrentRow?.Index??0;i=Math.Max(0,Math.Min(list.Rows.Count-1,i+d));list.CurrentCell=list.Rows[i].Cells[0];}
    void ApplyClassicSearch(){if(list.DataSource is not DataTable dt)return;string s=searchText.Text.Replace("'","''").Trim();string c=searchField.SelectedIndex switch{1=>"AD",2=>"SOYAD",3=>"IGTARIH",4=>"ICTARIH",_=>"PKNO"};dt.DefaultView.RowFilter=s.Length==0?"":(c is "IGTARIH" or "ICTARIH"?$"CONVERT({c}, 'System.String') LIKE '%{s}%'":$"{c} LIKE '%{s}%'");UpdateClassicStats();}
    void SortChanged(object? sender,EventArgs e){if(sender is RadioButton r&&r.Checked&&list.DataSource is DataTable dt)dt.DefaultView.Sort=$"{r.Tag} ASC";}

    Control BuildClassicStatus()
    {
        var p=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,Margin=Padding.Empty,CellBorderStyle=TableLayoutPanelCellBorderStyle.Single};
        for(int i=0;i<4;i++)p.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25));p.Controls.Add(stActive,0,0);p.Controls.Add(stLeft,1,0);p.Controls.Add(stTotal,2,0);p.Controls.Add(stListed,3,0);return p;
    }
    void UpdateClassicStats()
    {
        try{int a=Convert.ToInt32(S("select count(*) from KIMLIK where ICTARIH is null"));int t=Convert.ToInt32(S("select count(*) from KIMLIK"));stActive.Text=$"Aktif Çalışan Personel : {a}";stLeft.Text=$"İşten Ayrılan Personel : {t-a}";stTotal.Text=$"Toplam Personel : {t}";stListed.Text=$"Listelenen Personel : {list.Rows.Count}";}catch{}
    }

    void SelectPeriodForToday(ComboBox c){if(c.DataSource is not DataTable d)return;int grp=0;try{var k=Q("select GRUP from KIMLIK where PKNO=@PK",new FirebirdSql.Data.FirebirdClient.FbParameter("@PK",currentPk));if(k.Rows.Count>0&&k.Rows[0][0]!=DBNull.Value)grp=Convert.ToInt32(k.Rows[0][0]);}catch{}for(int i=0;i<d.Rows.Count;i++){var r=d.Rows[i];if(r["BASTAR"]==DBNull.Value||r["BITTAR"]==DBNull.Value)continue;var a=((DateTime)r["BASTAR"]).Date;var b=((DateTime)r["BITTAR"]).Date;int g=r["GRUP"]==DBNull.Value?0:Convert.ToInt32(r["GRUP"]);if(DateTime.Today.Date>=a&&DateTime.Today.Date<=b&&(grp==0||g==grp)){c.SelectedIndex=i;return;}}}
    void ApplyClassicGridStyles()
    {
        StyleGrid(gGiris);StyleGrid(gIzin);StyleGrid(gEkk);StyleGrid(gBilgi);StyleGrid(gOdeme);
        gGiris.CellFormatting-=GirisFormat;gGiris.CellFormatting+=GirisFormat;gBilgi.CellFormatting-=BilgiFormat;gBilgi.CellFormatting+=BilgiFormat;
        gGiris.DataBindingComplete-=GirisBound;gGiris.DataBindingComplete+=GirisBound;gIzin.DataBindingComplete-=IzinBound;gIzin.DataBindingComplete+=IzinBound;gEkk.DataBindingComplete-=EkkBound;gEkk.DataBindingComplete+=EkkBound;gBilgi.DataBindingComplete-=BilgiBound;gBilgi.DataBindingComplete+=BilgiBound;gOdeme.DataBindingComplete-=OdemeBound;gOdeme.DataBindingComplete+=OdemeBound;
    }
    void StyleGrid(DataGridView g){g.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.None;g.RowHeadersWidth=18;g.RowTemplate.Height=20;g.ColumnHeadersHeight=20;g.BackgroundColor=SystemColors.Control;g.BorderStyle=BorderStyle.FixedSingle;g.GridColor=SystemColors.ControlDark;g.DefaultCellStyle.Font=Font;g.ColumnHeadersDefaultCellStyle.Font=Font;g.EnableHeadersVisualStyles=true;}

    void GirisBound(object? s,DataGridViewBindingCompleteEventArgs e){SetCol(gGiris,"SIRA",0,false);SetCol(gGiris,"GIRIS_TARIHI",104,true,"Giriş Tarihi");SetCol(gGiris,"GIRIS_SAATI",72,true,"Giriş Saati");SetCol(gGiris,"GTUR",34,true,"Tür");SetCol(gGiris,"CIKIS_TARIHI",104,true,"Çıkış Tarihi");SetCol(gGiris,"CIKIS_SAATI",72,true,"Çıkış Saati");SetCol(gGiris,"CTUR",34,true,"Tür");OrderGirisColumns();}
    void IzinBound(object? s,DataGridViewBindingCompleteEventArgs e){SetCol(gIzin,"SIRA",0,false);SetCol(gIzin,"SUREDAKIKA",0,false);SetCol(gIzin,"EBALAN",0,false);SetCol(gIzin,"TARIH",120,true,"Tarih");SetCol(gIzin,"BASSAAT",62,true,"Baş. Saat");SetCol(gIzin,"BITSAAT",62,true,"Bit. Saat");SetCol(gIzin,"SURESAAT",62,true,"Süre");SetCol(gIzin,"TIP",90,true,"Tip");SetCol(gIzin,"MAZERET",210,true,"Mazeret");}
    void EkkBound(object? s,DataGridViewBindingCompleteEventArgs e){SetCol(gEkk,"KOD",0,false);SetCol(gEkk,"ISLEM_TARIHI",108,true,"İşlem Tar.");SetCol(gEkk,"VERILIS_TARIHI",108,true,"Ver. Tar.");SetCol(gEkk,"TURU",85,true,"Türü");SetCol(gEkk,"MIKTAR",85,true,"Miktar");SetCol(gEkk,"ACIKLAMA",175,true,"Açıklama");}
    void BilgiBound(object? s,DataGridViewBindingCompleteEventArgs e){string[] n={"TARIH","NC","M50","M100","UIZIN","SAAT5","SAAT6","SAAT7","SAAT8","SAAT9","DEVAMSIZLIK","GEC_KALMA","EKSIK_SURE"};string[] h={"TARİH","N.Ç.","% 50","%100","Üsz.İ","5","6","7","8","9","Dvms.","Geç K.","Eks."};int[] w={105,48,48,48,42,36,36,36,36,36,50,50,50};for(int i=0;i<n.Length;i++)SetCol(gBilgi,n[i],w[i],true,h[i]);}
    void SetCol(DataGridView g,string n,int w,bool vis,string? h=null){if(!g.Columns.Contains(n))return;var c=g.Columns[n];c.Visible=vis;if(vis)c.Width=w;if(h!=null)c.HeaderText=h;}
    void GirisFormat(object? s,DataGridViewCellFormattingEventArgs e){if(e.RowIndex<0||e.ColumnIndex<0||e.ColumnIndex>=gGiris.Columns.Count)return;var st=e.CellStyle;if(st is null)return;var col=gGiris.Columns[e.ColumnIndex];if(col is null)return;string n=col.Name;if(n is "GIRIS_SAATI" or "CIKIS_SAATI"){st.BackColor=Color.Black;st.ForeColor=Color.Lime;st.SelectionBackColor=Color.Black;st.SelectionForeColor=Color.Lime;st.Font=new Font(Font,FontStyle.Bold);}if((n is "GIRIS_TARIHI" or "CIKIS_TARIHI")&&e.Value is DateTime d){e.Value=d.ToString("dd MMM yyyy ddd",new CultureInfo("tr-TR"));e.FormattingApplied=true;}}
    void BilgiFormat(object? s,DataGridViewCellFormattingEventArgs e){if(e.RowIndex<0)return;var st=e.CellStyle;if(st is null)return;st.BackColor=Color.Black;st.ForeColor=Color.Lime;st.SelectionBackColor=Color.Black;st.SelectionForeColor=Color.Lime;if(e.ColumnIndex==0){st.BackColor=Color.White;st.ForeColor=Color.Black;st.SelectionBackColor=SystemColors.Highlight;st.SelectionForeColor=SystemColors.HighlightText;if(e.Value is DateTime d){e.Value=d.ToString("dd MMM yyyy ddd",new CultureInfo("tr-TR"));e.FormattingApplied=true;}}}
}
