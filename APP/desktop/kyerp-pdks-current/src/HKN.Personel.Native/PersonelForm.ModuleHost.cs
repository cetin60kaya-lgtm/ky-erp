namespace HKN.Personel.Native;

public partial class PersonelForm
{
    public void PrepareForEmbedding()
    {
        TopLevel = false;
        FormBorderStyle = FormBorderStyle.None;
        Dock = DockStyle.Fill;
        if (MainMenuStrip is not null) MainMenuStrip.Visible = false;
    }

    IWin32Window DialogOwner()
    {
        foreach (Form form in Application.OpenForms)
            if (form is MainShellForm && !form.IsDisposed) return form;
        var host = Parent?.FindForm();
        return host is not null && !host.IsDisposed ? host : this;
    }

    public void ActivateModule(PdksModule module)
    {
        if (!TopLevel && !Visible) Show();
        switch (module)
        {
            case PdksModule.Personel: tabs.SelectedIndex = 0; break;
            case PdksModule.GirisCikis: tabs.SelectedIndex = 1; break;
            case PdksModule.Izinler: tabs.SelectedIndex = 2; break;
            case PdksModule.EkKazancKesinti: tabs.SelectedIndex = 3; break;
            case PdksModule.Puantaj: tabs.SelectedIndex = 4; break;
            case PdksModule.Bordro: tabs.SelectedIndex = 5; break;
            case PdksModule.GunlukOperasyon: ShowDailyOperations(); break;
            case PdksModule.Tanimlar: ShowOrganizationDefinitions(); break;
            case PdksModule.Donemler: ShowLegacyPeriods(); break;
            case PdksModule.Terminal: ShowTerminalProfiles(); break;
            case PdksModule.Raporlar: ShowReportCenter(); break;
        }
    }

    public void OpenOrganizationDefinition(string labelOrTable)
    {
        var label = labelOrTable.Equals("GRUP", StringComparison.OrdinalIgnoreCase) ? "Grup"
            : labelOrTable.Equals("BOLUM", StringComparison.OrdinalIgnoreCase) ? "Bölüm"
            : labelOrTable;
        ShowOrganizationDefinitions(label);
    }

    public void OpenStandaloneDialog(PdksModule module)
    {
        switch (module)
        {
            case PdksModule.GunlukOperasyon: ShowDailyOperations(); break;
            case PdksModule.Tanimlar: ShowOrganizationDefinitions(); break;
            case PdksModule.Donemler: ShowLegacyPeriods(); break;
            case PdksModule.Terminal: ShowTerminalProfiles(); break;
            case PdksModule.Raporlar: ShowReportCenter(); break;
            default: ActivateModule(module); break;
        }
    }

    void ShowLegacyPeriods()
    {
        using var f=new LegacyPeriodForm();
        f.ShowDialog(DialogOwner());
        LoadPeriods();
    }

    void ShowReportCenter()
    {
        using var f = new Form
        {
            Text = "KYERP PDKS - Rapor Merkezi", Width = 520, Height = 410,
            StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false, MinimizeBox = false
        };
        var body = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown,
            WrapContents = false, Padding = new Padding(18), AutoScroll = true
        };
        foreach (var title in new[]
        {
            "Ayrıntılı Kişisel Bordro", "Personel Bilgi Formu", "Personel Bilgi Formu (Boş)",
            "Kişisel Giriş Çıkış Raporu", "Kişisel İzin Kartı", "Kişisel Ek Kazanç ve Kesinti Kartı"
        })
        {
            var b = new Button { Text = title, Width = 440, Height = 38, TextAlign = ContentAlignment.MiddleLeft };
            b.Click += (_, _) => PrintReportFinal(title);
            body.Controls.Add(b);
        }
        var pdf = new Button { Text = "Aktif tabloyu PDF aktar", Width = 440, Height = 38, TextAlign = ContentAlignment.MiddleLeft };
        pdf.Click += (_, _) => ExportActiveGrid(false);
        var xls = new Button { Text = "Aktif tabloyu Excel aktar", Width = 440, Height = 38, TextAlign = ContentAlignment.MiddleLeft };
        xls.Click += (_, _) => ExportActiveGrid(true);
        body.Controls.Add(pdf); body.Controls.Add(xls); f.Controls.Add(body); f.ShowDialog(DialogOwner());
    }
}
