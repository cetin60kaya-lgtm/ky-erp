using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed partial class PdksHomeDashboard
{
    readonly Label summaryActive = SummaryValue();
    readonly Label summaryArrived = SummaryValue();
    readonly Label summaryMissing = SummaryValue();
    readonly Label summaryOpen = SummaryValue();
    readonly Label summaryLeave = SummaryValue();
    readonly Label summaryIssues = SummaryValue();
    readonly Label summaryState = new()
    {
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        ForeColor = Color.FromArgb(88, 103, 124),
        Text = "Günlük denetim hazırlanıyor..."
    };

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
            Height = 150,
            BackColor = Color.White,
            Padding = new Padding(18, 10, 18, 10)
        };
        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 7,
            RowCount = 3,
            BackColor = Color.Transparent
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190));
        for (var i = 1; i < 7; i++)
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 16.666f));
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        table.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));

        var title = new Label
        {
            Text = "REV 6.4.0 CANLI  •  Günlük Operasyon Komuta Merkezi",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 11.5f, FontStyle.Bold),
            ForeColor = Color.FromArgb(24, 88, 166)
        };
        table.Controls.Add(title, 0, 0);
        table.SetColumnSpan(title, 7);

        table.Controls.Add(SummaryCard("Aktif", summaryActive, Color.FromArgb(234, 245, 255)), 1, 1);
        table.Controls.Add(SummaryCard("Gelen", summaryArrived, Color.FromArgb(235, 249, 240)), 2, 1);
        table.Controls.Add(SummaryCard("İzinli", summaryLeave, Color.FromArgb(246, 241, 255)), 3, 1);
        table.Controls.Add(SummaryCard("Kart Basmayan", summaryMissing, Color.FromArgb(255, 240, 240)), 4, 1);
        table.Controls.Add(SummaryCard("Çıkış Bekleyen", summaryOpen, Color.FromArgb(255, 247, 231)), 5, 1);
        table.Controls.Add(SummaryCard("İşlem Bekleyen", summaryIssues, Color.FromArgb(255, 235, 235)), 6, 1);

        var workflow = new Label
        {
            Text = "Canlı İzleme → Giriş/Çıkış Kontrolü → İzin → Puantaj → Bordro/Ödeme → Rapor",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 8.8f),
            ForeColor = Color.FromArgb(70, 86, 108)
        };
        table.Controls.Add(workflow, 0, 1);
        table.Controls.Add(summaryState, 0, 2);
        table.SetColumnSpan(summaryState, 7);

        shell.Controls.Add(table);
        return shell;
    }

    static Control SummaryCard(string title, Label value, Color back)
    {
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            Margin = new Padding(5, 2, 5, 2),
            Padding = new Padding(8, 6, 8, 6),
            BackColor = back
        };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1, BackColor = Color.Transparent };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 25));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.Controls.Add(new Label
        {
            Text = title,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 8.2f, FontStyle.Bold),
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
            var leave = Convert.ToInt32(db.Scalar(@"select count(distinct PKNO) from OZELIZIN
                where TARIH>=@A and TARIH<@B",
                new FbParameter("@A", today), new FbParameter("@B", tomorrow)) ?? 0);
            var open = Convert.ToInt32(db.Scalar(@"select count(*) from GIRCIK
                where GTARIH>=@A and GTARIH<@B and (CSAAT is null or trim(CSAAT)='')",
                new FbParameter("@A", today), new FbParameter("@B", tomorrow)) ?? 0);
            var missing = Math.Max(0, active - arrived - leave);
            var issues = missing + open;

            summaryActive.Text = active.ToString("N0");
            summaryArrived.Text = arrived.ToString("N0");
            summaryLeave.Text = leave.ToString("N0");
            summaryMissing.Text = missing.ToString("N0");
            summaryOpen.Text = open.ToString("N0");
            summaryIssues.Text = issues.ToString("N0");
            summaryState.Text = issues == 0
                ? "● Bugünün temel kart kontrollerinde bekleyen işlem görünmüyor."
                : $"● {issues:N0} işlem kontrol bekliyor. Önce Canlı İzleme ekranındaki kırmızı/sarı kayıtları doğrulayın.";
            summaryState.ForeColor = issues == 0 ? Color.FromArgb(24, 145, 84) : Color.FromArgb(190, 82, 54);
        }
        catch
        {
            summaryActive.Text = summaryArrived.Text = summaryLeave.Text = summaryMissing.Text = summaryOpen.Text = summaryIssues.Text = "—";
            summaryState.Text = "Günlük özet okunamadı. Veritabanı bağlantısını kontrol edin.";
            summaryState.ForeColor = Color.FromArgb(190, 82, 54);
        }
    }
}
