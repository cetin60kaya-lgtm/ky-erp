namespace HKN.Personel.Native;

public sealed class AuditHistoryForm : Form
{
    readonly ListBox files=new(){Dock=DockStyle.Fill,IntegralHeight=false,BorderStyle=BorderStyle.None};
    readonly TextBox content=new()
    {
        Dock=DockStyle.Fill,
        Multiline=true,
        ReadOnly=true,
        ScrollBars=ScrollBars.Both,
        WordWrap=false,
        Font=new Font("Consolas",9f),
        BorderStyle=BorderStyle.None
    };
    readonly TextBox search=new(){Dock=DockStyle.Fill,PlaceholderText="Dosya ara..."};
    readonly Label status=new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,AutoEllipsis=true};
    AuditFile[] allFiles=[];

    public AuditHistoryForm()
    {
        Text="İşlem Geçmişi";
        StartPosition=FormStartPosition.CenterParent;
        Size=new Size(1160,720);
        MinimumSize=new Size(900,580);
        Font=new Font("Segoe UI",9f);
        Build();
        Shown+=(_,_)=>ReloadFiles();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;

        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(16),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,92));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,54));

        var hero=PdksUiKit.Card(16);
        var heroGrid=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=2,BackColor=p.Surface,Margin=Padding.Empty};
        heroGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        heroGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,220));
        heroGrid.RowStyles.Add(new RowStyle(SizeType.Absolute,32));
        heroGrid.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        heroGrid.Controls.Add(new Label{Text="İşlem Geçmişi",Dock=DockStyle.Fill,Font=new Font("Segoe UI",12.5f,FontStyle.Bold),ForeColor=p.Text,TextAlign=ContentAlignment.MiddleLeft},0,0);
        heroGrid.Controls.Add(new Label{Text="Kullanıcı işlemleri, hata kayıtları ve sistem günlüklerini tek noktadan inceleyin.",Dock=DockStyle.Fill,ForeColor=p.Muted,TextAlign=ContentAlignment.MiddleLeft},0,1);
        var open=PdksUiKit.Button("Log Klasörünü Aç",140,PdksActionRole.Secondary,OpenLogFolder);
        open.MinimumSize=Size.Empty;open.MaximumSize=Size.Empty;open.Dock=DockStyle.Fill;open.Margin=new Padding(16,8,0,8);
        heroGrid.Controls.Add(open,1,0);heroGrid.SetRowSpan(open,2);
        hero.Controls.Add(heroGrid);
        root.Controls.Add(hero,0,0);

        var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=1,BackColor=p.Canvas,Margin=new Padding(0,12,0,0)};
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,315));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,12));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));

        var listCard=PdksUiKit.Card(12);
        var listLayout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,BackColor=p.Surface,Margin=Padding.Empty};
        listLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,34));
        listLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        listLayout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        listLayout.Controls.Add(PdksUiKit.SectionTitle("Kayıt Dosyaları"),0,0);
        search.Margin=new Padding(0,5,0,7);
        listLayout.Controls.Add(search,0,1);
        listLayout.Controls.Add(files,0,2);
        listCard.Controls.Add(listLayout);
        body.Controls.Add(listCard,0,0);
        body.Controls.Add(new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas},1,0);

        var contentCard=PdksUiKit.Card(12);
        var contentLayout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,BackColor=p.Surface,Margin=Padding.Empty};
        contentLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,34));
        contentLayout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        contentLayout.Controls.Add(PdksUiKit.SectionTitle("Kayıt İçeriği"),0,0);
        content.BackColor=p.Surface;
        content.ForeColor=p.Text;
        contentLayout.Controls.Add(content,0,1);
        contentCard.Controls.Add(contentLayout);
        body.Controls.Add(contentCard,2,0);
        root.Controls.Add(body,0,1);

        var footer=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,BackColor=p.Canvas};
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,190));
        status.ForeColor=p.Muted;
        status.Padding=new Padding(2,8,0,0);
        footer.Controls.Add(status,0,0);
        var refresh=PdksUiKit.Button("Yenile",95,PdksActionRole.Primary,ReloadFiles);
        refresh.Dock=DockStyle.Right;
        footer.Controls.Add(refresh,1,0);
        root.Controls.Add(footer,0,2);

        files.SelectedIndexChanged+=(_,_)=>LoadSelected();
        search.TextChanged+=(_,_)=>ApplyFilter();
        Controls.Add(root);
    }

    void ReloadFiles()
    {
        try
        {
            CompanyDataPaths.Ensure();
            var selected=(files.SelectedItem as AuditFile)?.Path;
            allFiles=Directory.EnumerateFiles(CompanyDataPaths.Logs,"*.*",SearchOption.TopDirectoryOnly)
                .Where(x=>new[]{".csv",".log",".txt"}.Contains(Path.GetExtension(x),StringComparer.OrdinalIgnoreCase))
                .Select(x=>new AuditFile(x,Path.GetFileName(x),File.GetLastWriteTime(x),new FileInfo(x).Length))
                .OrderByDescending(x=>x.Modified)
                .ToArray();
            ApplyFilter(selected);
            status.ForeColor=PdksAppearance.Current.Muted;
            if(allFiles.Length==0)
            {
                content.Clear();
                status.Text="Henüz işlem geçmişi dosyası yok.";
            }
            else status.Text=$"{allFiles.Length} kayıt dosyası bulundu • {CompanyDataPaths.Logs}";
        }
        catch(Exception ex)
        {
            content.Clear();
            status.Text="İşlem geçmişi okunamadı • "+PdksErrorPresenter.Report(ex,"AuditHistory.Reload");
            status.ForeColor=PdksAppearance.Current.Danger;
        }
    }

    void ApplyFilter(string? preferredPath=null)
    {
        var q=search.Text.Trim();
        var filtered=allFiles.Where(x=>q.Length==0||x.Name.Contains(q,StringComparison.OrdinalIgnoreCase)).ToArray();
        var selected=preferredPath??(files.SelectedItem as AuditFile)?.Path;

        files.BeginUpdate();
        files.Items.Clear();
        foreach(var item in filtered)files.Items.Add(item);
        files.DisplayMember=nameof(AuditFile.Display);
        files.EndUpdate();

        if(filtered.Length==0)
        {
            content.Clear();
            if(allFiles.Length>0)status.Text="Arama ölçütüne uygun kayıt dosyası yok.";
            return;
        }

        var index=string.IsNullOrWhiteSpace(selected)?0:Array.FindIndex(filtered,x=>string.Equals(x.Path,selected,StringComparison.OrdinalIgnoreCase));
        files.SelectedIndex=index>=0?index:0;
    }

    void LoadSelected()
    {
        if(files.SelectedItem is not AuditFile item)return;
        try
        {
            var lines=File.ReadLines(item.Path).TakeLast(2000).ToArray();
            content.Text=string.Join(Environment.NewLine,lines);
            content.SelectionStart=content.TextLength;
            content.ScrollToCaret();
            status.ForeColor=PdksAppearance.Current.Muted;
            status.Text=$"{item.Display} • Son {lines.Length:N0} satır • {FormatSize(item.Size)}";
        }
        catch(Exception ex)
        {
            content.Clear();
            status.Text="Dosya okunamadı • "+PdksErrorPresenter.Report(ex,"AuditHistory.ReadFile");
            status.ForeColor=PdksAppearance.Current.Danger;
        }
    }

    void OpenLogFolder()
    {
        try
        {
            CompanyDataPaths.Ensure();
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(CompanyDataPaths.Logs){UseShellExecute=true});
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"AuditHistory.OpenFolder");}
    }

    static string FormatSize(long bytes)
    {
        if(bytes>=1024L*1024L)return $"{bytes/(1024d*1024d):N1} MB";
        if(bytes>=1024L)return $"{bytes/1024d:N1} KB";
        return $"{bytes:N0} B";
    }

    sealed record AuditFile(string Path,string Name,DateTime Modified,long Size)
    {
        public string Display=>$"{Modified:dd.MM HH:mm}  •  {Name}";
    }
}
