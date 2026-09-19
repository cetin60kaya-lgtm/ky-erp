using System.Drawing.Printing;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
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
        if(currentPk==""&&title!="Personel Bilgi Formu (Boş)")return;
        string template=ReportTemplate(title);if(template.Length>0&&!File.Exists(template)){MessageBox.Show("Rapor şablonu bulunamadı:\n"+template,"Rapor",MessageBoxButtons.OK,MessageBoxIcon.Warning);return;}
        var grid=ReportGrid(title);int rowIndex=0;var doc=new PrintDocument{DocumentName=title};
        doc.BeginPrint+=(_,_)=>rowIndex=0;
        doc.PrintPage+=(s,e)=>
        {
            var g=e.Graphics!;float y=45;using var h=new Font("Arial",14,FontStyle.Bold);using var n=new Font("Arial",9);using var b=new Font("Arial",9,FontStyle.Bold);
            g.DrawString(title,h,Brushes.Black,45,y);y+=30;
            bool blank=title=="Personel Bilgi Formu (Boş)";string pk=blank?"":currentPk,ad=blank?"":$"{f.GetValueOrDefault("AD")?.Text} {f.GetValueOrDefault("SOYAD")?.Text}";
            g.DrawString($"Kart No: {pk}    Ad Soyad: {ad}",n,Brushes.Black,45,y);y+=21;
            g.DrawString($"İşe Giriş: {(blank?"":f.GetValueOrDefault("IGTARIH")?.Text)}    Maaş: {(blank?"":f.GetValueOrDefault("MAAS")?.Text)}",n,Brushes.Black,45,y);y+=26;
            if(title.StartsWith("Personel Bilgi Formu")){string[] keys={"UKNO","CINSIYET","DTARIH","DYER","BABAAD","ANAAD","MEDHAL","UYRUK","SSKNO","GSM","ADRES"};foreach(var k in keys){g.DrawString($"{k}: {(blank?"":f.GetValueOrDefault(k)?.Text)}",n,Brushes.Black,45,y);y+=19;}e.HasMorePages=false;return;}
            if(grid==null){e.HasMorePages=false;return;}
            string head=string.Join(" | ",grid.Columns.Cast<DataGridViewColumn>().Where(c=>c.Visible).Take(6).Select(c=>c.HeaderText));g.DrawString(head,b,Brushes.Black,45,y);y+=20;
            while(rowIndex<grid.Rows.Count){var r=grid.Rows[rowIndex];rowIndex++;if(r.IsNewRow)continue;string line=string.Join(" | ",r.Cells.Cast<DataGridViewCell>().Where(c=>c.OwningColumn.Visible).Take(6).Select(c=>Convert.ToString(c.FormattedValue)));g.DrawString(line,n,Brushes.Black,45,y);y+=17;if(y>e.MarginBounds.Bottom-25){e.HasMorePages=rowIndex<grid.Rows.Count;return;}}
            e.HasMorePages=false;
        };
        using var pv=new PrintPreviewDialog{Document=doc,Width=1000,Height=750,Text=title};pv.ShowDialog(this);
    }
}
