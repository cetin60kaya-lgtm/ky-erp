namespace HKN.Personel.Native;

internal sealed class PayrollReportSettingsForm : Form
{
    readonly TextBox company = new();
    readonly TextBox generalTitle = new();
    readonly TextBox personalTitle = new();
    readonly TextBox workplace = new();
    readonly TextBox employeeSignature = new();
    readonly TextBox employerSignature = new();
    readonly TextBox footer = new() { Multiline = true, Height = 58 };
    readonly CheckBox signatureColumn = new() { Text = "Genel bordroda personel imza sütunu", AutoSize = true };
    readonly CheckBox employerSignatureVisible = new() { Text = "Kişisel bordroda işveren / yetkili imza alanı", AutoSize = true };
    readonly CheckBox workplaceVisible = new() { Text = "İşyeri sicil numarasını raporda göster", AutoSize = true };
    readonly CheckBox generalA3 = new() { Text = "Genel bordroyu A3 yatay hazırla", AutoSize = true };
    readonly CheckBox bankColumn = new() { Text = "Banka sütununu genel bordroda göster", AutoSize = true };

    public PayrollReportSettingsForm()
    {
        Text = "Bordro Rapor Ayarları • ADMIN";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(720, 650);
        MinimumSize = MaximumSize = Size;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Font = new Font("Segoe UI", 9f);
        BackColor = PdksAppearance.Current.Canvas;

        Build();
        LoadSettings();
    }

    void Build()
    {
        var p = PdksAppearance.Current;
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 3,
            Padding = new Padding(16),
            BackColor = p.Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));

        var header = PdksUiKit.Card(12);
        header.Controls.Add(new Label
        {
            Text = "Bordro ve İmza Düzeni",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            ForeColor = p.Text,
            TextAlign = ContentAlignment.MiddleLeft
        });
        root.Controls.Add(header, 0, 0);

        var card = PdksUiKit.Card(14);
        var form = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 12, BackColor = p.Surface };
        form.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 215));
        form.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Add(form, 0, "Firma / Rapor Üst Başlığı", company);
        Add(form, 1, "Genel Bordro Başlığı", generalTitle);
        Add(form, 2, "Kişisel Bordro Başlığı", personalTitle);
        Add(form, 3, "İşyeri Sicil No", workplace);
        Add(form, 4, "Personel İmza Başlığı", employeeSignature);
        Add(form, 5, "İşveren İmza Başlığı", employerSignature);
        Add(form, 6, "Alt Not", footer);
        form.Controls.Add(signatureColumn, 1, 7);
        form.Controls.Add(employerSignatureVisible, 1, 8);
        form.Controls.Add(workplaceVisible, 1, 9);
        form.Controls.Add(generalA3, 1, 10);
        form.Controls.Add(bankColumn, 1, 11);
        card.Controls.Add(form);
        root.Controls.Add(card, 0, 1);

        var actions = PdksUiKit.ActionBar(true, p.Canvas);
        var save = PdksUiKit.Button("KAYDET", 112, PdksActionRole.Primary);
        var defaults = PdksUiKit.Button("Varsayılana Dön", 132, PdksActionRole.Quiet);
        save.Click += (_, _) => SaveSettings();
        defaults.Click += (_, _) => Apply(PayrollReportSettings.Default);
        actions.Controls.Add(save);
        actions.Controls.Add(defaults);
        root.Controls.Add(actions, 0, 2);

        Controls.Add(root);
    }

    static void Add(TableLayoutPanel form, int row, string caption, Control control)
    {
        form.RowStyles.Add(new RowStyle(SizeType.Absolute, row == 6 ? 68 : 42));
        form.Controls.Add(new Label
        {
            Text = caption,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = PdksAppearance.Current.Muted,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        }, 0, row);
        control.Dock = DockStyle.Fill;
        control.Margin = new Padding(0, 6, 0, 6);
        form.Controls.Add(control, 1, row);
    }

    void LoadSettings() => Apply(PayrollReportSettingsStore.Load());

    void Apply(PayrollReportSettings value)
    {
        company.Text = value.CompanyTitle;
        generalTitle.Text = value.GeneralTitle;
        personalTitle.Text = value.PersonalTitle;
        workplace.Text = value.WorkplaceRegistrationNo;
        employeeSignature.Text = value.EmployeeSignatureCaption;
        employerSignature.Text = value.EmployerSignatureCaption;
        footer.Text = value.FooterNote;
        signatureColumn.Checked = value.ShowSignatureColumn;
        employerSignatureVisible.Checked = value.ShowEmployerSignature;
        workplaceVisible.Checked = value.ShowWorkplaceRegistration;
        generalA3.Checked = value.UseA3ForGeneral;
        bankColumn.Checked = value.IncludeBankColumn;
    }

    void SaveSettings()
    {
        PayrollReportSettingsStore.Save(new(
            company.Text,
            generalTitle.Text,
            personalTitle.Text,
            workplace.Text,
            employeeSignature.Text,
            employerSignature.Text,
            footer.Text,
            signatureColumn.Checked,
            employerSignatureVisible.Checked,
            workplaceVisible.Checked,
            generalA3.Checked,
            bankColumn.Checked));
        DialogResult = DialogResult.OK;
        Close();
    }
}
