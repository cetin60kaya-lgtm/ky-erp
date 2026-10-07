using System.Text.Json;

namespace QuickDataTool;

internal sealed record PayrollReportSettingsRev27(
    string CompanyTitle,
    string GeneralTitle,
    string PersonalTitle,
    string WorkplaceRegistrationNo,
    string EmployeeSignatureCaption,
    string EmployerSignatureCaption,
    string FooterNote,
    bool ShowEmployeeSignature,
    bool ShowEmployerSignature,
    bool ShowWorkplaceRegistration,
    bool UseA3General)
{
    internal static PayrollReportSettingsRev27 Default => new(
        "Hakan Emprime",
        "Genel Maaş Bordrosu",
        "Kişisel Personel Bordrosu",
        "",
        "İmza",
        "İşveren / Yetkili",
        "",
        true,
        true,
        false,
        true);
}

internal static class PayrollReportSettingsStoreRev27
{
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    static string PathName
    {
        get
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "REV27_PAYROLL_REPORT.json");
        }
    }

    internal static PayrollReportSettingsRev27 Load()
    {
        try
        {
            if (!File.Exists(PathName)) return PayrollReportSettingsRev27.Default;
            return JsonSerializer.Deserialize<PayrollReportSettingsRev27>(File.ReadAllText(PathName), Json) ?? PayrollReportSettingsRev27.Default;
        }
        catch { return PayrollReportSettingsRev27.Default; }
    }

    internal static void Save(PayrollReportSettingsRev27 value)
    {
        var tmp = PathName + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(value, Json));
        File.Move(tmp, PathName, true);
    }
}

internal sealed class PayrollReportSettingsFormRev27 : Form
{
    readonly TextBox company = new();
    readonly TextBox general = new();
    readonly TextBox personal = new();
    readonly TextBox workplace = new();
    readonly TextBox employeeSign = new();
    readonly TextBox employerSign = new();
    readonly TextBox footer = new() { Multiline = true };
    readonly CheckBox employeeVisible = new() { Text = "Personel imza alanını göster", AutoSize = true };
    readonly CheckBox employerVisible = new() { Text = "İşveren / yetkili imza alanını göster", AutoSize = true };
    readonly CheckBox workplaceVisible = new() { Text = "İşyeri sicil numarasını göster", AutoSize = true };
    readonly CheckBox useA3 = new() { Text = "Genel bordroyu A3 yatay hazırla", AutoSize = true };

    internal PayrollReportSettingsFormRev27()
    {
        Text = "Bordro Rapor Ayarları • ADMIN";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(720, 590);
        MinimumSize = MaximumSize = Size;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        Font = new Font("Segoe UI", 9f);
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 12, Padding = new Padding(16) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 210));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Add(root, 0, "Firma / Üst Başlık", company);
        Add(root, 1, "Genel Bordro Başlığı", general);
        Add(root, 2, "Kişisel Bordro Başlığı", personal);
        Add(root, 3, "İşyeri Sicil No", workplace);
        Add(root, 4, "Personel İmza Başlığı", employeeSign);
        Add(root, 5, "İşveren İmza Başlığı", employerSign);
        Add(root, 6, "Alt Not", footer, 64);
        root.Controls.Add(employeeVisible, 1, 7);
        root.Controls.Add(employerVisible, 1, 8);
        root.Controls.Add(workplaceVisible, 1, 9);
        root.Controls.Add(useA3, 1, 10);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var save = new Button { Text = "KAYDET", Width = 110, Height = 34 };
        var reset = new Button { Text = "Varsayılana Dön", Width = 130, Height = 34 };
        save.Click += (_, _) => SaveAndClose();
        reset.Click += (_, _) => Apply(PayrollReportSettingsRev27.Default);
        bar.Controls.Add(save); bar.Controls.Add(reset);
        root.Controls.Add(bar, 0, 11); root.SetColumnSpan(bar, 2);
        Controls.Add(root);
        Apply(PayrollReportSettingsStoreRev27.Load());
    }

    static void Add(TableLayoutPanel root, int row, string label, Control control, int height = 38)
    {
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        root.Controls.Add(new Label { Text = label, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Font = new Font("Segoe UI", 9f, FontStyle.Bold) }, 0, row);
        control.Dock = DockStyle.Fill; control.Margin = new Padding(0, 5, 0, 5); root.Controls.Add(control, 1, row);
    }

    void Apply(PayrollReportSettingsRev27 x)
    {
        company.Text=x.CompanyTitle; general.Text=x.GeneralTitle; personal.Text=x.PersonalTitle; workplace.Text=x.WorkplaceRegistrationNo;
        employeeSign.Text=x.EmployeeSignatureCaption; employerSign.Text=x.EmployerSignatureCaption; footer.Text=x.FooterNote;
        employeeVisible.Checked=x.ShowEmployeeSignature; employerVisible.Checked=x.ShowEmployerSignature; workplaceVisible.Checked=x.ShowWorkplaceRegistration; useA3.Checked=x.UseA3General;
    }

    void SaveAndClose()
    {
        PayrollReportSettingsStoreRev27.Save(new(
            company.Text.Trim(), general.Text.Trim(), personal.Text.Trim(), workplace.Text.Trim(),
            employeeSign.Text.Trim(), employerSign.Text.Trim(), footer.Text.Trim(),
            employeeVisible.Checked, employerVisible.Checked, workplaceVisible.Checked, useA3.Checked));
        DialogResult=DialogResult.OK; Close();
    }
}
