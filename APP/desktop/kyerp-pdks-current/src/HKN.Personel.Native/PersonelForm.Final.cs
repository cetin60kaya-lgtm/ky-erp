using FirebirdSql.Data.FirebirdClient;
using System.Data;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    void SyncPeriodsToPerson()
    {
        if (string.IsNullOrWhiteSpace(currentPk)) return;
        try
        {
            var q = Q("select GRUP from KIMLIK where PKNO=@PK", new FbParameter("@PK", currentPk));
            if (q.Rows.Count == 0 || q.Rows[0][0] == DBNull.Value) return;
            int group = Convert.ToInt32(q.Rows[0][0]);

            var g = SelectPeriodForGroup(periodG, group);
            var i = SelectPeriodForGroup(periodI, group);
            var e = SelectPeriodForGroup(periodE, group);
            SelectPeriodForGroup(periodB, group);
            SelectPeriodForGroup(periodO, group);

            SetDateRange(g, gFrom, gTo);
            SetDateRange(i, iFrom, iTo);
            SetDateRange(e, eFrom, eTo);
        }
        catch { }
    }

    DataRow? SelectPeriodForGroup(ComboBox c, int group)
    {
        if (c.DataSource is not DataTable dt || dt.Rows.Count == 0) return null;
        DateTime today = DateTime.Today;
        var rows = dt.AsEnumerable()
            .Where(r => r["GRUP"] != DBNull.Value && Convert.ToInt32(r["GRUP"]) == group)
            .ToList();

        var row = rows.FirstOrDefault(r =>
                r["BASTAR"] != DBNull.Value && r["BITTAR"] != DBNull.Value &&
                ((DateTime)r["BASTAR"]).Date <= today && ((DateTime)r["BITTAR"]).Date >= today)
            ?? rows.OrderByDescending(r => r["BASTAR"] == DBNull.Value ? DateTime.MinValue : (DateTime)r["BASTAR"]).FirstOrDefault();

        if (row is null) return null;
        c.SelectedValue = row["KOD"];
        return row;
    }

    static void SetDateRange(DataRow? row, DateTimePicker from, DateTimePicker to)
    {
        if (row is null) return;
        if (row["BASTAR"] != DBNull.Value) from.Value = ((DateTime)row["BASTAR"]).Date;
        if (row["BITTAR"] != DBNull.Value) to.Value = ((DateTime)row["BITTAR"]).Date;
    }

    void OrderGirisColumns()
    {
        string[] order = { "GIRIS_TARIHI", "GIRIS_SAATI", "GTUR", "CIKIS_TARIHI", "CIKIS_SAATI", "CTUR" };
        for (int i = 0; i < order.Length; i++)
            if (gGiris.Columns.Contains(order[i])) gGiris.Columns[order[i]].DisplayIndex = i;
    }
}
