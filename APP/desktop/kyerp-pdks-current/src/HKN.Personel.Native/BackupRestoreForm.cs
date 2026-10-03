namespace HKN.Personel.Native;

public sealed class BackupRestoreForm : Form
{
    readonly DataGridView backups = new()
    {
        Dock=DockStyle.Fill,
        ReadOnly=true,
        AllowUserToAddRows=false,
        AllowUserToDeleteRows=false,
        MultiSelect=false,
        SelectionMode=DataGridViewSelectionMode.FullRowSelect,
        AutoGenerateColumns=false,
        BackgroundColor=PdksAppearance.Current.Surface,
        BorderStyle=BorderStyle.None,
        RowHeadersVisible=false
    };
    readonly Label status = new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,AutoEllipsis=true};

    public BackupRestoreForm()
    {
        Text="Yedekleme ve Geri Yükleme";
        StartPosition=FormStartPosition.CenterParent;
        Size=new Size(920,590);
        MinimumSize=new Size(760,500);
        Font=new Font("Segoe UI",9f);
        Build();
        Shown+=(_,_)=>RefreshList();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;

        backups.Columns.Add(new DataGridViewTextBoxColumn{Name="DATE",DataPropertyName=nameof(BackupItem.Modified),HeaderText="Tarih",Width=145,DefaultCellStyle=new DataGridViewCellStyle{Format="dd.MM.yyyy HH:mm"}});
        backups.Columns.Add(new DataGridViewTextBoxColumn{Name="FILE",DataPropertyName=nameof(BackupItem.FileName),HeaderText="Yedek Dosyası",AutoSizeMode=DataGridViewAutoSizeColumnMode.Fill});
        backups.Columns.Add(new DataGridViewTextBoxColumn{Name="SIZE",DataPropertyName=nameof(BackupItem.SizeText),HeaderText="Boyut",Width=105});
        backups.RowTemplate.Height=31;
        backups.ColumnHeadersHeight=36;
        backups.CellDoubleClick+=(_,e)=>{if(e.RowIndex>=0)RestoreSelected();};

        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,Padding=new Padding(16),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,112));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,40));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));

        var hero=PdksUiKit.Card(16);
        var heroGrid=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,BackColor=p.Surface,Margin=Padding.Empty};
        heroGrid.RowStyles.Add(new RowStyle(SizeType.Absolute,31));
        heroGrid.RowStyles.Add(new RowStyle(SizeType.Absolute,27));
        heroGrid.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        heroGrid.Controls.Add(new Label{Text="Yedekleme ve Geri Yükleme",Dock=DockStyle.Fill,Font=new Font("Segoe UI",12.5f,FontStyle.Bold),ForeColor=p.Text,TextAlign=ContentAlignment.MiddleLeft},0,0);
        heroGrid.Controls.Add(new Label{Text=$"Firma: {CompanyDataPaths.CompanyName}  •  Yedek klasörü: {CompanyDataPaths.Backup}",Dock=DockStyle.Fill,ForeColor=p.Muted,TextAlign=ContentAlignment.MiddleLeft,AutoEllipsis=true},0,1);
        status.ForeColor=p.Muted;
        heroGrid.Controls.Add(status,0,2);
        hero.Controls.Add(heroGrid);
        root.Controls.Add(hero,0,0);

        root.Controls.Add(new Label{Text="Kullanılabilir Yedekler",Dock=DockStyle.Fill,Font=new Font("Segoe UI",10.5f,FontStyle.Bold),ForeColor=p.Text,TextAlign=ContentAlignment.BottomLeft,Padding=new Padding(2,0,0,7)},0,1);

        var listCard=PdksUiKit.Card(10);
        listCard.Controls.Add(backups);
        root.Controls.Add(listCard,0,2);

        var bar=PdksUiKit.ActionBar(true,p.Canvas);
        bar.Controls.Add(PdksUiKit.Button("Kapat",92,PdksActionRole.Quiet,Close));
        bar.Controls.Add(PdksUiKit.Button("Yedek Klasörünü Aç",145,PdksActionRole.Secondary,OpenBackupFolder));
        bar.Controls.Add(PdksUiKit.Button("Dosyadan Seç",115,PdksActionRole.Secondary,RestoreFromFile));
        bar.Controls.Add(PdksUiKit.Button("Seçili Yedeği Geri Yükle",175,PdksActionRole.Danger,RestoreSelected));
        bar.Controls.Add(PdksUiKit.Button("Şimdi Yedek Al",125,PdksActionRole.Primary,Backup));
        root.Controls.Add(bar,0,3);

        Controls.Add(root);
    }

    void RefreshList()
    {
        try
        {
            CompanyDataPaths.Ensure();
            var items=DatabaseMaintenance.ListBackups()
                .Where(File.Exists)
                .Select(x=>new FileInfo(x))
                .OrderByDescending(x=>x.LastWriteTime)
                .Select(x=>new BackupItem(x.FullName,x.Name,x.LastWriteTime,x.Length))
                .ToList();
            backups.DataSource=items;
            if(items.Count>0)backups.CurrentCell=backups.Rows[0].Cells[0];
            status.Text=items.Count==0
                ? "Henüz yedek yok. İlk güvenli kopyayı almak için “Şimdi Yedek Al”ı kullanın."
                : $"{items.Count} yedek hazır • Son yedek: {items[0].Modified:dd.MM.yyyy HH:mm}";
            status.ForeColor=items.Count==0?PdksAppearance.Current.Warning:PdksAppearance.Current.Success;
        }
        catch(Exception ex)
        {
            status.Text="Yedek listesi okunamadı • "+PdksErrorPresenter.Report(ex,"BackupRestore.List");
            status.ForeColor=PdksAppearance.Current.Danger;
        }
    }

    void Backup()
    {
        try
        {
            status.Text="Yedek alınıyor…";
            status.ForeColor=PdksAppearance.Current.Primary;
            var path=DatabaseMaintenance.BackupNow();
            RefreshList();
            status.Text="Yedek tamamlandı • "+Path.GetFileName(path);
            status.ForeColor=PdksAppearance.Current.Success;
        }
        catch(Exception ex)
        {
            status.Text="Yedek alınamadı • "+PdksErrorPresenter.Report(ex,"BackupRestore.Backup");
            status.ForeColor=PdksAppearance.Current.Danger;
        }
    }

    void RestoreSelected()
    {
        if(backups.CurrentRow?.DataBoundItem is not BackupItem item)
        {
            MessageBox.Show("Geri yüklemek için listeden bir yedek seçin.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
            return;
        }
        PrepareRestore(item.Path);
    }

    void RestoreFromFile()
    {
        using var picker=new OpenFileDialog
        {
            Filter="Firebird yedeği (*.gbk)|*.gbk|Tüm dosyalar (*.*)|*.*",
            InitialDirectory=CompanyDataPaths.Backup
        };
        if(picker.ShowDialog(this)!=DialogResult.OK)return;
        PrepareRestore(picker.FileName);
    }

    void PrepareRestore(string path)
    {
        try
        {
            if(!File.Exists(path))throw new FileNotFoundException("Seçilen yedek dosyası bulunamadı.",path);
            var fi=new FileInfo(path);
            var answer=MessageBox.Show(
                $"Seçilen yedek geri yüklemeye hazırlanacak.\n\n{fi.Name}\n{fi.LastWriteTime:dd.MM.yyyy HH:mm} • {FormatSize(fi.Length)}\n\nMevcut veritabanı önce arşivlenecek. Devam edilsin mi?",
                Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning);
            if(answer!=DialogResult.Yes)return;

            var staged=DatabaseMaintenance.PrepareRestore(path);
            var restart=MessageBox.Show(
                "Yedek doğrulandı ve güvenli geri yükleme sırasına alındı.\n\nUygulamanın yeni veritabanıyla açılması için şimdi yeniden başlatılsın mı?",
                Text,MessageBoxButtons.YesNo,MessageBoxIcon.Question);
            if(restart!=DialogResult.Yes)
            {
                status.Text="Geri yükleme hazır • Uygulama yeniden başlatıldığında uygulanacak.";
                status.ForeColor=PdksAppearance.Current.Warning;
                return;
            }
            _=staged;
            Application.Restart();
            Environment.Exit(0);
        }
        catch(Exception ex)
        {
            status.Text="Geri yükleme hazırlanamadı • "+PdksErrorPresenter.Report(ex,"BackupRestore.Restore");
            status.ForeColor=PdksAppearance.Current.Danger;
        }
    }

    void OpenBackupFolder()
    {
        try
        {
            CompanyDataPaths.Ensure();
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(CompanyDataPaths.Backup){UseShellExecute=true});
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"BackupRestore.OpenFolder");}
    }

    static string FormatSize(long bytes)
    {
        if(bytes>=1024L*1024L*1024L)return $"{bytes/(1024d*1024d*1024d):N2} GB";
        if(bytes>=1024L*1024L)return $"{bytes/(1024d*1024d):N1} MB";
        if(bytes>=1024L)return $"{bytes/1024d:N1} KB";
        return $"{bytes:N0} B";
    }

    sealed record BackupItem(string Path,string FileName,DateTime Modified,long Size)
    {
        public string SizeText=>FormatSize(Size);
    }
}
