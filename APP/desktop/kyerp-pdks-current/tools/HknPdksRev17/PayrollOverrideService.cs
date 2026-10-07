using System.Data;
using System.Globalization;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed record PayrollPeriodStatus(bool PeriodLocked, bool PersonLocked, bool HasOverride, bool HasOverlap, string Text);

internal static class PayrollOverrideService
{
    private static readonly object SchemaGate = new();
    private static readonly HashSet<FirebirdDatabase> Prepared = new(ReferenceEqualityComparer.Instance);

    internal static readonly string[] EditableFields =
    [
        "DMAAS", "GUN1", "SAAT1", "UCRET1", "GUN2", "SAAT2", "UCRET2", "GUN3", "SAAT3", "UCRET3",
        "GUN4", "SAAT4", "UCRET4", "GUN5", "SAAT5", "UCRET5", "GUN6", "SAAT6", "UCRET6", "GUN7",
        "SAAT7", "UCRET7", "GUN8", "SAAT8", "UCRET8", "GUN9", "SAAT9", "UCRET9", "GUN10", "SAAT10",
        "UCRET10", "NCGUN", "NCSAAT", "NCUCRET", "NCODENEN", "FMSAAT", "FMUCRET", "FMODENEN", "FMKALAN",
        "DEVS", "DEVG", "DEVU", "DEVCEZAS", "DEVCEZAU", "ERS", "ERG", "ERU", "ERCEZAS", "ERCEZAU",
        "GECS", "GECG", "GECU", "GECCEZAS", "GECCEZAU", "EKS", "EKG", "EKU", "EKCEZAS", "EKCEZAU",
        "AYS", "AYU", "TOPEKS", "YOLU", "YEMEKU", "DEVIR", "EX1", "EX2", "EX3", "EX4", "EX5", "EX6",
        "EKKES", "EKKAZ", "NCMAAS", "NCKALAN", "SSKG", "BOLUM", "MESAIKESINTIS"
    ];

    internal static readonly string[] UiEditFields =
    [
        "DMAAS", "GUN1", "SAAT1", "UCRET1", "NCGUN", "NCSAAT", "NCUCRET",
        "SAAT2", "UCRET2", "SAAT3", "UCRET3", "GUN4", "SAAT4",
        "DEVG", "DEVS", "GECS", "EKS", "EKKAZ", "EKKES", "EX2",
        "NCMAAS", "NCKALAN", "FMSAAT", "FMUCRET", "FMODENEN", "FMKALAN"
    ];

    private sealed record ColumnInfo(string Name, int Type);

    internal static void EnsureSchema(FirebirdDatabase db)
    {
        lock (SchemaGate)
        {
            if (Prepared.Contains(db)) return;
        }
        if (!TableExists(db, "PDKS_BYPASS"))
            db.Execute("create table PDKS_BYPASS (CONNECTION_ID bigint not null)");
        else if (!FieldExists(db, "PDKS_BYPASS", "CONNECTION_ID"))
            db.Execute("alter table PDKS_BYPASS add CONNECTION_ID bigint");
        // Old REV22 global bypass rows must never survive an upgrade.
        db.Execute("delete from PDKS_BYPASS");

        if (!TableExists(db, "PDKS_BORDRO_OVERRIDE"))
            db.Execute(@"create table PDKS_BORDRO_OVERRIDE (
                PKNO varchar(5) not null,
                YIL integer not null,
                AY integer not null,
                FIELD_NAME varchar(31) not null,
                FIELD_VALUE varchar(120),
                IS_NULL smallint default 0,
                AKTIF smallint default 1,
                KAYIT_TARIHI timestamp,
                ACIKLAMA varchar(255)
            )");
        if (!IndexExists(db, "UX_PDKS_BORDRO_OVERRIDE"))
            db.Execute("create unique index UX_PDKS_BORDRO_OVERRIDE on PDKS_BORDRO_OVERRIDE(PKNO,YIL,AY,FIELD_NAME)");

        if (!TableExists(db, "PDKS_DONEM_KILIT"))
            db.Execute(@"create table PDKS_DONEM_KILIT (
                YIL integer not null,
                AY integer not null,
                KILITLI smallint default 0,
                KILIT_TARIH timestamp,
                KILITLEYEN varchar(50),
                NOTU varchar(255)
            )");
        if (!IndexExists(db, "UX_PDKS_DONEM_KILIT"))
            db.Execute("create unique index UX_PDKS_DONEM_KILIT on PDKS_DONEM_KILIT(YIL,AY)");

        if (!TableExists(db, "PDKS_PERSONEL_DONEM_KILIT"))
            db.Execute(@"create table PDKS_PERSONEL_DONEM_KILIT (
                PKNO varchar(5) not null,
                YIL integer not null,
                AY integer not null,
                KILITLI smallint default 0,
                KILIT_TARIH timestamp,
                KILITLEYEN varchar(50),
                NOTU varchar(255)
            )");
        if (!IndexExists(db, "UX_PDKS_PERSONEL_DONEM"))
            db.Execute("create unique index UX_PDKS_PERSONEL_DONEM on PDKS_PERSONEL_DONEM_KILIT(PKNO,YIL,AY)");

        if (!ExceptionExists(db, "PDKS_KILITLI_DONEM"))
            db.Execute("create exception PDKS_KILITLI_DONEM 'Kilitli doneme yazma engellendi'");

        DisableLegacyAugustTriggers(db);
        InstallProtectionTriggers(db);
        lock (SchemaGate) Prepared.Add(db);
    }

    private static bool TableExists(FirebirdDatabase db, string name) =>
        Convert.ToInt32(db.Scalar("select count(*) from rdb$relations where rdb$relation_name=@N", new FbParameter("@N", name)) ?? 0) > 0;

    private static bool IndexExists(FirebirdDatabase db, string name) =>
        Convert.ToInt32(db.Scalar("select count(*) from rdb$indices where rdb$index_name=@N", new FbParameter("@N", name)) ?? 0) > 0;

    private static bool FieldExists(FirebirdDatabase db, string table, string field) =>
        Convert.ToInt32(db.Scalar(@"select count(*) from rdb$relation_fields
            where rdb$relation_name=@T and rdb$field_name=@F",
            new FbParameter("@T", table), new FbParameter("@F", field)) ?? 0) > 0;

    private static bool ExceptionExists(FirebirdDatabase db, string name) =>
        Convert.ToInt32(db.Scalar("select count(*) from rdb$exceptions where rdb$exception_name=@N", new FbParameter("@N", name)) ?? 0) > 0;

    private static void DisableLegacyAugustTriggers(FirebirdDatabase db)
    {
        foreach (var name in new[] { "TRG_AGUSTOS_5KISI_KILIT", "KY_AUG26_U", "KY_AUG26_D", "KY_AUG26_I", "KY_AUG26_FIX", "KY_AUG26_P59" })
        {
            if (Convert.ToInt32(db.Scalar("select count(*) from rdb$triggers where rdb$trigger_name=@N", new FbParameter("@N", name)) ?? 0) > 0)
            {
                try { db.Execute("alter trigger " + name + " inactive"); } catch { }
            }
        }
    }

    private static List<ColumnInfo> Columns(FirebirdDatabase db, string table)
    {
        var t = db.Query(@"select trim(rf.rdb$field_name) FIELD_NAME, f.rdb$field_type FIELD_TYPE
            from rdb$relation_fields rf join rdb$fields f on f.rdb$field_name=rf.rdb$field_source
            where rf.rdb$relation_name=@T and f.rdb$computed_source is null order by rf.rdb$field_position", new FbParameter("@T", table));
        return t.AsEnumerable().Select(r => new ColumnInfo(Convert.ToString(r["FIELD_NAME"])!.Trim(), Convert.ToInt32(r["FIELD_TYPE"]))).ToList();
    }

    private static string CastFromText(ColumnInfo c)
    {
        return c.Type switch
        {
            7 => "cast(:V as smallint)",
            8 => "cast(:V as integer)",
            10 => "cast(:V as float)",
            16 => "cast(:V as numeric(18,4))",
            27 => "cast(:V as double precision)",
            _ => ":V"
        };
    }

    private static void InstallProtectionTriggers(FirebirdDatabase db)
    {
        var uCols = Columns(db, "UCRETLER");
        var pCols = Columns(db, "PUANTAJ");

        string lockOldU = @"(
            exists(select 1 from PDKS_DONEM_KILIT d where d.YIL=extract(year from OLD.BASTAR) and d.AY=extract(month from OLD.BASTAR) and d.KILITLI=1)
            or exists(select 1 from PDKS_PERSONEL_DONEM_KILIT p where p.PKNO=OLD.PKNO and p.YIL=extract(year from OLD.BASTAR) and p.AY=extract(month from OLD.BASTAR) and p.KILITLI=1)
        )";
        string lockNewU = @"(
            exists(select 1 from PDKS_DONEM_KILIT d where d.YIL=extract(year from NEW.BASTAR) and d.AY=extract(month from NEW.BASTAR) and d.KILITLI=1)
            or exists(select 1 from PDKS_PERSONEL_DONEM_KILIT p where p.PKNO=NEW.PKNO and p.YIL=extract(year from NEW.BASTAR) and p.AY=extract(month from NEW.BASTAR) and p.KILITLI=1)
        )";
        var freezeU = string.Join(Environment.NewLine, uCols.Select(c => "NEW." + c.Name + " = OLD." + c.Name + ";"));
        var byName = uCols.ToDictionary(c => c.Name, StringComparer.OrdinalIgnoreCase);
        var overrideBody = new StringBuilder();
        foreach (var field in EditableFields.Where(byName.ContainsKey))
        {
            var c = byName[field];
            overrideBody.AppendLine("N=0; V=NULL; Z=0;");
            overrideBody.AppendLine($"select count(*), max(FIELD_VALUE), max(IS_NULL) from PDKS_BORDRO_OVERRIDE where PKNO=:P and YIL=:Y and AY=:A and FIELD_NAME='{field}' and AKTIF=1 into :N,:V,:Z;");
            overrideBody.AppendLine("if (N>0) then begin");
            overrideBody.AppendLine($"  if (Z=1) then NEW.{field}=NULL; else NEW.{field}={CastFromText(c)};");
            overrideBody.AppendLine("end");
        }

        var updateU = $@"create or alter trigger PDKS_UCRET_LOCK_U for UCRETLER active before update position 0 as
declare variable Y integer;
declare variable A integer;
declare variable P varchar(5);
declare variable N integer;
declare variable Z smallint;
declare variable V varchar(120);
begin
  if (not exists(select 1 from PDKS_BYPASS b where b.CONNECTION_ID=CURRENT_CONNECTION)) then
  begin
    if {lockOldU} then
    begin
      {freezeU}
    end
    else
    begin
      Y=extract(year from OLD.BASTAR); A=extract(month from OLD.BASTAR); P=OLD.PKNO;
      {overrideBody}
    end
  end
end";
        db.Execute(updateU);

        var insertU = $@"create or alter trigger PDKS_UCRET_LOCK_I for UCRETLER active before insert position 0 as
declare variable Y integer;
declare variable A integer;
declare variable P varchar(5);
declare variable N integer;
declare variable Z smallint;
declare variable V varchar(120);
begin
  if (not exists(select 1 from PDKS_BYPASS b where b.CONNECTION_ID=CURRENT_CONNECTION)) then
  begin
    if {lockNewU} then exception PDKS_KILITLI_DONEM;
    Y=extract(year from NEW.BASTAR); A=extract(month from NEW.BASTAR); P=NEW.PKNO;
    {overrideBody}
  end
end";
        db.Execute(insertU);

        db.Execute($@"create or alter trigger PDKS_UCRET_LOCK_D for UCRETLER active before delete position 0 as
begin
  if (not exists(select 1 from PDKS_BYPASS b where b.CONNECTION_ID=CURRENT_CONNECTION) and {lockOldU}) then
    exception PDKS_KILITLI_DONEM;
end");

        string periodOldP = "exists(select 1 from PDKS_DONEM_KILIT d where d.YIL=extract(year from OLD.TARIH) and d.AY=extract(month from OLD.TARIH) and d.KILITLI=1)";
        string personOldP = "exists(select 1 from PDKS_PERSONEL_DONEM_KILIT p where p.PKNO=OLD.PKNO and p.YIL=extract(year from OLD.TARIH) and p.AY=extract(month from OLD.TARIH) and p.KILITLI=1)";
        string periodNewP = "exists(select 1 from PDKS_DONEM_KILIT d where d.YIL=extract(year from NEW.TARIH) and d.AY=extract(month from NEW.TARIH) and d.KILITLI=1)";
        var freezeP = string.Join(Environment.NewLine, pCols.Select(c => "NEW." + c.Name + " = OLD." + c.Name + ";"));

        db.Execute($@"create or alter trigger PDKS_PUANTAJ_LOCK_U for PUANTAJ active before update position 0 as
begin
  if (not exists(select 1 from PDKS_BYPASS b where b.CONNECTION_ID=CURRENT_CONNECTION) and ({periodOldP} or {personOldP})) then
  begin
    {freezeP}
  end
end");

        // Global month lock is hard protection for inserts/deletes. Person lock intentionally does not raise here,
        // so Hedef can continue calculating other personnel in the same batch; UCRETLER stays protected by the person lock.
        db.Execute($@"create or alter trigger PDKS_PUANTAJ_LOCK_I for PUANTAJ active before insert position 0 as
begin
  if (not exists(select 1 from PDKS_BYPASS b where b.CONNECTION_ID=CURRENT_CONNECTION) and {periodNewP}) then
    exception PDKS_KILITLI_DONEM;
end");
        db.Execute($@"create or alter trigger PDKS_PUANTAJ_LOCK_D for PUANTAJ active before delete position 0 as
begin
  if (not exists(select 1 from PDKS_BYPASS b where b.CONNECTION_ID=CURRENT_CONNECTION) and {periodOldP}) then
    exception PDKS_KILITLI_DONEM;
end");
    }

    internal static bool IsPeriodLocked(FirebirdDatabase db, int year, int month) =>
        Convert.ToInt32(db.Scalar("select count(*) from PDKS_DONEM_KILIT where YIL=@Y and AY=@A and KILITLI=1",
            new FbParameter("@Y", year), new FbParameter("@A", month)) ?? 0) > 0;

    internal static bool IsPersonLocked(FirebirdDatabase db, string card, int year, int month) =>
        Convert.ToInt32(db.Scalar("select count(*) from PDKS_PERSONEL_DONEM_KILIT where PKNO=@P and YIL=@Y and AY=@A and KILITLI=1",
            new FbParameter("@P", card), new FbParameter("@Y", year), new FbParameter("@A", month)) ?? 0) > 0;

    internal static void SetPeriodLock(FirebirdDatabase db, int year, int month, bool locked, string? note = null)
    {
        EnsureSchema(db);
        FbParameter[] P() => [
            new FbParameter("@Y", year), new FbParameter("@A", month), new FbParameter("@K", locked ? 1 : 0),
            new FbParameter("@U", Environment.UserName), new FbParameter("@N", note ?? "")
        ];
        var updated = db.Execute(@"update PDKS_DONEM_KILIT set KILITLI=@K,KILIT_TARIH=current_timestamp,KILITLEYEN=@U,NOTU=@N where YIL=@Y and AY=@A", P());
        if (updated == 0)
            db.Execute(@"insert into PDKS_DONEM_KILIT(YIL,AY,KILITLI,KILIT_TARIH,KILITLEYEN,NOTU) values(@Y,@A,@K,current_timestamp,@U,@N)", P());
    }

    internal static void SetPersonLock(FirebirdDatabase db, string card, int year, int month, bool locked, string? note = null)
    {
        EnsureSchema(db);
        FbParameter[] P() => [
            new FbParameter("@P", card), new FbParameter("@Y", year), new FbParameter("@A", month), new FbParameter("@K", locked ? 1 : 0),
            new FbParameter("@U", Environment.UserName), new FbParameter("@N", note ?? "")
        ];
        var updated = db.Execute(@"update PDKS_PERSONEL_DONEM_KILIT set KILITLI=@K,KILIT_TARIH=current_timestamp,KILITLEYEN=@U,NOTU=@N where PKNO=@P and YIL=@Y and AY=@A", P());
        if (updated == 0)
            db.Execute(@"insert into PDKS_PERSONEL_DONEM_KILIT(PKNO,YIL,AY,KILITLI,KILIT_TARIH,KILITLEYEN,NOTU) values(@P,@Y,@A,@K,current_timestamp,@U,@N)", P());
    }

    internal static DataTable GetMonthRows(FirebirdDatabase db, int year, int month, string? card = null)
    {
        EnsureSchema(db);
        var start = new DateTime(year, month, 1);
        var end = start.AddMonths(1);
        var last = end.AddDays(-1);

        var rawSql = @"select u.PKNO,u.BASTAR,u.BITTAR,k.IGTARIH,k.AD,k.SOYAD,u.DMAAS,
            u.NCGUN,u.NCSAAT,u.NCUCRET,u.SAAT2,u.UCRET2,u.SAAT3,u.UCRET3,u.GUN4,u.SAAT4,
            u.DEVG,u.DEVS,u.GECS,u.EKS,u.EKKAZ,u.EKKES,u.EX2,u.NCMAAS,u.NCKALAN,u.FMSAAT,u.FMUCRET,u.FMODENEN,u.FMKALAN
            from UCRETLER u inner join KIMLIK k on k.PKNO=u.PKNO
            where u.BASTAR=@A and u.BITTAR=@E
              and k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A)" +
            (string.IsNullOrWhiteSpace(card) ? "" : " and u.PKNO=@P") + " order by u.PKNO";
        var raw = string.IsNullOrWhiteSpace(card)
            ? db.Query(rawSql, new FbParameter("@A", start), new FbParameter("@B", end), new FbParameter("@E", last))
            : db.Query(rawSql, new FbParameter("@A", start), new FbParameter("@B", end), new FbParameter("@E", last), new FbParameter("@P", card));

        var periodLocked = IsPeriodLocked(db, year, month);
        var personLocks = db.Query("select PKNO from PDKS_PERSONEL_DONEM_KILIT where YIL=@Y and AY=@M and KILITLI=1",
            new FbParameter("@Y", year), new FbParameter("@M", month)).AsEnumerable()
            .Select(r => Convert.ToString(r["PKNO"]) ?? "").ToHashSet(StringComparer.OrdinalIgnoreCase);
        var overrides = db.Query("select distinct PKNO from PDKS_BORDRO_OVERRIDE where YIL=@Y and AY=@M and AKTIF=1",
            new FbParameter("@Y", year), new FbParameter("@M", month)).AsEnumerable()
            .Select(r => Convert.ToString(r["PKNO"]) ?? "").ToHashSet(StringComparer.OrdinalIgnoreCase);
        var overlaps = db.Query(@"select PKNO from UCRETLER where BASTAR<@B and BITTAR>=@A group by PKNO having count(*)>1",
            new FbParameter("@A", start), new FbParameter("@B", end)).AsEnumerable()
            .Select(r => Convert.ToString(r["PKNO"]) ?? "").ToHashSet(StringComparer.OrdinalIgnoreCase);
        var advances = db.Query(@"select PKNO,coalesce(sum(MIKTAR),0) TOPLAM from AVANS where TARIH>=@A and TARIH<@B group by PKNO",
            new FbParameter("@A", start), new FbParameter("@B", end)).AsEnumerable()
            .ToDictionary(r => Convert.ToString(r["PKNO"]) ?? "", r => Convert.ToString(r["TOPLAM"], CultureInfo.CurrentCulture) ?? "0", StringComparer.OrdinalIgnoreCase);

        var t = new DataTable();
        foreach (var name in new[]
        {
            "PKNO","BASTAR","BITTAR","S.No","Kart No","İ.G.T","Adı Soyadı","Maaşı",
            "N.Çalışma Gün","N.Çalışma Saat","H.İ.M","H.S.M","Ü.Siz İzin","Dev.","Geç","Eksik",
            "Avans","Banka","Maaş","Mesai","Net","Kilit","Uyarı"
        }) t.Columns.Add(name);

        int no = 0;
        foreach (DataRow row in raw.Rows)
        {
            no++;
            var personCard = Convert.ToString(row["PKNO"]) ?? "";
            string V(string name) => row.Table.Columns.Contains(name) && row[name] != DBNull.Value ? Convert.ToString(row[name], CultureInfo.CurrentCulture)?.Trim() ?? "" : "";
            string Join(params string[] values) => string.Join(" / ", values.Where(x => !string.IsNullOrWhiteSpace(x) && x != "0" && x != "00:00"));
            var lockText = periodLocked ? "AY KİLİTLİ" : personLocks.Contains(personCard) ? "PERSONEL KİLİTLİ" : overrides.Contains(personCard) ? "DÜZENLENMİŞ" : "";
            t.Rows.Add(
                personCard, row["BASTAR"], row["BITTAR"], no, personCard,
                row["IGTARIH"] == DBNull.Value ? "" : Convert.ToDateTime(row["IGTARIH"]).ToString("dd.MM.yyyy"),
                (V("AD") + " " + V("SOYAD")).Trim(), V("DMAAS"),
                V("NCGUN"), V("NCSAAT"), V("SAAT2"), V("SAAT3"), Join(V("GUN4"), V("SAAT4")),
                Join(V("DEVG"), V("DEVS")), V("GECS"), V("EKS"), advances.TryGetValue(personCard, out var avans) ? avans : "0",
                V("EX2"), V("NCMAAS"), Join(V("FMSAAT"), V("FMUCRET")), V("NCKALAN"),
                lockText, overlaps.Contains(personCard) ? "Çakışan dönem kaydı var" : "");
        }
        return t;
    }

    internal static DataTable GetOverlaps(FirebirdDatabase db, string card, int year, int month)
    {
        var start = new DateTime(year, month, 1);
        var end = start.AddMonths(1);
        return db.Query("select * from UCRETLER where PKNO=@P and BASTAR<@B and BITTAR>=@A order by BASTAR,BITTAR",
            new FbParameter("@P", card), new FbParameter("@A", start), new FbParameter("@B", end));
    }

    internal static PayrollPeriodStatus Status(FirebirdDatabase db, string card, int year, int month)
    {
        EnsureSchema(db);
        var period = IsPeriodLocked(db, year, month);
        var person = IsPersonLocked(db, card, year, month);
        var manual = Convert.ToInt32(db.Scalar("select count(*) from PDKS_BORDRO_OVERRIDE where PKNO=@P and YIL=@Y and AY=@A and AKTIF=1",
            new FbParameter("@P", card), new FbParameter("@Y", year), new FbParameter("@A", month)) ?? 0) > 0;
        var overlap = GetOverlaps(db, card, year, month).Rows.Count > 1;
        var text = period ? "AY KİLİTLİ" : person ? "PERSONEL KİLİTLİ" : manual ? "DÜZENLENMİŞ" : "";
        return new(period, person, manual, overlap, text);
    }

    internal static DataRow? PreferredRow(FirebirdDatabase db, string card, int year, int month)
    {
        var rows = GetOverlaps(db, card, year, month);
        if (rows.Rows.Count == 0) return null;
        var start = new DateTime(year, month, 1);
        var last = start.AddMonths(1).AddDays(-1);
        var exact = rows.AsEnumerable().FirstOrDefault(r =>
            r["BASTAR"] != DBNull.Value && r["BITTAR"] != DBNull.Value &&
            Convert.ToDateTime(r["BASTAR"]).Date == start && Convert.ToDateTime(r["BITTAR"]).Date == last);
        return exact ?? rows.AsEnumerable().OrderBy(r => Convert.ToDateTime(r["BASTAR"])).ThenBy(r => Convert.ToDateTime(r["BITTAR"])).First();
    }

    internal static Dictionary<string, string> RowValues(DataRow row)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in EditableFields)
            if (row.Table.Columns.Contains(field))
                result[field] = row[field] == DBNull.Value ? "" : Convert.ToString(row[field], CultureInfo.CurrentCulture) ?? "";
        return result;
    }

    private static bool IsTextField(string field) =>
        field.StartsWith("SAAT", StringComparison.OrdinalIgnoreCase) ||
        field is "DEVS" or "DEVCEZAS" or "ERS" or "ERCEZAS" or "GECS" or "GECCEZAS" or "EKS" or "EKCEZAS" or "AYS" or "NCSAAT" or "FMSAAT" or "TOPEKS" or "MESAIKESINTIS";

    private static string Canonical(string field, object? value)
    {
        if (value is null || value == DBNull.Value) return "";
        if (IsTextField(field)) return Convert.ToString(value)?.Trim() ?? "";
        if (field is "SSKG" or "BOLUM")
            return Convert.ToInt32(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        return Convert.ToDouble(value, CultureInfo.CurrentCulture).ToString("R", CultureInfo.InvariantCulture);
    }

    private static object TypedValue(string field, string text)
    {
        text = text.Trim();
        if (IsTextField(field)) return string.IsNullOrWhiteSpace(text) ? DBNull.Value : text;
        if (field is "SSKG" or "BOLUM")
        {
            if (string.IsNullOrWhiteSpace(text)) return 0;
            return int.Parse(text, NumberStyles.Any, CultureInfo.CurrentCulture);
        }
        if (string.IsNullOrWhiteSpace(text)) return 0d;
        if (double.TryParse(text, NumberStyles.Any, CultureInfo.CurrentCulture, out var d) ||
            double.TryParse(text.Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out d)) return d;
        throw new InvalidOperationException(field + " sayısal değer olmalı.");
    }

    private static string OverrideText(string field, string text)
    {
        var v = TypedValue(field, text);
        if (v == DBNull.Value) return "";
        return IsTextField(field) ? Convert.ToString(v)!.Trim() : Convert.ToDouble(v, CultureInfo.InvariantCulture).ToString("R", CultureInfo.InvariantCulture);
    }

    private static string DurationFromMinutes(int total) => $"{total / 60:00}:{total % 60:00}";

    internal static string[] SaveOverrides(FirebirdDatabase db, string card, int year, int month, IDictionary<string, string> requested, bool autoHours, string note)
    {
        EnsureSchema(db);
        var row = PreferredRow(db, card, year, month) ?? throw new InvalidOperationException("Seçili ay için UCRETLER kaydı bulunamadı.");
        var values = new Dictionary<string, string>(requested, StringComparer.OrdinalIgnoreCase);

        if (autoHours && values.TryGetValue("GUN1", out var dayText))
        {
            var oldDay = row.Table.Columns.Contains("GUN1") ? Canonical("GUN1", row["GUN1"]) : "";
            var newDay = Canonical("GUN1", TypedValue("GUN1", dayText));
            if (!string.Equals(oldDay, newDay, StringComparison.Ordinal))
            {
                var days = Convert.ToDouble(TypedValue("GUN1", dayText), CultureInfo.InvariantCulture);
                int daily = 450;
                try { daily = WorkTimePolicy.Read(db, CancellationToken.None).DailyWork; } catch { }
                var auto = DurationFromMinutes((int)Math.Round(days * daily, MidpointRounding.AwayFromZero));
                if (!values.TryGetValue("SAAT1", out var userHour) || Canonical("SAAT1", userHour) == Canonical("SAAT1", row["SAAT1"])) values["SAAT1"] = auto;
                if (row.Table.Columns.Contains("NCGUN") && (!values.TryGetValue("NCGUN", out var ng) || Canonical("NCGUN", TypedValue("NCGUN", ng)) == Canonical("NCGUN", row["NCGUN"]))) values["NCGUN"] = dayText;
                if (row.Table.Columns.Contains("NCSAAT") && (!values.TryGetValue("NCSAAT", out var ns) || Canonical("NCSAAT", ns) == Canonical("NCSAAT", row["NCSAAT"]))) values["NCSAAT"] = auto;
            }
        }

        var changed = new List<string>();
        foreach (var field in EditableFields)
        {
            if (!values.TryGetValue(field, out var text) || !row.Table.Columns.Contains(field)) continue;
            var oldCanonical = Canonical(field, row[field]);
            var newCanonical = IsTextField(field) ? text.Trim() : Canonical(field, TypedValue(field, text));
            if (!string.Equals(oldCanonical, newCanonical, StringComparison.Ordinal)) changed.Add(field);
        }
        if (changed.Count == 0) return [];

        var start = Convert.ToDateTime(row["BASTAR"]);
        var finish = Convert.ToDateTime(row["BITTAR"]);
        db.InTransaction((connection, tx) =>
        {
            using (var bypass = FirebirdDatabase.CreateCommand(connection, tx, "insert into PDKS_BYPASS(CONNECTION_ID) values(CURRENT_CONNECTION)"))
                bypass.ExecuteNonQuery();

            var sets = new List<string>();
            var parameters = new List<FbParameter>();
            var i = 0;
            foreach (var field in changed)
            {
                var name = "@V" + i++;
                sets.Add(field + "=" + name);
                parameters.Add(new FbParameter(name, TypedValue(field, values[field])));
            }
            parameters.Add(new FbParameter("@P", card));
            parameters.Add(new FbParameter("@S", start));
            parameters.Add(new FbParameter("@E", finish));
            using (var update = FirebirdDatabase.CreateCommand(connection, tx,
                "update UCRETLER set " + string.Join(",", sets) + " where PKNO=@P and BASTAR=@S and BITTAR=@E", parameters.ToArray()))
            {
                if (update.ExecuteNonQuery() != 1) throw new InvalidOperationException("Bordro satırı tekil değil; güvenli güncelleme yapılmadı.");
            }

            foreach (var field in changed)
            {
                var raw = values[field].Trim();
                var value = string.IsNullOrWhiteSpace(raw) && IsTextField(field) ? (object)DBNull.Value : OverrideText(field, raw);
                var isNull = string.IsNullOrWhiteSpace(raw) && IsTextField(field) ? 1 : 0;
                FbParameter[] P() => [
                    new FbParameter("@P", card), new FbParameter("@Y", year), new FbParameter("@A", month), new FbParameter("@F", field),
                    new FbParameter("@V", value), new FbParameter("@Z", isNull), new FbParameter("@N", note ?? "")
                ];
                using var updateOverride = FirebirdDatabase.CreateCommand(connection, tx, @"update PDKS_BORDRO_OVERRIDE set FIELD_VALUE=@V,IS_NULL=@Z,AKTIF=1,KAYIT_TARIHI=current_timestamp,ACIKLAMA=@N where PKNO=@P and YIL=@Y and AY=@A and FIELD_NAME=@F", P());
                if (updateOverride.ExecuteNonQuery() == 0)
                {
                    using var insertOverride = FirebirdDatabase.CreateCommand(connection, tx, @"insert into PDKS_BORDRO_OVERRIDE(PKNO,YIL,AY,FIELD_NAME,FIELD_VALUE,IS_NULL,AKTIF,KAYIT_TARIHI,ACIKLAMA) values(@P,@Y,@A,@F,@V,@Z,1,current_timestamp,@N)", P());
                    insertOverride.ExecuteNonQuery();
                }
            }
            using (var clearBypass = FirebirdDatabase.CreateCommand(connection, tx, "delete from PDKS_BYPASS where CONNECTION_ID=CURRENT_CONNECTION")) clearBypass.ExecuteNonQuery();
            return 0;
        });
        return changed.ToArray();
    }

    internal static void ClearOverrides(FirebirdDatabase db, string card, int year, int month)
    {
        EnsureSchema(db);
        db.Execute("update PDKS_BORDRO_OVERRIDE set AKTIF=0,KAYIT_TARIHI=current_timestamp where PKNO=@P and YIL=@Y and AY=@A",
            new FbParameter("@P", card), new FbParameter("@Y", year), new FbParameter("@A", month));
    }

    internal static int CleanSafeOverlap(FirebirdDatabase db, string card, int year, int month)
    {
        EnsureSchema(db);
        var rows = GetOverlaps(db, card, year, month);
        var start = new DateTime(year, month, 1);
        var last = start.AddMonths(1).AddDays(-1);
        var exact = rows.AsEnumerable().Where(r => Convert.ToDateTime(r["BASTAR"]).Date == start && Convert.ToDateTime(r["BITTAR"]).Date == last).ToArray();
        if (exact.Length != 1) throw new InvalidOperationException("Doğru aylık satır tekil değil; otomatik temizlik yapılmadı.");
        var bad = rows.AsEnumerable().Where(r => Convert.ToDateTime(r["BASTAR"]).Date == start && Convert.ToDateTime(r["BITTAR"]).Date > last).ToArray();
        if (bad.Length == 0) return 0;

        return db.InTransaction((connection, tx) =>
        {
            using (var bypass = FirebirdDatabase.CreateCommand(connection, tx, "insert into PDKS_BYPASS(CONNECTION_ID) values(CURRENT_CONNECTION)")) bypass.ExecuteNonQuery();
            var count = 0;
            foreach (var row in bad)
            {
                using var cmd = FirebirdDatabase.CreateCommand(connection, tx,
                    "delete from UCRETLER where PKNO=@P and BASTAR=@S and BITTAR=@E",
                    new FbParameter("@P", card), new FbParameter("@S", Convert.ToDateTime(row["BASTAR"])), new FbParameter("@E", Convert.ToDateTime(row["BITTAR"])));
                count += cmd.ExecuteNonQuery();
            }
            using (var clearBypass = FirebirdDatabase.CreateCommand(connection, tx, "delete from PDKS_BYPASS where CONNECTION_ID=CURRENT_CONNECTION")) clearBypass.ExecuteNonQuery();
            return count;
        });
    }

    internal static DataTable PersonSummary(FirebirdDatabase db, string card, int year, int month)
    {
        EnsureSchema(db);
        var row = PreferredRow(db, card, year, month);
        var t = new DataTable();
        foreach (var c in new[] { "Durum", "Normal Gün", "Normal Saat", "Normal Ücret", "%50 Mesai", "%100 Mesai", "Ücretsiz İzin", "Devamsızlık", "Ek Kazanç", "Kesinti", "Avans", "Banka / Ödenen", "Maaş", "Maaş Kalan", "Mesai Kalan", "Uyarı" }) t.Columns.Add(c);
        if (row is null) return t;
        string V(string name) => row.Table.Columns.Contains(name) && row[name] != DBNull.Value ? Convert.ToString(row[name], CultureInfo.CurrentCulture) ?? "" : "";
        var start = new DateTime(year, month, 1);
        var end = start.AddMonths(1);
        var advance = db.Scalar("select coalesce(sum(MIKTAR),0) from AVANS where PKNO=@P and TARIH>=@A and TARIH<@B", new FbParameter("@P", card), new FbParameter("@A", start), new FbParameter("@B", end));
        var paid = db.Scalar("select coalesce(sum(NODENEN),0) from ODEME where PKNO=@P and BASTAR>=@A and BASTAR<@B", new FbParameter("@P", card), new FbParameter("@A", start), new FbParameter("@B", end));
        var s = Status(db, card, year, month);
        t.Rows.Add(s.Text, V("GUN1"), V("SAAT1"), V("UCRET1"),
            string.Join(" / ", new[] { V("SAAT2"), V("UCRET2") }.Where(x => x.Length > 0)),
            string.Join(" / ", new[] { V("SAAT3"), V("UCRET3") }.Where(x => x.Length > 0)),
            string.Join(" / ", new[] { V("GUN4"), V("SAAT4") }.Where(x => x.Length > 0)),
            string.Join(" / ", new[] { V("DEVG"), V("DEVS") }.Where(x => x.Length > 0)),
            V("EKKAZ"), V("EKKES"), Convert.ToString(advance, CultureInfo.CurrentCulture), Convert.ToString(paid, CultureInfo.CurrentCulture),
            V("DMAAS"), V("NCKALAN"), V("FMKALAN"), s.HasOverlap ? "Çakışan dönem kaydı bulundu" : "");
        return t;
    }
}