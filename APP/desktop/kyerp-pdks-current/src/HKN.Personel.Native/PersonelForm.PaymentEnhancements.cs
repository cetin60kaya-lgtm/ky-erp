namespace HKN.Personel.Native;

public partial class PersonelForm
{
    bool monthlyPaymentLauncherInstalled;

    void InstallMonthlyPaymentLauncher()
    {
        if (monthlyPaymentLauncherInstalled) return;
        monthlyPaymentLauncherInstalled = true;
        var page = tabs.TabPages.Cast<TabPage>().FirstOrDefault(x => x.Text == "Ödemeler");
        if (page is null || page.Controls.Find("MonthlyAdjustmentBar", true).Length > 0) return;

        var bar = new Panel
        {
            Name = "MonthlyAdjustmentBar",
            Dock = DockStyle.Top,
            Height = 48,
            BackColor = Color.FromArgb(238, 245, 255),
            Padding = new Padding(8, 7, 8, 7)
        };
        var button = new Button
        {
            Text = "Aylık Düzeltme / Hızlı Ödeme",
            Dock = DockStyle.Left,
            Width = 230,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(31, 111, 235),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        };
        button.FlatAppearance.BorderSize = 0;
        button.Click += (_, _) =>
        {
            using var form = new MonthlyPayrollAdjustmentForm();
            form.ShowDialog(this);
            RefreshFullTabs();
        };
        var note = new Label
        {
            Text = "Ay bazında bordro kaynağını düzeltir; Banka/Elden ve toplu ödeme işlemlerini tek ekranda yapar.",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(12, 0, 0, 0),
            ForeColor = Color.FromArgb(50, 75, 105)
        };
        bar.Controls.Add(note);
        bar.Controls.Add(button);
        page.Controls.Add(bar);
        bar.BringToFront();
    }
}
