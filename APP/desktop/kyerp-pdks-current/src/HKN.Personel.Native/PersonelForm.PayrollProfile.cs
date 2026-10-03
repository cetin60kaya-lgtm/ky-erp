using KYERP.PDKS.Core.Payroll;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    readonly NumericUpDown payrollNetEntitlement = new() { DecimalPlaces=2, Maximum=10_000_000m, ThousandsSeparator=true, Width=130, ReadOnly=true, Enabled=false };
    readonly ComboBox payrollPekMode = new() { DropDownStyle=ComboBoxStyle.DropDownList, Width=190, Enabled=false };
    readonly NumericUpDown payrollManualPek = new() { DecimalPlaces=2, Maximum=10_000_000m, ThousandsSeparator=true, Width=130, ReadOnly=true, Enabled=false };
    readonly Label payrollMinimum = new() { AutoSize=true };
    readonly Label payrollOfficialNet = new() { AutoSize=true, Font=new Font("Segoe UI",9f,FontStyle.Bold) };
    readonly Label payrollDifference = new() { AutoSize=true, Font=new Font("Segoe UI",9f,FontStyle.Bold) };
    readonly Label payrollWarning = new() { AutoSize=false, Height=40, Dock=DockStyle.Fill };
    bool payrollProfileLoading;

    Control BuildPayrollProfilePanel()
    {
        if (payrollPekMode.Items.Count == 0)
        {
            payrollPekMode.Items.AddRange(["Mevzuata göre otomatik", "Manuel PEK"]);
            payrollPekMode.SelectedIndex = 0;
        }

        var p=PdksAppearance.Current;
        payrollWarning.ForeColor=p.Warning;
        var box = new GroupBox { Text="İç Hakediş / Resmî Bordro Profili", BackColor=p.SurfaceAlt, ForeColor=p.Text, Padding=new Padding(10) };
        var table = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=6, RowCount=3, BackColor=p.SurfaceAlt };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,145));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,200));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));

        table.Controls.Add(PayrollCaption("Net Hakediş Maaşı"),0,0);
        table.Controls.Add(payrollNetEntitlement,1,0);
        table.Controls.Add(PayrollCaption("PEK Modu"),2,0);
        table.Controls.Add(payrollPekMode,3,0);
        table.Controls.Add(PayrollCaption("Manuel PEK"),4,0);
        table.Controls.Add(payrollManualPek,5,0);

        table.Controls.Add(PayrollCaption("2026 Asgari"),0,1);
        table.Controls.Add(payrollMinimum,1,1);
        table.SetColumnSpan(payrollMinimum,1);
        table.Controls.Add(PayrollCaption("Resmî Bordro Neti"),2,1);
        table.Controls.Add(payrollOfficialNet,3,1);
        table.Controls.Add(PayrollCaption("Aradaki Fark"),4,1);
        table.Controls.Add(payrollDifference,5,1);

        payrollWarning.Text="Düzenlemek için Personeli Düzenle > Bordro / PEK sekmesini kullanın.";
        payrollWarning.ForeColor=p.Muted;
        table.Controls.Add(payrollWarning,0,2);
        table.SetColumnSpan(payrollWarning,6);

        payrollNetEntitlement.ValueChanged += (_,_) => RefreshPayrollProfilePreview();
        payrollPekMode.SelectedIndexChanged += (_,_) =>
        {
            RefreshPayrollProfilePreview();
        };
        payrollManualPek.ValueChanged += (_,_) => RefreshPayrollProfilePreview();

        box.Controls.Add(table);
        RefreshPayrollProfilePreview();
        return box;
    }

    static Label PayrollCaption(string text) => new()
    {
        Text=text, Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleLeft,
        Font=new Font("Segoe UI",8.5f,FontStyle.Bold), ForeColor=PdksAppearance.Current.Muted
    };

    void LoadPayrollProfilePanel(string cardNo, decimal fallbackNetSalary)
    {
        payrollProfileLoading = true;
        try
        {
            var profile = PayrollProfileStore.Load(cardNo, fallbackNetSalary);
            payrollNetEntitlement.Value = Clamp(payrollNetEntitlement, profile.NetMonthlyEntitlement);
            payrollPekMode.SelectedIndex = profile.PekMode == PekMode.Manual ? 1 : 0;
            payrollManualPek.Value = Clamp(payrollManualPek, profile.ManualPekGross);

        }
        finally
        {
            payrollProfileLoading = false;
            RefreshPayrollProfilePreview();
        }
    }

    void SavePayrollProfile()
    {
        if (string.IsNullOrWhiteSpace(currentPk))
        {
            MessageBox.Show("Önce personel seçin.", "Bordro Profili", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var profile = new PayrollProfile(
            currentPk,
            payrollNetEntitlement.Value,
            payrollPekMode.SelectedIndex == 1 ? PekMode.Manual : PekMode.LegalAutomatic,
            payrollManualPek.Value,
            DateTime.UtcNow,
            Environment.UserName);
        PayrollProfileStore.Save(profile);
        RefreshPayrollProfilePreview();
        if (canonicalProfileSummary.TryGetValue("HAKEDIS", out var hak)) hak.Text = profile.NetMonthlyEntitlement.ToString("N2") + " ₺";
        if (canonicalProfileSummary.TryGetValue("PEKMODE", out var mode)) mode.Text = profile.PekMode == PekMode.LegalAutomatic ? "Mevzuata göre otomatik" : "Manuel PEK";
        MessageBox.Show("Personelin bordro profili kaydedildi. Bundan sonraki dönemlerde aynı tanım kullanılacak.", "Bordro Profili", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    void RefreshPayrollProfilePreview()
    {
        if (payrollProfileLoading) return;
        try
        {
            var year = DateTime.Today.Year;
            var rules = TurkishPayrollRules.ForYear(year);
            payrollMinimum.Text = $"{rules.MinimumGrossMonthly:N2} brüt / {TurkishPayrollCalculator.Calculate(new OfficialPayrollInput(rules.MinimumGrossMonthly), rules).NetWage:N2} net";

            var requiredGross = TurkishPayrollCalculator.GrossForTargetNet(payrollNetEntitlement.Value, year);
            var gross = payrollPekMode.SelectedIndex == 1 ? payrollManualPek.Value : requiredGross;
            if (gross <= 0m) gross = rules.MinimumGrossMonthly;
            var official = TurkishPayrollCalculator.Calculate(new OfficialPayrollInput(gross), rules);
            payrollOfficialNet.Text = official.NetWage.ToString("N2") + " ₺";
            var difference = payrollNetEntitlement.Value - official.NetWage;
            payrollDifference.Text = difference.ToString("N2") + " ₺";

            if (payrollPekMode.SelectedIndex == 1 && gross + 0.01m < requiredGross && payrollNetEntitlement.Value > official.NetWage + 0.01m)
                payrollWarning.Text = "UYARI: Manuel PEK, tanımlı net hakedişi üretecek mevzuat brütünden düşük. Bu fark otomatik olarak elden ödeme sayılmaz; resmî bordro/PEK uyumu ayrıca kontrol edilmelidir.";
            else
                payrollWarning.Text = "İç hakediş ve resmî bordro ayrı hesaplanır. Banka tutarı resmî bordro netinden türetilir; fark yalnız mutabakat bilgisidir.";
        }
        catch (NotSupportedException)
        {
            payrollMinimum.Text = "Yıl parametresi bekleniyor";
            payrollOfficialNet.Text = "—";
            payrollDifference.Text = "—";
            payrollWarning.Text = "Bu yılın resmî bordro parametreleri henüz tanımlı değil.";
        }
    }

    static decimal Clamp(NumericUpDown control, decimal value) => Math.Min(control.Maximum, Math.Max(control.Minimum, value));
}
