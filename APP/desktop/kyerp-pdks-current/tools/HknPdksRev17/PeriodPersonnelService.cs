using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed record PeriodPerson(string Card, string Name, DateTime HireDate, DateTime? ExitDate)
{
    public override string ToString() => $"{Card}  {Name}";
}

internal static class PeriodPersonnelService
{
    internal static PeriodPerson[] ReadActive(FirebirdDatabase db, DateTime start, DateTime endInclusive)
    {
        start = start.Date;
        var end = endInclusive.Date.AddDays(1);
        var table = db.Query(@"select PKNO,AD,SOYAD,IGTARIH,ICTARIH
            from KIMLIK
            where IGTARIH<@B and (ICTARIH is null or ICTARIH>=@A)
            order by PKNO",
            new FbParameter("@A", start), new FbParameter("@B", end));
        return table.AsEnumerable()
            .Select(row => new PeriodPerson(
                Convert.ToString(row["PKNO"])?.Trim() ?? "",
                ((Convert.ToString(row["AD"]) ?? "") + " " + (Convert.ToString(row["SOYAD"]) ?? "")).Trim(),
                row["IGTARIH"] == DBNull.Value ? DateTime.MinValue : Convert.ToDateTime(row["IGTARIH"]).Date,
                row["ICTARIH"] == DBNull.Value ? null : Convert.ToDateTime(row["ICTARIH"]).Date))
            .Where(person => person.Card.Length > 0)
            .ToArray();
    }

    internal static bool ActiveOn(PeriodPerson person, DateTime day) =>
        person.HireDate <= day.Date && (person.ExitDate is null || person.ExitDate.Value >= day.Date);
}
