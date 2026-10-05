using System.Globalization;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed record AttendanceBulkCorrectionResult(
    string Operation,
    int Requested,
    int Changed,
    int Skipped,
    IReadOnlyList<string> Cards,
    string Message);

internal static class AttendanceBulkCorrectionService
{
    public static AttendanceBulkCorrectionResult NormalizeEntries(
        FirebirdDatabase db, IEnumerable<string> cards, DateTime day, TimeSpan from, TimeSpan to) =>
        Normalize(db, cards, day, from, to, entry: true);

    public static AttendanceBulkCorrectionResult NormalizeExits(
        FirebirdDatabase db, IEnumerable<string> cards, DateTime day, TimeSpan from, TimeSpan to) =>
        Normalize(db, cards, day, from, to, entry: false);

    public static AttendanceBulkCorrectionResult AddManualEntries(
        FirebirdDatabase db, IEnumerable<string> cards, DateTime day, TimeSpan from, TimeSpan to) =>
        AddManual(db, cards, day, from, to, entry: true);

    public static AttendanceBulkCorrectionResult AddManualExits(
        FirebirdDatabase db, IEnumerable<string> cards, DateTime day, TimeSpan from, TimeSpan to) =>
        AddManual(db, cards, day, from, to, entry: false);

    static AttendanceBulkCorrectionResult Normalize(
        FirebirdDatabase db, IEnumerable<string> sourceCards, DateTime day, TimeSpan from, TimeSpan to, bool entry)
    {
        ValidateRange(from, to);
        var cards = NormalizeCards(sourceCards);
        var changedCards = new List<string>();
        var audit = new List<string>();
        var skipped = 0;

        foreach (var card in cards)
        {
            var table = db.Query(entry
                ? "select first 1 SIRA,GSAAT,GDAKIKA,GTUR from GIRCIK where PKNO=@P and GTARIH>=@D and GTARIH<@N order by GDAKIKA,SIRA"
                : "select first 1 SIRA,CSAAT,CDAKIKA,CTUR from GIRCIK where PKNO=@P and CTARIH>=@D and CTARIH<@N order by CDAKIKA desc,SIRA desc",
                new FbParameter("@P", card),
                new FbParameter("@D", day.Date),
                new FbParameter("@N", day.Date.AddDays(1)));

            if (table.Rows.Count == 0) { skipped++; continue; }
            var row = table.Rows[0];
            var tur = Convert.ToString(row[entry ? "GTUR" : "CTUR"])?.Trim() ?? string.Empty;
            if (string.Equals(tur, "E", StringComparison.OrdinalIgnoreCase)) { skipped++; continue; }

            var oldTime = Convert.ToString(row[entry ? "GSAAT" : "CSAAT"])?.Trim() ?? string.Empty;
            var minute = StableMinute(card, day, entry ? "NORMAL_GIRIS" : "NORMAL_CIKIS", from, to);
            var newTime = TimeSpan.FromMinutes(minute).ToString(@"hh\:mm", CultureInfo.InvariantCulture);
            var sira = Convert.ToInt32(row["SIRA"]);

            var affected = db.Execute(entry
                ? "update GIRCIK set GSAAT=@T,GDAKIKA=@M where SIRA=@S and PKNO=@P"
                : "update GIRCIK set CSAAT=@T,CDAKIKA=@M where SIRA=@S and PKNO=@P",
                new FbParameter("@T", newTime),
                new FbParameter("@M", minute),
                new FbParameter("@S", sira),
                new FbParameter("@P", card));
            if (affected <= 0) { skipped++; continue; }

            changedCards.Add(card);
            audit.Add($"{card};{day:yyyy-MM-dd};{(entry ? "GIRIS_NORMALIZE" : "CIKIS_NORMALIZE")};{oldTime};{newTime};E=HAYIR");
        }

        if (changedCards.Count > 0)
        {
            OperationalTnfSyncService.AlignPersonDays(db, changedCards.Select(x => (x, day.Date)));
            WriteAudit(audit);
        }

        var op = entry ? "Geç giriş düzeltme" : "Erken çıkış düzeltme";
        return new(op, cards.Length, changedCards.Count, skipped, changedCards,
            $"{op}: {changedCards.Count} kayıt {from:hh\:mm}-{to:hh\:mm} aralığına dağıtıldı; DATA ve yıllık TNF birlikte eşitlendi. E oluşturulmadı. Atlanan={skipped}.");
    }

    static AttendanceBulkCorrectionResult AddManual(
        FirebirdDatabase db, IEnumerable<string> sourceCards, DateTime day, TimeSpan from, TimeSpan to, bool entry)
    {
        ValidateRange(from, to);
        var cards = NormalizeCards(sourceCards);
        var changedCards = new List<string>();
        var audit = new List<string>();
        var skipped = 0;

        foreach (var card in cards)
        {
            var minute = StableMinute(card, day, entry ? "E_GIRIS" : "E_CIKIS", from, to);
            var time = TimeSpan.FromMinutes(minute).ToString(@"hh\:mm", CultureInfo.InvariantCulture);

            if (entry)
            {
                var already = Convert.ToInt32(db.Scalar(
                    "select count(*) from GIRCIK where PKNO=@P and GTARIH>=@D and GTARIH<@N",
                    new FbParameter("@P", card), new FbParameter("@D", day.Date), new FbParameter("@N", day.Date.AddDays(1))) ?? 0);
                if (already > 0) { skipped++; continue; }

                var exitOnly = db.Query(
                    "select first 1 SIRA from GIRCIK where PKNO=@P and GTARIH is null and CTARIH>=@D and CTARIH<@N order by CDAKIKA,SIRA",
                    new FbParameter("@P", card), new FbParameter("@D", day.Date), new FbParameter("@N", day.Date.AddDays(1)));
                if (exitOnly.Rows.Count > 0)
                {
                    var sira = Convert.ToInt32(exitOnly.Rows[0]["SIRA"]);
                    db.Execute("update GIRCIK set GTARIH=@D,GSAAT=@T,GDAKIKA=@M,GTUR='E' where SIRA=@S and PKNO=@P",
                        new FbParameter("@D", day.Date), new FbParameter("@T", time), new FbParameter("@M", minute),
                        new FbParameter("@S", sira), new FbParameter("@P", card));
                }
                else
                {
                    var sira = Convert.ToInt32(db.Scalar("select coalesce(max(SIRA),0)+1 from GIRCIK") ?? 1);
                    db.Execute("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,MKOD) values (@S,@P,@D,@T,@M,'E',0)",
                        new FbParameter("@S", sira), new FbParameter("@P", card), new FbParameter("@D", day.Date),
                        new FbParameter("@T", time), new FbParameter("@M", minute));
                }
            }
            else
            {
                var already = Convert.ToInt32(db.Scalar(
                    "select count(*) from GIRCIK where PKNO=@P and CTARIH>=@D and CTARIH<@N",
                    new FbParameter("@P", card), new FbParameter("@D", day.Date), new FbParameter("@N", day.Date.AddDays(1))) ?? 0);
                if (already > 0) { skipped++; continue; }

                var open = db.Query(
                    "select first 1 SIRA from GIRCIK where PKNO=@P and GTARIH>=@D and GTARIH<@N and CTARIH is null order by GDAKIKA desc,SIRA desc",
                    new FbParameter("@P", card), new FbParameter("@D", day.Date), new FbParameter("@N", day.Date.AddDays(1)));
                if (open.Rows.Count == 0) { skipped++; continue; }

                var sira = Convert.ToInt32(open.Rows[0]["SIRA"]);
                db.Execute("update GIRCIK set CTARIH=@D,CSAAT=@T,CDAKIKA=@M,CTUR='E' where SIRA=@S and PKNO=@P",
                    new FbParameter("@D", day.Date), new FbParameter("@T", time), new FbParameter("@M", minute),
                    new FbParameter("@S", sira), new FbParameter("@P", card));
            }

            changedCards.Add(card);
            audit.Add($"{card};{day:yyyy-MM-dd};{(entry ? "ELLE_GIRIS_E" : "ELLE_CIKIS_E")};;{time};E=EVET");
        }

        if (changedCards.Count > 0)
        {
            OperationalTnfSyncService.AlignPersonDays(db, changedCards.Select(x => (x, day.Date)));
            WriteAudit(audit);
        }

        var op = entry ? "Toplu E giriş" : "Toplu E çıkış";
        return new(op, cards.Length, changedCards.Count, skipped, changedCards,
            $"{op}: {changedCards.Count} DATA kaydı oluşturuldu. E kayıtları yıllık TNF'ye yazılmadı; uygulamada E olarak kalır. Atlanan={skipped}.");
    }

    static string[] NormalizeCards(IEnumerable<string> source) =>
        source.Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().PadLeft(5, '0'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    static void ValidateRange(TimeSpan from, TimeSpan to)
    {
        if (from < TimeSpan.Zero || to >= TimeSpan.FromDays(1) || to < from)
            throw new ArgumentException("Saat aralığı geçersiz.");
    }

    static int StableMinute(string card, DateTime day, string operation, TimeSpan from, TimeSpan to)
    {
        var min = (int)from.TotalMinutes;
        var max = (int)to.TotalMinutes;
        var span = max - min + 1;
        var seedText = $"{card}|{day:yyyyMMdd}|{operation}";
        var hash = System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(seedText));
        var value = BitConverter.ToUInt32(hash, 0);
        return min + (int)(value % (uint)span);
    }

    static void WriteAudit(IEnumerable<string> rows)
    {
        CompanyDataPaths.Ensure();
        var dir = Path.Combine(CompanyDataPaths.Audit, "MANUEL_ISLEMLER");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"MANUEL_DUZELTMELER_{DateTime.Today:yyyy}.csv");
        if (!File.Exists(path))
            File.WriteAllText(path, "KART;TARIH;ISLEM;ESKI;YENI;TIP;KAYIT_ZAMANI;KULLANICI" + Environment.NewLine, Encoding.UTF8);
        foreach (var row in rows)
            File.AppendAllText(path, $"{row};{DateTime.Now:yyyy-MM-dd HH:mm:ss};{Environment.UserName}{Environment.NewLine}", Encoding.UTF8);
    }
}
