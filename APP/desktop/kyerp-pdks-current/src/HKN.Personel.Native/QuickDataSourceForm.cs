using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class QuickDataSourceForm : Form
{
    readonly TextBox gdb=new(){Dock=DockStyle.Fill};
    readonly TextBox terminal=new(){Dock=DockStyle.Fill};
    readonly Label status=new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,AutoEllipsis=true};
    readonly DataGridView grid=new()
    {
        Dock=DockStyle.Fill,
        ReadOnly=true,
        AllowUserToAddRows=false,
        AllowUserToDeleteRows=false,
        MultiSelect=false,
        SelectionMode=DataGridViewSelectionMode.FullRowSelect,
        AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,
        BackgroundColor=PdksAppearance.Current.Surface,
        BorderStyle=BorderStyle.None,
        RowHeadersVisible=false
    };

    public QuickDataSourceForm()
    {
        Text="Veri Kaynakları";
        StartPosition=FormStartPosition.CenterParent;
        Size=new Size(1040,680);
        MinimumSize=new Size(860,560);
        Font=new Font("Segoe UI",9f);
        Build();
        Shown+=(_,_)=>Detect();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;
        grid.RowTemplate.Height=31;
        grid.ColumnHeadersHeight=36;

        var root=new TableLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(16),RowCount=5,ColumnCount=1,BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,88));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,108));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,108));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));

        var hero=PdksUiKit.Card(16);
        var heroGrid=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,BackColor=p.Surface,Margin=Padding.Empty};
        heroGrid.RowStyles.Add(new RowStyle(SizeType.Absolute,32));
        heroGrid.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        heroGrid.Controls.Add(new Label{Text="Veri Kaynakları",Dock=DockStyle.Fill,Font=new Font("Segoe UI",12.5f,FontStyle.Bold),ForeColor=p.Text,TextAlign=ContentAlignment.MiddleLeft},0,0);
        heroGrid.Controls.Add(new Label{Text="Canlı Firebird veritabanını ve terminal/TNF kaynağını tek noktadan doğrulayın. FDB değişikliği yalnız bağlantı testi başarılı olursa kalıcılaştırılır.",Dock=DockStyle.Fill,ForeColor=p.Muted,TextAlign=ContentAlignment.MiddleLeft},0,1);
        hero.Controls.Add(heroGrid);
        root.Controls.Add(hero,0,0);

        root.Controls.Add(SourceCard("Canlı şirket veritabanı (.FDB / .GDB)","Personel, puantaj ve bordronun ana veri kaynağı",gdb,PickGdb),0,1);
        root.Controls.Add(SourceCard("Terminal / denetim datası (.TNF / .TXT)","Kart hareketi aktarımı ve denetim için kullanılan kaynak",terminal,PickTerminal),0,2);

        var bar=PdksUiKit.ActionBar(false,p.Canvas);
        bar.Controls.Add(PdksUiKit.Button("Otomatik Tanı",110,PdksActionRole.Secondary,Detect));
        bar.Controls.Add(PdksUiKit.Button("Kaynakları Kontrol Et",155,PdksActionRole.Primary,Inspect));
        bar.Controls.Add(PdksUiKit.Button("FDB'yi Aktif Et",125,PdksActionRole.Secondary,ActivateDatabase));
        status.ForeColor=p.Muted;
        status.Padding=new Padding(14,8,0,0);
        status.Width=310;
        status.Height=34;
        status.AutoEllipsis=true;
        bar.Controls.Add(status);
        root.Controls.Add(bar,0,3);

        var gridCard=PdksUiKit.Card(10);
        gridCard.Controls.Add(grid);
        root.Controls.Add(gridCard,0,4);
        Controls.Add(root);
    }

    static Control SourceCard(string caption,string hint,TextBox box,Action pick)
    {
        var p=PdksAppearance.Current;
        var card=PdksUiKit.Card(12);
        var layout=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=2,BackColor=p.Surface,Margin=Padding.Empty};
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,116));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,40));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));

        var title=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,BackColor=p.Surface,Margin=Padding.Empty};
        title.RowStyles.Add(new RowStyle(SizeType.Absolute,20));title.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        title.Controls.Add(new Label{Text=caption,Dock=DockStyle.Fill,Font=new Font("Segoe UI",8.8f,FontStyle.Bold),ForeColor=p.Text},0,0);
        title.Controls.Add(new Label{Text=hint,Dock=DockStyle.Fill,Font=new Font("Segoe UI",8f),ForeColor=p.Muted},0,1);
        layout.Controls.Add(title,0,0);layout.SetColumnSpan(title,2);

        box.Margin=new Padding(0,5,10,5);
        layout.Controls.Add(box,0,1);
        var button=PdksUiKit.Button("Dosya Seç",100,PdksActionRole.Secondary,pick);
        button.MinimumSize=Size.Empty;button.MaximumSize=Size.Empty;button.Dock=DockStyle.Fill;button.Margin=new Padding(0,5,0,5);
        layout.Controls.Add(button,1,1);
        card.Controls.Add(layout);
        return card;
    }

    void Detect()
    {
        try
        {
            var o=PdksOptions.FromEnvironment();
            CompanyDataPaths.Ensure();
            gdb.Text=File.Exists(o.DatabasePath)?o.DatabasePath:CompanyDataPaths.Database;
            var temp=CompanyDataPaths.Tnf;
            terminal.Text=Directory.Exists(temp)
                ? Directory.GetFiles(temp,"TR*.Tnf").OrderByDescending(x=>x).FirstOrDefault()??CompanyDataPaths.CurrentTnf
                : CompanyDataPaths.CurrentTnf;
            Inspect();
        }
        catch(Exception ex)
        {
            status.Text="Otomatik tanı başarısız • "+PdksErrorPresenter.Report(ex,"DataSources.Detect");
            status.ForeColor=PdksAppearance.Current.Danger;
        }
    }

    void PickGdb()
    {
        using var d=new OpenFileDialog{Filter="Firebird veritabanı (*.fdb;*.gdb)|*.fdb;*.gdb|Tüm dosyalar (*.*)|*.*",FileName=gdb.Text};
        if(d.ShowDialog(this)==DialogResult.OK){gdb.Text=d.FileName;Inspect();}
    }

    void PickTerminal()
    {
        using var d=new OpenFileDialog{Filter="Terminal datası (*.tnf;*.txt)|*.tnf;*.txt|Tüm dosyalar (*.*)|*.*",FileName=terminal.Text};
        if(d.ShowDialog(this)==DialogResult.OK){terminal.Text=d.FileName;Inspect();}
    }

    void Inspect()
    {
        try
        {
            var table=new System.Data.DataTable();
            table.Columns.Add("Kaynak");table.Columns.Add("Yol");table.Columns.Add("Durum");table.Columns.Add("Boyut / Satır");

            var gf=new FileInfo(gdb.Text.Trim());
            table.Rows.Add("Şirket FDB",gdb.Text,gf.Exists?"Hazır":"Bulunamadı",gf.Exists?FormatSize(gf.Length):"-");

            var tf=new FileInfo(terminal.Text.Trim());
            var lines=tf.Exists?File.ReadLines(tf.FullName).Count():0;
            table.Rows.Add("Terminal / TNF",terminal.Text,tf.Exists?"Hazır":"Bulunamadı",tf.Exists?$"{lines:N0} satır":"-");

            grid.DataSource=table;
            var ready=gf.Exists&&tf.Exists;
            status.Text=ready?"İki kaynak da hazır":"Kaynak seçimi veya dosya kontrolü gerekli";
            status.ForeColor=ready?PdksAppearance.Current.Success:PdksAppearance.Current.Warning;
        }
        catch(Exception ex)
        {
            status.Text="Kaynak kontrolü başarısız • "+PdksErrorPresenter.Report(ex,"DataSources.Inspect");
            status.ForeColor=PdksAppearance.Current.Danger;
        }
    }

    void ActivateDatabase()
    {
        var selected=gdb.Text.Trim();
        if(!File.Exists(selected))
        {
            MessageBox.Show("Aktif edilecek Firebird veritabanı dosyası bulunamadı.",Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);
            return;
        }

        var oldProcess=Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH",EnvironmentVariableTarget.Process);
        try
        {
            status.Text="Veritabanı bağlantısı doğrulanıyor…";
            status.ForeColor=PdksAppearance.Current.Primary;
            Environment.SetEnvironmentVariable("KY_PDKS_DB_PATH",selected,EnvironmentVariableTarget.Process);
            using var connection=new FirebirdDatabase(PdksOptions.FromEnvironment()).OpenConnection();
            using var command=connection.CreateCommand();
            command.CommandText="select 1 from RDB$DATABASE";
            _=command.ExecuteScalar();

            Environment.SetEnvironmentVariable("KY_PDKS_DB_PATH",selected,EnvironmentVariableTarget.User);
            status.Text="FDB aktif edildi • "+Path.GetFileName(selected);
            status.ForeColor=PdksAppearance.Current.Success;
            Inspect();
        }
        catch(Exception ex)
        {
            Environment.SetEnvironmentVariable("KY_PDKS_DB_PATH",oldProcess,EnvironmentVariableTarget.Process);
            status.Text="FDB aktif edilemedi • "+PdksErrorPresenter.Report(ex,"DataSources.ActivateDatabase");
            status.ForeColor=PdksAppearance.Current.Danger;
        }
    }

    static string FormatSize(long bytes)
    {
        if(bytes>=1024L*1024L*1024L)return $"{bytes/(1024d*1024d*1024d):N2} GB";
        if(bytes>=1024L*1024L)return $"{bytes/(1024d*1024d):N1} MB";
        if(bytes>=1024L)return $"{bytes/1024d:N1} KB";
        return $"{bytes:N0} B";
    }
}
