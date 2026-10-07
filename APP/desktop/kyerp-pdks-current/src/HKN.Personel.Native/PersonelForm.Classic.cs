using System.Data;
using System.Globalization;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    readonly ComboBox searchField = new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=65};
    readonly RadioButton scopeActive = new(){Text="Aktif",AutoSize=true,Checked=true,Margin=new Padding(4,5,2,0)};
    readonly RadioButton scopePassive = new(){Text="Pasif",AutoSize=true,Margin=new Padding(2,5,2,0)};
    readonly RadioButton scopeAll = new(){Text="Tümü",AutoSize=true,Margin=new Padding(2,5,2,0)};
    readonly TextBox searchText = new(){Width=95};
    readonly FlowLayoutPanel sortPanel = new(){Dock=DockStyle.Fill,FlowDirection=FlowDirection.LeftToRight,WrapContents=false};
    readonly Label stActive = new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};
    readonly Label stLeft = new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};
    readonly Label stTotal = new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};
    readonly Label stListed = new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};
    readonly PictureBox photo = new(){Dock=DockStyle.Fill,BorderStyle=BorderStyle.FixedSingle,SizeMode=PictureBoxSizeMode.Zoom,BackColor=PdksAppearance.Current.SurfaceAlt};
    readonly System.Windows.Forms.Timer personLoadTimer = new(){Interval=70};
    string pendingPersonPk = "";

    void BuildUiClassic()
    {
        AutoScaleMode=AutoScaleMode.Dpi;
        Font=new Font("Segoe UI",9f,FontStyle.Regular,GraphicsUnit.Point);
        var palette=PdksAppearance.Current;
        BackColor=palette.Canvas;
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=3,Padding=new Padding(12,12,12,0),Margin=Padding.Empty,BackColor=palette.Canvas};
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,450)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,77)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,22));
        BuildClassicList(); root.Controls.Add(list,0,0); BuildClassicRight(root); root.Controls.Add(BuildClassicSearch(),0,1); var st=BuildClassicStatus(); root.Controls.Add(st,0,2); root.SetColumnSpan(st,2);
        Controls.Add(root);
        list.DataBindingComplete += (_,_)=>{ConfigureListColumns();UpdateClassicStats();};
        tabs.SelectedIndexChanged += (_,_)=>{ApplyClassicGridStyles();RefreshSelectedTab();};
        personLoadTimer.Tick += (_,_)=>{personLoadTimer.Stop();var pk=pendingPersonPk;if(pk.Length>0&&pk!=currentPk)LoadPerson(pk);};
    }

    Control BuildClassicStatusPlaceholder()=>new Panel{Visible=false};
    void BuildClassicList()
    {
        var p=PdksAppearance.Current;
        list.Dock=DockStyle.Fill; list.Margin=new Padding(0); list.BorderStyle=BorderStyle.None; list.BackgroundColor=p.Surface;
        list.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.None; list.RowHeadersWidth=18; list.RowHeadersVisible=false;
        list.ColumnHeadersHeight=34; list.RowTemplate.Height=29; list.AllowUserToResizeRows=false; list.MultiSelect=false;
        list.EnableHeadersVisualStyles=false;list.ColumnHeadersDefaultCellStyle.BackColor=p.GridHeader;list.ColumnHeadersDefaultCellStyle.ForeColor=p.Text;
        list.DefaultCellStyle.SelectionBackColor=p.Selection;list.DefaultCellStyle.SelectionForeColor=p.Text;
        list.DefaultCellStyle.Font=Font; list.ColumnHeadersDefaultCellStyle.Font=Font; list.SelectionMode=DataGridViewSelectionMode.FullRowSelect;
        list.SelectionChanged += (_,_)=>QueuePersonLoad();
        list.CellFormatting += PersonListFormat;
        typeof(DataGridView).GetProperty("DoubleBuffered",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)?.SetValue(list,true);
    }

    void ConfigureListColumns()
    {
        if(list.Columns.Count==0)return;
        foreach(DataGridViewColumn c in list.Columns)
        {
            c.Visible=false;
            c.SortMode=DataGridViewColumnSortMode.NotSortable;
        }

        var specs = new (string Name,string Header,int Width)[]
        {
            ("PKNO","Kart No",68),
            ("ADSOYAD","Personel Ad Soyad",170),
            ("GRUPAD","Grup",104)
        };
        var index=0;
        foreach(var spec in specs)
        {
            if(!list.Columns.Contains(spec.Name)) continue;
            var col=list.Columns[spec.Name];
            col.Visible=true;
            col.HeaderText=spec.Header;
            col.Width=spec.Width;
            col.DisplayIndex=index++;
            col.DefaultCellStyle.NullValue="";
        }
    }

    void GirisBound(object? s,DataGridViewBindingCompleteEventArgs e){SetCol(gGiris,"SIRA",0,false);SetCol(gGiris,"GIRIS_TARIHI",104,true,"Giriş Tarihi");SetCol(gGiris,"GIRIS_SAATI",78,true,"Giriş");SetCol(gGiris,"GTUR",0,false);SetCol(gGiris,"CIKIS_TARIHI",104,true,"Çıkış Tarihi");SetCol(gGiris,"CIKIS_SAATI",78,true,"Çıkış");SetCol(gGiris,"CTUR",0,false);OrderGirisColumns();}
    void IzinBound(object? s,DataGridViewBindingCompleteEventArgs e){SetCol(gIzin,"SIRA",0,false);SetCol(gIzin,"SUREDAKIKA",0,false);SetCol(gIzin,"EBALAN",0,false);SetCol(gIzin,"TARIH",120,true,"Tarih");SetCol(gIzin,"BASSAAT",62,true,"Baş. Saat");SetCol(gIzin,"BITSAAT",62,true,"Bit. Saat");SetCol(gIzin,"SURESAAT",62,true,"Süre");SetCol(gIzin,"TIP",90,true,"Tip");SetCol(gIzin,"MAZERET",210,true,"Mazeret");}
    void EkkBound(object? s,DataGridViewBindingCompleteEventArgs e){SetCol(gEkk,"KOD",0,false);SetCol(gEkk,"ISLEM_TARIHI",108,true,"İşlem Tar.");SetCol(gEkk,"VERILIS_TARIHI",108,true,"Ver. Tar.");SetCol(gEkk,"TURU",85,true,"Türü");SetCol(gEkk,"MIKTAR",85,true,"Miktar");SetCol(gEkk,"ACIKLAMA",175,true,"Açıklama");}
    void BilgiBound(object? s,DataGridViewBindingCompleteEventArgs e){string[] n={"TARIH","NC","M50","M100","UIZIN","SAAT5","SAAT6","SAAT7","SAAT8","SAAT9","DEVAMSIZLIK","GEC_KALMA","EKSIK_SURE"};string[] h={"TARİH","N.Ç.","% 50","%100","Üsz.İ","5","6","7","8","9","Dvms.","Geç K.","Eks."};int[] w={105,48,48,48,42,36,36,36,36,36,50,50,50};for(int i=0;i<n.Length;i++)SetCol(gBilgi,n[i],w[i],true,h[i]);}
    void SetCol(DataGridView g,string n,int w,bool vis,string? h=null){if(!g.Columns.Contains(n))return;var c=g.Columns[n];c.Visible=vis;if(vis)c.Width=w;if(h!=null)c.HeaderText=h;}
    void GirisFormat(object? s,DataGridViewCellFormattingEventArgs e)
    {
        if(e.RowIndex<0||e.ColumnIndex<0||e.ColumnIndex>=gGiris.Columns.Count)return;
        var st=e.CellStyle;if(st is null)return;var col=gGiris.Columns[e.ColumnIndex];if(col is null)return;string n=col.Name;
        if(n is "GIRIS_SAATI" or "CIKIS_SAATI")
        {
            st.Font=new Font(Font,FontStyle.Bold);
            var typeColumn=n=="GIRIS_SAATI"?"GTUR":"CTUR";
            var isE=gGiris.Columns.Contains(typeColumn) &&
                string.Equals(Convert.ToString(gGiris.Rows[e.RowIndex].Cells[typeColumn].Value)?.Trim(),"E",StringComparison.OrdinalIgnoreCase);
            if(isE)
            {
                st.BackColor=PdksAppearance.Current.IsDark?Color.FromArgb(75,57,20):Color.FromArgb(255,245,204);
                st.ForeColor=PdksAppearance.Current.IsDark?Color.FromArgb(255,224,142):Color.FromArgb(135,84,0);
                if(e.Value is not null)
                {
                    e.Value=(Convert.ToString(e.Value)?.Trim()??"")+"  E";
                    e.FormattingApplied=true;
                }
            }
        }
        if((n is "GIRIS_TARIHI" or "CIKIS_TARIHI")&&e.Value is DateTime d){e.Value=d.ToString("dd MMM yyyy ddd",new CultureInfo("tr-TR"));e.FormattingApplied=true;}
    }
    void BilgiFormat(object? s,DataGridViewCellFormattingEventArgs e)
    {
        if(e.RowIndex<0)return;
        if(e.ColumnIndex==0&&e.Value is DateTime d){e.Value=d.ToString("dd MMM yyyy ddd",new CultureInfo("tr-TR"));e.FormattingApplied=true;}
    }
}
