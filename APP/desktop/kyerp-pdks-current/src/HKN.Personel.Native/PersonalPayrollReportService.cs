using System.Data;
using System.Diagnostics;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;

namespace HKN.Personel.Native;

internal static class PersonalPayrollReportService
{
    internal static bool ExportPdf(
        IWin32Window owner,
        FirebirdDatabase db,
        string card,
        DateTime period,
        string path,
        bool openAfter = false)
    {
        try
        {
            var model = Load(db, card, period);
            var settings = PayrollReportSettingsStore.Load();
            Draw(path, model, settings);
            if (openAfter)
            {
                try { Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); } catch { }
            }
            return true;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Kişisel Bordro", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }
    }

    internal static void Preview(IWin32Window owner, FirebirdDatabase db, string card, DateTime period)
    {
        var dir = Path.Combine(CompanyDataPaths.Reports, "BORDRO_ONIZLEME");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"Kisisel_Bordro_{card}_{period:yyyyMM}_{DateTime.Now:HHmmss}.pdf");
        ExportPdf(owner, db, card, period, path, true);
    }

    static PayrollModel Load(FirebirdDatabase db, string card, DateTime period)
    {
        var a = new DateTime(period.Year, period.Month, 1);
        var b = a.AddMonths(1);
        var person = db.Query(@"select first 1 k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,k.MAAS,k.SSKNO,
                coalesce(bl.AD,'') BOLUMAD
            from KIMLIK k left join BOLUM bl on bl.KOD=k.BOLUM where k.PKNO=@P",
            new FbParameter("@P", card));
        if (person.Rows.Count == 0) throw new InvalidOperationException("Personel bulunamadı.");
        var pr = person.Rows[0];

        var payroll = db.Query(@"select first 1 * from UCRETLER
            where PKNO=@P and BASTAR<@B and coalesce(BITTAR,BASTAR)>=@A
            order by BASTAR desc",
            new FbParameter("@P", card),
            new FbParameter("@A", a),
            new FbParameter("@B", b));
        if (payroll.Rows.Count == 0)
            throw new InvalidOperationException($"{a:MMMM yyyy} için bordro kaydı yok.");
        var pay = payroll.Rows[0];

        var movements = db.Query(@"select SIRA,GTARIH,GSAAT,GDAKIKA,GTUR,CTARIH,CSAAT,CDAKIKA,CTUR
            from GIRCIK where PKNO=@P and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B))
            order by SIRA",
            new FbParameter("@P", card),
            new FbParameter("@A", a),
            new FbParameter("@B", b));

        var dayMap = new Dictionary<DateTime, DayLine>();
        for (var day = a; day < b; day = day.AddDays(1))
        {
            var status = day.DayOfWeek == DayOfWeek.Saturday ? "CUMARTESİ"
                : day.DayOfWeek == DayOfWeek.Sunday ? "PAZAR" : "";
            dayMap[day.Date] = new(day.Date, null, "", null, "", "", status);
        }

        foreach (DataRow row in movements.Rows)
        {
            var entry = At(row, "GTARIH", "GSAAT", "GDAKIKA");
            if (entry.HasValue && dayMap.TryGetValue(entry.Value.Date, out var line))
            {
                if (!line.Entry.HasValue || entry.Value < line.Entry.Value)
                    dayMap[entry.Value.Date] = line with { Entry = entry, EntryType = S(row, "GTUR") };
            }

            var exit = At(row, "CTARIH", "CSAAT", "CDAKIKA");
            if (exit.HasValue && dayMap.TryGetValue(exit.Value.Date, out line))
            {
                if (!line.Exit.HasValue || exit.Value > line.Exit.Value)
                    dayMap[exit.Value.Date] = line with { Exit = exit, ExitType = S(row, "CTUR") };
            }
        }

        var normalDays = I(pay, "GUN1");
        var normalHours = S(pay, "SAAT1");
        var dailyHours = DailyHours(normalDays, normalHours);
        foreach (var day in dayMap.Keys.ToArray())
        {
            var line = dayMap[day];
            if (line.Status.Length == 0 && (line.Entry.HasValue || line.Exit.HasValue))
                dayMap[day] = line with { NormalHours = dailyHours };
        }

        return new(
            card,
            $"{S(pr, "AD")} {S(pr, "SOYAD")}".Trim(),
            D(pr, "IGTARIH"),
            D(pr, "ICTARIH"),
            S(pr, "BOLUMAD"),
            S(pr, "SSKNO"),
            M(pay, "DMAAS", M(pr, "MAAS")),
            normalDays,
            normalHours,
            M(pay, "UCRET1"),
            S(pay, "SAAT2"),
            S(pay, "SAAT3"),
            I(pay, "GUN4"),
            I(pay, "GUN5"),
            I(pay, "GUN9"),
            I(pay, "DEVG"),
            S(pay, "DEVS"),
            S(pay, "GECS"),
            S(pay, "EKS"),
            M(pay, "EKKAZ"),
            M(pay, "EKKES"),
            M(pay, "EX1"),
            M(pay, "EX2"),
            M(pay, "EX3"),
            M(pay, "EX4"),
            M(pay, "NCKALAN"),
            M(pay, "FMKALAN"),
            dayMap.Values.OrderBy(x => x.Day).ToArray(),
            a);
    }

    static void Draw(string path, PayrollModel m, PayrollReportSettings s)
    {
        using var doc = new PdfDocument();
        doc.Info.Title = $"{s.PersonalTitle} • {m.Card} • {m.Name}";
        var page = doc.AddPage();
        page.Size = PdfSharpCore.PageSize.A4;
        page.Orientation = PdfSharpCore.PageOrientation.Portrait;
        using var g = XGraphics.FromPdfPage(page);

        var blue = XColor.FromArgb(202, 224, 248);
        var blueDark = XColor.FromArgb(28, 76, 128);
        var border = new XPen(XColor.FromArgb(70, 80, 90), .7);
        var black = XBrushes.Black;
        var title = new XFont("Arial", 14, XFontStyle.Bold);
        var bold = new XFont("Arial", 7.4, XFontStyle.Bold);
        var normal = new XFont("Arial", 7.1, XFontStyle.Regular);
        var small = new XFont("Arial", 6.5, XFontStyle.Regular);

        const double margin = 24;
        var width = page.Width - margin * 2;
        var y = margin;

        g.DrawRectangle(new XSolidBrush(blue), margin, y, width, 24);
        g.DrawRectangle(border, margin, y, width, 24);
        g.DrawString(s.PersonalTitle, title, new XSolidBrush(blueDark), new XRect(margin, y + 4, width, 18), XStringFormats.TopCenter);
        y += 24;

        var infoHeight = 46d;
        g.DrawRectangle(border, margin, y, width, infoHeight);
        var c1 = width * .34;
        var c2 = width * .34;
        var c3 = width - c1 - c2;
        DrawInfo(g, normal, bold, margin + 5, y + 5, "Kart No", m.Card);
        DrawInfo(g, normal, bold, margin + 5, y + 17, "Ad Soyad", m.Name);
        DrawInfo(g, normal, bold, margin + 5, y + 29, "SSK No", m.SskNo);
        DrawInfo(g, normal, bold, margin + c1 + 5, y + 5, "İşe Giriş", Date(m.Hire));
        DrawInfo(g, normal, bold, margin + c1 + 5, y + 17, "İşten Çıkış", Date(m.Exit));
        DrawInfo(g, normal, bold, margin + c1 + 5, y + 29, "Bölüm", m.Department);
        DrawInfo(g, normal, bold, margin + c1 + c2 + 5, y + 5, "Net Maaş", Money(m.Salary));
        DrawInfo(g, normal, bold, margin + c1 + c2 + 5, y + 17, "Dönem", m.Period.ToString("MMMM yyyy", CultureInfo.GetCultureInfo("tr-TR")));
        if (s.ShowWorkplaceRegistration)
            DrawInfo(g, normal, bold, margin + c1 + c2 + 5, y + 29, "İşyeri Sicil", s.WorkplaceRegistrationNo);
        y += infoHeight;

        var columns = new[]
        {
            ("Tarih", 80d),("Giriş", 38d),("Çıkış", 38d),("N.Ç.", 34d),("%50", 28d),("%100", 30d),
            ("Ü.siz", 30d),("Ü.li İ.", 32d),("H.T.", 28d),("R.T.", 28d),("T.M.", 28d),("Dev.", 28d),
            ("Geç", 28d),("Eks", 28d),("Erk", 28d),("Durum", width - 80-38-38-34-28-30-30-32-28-28-28-28-28-28-28)
        };

        DrawHeader(g, columns, margin, ref y, 16, blue, border, bold);
        foreach (var line in m.Days)
        {
            var values = new[]
            {
                line.Day.ToString("dd MMM yyyy ddd", CultureInfo.GetCultureInfo("tr-TR")),
                TimeWithE(line.Entry, line.EntryType),
                TimeWithE(line.Exit, line.ExitType),
                line.NormalHours,
                "","","","","","","","","","","",
                line.Status
            };
            DrawRow(g, columns.Select(x => x.Item2).ToArray(), values, margin, ref y, 12.7, border, normal);
        }

        y += 4;
        var blockGap = 5d;
        var blockWidth = (width - blockGap * 2) / 3d;
        var blockHeight = Math.Max(120, page.Height - margin - y - 52);

        DrawSummaryBlock(g, margin, y, blockWidth, blockHeight, "Bordro Bilgileri", blue, border, bold, normal,
        [
            ("Normal Çalışma", $"{m.NormalDays} gün  {m.NormalHours}  {Money(m.NormalWage)}"),
            ("%50 Mesai", m.Overtime50),
            ("%100 Mesai", m.Overtime100),
            ("Ücretli İzin", $"{m.PaidLeaveDays} gün"),
            ("Yıllık İzin", $"{m.AnnualLeaveDays} gün"),
            ("Devamsızlık", $"{m.AbsenceDays} gün  {m.AbsenceHours}"),
            ("Geç Kalma", m.LateHours),
            ("Eksik Çalışma", m.MissingHours)
        ]);

        DrawSummaryBlock(g, margin + blockWidth + blockGap, y, blockWidth, blockHeight, "Diğer Ücretler", blue, border, bold, normal,
        [
            ("Avans", Money(m.Advance)),
            ("Banka", Money(m.Bank)),
            ("BES", Money(m.Bes)),
            ("İcra", Money(m.Enforcement)),
            ("Ek Kesinti", Money(m.ExtraDeduction)),
            ("Ek Kazanç", Money(m.ExtraEarning)),
            ("", ""),
            ("", "")
        ]);

        var payable = m.SalaryPayment + m.OvertimePayment;
        DrawSummaryBlock(g, margin + (blockWidth + blockGap) * 2, y, blockWidth, blockHeight, "Ödemeler", blue, border, bold, normal,
        [
            ("Normal Çalışma", $"{m.NormalDays} gün  {m.NormalHours}"),
            ("N.Ç. Hakedişi", Money(m.NormalWage)),
            ("N.Ç. Kalan", Money(m.SalaryPayment)),
            ("Fazla Mesai", $"{m.Overtime50} / {m.Overtime100}"),
            ("F.M. Kalan", Money(m.OvertimePayment)),
            ("Ödenecek Tutar", Money(payable)),
            ("", ""),
            ("", "")
        ]);

        var signatureY = page.Height - margin - 40;
        g.DrawString($"Tarih : ...../...../............", normal, black, margin, signatureY);
        g.DrawString(s.EmployeeSignatureCaption, bold, black, new XRect(margin + width * .35, signatureY, width * .25, 16), XStringFormats.TopCenter);
        if (s.ShowEmployerSignature)
            g.DrawString(s.EmployerSignatureCaption, bold, black, new XRect(margin + width * .68, signatureY, width * .3, 16), XStringFormats.TopCenter);
        if (!string.IsNullOrWhiteSpace(s.FooterNote))
            g.DrawString(s.FooterNote, small, black, new XRect(margin, page.Height - margin - 14, width, 12), XStringFormats.TopLeft);

        doc.Save(path);
    }

    static void DrawInfo(XGraphics g, XFont normal, XFont bold, double x, double y, string label, string value)
    {
        g.DrawString(label + " :", bold, XBrushes.Black, new XPoint(x, y + 7));
        g.DrawString(value ?? "", normal, XBrushes.Black, new XPoint(x + 58, y + 7));
    }

    static void DrawHeader(XGraphics g, (string, double)[] columns, double left, ref double y, double height, XColor back, XPen border, XFont font)
    {
        var x = left;
        foreach (var (name, width) in columns)
        {
            g.DrawRectangle(new XSolidBrush(back), x, y, width, height);
            g.DrawRectangle(border, x, y, width, height);
            g.DrawString(name, font, XBrushes.Black, new XRect(x + 2, y + 3, width - 4, height - 4), XStringFormats.TopLeft);
            x += width;
        }
        y += height;
    }

    static void DrawRow(XGraphics g, double[] widths, string[] values, double left, ref double y, double height, XPen border, XFont font)
    {
        var x = left;
        for (var i = 0; i < widths.Length; i++)
        {
            g.DrawRectangle(border, x, y, widths[i], height);
            var value = i < values.Length ? values[i] : "";
            g.DrawString(value, font, XBrushes.Black, new XRect(x + 2, y + 2, widths[i] - 4, height - 3), XStringFormats.TopLeft);
            x += widths[i];
        }
        y += height;
    }

    static void DrawSummaryBlock(XGraphics g, double x, double y, double width, double height, string title, XColor back, XPen border, XFont bold, XFont normal, (string Label, string Value)[] rows)
    {
        g.DrawRectangle(border, x, y, width, height);
        g.DrawRectangle(new XSolidBrush(back), x, y, width, 17);
        g.DrawRectangle(border, x, y, width, 17);
        g.DrawString(title, bold, XBrushes.Black, new XRect(x, y + 3, width, 14), XStringFormats.TopCenter);
        var yy = y + 22;
        foreach (var row in rows)
        {
            if (string.IsNullOrWhiteSpace(row.Label)) { yy += 12; continue; }
            g.DrawString(row.Label, normal, XBrushes.Black, new XPoint(x + 5, yy + 7));
            g.DrawString(row.Value, bold, XBrushes.Black, new XRect(x + width * .48, yy, width * .49 - 5, 12), XStringFormats.TopRight);
            yy += 13;
        }
    }

    static DateTime? At(DataRow r, string date, string time, string minute)
    {
        if (r[date] == DBNull.Value) return null;
        var day = Convert.ToDateTime(r[date]).Date;
        if (r[minute] != DBNull.Value)
        {
            var m = Convert.ToInt32(r[minute]);
            if (m >= 0 && m < 1440) return day.AddMinutes(m);
        }
        return TimeSpan.TryParse(S(r, time), out var t) ? day.Add(t) : null;
    }

    static string DailyHours(int days, string total)
    {
        if (days <= 0 || !TryDuration(total, out var minutes)) return "";
        var daily = (int)Math.Round(minutes / (double)days, MidpointRounding.AwayFromZero);
        return $"{daily / 60:00}:{daily % 60:00}";
    }

    static bool TryDuration(string value, out int minutes)
    {
        minutes = 0;
        var p = (value ?? "").Trim().Split(':');
        if (p.Length == 2 && int.TryParse(p[0], out var h) && int.TryParse(p[1], out var m))
        {
            minutes = h * 60 + m;
            return true;
        }
        return false;
    }

    static string TimeWithE(DateTime? at, string type) =>
        at.HasValue ? at.Value.ToString("HH:mm") + (string.Equals(type, "E", StringComparison.OrdinalIgnoreCase) ? " E" : "") : "";

    static string Date(DateTime? value) => value?.ToString("dd.MM.yyyy") ?? "—";
    static string Money(decimal value) => value == 0 ? "" : value.ToString("N2", CultureInfo.GetCultureInfo("tr-TR"));
    static string S(DataRow row, string name) => row.Table.Columns.Contains(name) && row[name] != DBNull.Value ? Convert.ToString(row[name])?.Trim() ?? "" : "";
    static int I(DataRow row, string name) => row.Table.Columns.Contains(name) && row[name] != DBNull.Value ? Convert.ToInt32(row[name]) : 0;
    static decimal M(DataRow row, string name, decimal fallback = 0m)
    {
        if (!row.Table.Columns.Contains(name) || row[name] == DBNull.Value) return fallback;
        try { return Convert.ToDecimal(row[name]); } catch { return fallback; }
    }
    static DateTime? D(DataRow row, string name) => row.Table.Columns.Contains(name) && row[name] != DBNull.Value ? Convert.ToDateTime(row[name]).Date : null;

    sealed record DayLine(DateTime Day, DateTime? Entry, string EntryType, DateTime? Exit, string ExitType, string NormalHours, string Status);
    sealed record PayrollModel(
        string Card, string Name, DateTime? Hire, DateTime? Exit, string Department, string SskNo,
        decimal Salary, int NormalDays, string NormalHours, decimal NormalWage,
        string Overtime50, string Overtime100, int UnpaidLeaveDays, int PaidLeaveDays, int AnnualLeaveDays,
        int AbsenceDays, string AbsenceHours, string LateHours, string MissingHours,
        decimal ExtraEarning, decimal ExtraDeduction, decimal Advance, decimal Bank, decimal Bes, decimal Enforcement,
        decimal SalaryPayment, decimal OvertimePayment, IReadOnlyList<DayLine> Days, DateTime Period);
}
