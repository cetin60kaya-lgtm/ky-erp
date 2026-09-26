using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed partial class PdksHomeDashboard
{
    readonly Label summaryActive = SummaryValue();
    readonly Label summaryArrived = SummaryValue();
    readonly Label summaryMissing = SummaryValue();
    readonly Label summaryOpen = SummaryValue();

    static Label SummaryValue() => new()
    {
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleCenter,
        Font = new Font("Segoe UI", 18f, FontStyle.Bold),
        ForeColor = Color.FromArgb(27, 44, 68),
        Text = "—"
    };

    Control BuildDailySummary()
    {
        var shell = new Panel
        {
            Dock = DockStyle.Top,
            Height = 128,
            BackColor = Color.White,
            Padding = new Padding(18, 12, 18, 12)
        };
        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 5,
            RowCount = 2,
            BackColor = Color.Transparent
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
        for (var i = 1; i < 5; i++)
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        table.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var title = new Label
        {
            Text = "Günün Özeti",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            ForeColor = Color.FromArgb(27, 44, 68)
        };
        table.Controls.Add(title, 0, 0);
        table.SetRowSpan(title, 2);

        table.Controls.Add(SummaryCard("Aktif Personel", summaryActive, Color.FromArgb(234, 245, 255)), 1, 0);
        table.Controls.Add(SummaryCard("Bugün Gelen", summaryArrived, Color.FromArgb(235, 249, 240)), 2, 0);
        table.Controls.Add(SummaryCard("Kart Basmayan", summaryMissing, Color.FromArgb(255, 240, 240)), 3, 0);
        table.Controls.Add(SummaryCard("İçeride / Çıkış Bekleyen", summaryOpen, Color.FromArgb(255, 247, 231)), 4, 0);
        foreach (Control control in table.Controls.Cast<Control>().Where(c => table.GetColumn(c) > 0))
            table.SetRowSpan(control, 2);
        shell.Controls.Add(table);
        return shell;
    }

    static Control SummaryCard(string title, Label value, Color back)
    {
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            Margin = new Padding(6, 2, 6, 2),
            Padding = new Padding(10, 8, 10, 8),
            BackColor = back
        };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1, BackColor = Color.Transparent };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.Controls.Add(new Label
        {
            Text = title,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 8.7f, FontStyle.Bold),
            ForeColor = Color.FromArgb(70, 86, 108)
        }, 0, 0);
        layout.Controls.Add(value, 0, 1);
        panel.Controls.Add(layout);
        return panel;
    }

    void RefreshDailySummary()
    {
        try
        {
            var db = new FirebirdDatabase(PdksOptions.FromEnvironment());
            var today = DateTime.Today;
            var tomorrow = today.AddDays(1);
            var active = Convert.ToInt32(db.Scalar(@"select count(*) from KIMLIK
                where (IGTARIH is null or IGTARIH<@B) and (ICTARIH is null or ICTARIH>=@A)",
                new FbParameter("@A", today), new FbParameter("@B", tomorrow)) ?? 0);
            var arrived = Convert.ToInt32(db.Scalar(@"select count(distinct PKNO) from GIRCIK
                where GTARIH>=@A and GTARIH<@B",
                new FbParameter("@A", today), new FbParameter("@B", tomorrow)) ?? 0);
            var open = Convert.ToInt32(db.Scalar(@"select count(*) from GIRCIK
                where GTARIH>=@A and GTARIH<@B and (CSAAT is null or trim(CSAAT)='')",
                new FbParameter("@A", today), new FbParameter("@B", tomorrow)) ?? 0);

            summaryActive.Text = active.ToString("N0");
            summaryArrived.Text = arrived.ToString("N0");
            summaryMissing.Text = Math.Max(0, active - arrived).ToString("N0");
            summaryOpen.Text = open.ToString("N0");
        }
        catch
        {
            summaryActive.Text = summaryArrived.Text = summaryMissing.Text = summaryOpen.Text = "—";
        }
    }
}
