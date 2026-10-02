namespace HKN.Personel.Native;

public sealed class BackupRestoreForm : Form
{
    readonly ListBox list = new() { Dock = DockStyle.Fill, HorizontalScrollbar = true };
    readonly Label info = new() { Dock = DockStyle.Top, Height = 54, Padding = new Padding(10) };

    public BackupRestoreForm()
    {
        Text = "KY PDKS 6.0 • Yedek Yönetimi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(820, 520);
        MinimumSize = new Size(700, 420);
        Font = new Font("Segoe UI", 9f);
        Build();
        Shown += (_, _) => RefreshList();
    }
    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(14), BackColor=p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 62));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        info.Text = $"Firma: {CompanyDataPaths.CompanyName}\nVeri klasörü: {CompanyDataPaths.Root}";
        root.Controls.Add(info, 0, 0);
        root.Controls.Add(list, 0, 1);

        var bar = PdksUiKit.ActionBar(true,p.Canvas);
        bar.Controls.Add(Button("Kapat", Close));
        bar.Controls.Add(Button("Klasörü Aç", CompanyDataPaths.OpenRoot));
        bar.Controls.Add(Button("Yedekten Geri Yükle", Restore));
        bar.Controls.Add(Button("Şimdi Yedek Al", Backup, true));
        root.Controls.Add(bar, 0, 2);
        Controls.Add(root);
    }

    static Button Button(string text, Action action, bool primary = false)
    {
        var role=primary?PdksActionRole.Primary:
            text.Contains("Kapat",StringComparison.OrdinalIgnoreCase)?PdksActionRole.Quiet:
            text.Contains("Geri Yükle",StringComparison.OrdinalIgnoreCase)?PdksActionRole.Danger:
            PdksActionRole.Secondary;
        return PdksUiKit.Button(text,145,role,action);
    }
    void RefreshList()
    {
        list.Items.Clear();
        foreach (var path in DatabaseMaintenance.ListBackups())
            list.Items.Add(path);
    }

    void Backup()
    {
        try
        {
            var path = DatabaseMaintenance.BackupNow();
            RefreshList();
            MessageBox.Show("Yedek alındı:\n" + path, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex) { PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"BackupRestore"); }
    }

    void Restore()
    {
        using var picker = new OpenFileDialog
        {
            Filter = "Firebird yedeği (*.gbk)|*.gbk|Tüm dosyalar (*.*)|*.*",
            InitialDirectory = CompanyDataPaths.Backup
        };
        if (picker.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            var staged = DatabaseMaintenance.PrepareRestore(picker.FileName);
            var answer = MessageBox.Show(
                "Yedek doğrulandı ve geri yüklemeye hazırlandı.\n\n" + staged +
                "\n\nUygulama yeniden başlatılsın mı?",
                Text, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (answer != DialogResult.Yes) return;
            Application.Restart();
            Environment.Exit(0);
        }
        catch (Exception ex) { PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"BackupRestore"); }
    }
}
