using System.Drawing.Printing;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    static string SafeFileName(string value)=>string.Concat(value.Select(c=>Path.GetInvalidFileNameChars().Contains(c)?'_':c));

    void ExportActiveGrid(bool excel)
    {
        var page=tabs.SelectedTab??throw new InvalidOperationException("Aktarılacak sekme seçili değil.");
        var grid=All(page).OfType<DataGridView>().FirstOrDefault()??throw new InvalidOperationException("Bu sekmede aktarılacak tablo yok.");
        var columns=grid.Columns.Cast<DataGridViewColumn>().Where(column=>column.Visible).OrderBy(column=>column.DisplayIndex).ToArray();
        var rows=grid.Rows.Cast<DataGridViewRow>().Where(row=>!row.IsNewRow).Select(row=>(IReadOnlyList<string>)columns.Select(column=>Convert.ToString(row.Cells[column.Index].FormattedValue)??"").ToArray()).ToArray();
        var report=CompanyBranding.Decorate(new ReportTable(page.Text,columns.Select(column=>column.HeaderText).ToArray(),rows));
        using var save=new SaveFileDialog{Filter=excel?"Excel (*.xlsx)|*.xlsx":"PDF (*.pdf)|*.pdf",DefaultExt=excel?"xlsx":"pdf",FileName=$"{SafeFileName(page.Text)}-{DateTime.Now:yyyyMMdd-HHmm}"};
        if(save.ShowDialog(this)!=DialogResult.OK)return;
        if(excel)ReportExporter.ExportExcel(save.FileName,report);else ReportExporter.ExportPdf(save.FileName,report);
        MessageBox.Show("Rapor oluşturuldu:\n"+save.FileName,"Raporlar",MessageBoxButtons.OK,MessageBoxIcon.Information);
    }

    string ReportTemplate(string title)=>title switch
    {
        "Ayrıntılı Kişisel Bordro"=>options.ReportPath("Kisisel_Bordro.fr3"),
        "Personel Bilgi Formu"=>options.ReportPath("PerBilgi.fr3"),
        "Personel Bilgi Formu (Boş)"=>options.ReportPath("PerBilgiBos.fr3"),
        "Kişisel Giriş Çıkış Raporu"=>options.ReportPath("KisiselGirisCikis.fr3"),
        "Kişisel İzin Kartı"=>options.ReportPath("KisiselIzinKarti.fr3"),
        "Kişisel Ek Kazanç ve Kesinti Kartı"=>options.ReportPath("KisiselEKKKarti.fr3"),
        _=>""
    };

    DataGridView? ReportGrid(string title)=>title.Contains("Giriş")?gGiris:title.Contains("İzin")?gIzin:title.Contains("Kazanç")?gEkk:title.Contains("Bordro")?gOdeme:null;

    void PrintReportFinal(string title)
    {
        if (currentPk == "" && title != "Personel Bilgi Formu (Boş)") return;
        var blank = title == "Personel Bilgi Formu (Boş)";
        var grid = ReportGrid(title);
        ReportTable report;

        if (title.StartsWith("Personel Bilgi Formu", StringComparison.Ordinal))
        {
            string V(string key) => blank ? string.Empty : f.GetValueOrDefault(key)?.Text ?? string.Empty;
            var rows = new List<IReadOnlyList<string>>
            {
                new[] { "Kart No", blank ? string.Empty : currentPk },
                new[] { "Ad Soyad", blank ? string.Empty : $"{V("AD")} {V("SOYAD")}".Trim() },
                new[] { "İşe Giriş", V("IGTARIH") },
                new[] { "Maaş", V("MAAS") },
                new[] { "Ulusal Kimlik No", V("UKNO") },
                new[] { "Cinsiyeti", V("CINSIYET") },
                new[] { "Doğum Tarihi", V("DTARIH") },
                new[] { "Doğum Yeri", V("DYER") },
                new[] { "Baba Adı", V("BABAAD") },
                new[] { "Ana Adı", V("ANAAD") },
                new[] { "Medeni Hali", V("MEDHAL") },
                new[] { "Uyruğu", V("UYRUK") },
                new[] { "SSK No", V("SSKNO") },
                new[] { "GSM", V("GSM") },
                new[] { "Adres", V("ADRES") }
            };
            report = new ReportTable(title, new[] { "Alan", "Bilgi" }, rows);
        }
        else
        {
            if (grid is null) return;
            var columns = grid.Columns.Cast<DataGridViewColumn>()
                .Where(c => c.Visible).OrderBy(c => c.DisplayIndex).Take(10).ToArray();
            var rows = grid.Rows.Cast<DataGridViewRow>().Where(r => !r.IsNewRow)
                .Select(r => (IReadOnlyList<string>)columns.Select(c => Convert.ToString(r.Cells[c.Index].FormattedValue) ?? string.Empty).ToArray())
                .ToArray();
            var person = $"{f.GetValueOrDefault("AD")?.Text} {f.GetValueOrDefault("SOYAD")?.Text}".Trim();
            report = new ReportTable($"{title} • {currentPk} • {person}", columns.Select(c => c.HeaderText).ToArray(), rows);
        }

        ReportPrintHelper.Preview(this, report, report.Columns.Count > 7);
    }
}
