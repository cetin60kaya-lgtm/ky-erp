using System.Data;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal static class PdksPeriodService
{
    static readonly CultureInfo Tr = new("tr-TR");

    public static int EnsureYear(FirebirdDatabase db,int year)
    {
        if(year<1900||year>9998)throw new ArgumentOutOfRangeException(nameof(year));

        PdksCoreWorkGroups.Normalize(db);
        var groups=PdksCoreWorkGroups.CanonicalTable(db);
        if(groups.Rows.Count!=2)
            throw new InvalidOperationException("Dönem hazırlamak için MESAİLİ GRUP ve İDARİ GRUP tanımları bulunmalıdır.");

        var inserted=0;
        for(var month=1;month<=12;month++)
        {
            var a=new DateTime(year,month,1);
            var b=a.AddMonths(1);
            foreach(DataRow group in groups.Rows)
            {
                var groupCode=Convert.ToInt32(group["KOD"]);
                var existing=Convert.ToInt32(db.Scalar(
                    "select count(*) from DONEM where GRUP=@G and BASTAR<@B and coalesce(BITTAR,BASTAR)>=@A",
                    new FbParameter("@G",groupCode),
                    new FbParameter("@A",a),
                    new FbParameter("@B",b))??0);
                if(existing>0)continue;

                var defaults=db.Query(
                    "select first 1 ACESAAT,SSKACE,ACFSAAT,SSKACF,EBALAN,CBALAN from DONEM where GRUP=@G and BASTAR<@A order by BASTAR desc,KOD desc",
                    new FbParameter("@G",groupCode),
                    new FbParameter("@A",a));
                if(defaults.Rows.Count==0)
                    defaults=db.Query(
                        "select first 1 ACESAAT,SSKACE,ACFSAAT,SSKACF,EBALAN,CBALAN from DONEM where GRUP=@G order by BASTAR desc,KOD desc",
                        new FbParameter("@G",groupCode));

                object Value(string column,object fallback)
                    => defaults.Rows.Count>0&&defaults.Rows[0][column]!=DBNull.Value?defaults.Rows[0][column]:fallback;

                var code=Convert.ToInt32(db.Scalar("select coalesce(max(KOD),0)+1 from DONEM")??1);
                var rawName=Convert.ToString(group["AD"])?.Trim()??"";
                var displayName=rawName.EndsWith(" GRUP",StringComparison.OrdinalIgnoreCase)
                    ?rawName[..^5].Trim()
                    :rawName;
                var periodName=$"{year} {a.ToString("MMMM",Tr).ToUpper(Tr)} - {displayName}";

                db.Execute(
                    "insert into DONEM (KOD,AD,BASTAR,BITTAR,ACESAAT,SSKACE,ACFSAAT,SSKACF,EBALAN,CBALAN,GRUP) values (@K,@AD,@A,@B,@ACE,@SSKACE,@ACF,@SSKACF,@EBA,@CBA,@G)",
                    new FbParameter("@K",code),
                    new FbParameter("@AD",periodName),
                    new FbParameter("@A",a),
                    new FbParameter("@B",b.AddDays(-1)),
                    new FbParameter("@ACE",Value("ACESAAT",0)),
                    new FbParameter("@SSKACE",Value("SSKACE",0)),
                    new FbParameter("@ACF",Value("ACFSAAT",0)),
                    new FbParameter("@SSKACF",Value("SSKACF",0)),
                    new FbParameter("@EBA",Value("EBALAN",DBNull.Value)),
                    new FbParameter("@CBA",Value("CBALAN",DBNull.Value)),
                    new FbParameter("@G",groupCode));
                inserted++;
            }
        }
        return inserted;
    }

    public static DataTable BuildYearOverview(FirebirdDatabase db,int year)
    {
        PdksCoreWorkGroups.Normalize(db);
        var groups=PdksCoreWorkGroups.CanonicalTable(db);
        if(groups.Rows.Count!=2)
            throw new InvalidOperationException("MESAİLİ GRUP ve İDARİ GRUP tanımları bulunamadı.");

        var mesailiCode=Convert.ToInt32(groups.Rows[0]["KOD"]);
        var idariCode=Convert.ToInt32(groups.Rows[1]["KOD"]);
        var a=new DateTime(year,1,1);
        var b=a.AddYears(1);
        var periods=db.Query(
            "select KOD,AD,BASTAR,BITTAR,GRUP from DONEM where BASTAR<@B and coalesce(BITTAR,BASTAR)>=@A order by BASTAR,GRUP,KOD",
            new FbParameter("@A",a),
            new FbParameter("@B",b));

        var result=new DataTable();
        result.Columns.Add("AYNO",typeof(int));
        result.Columns.Add("AY",typeof(string));
        result.Columns.Add("BASTAR",typeof(DateTime));
        result.Columns.Add("BITTAR",typeof(DateTime));
        result.Columns.Add("MESAILI",typeof(string));
        result.Columns.Add("IDARI",typeof(string));
        result.Columns.Add("DURUM",typeof(string));
        result.Columns.Add("KAYIT",typeof(int));

        for(var month=1;month<=12;month++)
        {
            var start=new DateTime(year,month,1);
            var end=start.AddMonths(1);
            var rows=periods.AsEnumerable().Where(r=>
            {
                var rs=Convert.ToDateTime(r["BASTAR"]).Date;
                var re=r["BITTAR"]==DBNull.Value?rs:Convert.ToDateTime(r["BITTAR"]).Date;
                return rs<end&&re>=start;
            }).ToArray();

            var mesaili=rows.Count(r=>r["GRUP"]!=DBNull.Value&&Convert.ToInt32(r["GRUP"])==mesailiCode);
            var idari=rows.Count(r=>r["GRUP"]!=DBNull.Value&&Convert.ToInt32(r["GRUP"])==idariCode);
            var mState=State(mesaili);
            var iState=State(idari);
            var overall=mesaili==1&&idari==1?"Hazır":"Kontrol";
            result.Rows.Add(month,start.ToString("MMMM",Tr).ToUpper(Tr),start,end.AddDays(-1),mState,iState,overall,rows.Length);
        }

        return result;
    }

    public static int CountYearRows(FirebirdDatabase db,int year)
    {
        var a=new DateTime(year,1,1);
        var b=a.AddYears(1);
        return Convert.ToInt32(db.Scalar(
            "select count(*) from DONEM where BASTAR>=@A and BASTAR<@B",
            new FbParameter("@A",a),
            new FbParameter("@B",b))??0);
    }

    static string State(int count)=>count switch
    {
        0=>"Eksik",
        1=>"Hazır",
        _=>$"Kontrol ({count})"
    };
}
