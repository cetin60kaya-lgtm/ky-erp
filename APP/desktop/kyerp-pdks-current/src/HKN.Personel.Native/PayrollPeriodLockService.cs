using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed record PayrollPeriodLockInfo(int Year, int Month, bool Locked, DateTime? LockedAt, string LockedBy, string Note);

internal static class PayrollPeriodLockService
{
    const string TableName = "PDKS_DONEM_KILIT";

    public static void Ensure(FirebirdDatabase db)
    {
        var exists = Convert.ToInt32(db.Scalar(
            "select count(*) from RDB$RELATIONS where trim(RDB$RELATION_NAME)=@N",
            new FbParameter("@N", TableName)) ?? 0) > 0;
        if (exists) return;

        db.Execute(
            "create table PDKS_DONEM_KILIT (" +
            "YIL smallint not null, AY smallint not null, KILITLI smallint not null, " +
            "KILIT_TARIH timestamp, KILITLEYEN varchar(80), NOTU varchar(250), " +
            "constraint PK_PDKS_DONEM_KILIT primary key (YIL,AY))");
    }

    public static PayrollPeriodLockInfo Get(FirebirdDatabase db, DateTime period)
    {
        Ensure(db);
        var dt = db.Query(
            "select YIL,AY,KILITLI,KILIT_TARIH,KILITLEYEN,NOTU from PDKS_DONEM_KILIT where YIL=@Y and AY=@M",
            new FbParameter("@Y", period.Year), new FbParameter("@M", period.Month));
        if (dt.Rows.Count == 0)
            return new(period.Year, period.Month, false, null, string.Empty, string.Empty);

        var r = dt.Rows[0];
        return new(
            Convert.ToInt32(r["YIL"]),
            Convert.ToInt32(r["AY"]),
            Convert.ToInt32(r["KILITLI"]) == 1,
            r["KILIT_TARIH"] == DBNull.Value ? null : Convert.ToDateTime(r["KILIT_TARIH"]),
            Convert.ToString(r["KILITLEYEN"])?.Trim() ?? string.Empty,
            Convert.ToString(r["NOTU"])?.Trim() ?? string.Empty);
    }

    public static bool IsLocked(FirebirdDatabase db, DateTime period) => Get(db, period).Locked;

    public static PayrollPeriodLockInfo? FirstLocked(FirebirdDatabase db, DateTime start, DateTime endInclusive)
    {
        var cursor = new DateTime(start.Year, start.Month, 1);
        var last = new DateTime(endInclusive.Year, endInclusive.Month, 1);
        while (cursor <= last)
        {
            var info = Get(db, cursor);
            if (info.Locked) return info;
            cursor = cursor.AddMonths(1);
        }
        return null;
    }

    public static PayrollPeriodLockInfo Set(FirebirdDatabase db, DateTime period, bool locked, string? note = null)
    {
        Ensure(db);
        var changed = db.Execute(
            "update PDKS_DONEM_KILIT set KILITLI=@K,KILIT_TARIH=@T,KILITLEYEN=@U,NOTU=@N where YIL=@Y and AY=@M",
            new FbParameter("@K", locked ? 1 : 0),
            new FbParameter("@T", DateTime.Now),
            new FbParameter("@U", Environment.UserName),
            new FbParameter("@N", note ?? string.Empty),
            new FbParameter("@Y", period.Year),
            new FbParameter("@M", period.Month));
        if (changed == 0)
        {
            db.Execute(
                "insert into PDKS_DONEM_KILIT (YIL,AY,KILITLI,KILIT_TARIH,KILITLEYEN,NOTU) values (@Y,@M,@K,@T,@U,@N)",
                new FbParameter("@Y", period.Year),
                new FbParameter("@M", period.Month),
                new FbParameter("@K", locked ? 1 : 0),
                new FbParameter("@T", DateTime.Now),
                new FbParameter("@U", Environment.UserName),
                new FbParameter("@N", note ?? string.Empty));
        }
        return Get(db, period);
    }

    public static string Caption(PayrollPeriodLockInfo info)
        => info.Locked
            ? $"KİLİTLİ • {info.Month:00}.{info.Year}" + (info.LockedAt is null ? "" : $" • {info.LockedAt:dd.MM.yyyy HH:mm}")
            : $"AÇIK • {info.Month:00}.{info.Year}";
}
