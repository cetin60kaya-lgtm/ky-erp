namespace HKN.Personel.Native;

internal sealed class AuditHistoryForm : Form
{
    readonly ListBox files = new() { Dock = DockStyle.Fill, IntegralHeight = false };
    readonly TextBox content = new()
    {
        Dock = DockStyle.Fill,
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Both,
        WordWrap = false,
        Font = new Font("Consolas", 9f)
    };
    readonly Label status = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };

    public AuditHistoryForm()
    {
        Text = "Değişiklik / İşlem Geçmişi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1100, 680);
        MinimumSize = new Size(860, 540);
        Font = new Font("Segoe UI", 9f);
        Build();
        Shown += (_, _) => ReloadFiles();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(14), BackColor=p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));

        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(0, 7, 0, 0) };
        top.Controls.Add(new Label
        {
            Text = "AUDIT / İŞLEM GEÇMİŞİ",
            AutoSize = true,
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            ForeColor = p.Text,
            Padding = new Padding(0, 4, 20, 0)
        });
        var refresh = PdksUiKit.Button("Yenile",90,PdksActionRole.Primary,ReloadFiles);
        refresh.Height=30;refresh.MinimumSize=new Size(90,30);refresh.MaximumSize=new Size(90,30);
        top.Controls.Add(refresh);
        root.Controls.Add(top, 0, 0);

        var split = new SplitContainer { Dock = DockStyle.Fill, SplitterDistance = 300, FixedPanel = FixedPanel.Panel1 };
        split.Panel1.Controls.Add(files);
        split.Panel2.Controls.Add(content);
        files.SelectedIndexChanged += (_, _) => LoadSelected();
        root.Controls.Add(split, 0, 1);

        root.Controls.Add(status, 0, 2);
        Controls.Add(root);
    }

    void ReloadFiles()
    {
        try
        {
            CompanyDataPaths.Ensure();
            var selected = files.SelectedItem as AuditFile;
            var list = Directory.EnumerateFiles(CompanyDataPaths.Logs, "*.*", SearchOption.TopDirectoryOnly)
                .Where(x => new[] { ".csv", ".log", ".txt" }.Contains(Path.GetExtension(x), StringComparer.OrdinalIgnoreCase))
                .Select(x => new AuditFile(x, Path.GetFileName(x), File.GetLastWriteTime(x)))
                .OrderByDescending(x => x.Modified)
                .ToArray();
            files.BeginUpdate();
            files.Items.Clear();
            foreach (var item in list) files.Items.Add(item);
            files.EndUpdate();
            files.DisplayMember = nameof(AuditFile.Display);
            if (list.Length > 0)
            {
                var index = selected is null ? 0 : Array.FindIndex(list, x => string.Equals(x.Path, selected.Path, StringComparison.OrdinalIgnoreCase));
                files.SelectedIndex = index >= 0 ? index : 0;
            }
            else
            {
                content.Clear();
                status.Text = "Henüz işlem geçmişi dosyası yok.";
            }
        }
        catch (Exception ex)
        {
            status.Text = "Audit klasörü okunamadı: " + ex.GetBaseException().Message;
        }
    }

    void LoadSelected()
    {
        if (files.SelectedItem is not AuditFile item) return;
        try
        {
            var lines = File.ReadLines(item.Path).TakeLast(2000).ToArray();
            content.Text = string.Join(Environment.NewLine, lines);
            content.SelectionStart = content.TextLength;
            content.ScrollToCaret();
            status.Text = $"{item.Display} • Son {lines.Length:N0} satır • {item.Modified:dd.MM.yyyy HH:mm:ss}";
        }
        catch (Exception ex)
        {
            content.Clear();
            status.Text = "Dosya okunamadı: " + ex.GetBaseException().Message;
        }
    }

    sealed record AuditFile(string Path, string Name, DateTime Modified)
    {
        public string Display => $"{Modified:dd.MM.yyyy HH:mm}  •  {Name}";
    }
}
