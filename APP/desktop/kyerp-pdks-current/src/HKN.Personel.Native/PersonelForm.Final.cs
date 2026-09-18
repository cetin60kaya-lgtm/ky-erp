using FirebirdSql.Data.FirebirdClient;
using System.Data;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    void SyncPeriodsToPerson()
    {
        if(string.IsNullOrWhiteSpace(currentPk)) return;
        try
        {
            var q=Q("select GRUP from KIMLIK where PKNO=@PK",new FbParameter("@PK",currentPk));
            if(q.Rows.Count==0 || q.Rows[0][0]==DBNull.Value) return;
            int group=Convert.ToInt32(q.Rows[0][0]);
            foreach(var c in new[]{periodG,periodI,periodE,periodB,periodO}) SelectPeriodForGroup(c,group);
            SetDateRange(periodG,gFrom,gTo); SetDateRange(periodI,iFrom,iTo); SetDateRange(periodE,eFrom,eTo);
        }
        catch{}
    }

    void SelectPeriodForGroup(ComboBox c,int group)
    {
        if(c.DataSource is not DataTable dt || dt.Rows.Count==0) return;
        DateTime today=DateTime.Today;
        var rows=dt.AsEnumerable().Where(r=>r["GRUP"]!=DBNull.Value && Convert.ToInt32(r["GRUP"])==group);
        var row=rows.FirstOrDefault(r=>r["BASTAR"]!=DBNull.Value && r["BITTAR"]!=DBNull.Value && ((DateTime)r["BASTAR"]).Date<=today && ((DateTime)r["BITTAR"]).Date>=today)
            ?? rows.OrderByDescending(r=>r["BASTAR"]==DBNull.Value?DateTime.MinValue:(DateTime)r["BASTAR"]).FirstOrDefault();
        if(row!=null) c.SelectedValue=row["KOD"];
    }
    void SetDateRange(ComboBox c,DateTimePicker from,DateTimePicker to)
    {
        if(c.SelectedItem is not DataRowView r) return;
        if(r["BASTAR"]!=DBNull.Value) from.Value=((DateTime)r["BASTAR"]).Date;
        if(r["BITTAR"]!=DBNull.Value) to.Value=((DateTime)r["BITTAR"]).Date;
    }

    void OrderGirisColumns()
    {
        string[] order={"GIRIS_TARIHI","GIRIS_SAATI","GTUR","CIKIS_TARIHI","CIKIS_SAATI","CTUR"};
        for(int i=0;i<order.Length;i++) if(gGiris.Columns.Contains(order[i])) gGiris.Columns[order[i]].DisplayIndex=i;
    }
}
