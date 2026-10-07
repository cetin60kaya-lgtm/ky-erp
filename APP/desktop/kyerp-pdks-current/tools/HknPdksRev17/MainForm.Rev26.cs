using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using FirebirdSql.Data.FirebirdClient;

namespace QuickDataTool;

public sealed partial class MainForm
{
    private bool Rev26Period(out int year, out int month)
    {
        year = (int)payrollYear.Value;
        month = payrollMonthNo.SelectedIndex;
        if (month is < 1 or > 12)
        {
            MessageBox.Show("Kilit işlemi için tek bir ay seçin.", "Bordro Kilidi", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return false;
        }
        return true;
    }

    private bool Rev26LockInfrastructureReady()
    {
        if (db == null) return false;
        try
        {
            var tables = Convert.ToInt32(db.Scalar("select count(*) from rdb$relations where rdb$relation_name in ('PDKS_DONEM_KILIT','PDKS_PERSONEL_DONEM_KILIT')") ?? 0);
            var guards = Convert.ToInt32(db.Scalar("select count(*) from rdb$triggers where rdb$trigger_name in ('PDKS_GUARD_PUANTAJ','PDKS_GUARD_UCRET','PDKS_GUARD_OVERRIDE') and coalesce(rdb$trigger_inactive,0)=0") ?? 0);
            if (tables != 2 || guards != 3)
            {
                MessageBox.Show("REV26 kilit koruması eksik. DB koruma tabloları/tetikleyicileri tam değil; güvenli kilit uygulanmadı.", "Bordro Kilidi", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
            return true;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Bordro Kilidi", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }
    }

    private bool Rev26IsLocked(string card, DateTime period)
    {
        if (db == null) return false;
        var y = period.Year;
        var m = period.Month;
        var monthLock = Convert.ToInt32(db.Scalar(
            "select count(*) from PDKS_DONEM_KILIT where YIL=@Y and AY=@M and coalesce(KILITLI,0)=1",
            new FbParameter("@Y", y), new FbParameter("@M", m)) ?? 0) > 0;
        if (monthLock) return true;
        return Convert.ToInt32(db.Scalar(
            "select count(*) from PDKS_PERSONEL_DONEM_KILIT where PKNO=@P and YIL=@Y and AY=@M and coalesce(KILITLI,0)=1",
            new FbParameter("@P", card), new FbParameter("@Y", y), new FbParameter("@M", m)) ?? 0) > 0;
    }

    private void Rev26SetMonthLock(bool locked)
    {
        if (db == null || !Rev26Period(out var y, out var m) || !Rev26LockInfrastructureReady()) return;
        if (MessageBox.Show($"{m:00}.{y} dönemi {(locked ? "KİLİTLENECEK" : "AÇILACAK")}. Devam?", "Bordro Kilidi", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

        var now = DateTime.Now;
        var actor = Environment.UserName;
        var note = "REV26 Bordro ana ekranı";
        var n = db.Execute("update PDKS_DONEM_KILIT set KILITLI=@L,KILIT_TARIH=@T,KILITLEYEN=@K,NOTU=@N where YIL=@Y and AY=@M",
            new FbParameter("@L", locked ? 1 : 0), new FbParameter("@T", now), new FbParameter("@K", actor), new FbParameter("@N", note),
            new FbParameter("@Y", y), new FbParameter("@M", m));
        if (n == 0)
            db.Execute("insert into PDKS_DONEM_KILIT (YIL,AY,KILITLI,KILIT_TARIH,KILITLEYEN,NOTU) values (@Y,@M,@L,@T,@K,@N)",
                new FbParameter("@Y", y), new FbParameter("@M", m), new FbParameter("@L", locked ? 1 : 0),
                new FbParameter("@T", now), new FbParameter("@K", actor), new FbParameter("@N", note));
        LoadPayroll();
        MessageBox.Show(locked
            ? "Ay kilitlendi. UCRETLER + PUANTAJ + bordro override DB seviyesinde değiştirilemez."
            : "Ay kilidi açıldı.", "Bordro Kilidi", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void Rev26SetSelectedLocks(bool locked)
    {
        if (db == null || !Rev26Period(out var y, out var m) || !Rev26LockInfrastructureReady()) return;
        var cards = payrollGrid.SelectedRows.Cast<DataGridViewRow>()
            .Where(r => !r.IsNewRow)
            .Select(r => Convert.ToString(r.Cells["PKNO"].Value)?.Trim() ?? "")
            .Where(x => x.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (cards.Length == 0)
        {
            MessageBox.Show("Önce bir veya daha fazla personel satırı seçin.", "Bordro Kilidi");
            return;
        }
        if (MessageBox.Show($"{cards.Length} personel {m:00}.{y} için {(locked ? "KİLİTLENECEK" : "AÇILACAK")}. Devam?", "Bordro Kilidi", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

        var now = DateTime.Now;
        var actor = Environment.UserName;
        foreach (var card in cards)
        {
            var n = db.Execute("update PDKS_PERSONEL_DONEM_KILIT set KILITLI=@L,KILIT_TARIH=@T,KILITLEYEN=@K,NOTU=@N where PKNO=@P and YIL=@Y and AY=@M",
                new FbParameter("@L", locked ? 1 : 0), new FbParameter("@T", now), new FbParameter("@K", actor), new FbParameter("@N", "REV26 Bordro ana ekranı"),
                new FbParameter("@P", card), new FbParameter("@Y", y), new FbParameter("@M", m));
            if (n == 0)
                db.Execute("insert into PDKS_PERSONEL_DONEM_KILIT (PKNO,YIL,AY,KILITLI,KILIT_TARIH,KILITLEYEN,NOTU) values (@P,@Y,@M,@L,@T,@K,@N)",
                    new FbParameter("@P", card), new FbParameter("@Y", y), new FbParameter("@M", m), new FbParameter("@L", locked ? 1 : 0),
                    new FbParameter("@T", now), new FbParameter("@K", actor), new FbParameter("@N", "REV26 Bordro ana ekranı"));
        }
        LoadPayroll();
        MessageBox.Show(locked ? "Seçilen personeller kilitlendi." : "Seçilen personellerin kilidi açıldı.", "Bordro Kilidi");
    }

    private void Rev26Unlock()
    {
        if (payrollGrid.SelectedRows.Count > 0) Rev26SetSelectedLocks(false);
        else Rev26SetMonthLock(false);
    }

    private void ApplyRev26LockColors()
    {
        if (db == null || payrollGrid.DataSource == null) return;
        foreach (DataGridViewRow row in payrollGrid.Rows)
        {
            if (row.IsNewRow || !row.DataGridView!.Columns.Contains("PKNO") || !row.DataGridView.Columns.Contains("BASTAR")) continue;
            var card = Convert.ToString(row.Cells["PKNO"].Value)?.Trim() ?? "";
            if (row.Cells["BASTAR"].Value is DBNull || !DateTime.TryParse(Convert.ToString(row.Cells["BASTAR"].Value), out var d)) continue;
            if (Rev26IsLocked(card, d))
            {
                row.DefaultCellStyle.BackColor = System.Drawing.Color.FromArgb(255, 232, 232);
                row.DefaultCellStyle.SelectionBackColor = System.Drawing.Color.FromArgb(230, 170, 170);
            }
        }
    }

    private void EditPayrollSelectedRev26()
    {
        if (db == null || payrollGrid.SelectedRows.Count != 1)
        {
            MessageBox.Show("Tek bordro satırı seçin.");
            return;
        }

        var row = payrollGrid.SelectedRows[0];
        var card = Convert.ToString(row.Cells["PKNO"].Value)?.Trim() ?? "";
        var start = Convert.ToDateTime(row.Cells["BASTAR"].Value);

        if (Rev26IsLocked(card, start))
        {
            MessageBox.Show($"{card} / {start:MM.yyyy} kilitli. Önce Kilidi Aç işlemini kullanın.", "Bordro Kilidi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        using var form = new PayrollEditForm(card, row);
        if (form.ShowDialog(this) != DialogResult.OK) return;
        var changed = form.ChangedFields.ToArray();
        if (changed.Length == 0)
        {
            MessageBox.Show("Değişiklik yok.", "Bordro");
            return;
        }

        if (MessageBox.Show($"{card} bordro kaydında {changed.Length} alan güncellenecek. Devam?", "Bordro", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

        var sets = new List<string>();
        var parameters = new List<FbParameter>();
        for (var i = 0; i < changed.Length; i++)
        {
            var field = changed[i];
            var p = "@V" + i;
            sets.Add(field + "=" + p);
            parameters.Add(new FbParameter(p, PayrollValue(field, form.Get(field))));
        }
        parameters.Add(new FbParameter("@P", card));
        parameters.Add(new FbParameter("@B", start));

        var affected = db.Execute("update UCRETLER set " + string.Join(",", sets) + " where PKNO=@P and BASTAR=@B", parameters.ToArray());
        if (affected != 1) throw new InvalidOperationException("Bordro kaydı tekil güncellenemedi. Değişiklik doğrulanmadı.");

        var verify = db.Query("select " + string.Join(",", changed) + " from UCRETLER where PKNO=@P and BASTAR=@B",
            new FbParameter("@P", card), new FbParameter("@B", start));
        if (verify.Rows.Count != 1) throw new InvalidOperationException("Kaydedilen bordro satırı tekrar okunamadı.");

        var bad = new List<string>();
        foreach (var field in changed)
        {
            var expected = PayrollValue(field, form.Get(field));
            var actual = verify.Rows[0][field];
            if (!Rev26Equivalent(expected, actual)) bad.Add(field);
        }
        if (bad.Count > 0)
            throw new InvalidOperationException("DB doğrulaması başarısız. Kaydedilemeyen alanlar: " + string.Join(", ", bad));

        LoadPayroll();
        MessageBox.Show("Kaydedildi ve DB'den doğrulandı: " + string.Join(", ", changed), "Bordro", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private static bool Rev26Equivalent(object expected, object actual)
    {
        if (actual == DBNull.Value) return expected == DBNull.Value || string.IsNullOrWhiteSpace(Convert.ToString(expected));
        if (expected is string es) return string.Equals(es.Trim(), (Convert.ToString(actual) ?? "").Trim(), StringComparison.Ordinal);
        try
        {
            return Convert.ToDecimal(expected, CultureInfo.CurrentCulture) == Convert.ToDecimal(actual, CultureInfo.CurrentCulture);
        }
        catch
        {
            return string.Equals(Convert.ToString(expected)?.Trim(), Convert.ToString(actual)?.Trim(), StringComparison.Ordinal);
        }
    }
}
