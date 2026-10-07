using System.Data;
using System.Diagnostics;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;

namespace QuickDataTool;

internal static class PayrollReportServiceRev27
{
    internal static void ExportGeneral(IWin32Window owner, FirebirdDatabase db, DateTime period)
    {
        var settings = PayrollReportSettingsStoreRev27.Load();
        using var save = new SaveFileDialog
        {
            Filter = "PDF (*.pdf)|*.pdf",
            DefaultExt = "pdf",
            FileName = $"Genel-Maas-Bordrosu-{period:yyyyMM}.pdf"
        };
        if (save.ShowDialog(owner) != DialogResult.OK) return;
        try
        {
            var rows = LoadPayroll(db, period);
            if (rows.Rows.Count == 0) throw new InvalidOperationException($"{period:MMMM yyyy} için bordro kaydı yok.");
            DrawGeneral(save.FileName, rows, period, settings);
            Open(save.FileName);
        }
        catch (Exception ex) { MessageBox.Show(owner, ex.Message, "Genel Bordro", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    internal static void ExportPersonal(IWin32Window owner, FirebirdDatabase db, string card, DateTime period)
    {
        if (string.IsNullOrWhiteSpace(card)) { MessageBox.Show(owner, "Önce personel seçin."); return; }
        var settings = PayrollReportSettingsStoreRev27.Load();
        using var save = new SaveFileDialog
        {
            Filter = "PDF (*.pdf)|*.pdf",
            DefaultExt = "pdf",
            FileName = $"Kisisel-Bordro-{card}-{period:yyyyMM}.pdf"
        };
        if (save.ShowDialog(owner) != DialogResult.OK) return;
        try
        {
            DrawPersonal(save.FileName, db, card, period, settings);
            Open(save.FileName);
        }
        catch (Exception ex) { MessageBox.Show(owner, ex.Message, "Kişisel Bordro", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    static DataTable LoadPayroll(FirebirdDatabase db, DateTime period)
    {
        var a = new DateTime(period.Year, period.Month, 1);
        var b = a.AddMonths(1);
        return db.Query(@"select u.*,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,k.SSKNO,k.MAAS KART_MAAS
            from UCRETLER u inner join KIMLIK k on k.PKNO=u.PKNO
            where u.BASTAR>=@A and u.BASTAR<@B and k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A)
            order by u.PKNO",
            new FbParameter("@A", a), new FbParameter("@B", b));
    }

    static void DrawGeneral(string path, DataTable data, DateTime period, PayrollReportSettingsRev27 settings)
    {
        using var doc = new PdfDocument();
        doc.Info.Title = $"{settings.GeneralTitle} • {period:MM.yyyy}";
        var page = doc.AddPage();
        page.Size = settings.UseA3General ? PdfSharpCore.PageSize.A3 : PdfSharpCore.PageSize.A4;
        page.Orientation = PdfSharpCore.PageOrientation.Landscape;
        using var g = XGraphics.FromPdfPage(page);

        var border = new XPen(XColors.Black, .55);
        var headerBrush = new XSolidBrush(XColor.FromArgb(230, 230, 230));
        var titleFont = new XFont("Arial", 14, XFontStyle.Bold);
        var headerFont = new XFont("Arial", settings.UseA3General ? 7.2 : 5.4, XFontStyle.Bold);
        var bodyFont = new XFont("Arial", settings.UseA3General ? 7.1 : 5.2, XFontStyle.Regular);
        var bold = new XFont("Arial", settings.UseA3General ? 7.2 : 5.4, XFontStyle.Bold);

        const double margin = 18;
        var width = page.Width - 2 * margin;
        var y = margin;
        g.DrawRectangle(headerBrush, margin, y, width, 30);
        g.DrawRectangle(border, margin, y, width, 30);
        var title = $"{period:dd.MM.yyyy} - {period.AddMonths(1).AddDays(-1):dd.MM.yyyy} {settings.GeneralTitle}";
        g.DrawString(title, titleFont, XBrushes.Black, new XRect(margin, y + 7, width, 18), XStringFormats.TopCenter);
        y += 36;

        var defs = new (string Header, double Weight)[]
        {
            ("S.No",3),("Kart No",5),("İ.G.T",6),("Adı Soyadı",12),("Maaşı",7),
            ("N.Gün",4),("N.Saat",5),("H.İ.M",5),("H.S.M",5),("Ü.siz İ.",5),("Ücretli İ.",5),
            ("Dev.",4),("Geç",4),("Eksik",4),("Avans",6),("Banka",7),("BES",5),("İcra",5),
            ("Maaş",7),("Mesai",6),("Net",7),("İmza",10)
        };
        var totalWeight = defs.Sum(x => x.Weight);
        var widths = defs.Select(x => width * x.Weight / totalWeight).ToArray();
        DrawHeader(g, margin, ref y, 24, defs.Select(x=>x.Header).ToArray(), widths, headerBrush, border, headerFont);

        var totalSalary=0m; var totalBank=0m; var totalPayable=0m;
        var index=1;
        foreach (DataRow r in data.Rows)
        {
            var salary = M(r,"DMAAS",M(r,"KART_MAAS"));
            var bank = M(r,"EX2");
            var salaryPay = M(r,"NCKALAN");
            var overtimePay = M(r,"FMKALAN");
            var net = salaryPay + overtimePay;
            totalSalary += salary; totalBank += bank; totalPayable += net;
            var values = new[]
            {
                index++.ToString(),
                S(r,"PKNO"),
                Date(D(r,"IGTARIH")),
                $"{S(r,"AD")} {S(r,"SOYAD")}".Trim(),
                Money(salary),
                I(r,"GUN1").ToString(),
                S(r,"SAAT1"),
                S(r,"SAAT2"),
                S(r,"SAAT3"),
                S(r,"SAAT4"),
                S(r,"SAAT5"),
                S(r,"DEVS"),
                S(r,"GECS"),
                S(r,"EKS"),
                Money(M(r,"EX1")),
                Money(bank),
                Money(M(r,"EX3")),
                Money(M(r,"EX4")),
                Money(salaryPay),
                Money(overtimePay),
                Money(net),
                ""
            };
            DrawRow(g, margin, ref y, settings.UseA3General ? 21 : 16.5, values, widths, border, bodyFont);
            if (y > page.Height - margin - 45) break;
        }

        var totals = Enumerable.Repeat("", defs.Length).ToArray();
        totals[3] = "TOPLAM";
        totals[4] = Money(totalSalary);
        totals[15] = Money(totalBank);
        totals[20] = Money(totalPayable);
        DrawRow(g, margin, ref y, 22, totals, widths, border, bold, headerBrush);

        if (settings.ShowWorkplaceRegistration && !string.IsNullOrWhiteSpace(settings.WorkplaceRegistrationNo))
            g.DrawString("İşyeri Sicil No: " + settings.WorkplaceRegistrationNo, bodyFont, XBrushes.Black, new XPoint(margin, page.Height - margin - 18));
        if (!string.IsNullOrWhiteSpace(settings.FooterNote))
            g.DrawString(settings.FooterNote, bodyFont, XBrushes.Black, new XRect(margin + width*.35, page.Height-margin-20, width*.65, 16), XStringFormats.TopRight);
        doc.Save(path);
    }

    static void DrawPersonal(string path, FirebirdDatabase db, string card, DateTime period, PayrollReportSettingsRev27 settings)
    {
        var a = new DateTime(period.Year, period.Month, 1);
        var b = a.AddMonths(1);
        var person = db.Query(@"select first 1 k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,k.MAAS,k.SSKNO,coalesce(bl.AD,'') BOLUMAD
            from KIMLIK k left join BOLUM bl on bl.KOD=k.BOLUM where k.PKNO=@P", new FbParameter("@P", card));
        if (person.Rows.Count == 0) throw new InvalidOperationException("Personel bulunamadı.");
        var pr=person.Rows[0];
        var payroll=db.Query("select first 1 * from UCRETLER where PKNO=@P and BASTAR>=@A and BASTAR<@B order by BASTAR desc",
            new FbParameter("@P",card),new FbParameter("@A",a),new FbParameter("@B",b));
        if(payroll.Rows.Count==0) throw new InvalidOperationException($"{a:MMMM yyyy} için bordro kaydı yok.");
        var pay=payroll.Rows[0];

        var moves=db.Query(@"select SIRA,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK
            where PKNO=@P and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B)) order by SIRA",
            new FbParameter("@P",card),new FbParameter("@A",a),new FbParameter("@B",b));

        var days=new Dictionary<DateTime,(string In,string Out,string Status)>();
        for(var d=a;d<b;d=d.AddDays(1))
            days[d.Date]=("", "", d.DayOfWeek==DayOfWeek.Saturday?"CUMARTESİ":d.DayOfWeek==DayOfWeek.Sunday?"PAZAR":"");
        foreach(DataRow r in moves.Rows)
        {
            if(r["GTARIH"]!=DBNull.Value)
            {
                var d=Convert.ToDateTime(r["GTARIH"]).Date;
                if(days.TryGetValue(d,out var x))
                {
                    var t=S(r,"GSAAT")+(string.Equals(S(r,"GTUR"),"E",StringComparison.OrdinalIgnoreCase)?" E":"");
                    if(string.IsNullOrWhiteSpace(x.In)||string.CompareOrdinal(t,x.In)<0) days[d]=(t,x.Out,x.Status);
                }
            }
            if(r["CTARIH"]!=DBNull.Value)
            {
                var d=Convert.ToDateTime(r["CTARIH"]).Date;
                if(days.TryGetValue(d,out var x))
                {
                    var t=S(r,"CSAAT")+(string.Equals(S(r,"CTUR"),"E",StringComparison.OrdinalIgnoreCase)?" E":"");
                    if(string.IsNullOrWhiteSpace(x.Out)||string.CompareOrdinal(t,x.Out)>0) days[d]=(x.In,t,x.Status);
                }
            }
        }

        using var doc=new PdfDocument();
        doc.Info.Title=$"{settings.PersonalTitle} • {card}";
        var page=doc.AddPage(); page.Size=PdfSharpCore.PageSize.A4; page.Orientation=PdfSharpCore.PageOrientation.Portrait;
        using var g=XGraphics.FromPdfPage(page);
        var border=new XPen(XColors.Black,.55);
        var blue=new XSolidBrush(XColor.FromArgb(192,216,242));
        var titleFont=new XFont("Arial",13,XFontStyle.Bold);
        var head=new XFont("Arial",6.5,XFontStyle.Bold);
        var normal=new XFont("Arial",6.3,XFontStyle.Regular);
        var bold=new XFont("Arial",6.5,XFontStyle.Bold);
        const double margin=12;
        var width=page.Width-2*margin;
        var y=margin;

        g.DrawRectangle(blue,margin,y,width,24);g.DrawRectangle(border,margin,y,width,24);
        g.DrawString(settings.PersonalTitle,titleFont,XBrushes.Black,new XRect(margin,y+4,width,18),XStringFormats.TopCenter);y+=24;

        g.DrawRectangle(border,margin,y,width,50);
        DrawInfo(g,bold,normal,margin+4,y+6,"Kart No",card);
        DrawInfo(g,bold,normal,margin+4,y+19,"Adı",S(pr,"AD"));
        DrawInfo(g,bold,normal,margin+4,y+32,"Soyadı",S(pr,"SOYAD"));
        DrawInfo(g,bold,normal,margin+width*.34,y+6,"İşe Giriş Tarihi",Date(D(pr,"IGTARIH")));
        DrawInfo(g,bold,normal,margin+width*.34,y+19,"İşten Ayrılış Tarihi",Date(D(pr,"ICTARIH")));
        DrawInfo(g,bold,normal,margin+width*.34,y+32,"Bölümü",S(pr,"BOLUMAD"));
        DrawInfo(g,bold,normal,margin+width*.70,y+6,"Net Maaşı",Money(M(pay,"DMAAS",M(pr,"MAAS"))));
        var salary=M(pay,"DMAAS",M(pr,"MAAS"));
        DrawInfo(g,bold,normal,margin+width*.70,y+19,"Günlük Ücret",Money(salary/30m));
        DrawInfo(g,bold,normal,margin+width*.70,y+32,"Saatlik Ücret",Money(salary/225m));
        y+=50;

        var headers=new[]{"Tarih","Giriş","Çıkış","N.Ç.","%50","%100","Ü.siz","Ü.li İ.","H.T.","R.T.","T.M.","Dev.","Geç","Eks","Erk","Durum"};
        var weights=new double[]{11,5,5,5,4,4,4,4,4,4,4,4,4,4,4,13};
        var total=weights.Sum();var widths=weights.Select(w=>width*w/total).ToArray();
        DrawHeader(g,margin,ref y,16,headers,widths,blue,border,head);
        var normalDaily=DailyHours(I(pay,"GUN1"),S(pay,"SAAT1"));
        foreach(var kv in days.OrderBy(x=>x.Key))
        {
            var vals=new[]{kv.Key.ToString("dd MMM yyyy ddd",CultureInfo.GetCultureInfo("tr-TR")),kv.Value.In,kv.Value.Out,
                normalDaily,"","","","","","","","","","","",kv.Value.Status};
            DrawRow(g,margin,ref y,12.7,vals,widths,border,normal);
        }

        y+=4;
        var gap=4d;var block=(width-gap*2)/3d;var h=Math.Max(118,page.Height-margin-y-44);
        DrawBlock(g,margin,y,block,h,"Bordro Bilgileri",blue,border,bold,normal,new[]
        {
            ("Normal Çalışma",$"{I(pay,"GUN1")}   {S(pay,"SAAT1")}   {Money(M(pay,"UCRET1"))}"),
            ("%50 Mesai",S(pay,"SAAT2")+"   "+Money(M(pay,"UCRET2"))),
            ("%100 Mesai",S(pay,"SAAT3")+"   "+Money(M(pay,"UCRET3"))),
            ("Ücretli İzin",$"{I(pay,"GUN5")}   {S(pay,"SAAT5")}"),
            ("Hafta Tatili",$"{I(pay,"GUN6")}   {S(pay,"SAAT6")}"),
            ("Resmi Tatil",$"{I(pay,"GUN7")}   {S(pay,"SAAT7")}"),
            ("Tatil Mesaisi",$"{I(pay,"GUN8")}   {S(pay,"SAAT8")}"),
            ("Kesintiler",""),
            ("Devamsızlık",$"{I(pay,"DEVG")}   {S(pay,"DEVS")}"),
            ("Ücretsiz İzin",$"{I(pay,"GUN4")}   {S(pay,"SAAT4")}"),
            ("Geç Kalma",S(pay,"GECS")),
            ("Eksik Çalışma",S(pay,"EKS")),
            ("Erken Çıkma",S(pay,"ERS"))
        });
        DrawBlock(g,margin+block+gap,y,block,h,"Diğer Ücretler",blue,border,bold,normal,new[]
        {
            ("Avans",Money(M(pay,"EX1"))),("Banka",Money(M(pay,"EX2"))),("BES",Money(M(pay,"EX3"))),("İcra",Money(M(pay,"EX4"))),
            ("Ek Kesinti Toplamı",Money(M(pay,"EKKES"))),("Yol Parası",Money(M(pay,"YOLU"))),("Yemek Parası",Money(M(pay,"YEMEKU"))),
            ("Ek Kazanç Toplamı",Money(M(pay,"EKKAZ"))),("Devir",Money(M(pay,"DEVIR")))
        });
        var payable=M(pay,"NCKALAN")+M(pay,"FMKALAN");
        DrawBlock(g,margin+(block+gap)*2,y,block,h,"Ödemeler",blue,border,bold,normal,new[]
        {
            ("Normal Çalışma",$"{I(pay,"GUN1")}   {S(pay,"SAAT1")}   {Money(M(pay,"UCRET1"))}"),
            ("N.Ç. Hakedişi",Money(M(pay,"NCUCRET",M(pay,"UCRET1")))),("N.Ç. Ödenen",Money(M(pay,"NCODENEN"))),
            ("N.Ç. Kalan",Money(M(pay,"NCKALAN"))),("Fazla Mesai",Money(M(pay,"FMUCRET"))),("F.M. Ödenen",Money(M(pay,"FMODENEN"))),
            ("F.M. Kalan",Money(M(pay,"FMKALAN"))),("Ödenecek Tutar",Money(payable))
        });

        var sy=page.Height-margin-28;
        g.DrawString("Tarih : ...../...../............",normal,XBrushes.Black,new XPoint(margin,sy));
        if(settings.ShowEmployeeSignature)g.DrawString(settings.EmployeeSignatureCaption,bold,XBrushes.Black,new XRect(margin+width*.38,sy,width*.2,14),XStringFormats.TopCenter);
        if(settings.ShowEmployerSignature)g.DrawString(settings.EmployerSignatureCaption,bold,XBrushes.Black,new XRect(margin+width*.70,sy,width*.28,14),XStringFormats.TopCenter);
        if(!string.IsNullOrWhiteSpace(settings.FooterNote))g.DrawString(settings.FooterNote,normal,XBrushes.Black,new XRect(margin,page.Height-margin-12,width,10),XStringFormats.TopLeft);
        doc.Save(path);
    }

    static void DrawInfo(XGraphics g,XFont bold,XFont normal,double x,double y,string label,string value)
    { g.DrawString(label+" :",bold,XBrushes.Black,new XPoint(x,y+6));g.DrawString(value??"",normal,XBrushes.Black,new XPoint(x+62,y+6)); }

    static void DrawHeader(XGraphics g,double left,ref double y,double height,string[] headers,double[] widths,XBrush back,XPen border,XFont font)
    {
        var x=left;for(var i=0;i<headers.Length;i++){g.DrawRectangle(back,x,y,widths[i],height);g.DrawRectangle(border,x,y,widths[i],height);g.DrawString(headers[i],font,XBrushes.Black,new XRect(x+1,y+3,widths[i]-2,height-4),XStringFormats.TopCenter);x+=widths[i];}y+=height;
    }

    static void DrawRow(XGraphics g,double left,ref double y,double height,string[] values,double[] widths,XPen border,XFont font,XBrush? back=null)
    {
        var x=left;for(var i=0;i<widths.Length;i++){if(back is not null)g.DrawRectangle(back,x,y,widths[i],height);g.DrawRectangle(border,x,y,widths[i],height);g.DrawString(i<values.Length?values[i]:"",font,XBrushes.Black,new XRect(x+1,y+2,widths[i]-2,height-3),XStringFormats.TopLeft);x+=widths[i];}y+=height;
    }

    static void DrawBlock(XGraphics g,double x,double y,double width,double height,string title,XBrush back,XPen border,XFont bold,XFont normal,(string,string)[] rows)
    {
        g.DrawRectangle(border,x,y,width,height);g.DrawRectangle(back,x,y,width,17);g.DrawRectangle(border,x,y,width,17);
        g.DrawString(title,bold,XBrushes.Black,new XRect(x,y+3,width,13),XStringFormats.TopCenter);
        var yy=y+21;foreach(var row in rows){g.DrawString(row.Item1,normal,XBrushes.Black,new XPoint(x+4,yy+6));g.DrawString(row.Item2,bold,XBrushes.Black,new XRect(x+width*.44,yy,width*.54-4,11),XStringFormats.TopRight);yy+=11.5;if(yy>y+height-10)break;}
    }

    static string DailyHours(int days,string total)
    {
        if(days<=0||!TryMinutes(total,out var min))return "";
        var d=(int)Math.Round(min/(double)days);return $"{d/60:00}:{d%60:00}";
    }
    static bool TryMinutes(string raw,out int minutes)
    {
        minutes=0;var p=(raw??"").Split(':');if(p.Length!=2||!int.TryParse(p[0],out var h)||!int.TryParse(p[1],out var m))return false;minutes=h*60+m;return true;
    }
    static string S(DataRow r,string n)=>r.Table.Columns.Contains(n)&&r[n]!=DBNull.Value?Convert.ToString(r[n])?.Trim()??"":"";
    static int I(DataRow r,string n)=>r.Table.Columns.Contains(n)&&r[n]!=DBNull.Value?Convert.ToInt32(r[n]):0;
    static decimal M(DataRow r,string n,decimal fallback=0m){if(!r.Table.Columns.Contains(n)||r[n]==DBNull.Value)return fallback;try{return Convert.ToDecimal(r[n]);}catch{return fallback;}}
    static DateTime? D(DataRow r,string n)=>r.Table.Columns.Contains(n)&&r[n]!=DBNull.Value?Convert.ToDateTime(r[n]).Date:null;
    static string Date(DateTime? d)=>d?.ToString("dd.MM.yyyy")??"—";
    static string Money(decimal v)=>v==0m?"":v.ToString("N2",CultureInfo.GetCultureInfo("tr-TR"));
    static void Open(string path){try{Process.Start(new ProcessStartInfo(path){UseShellExecute=true});}catch{}}
}
