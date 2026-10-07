using System.Data;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed class BulkAdvanceDialog : Form
{
    readonly FirebirdDatabase db;
    readonly DateTime period;
    readonly DateTimePicker paymentDate = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "dd.MM.yyyy", Width = 112 };
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        AutoGenerateColumns = false,
        BackgroundColor = PdksAppearance.Current.Surface,
        BorderStyle = BorderStyle.None
    };
    readonly Label info = new() { Dock = DockStyle.Fill, ForeColor = PdksAppearance.Current.Muted, TextAlign = ContentAlignment.MiddleLeft };
    DataTable data = new();

    public BulkAdvanceDialog(FirebirdDatabase database, DateTime selectedPeriod)
    {
        db = database;
        period = new DateTime(selectedPeriod.Year, selectedPeriod.Month, 1);
        paymentDate.Value = DateTime.Today;

        Text = "Toplu Avans • ADMIN";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(920, 680);
        MinimumSize = new Size(820, 600);
        Font = new Font("Segoe UI", 9f);
        BackColor = PdksAppearance.Current.Canvas;

        Build();
        Shown += (_, _) => LoadPeople();
    }

    void Build()
    {
        var p = PdksAppearance.Current;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, Padding = new Padding(14), BackColor = p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));

        var header = PdksUiKit.Card(12);
        header.Controls.Add(new Label
        {
            Text = $"Toplu Avans • {period:MMMM yyyy}",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            ForeColor = p.Text,
            TextAlign = ContentAlignment.MiddleLeft
        });
        root.Controls.Add(header, 0, 0);

        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(8, 8, 0, 0), BackColor = p.Surface };
        top.Controls.Add(new Label { Text = "Avans Tarihi", AutoSize = true, Padding = new Padding(0, 8, 6, 0), Font = new Font("Segoe UI", 9f, FontStyle.Bold) });
        top.Controls.Add(paymentDate);
        var selectAll = PdksUiKit.Button("Tümünü Seç", 100, PdksActionRole.Quiet);
        selectAll.Click += (_, _) => SetAll(true);
        var clear = PdksUiKit.Button("Seçimi Temizle", 116, PdksActionRole.Quiet);
        clear.Click += (_, _) => SetAll(false);
        top.Controls.Add(selectAll);
        top.Controls.Add(clear);
        top.Controls.Add(info);
        root.Controls.Add(top, 0, 1);

        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersDefaultCellStyle.BackColor = p.GridHeader;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = p.Text;
        grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        grid.RowTemplate.Height = 30;
        grid.ColumnHeadersHeight = 36;
        grid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "SEC", HeaderText = "Seç", DataPropertyName = "SEC", Width = 48 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "PKNO", HeaderText = "Kart", DataPropertyName = "PKNO", Width = 74, ReadOnly = true });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "PERSONEL", HeaderText = "Ad Soyad", DataPropertyName = "PERSONEL", Width = 220, ReadOnly = true });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "MAAS", HeaderText = "Maaş", DataPropertyName = "MAAS", Width = 110, ReadOnly = true, DefaultCellStyle = new DataGridViewCellStyle { Format = "N2", Alignment = DataGridViewContentAlignment.MiddleRight } });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "MIKTAR", HeaderText = "Avans Tutarı", DataPropertyName = "MIKTAR", Width = 130, DefaultCellStyle = new DataGridViewCellStyle { Format = "N2", Alignment = DataGridViewContentAlignment.MiddleRight } });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "DURUM", HeaderText = "Durum", DataPropertyName = "DURUM", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill, ReadOnly = true });
        root.Controls.Add(grid, 0, 2);

        var bottom = PdksUiKit.ActionBar(true, p.Canvas);
        var save = PdksUiKit.Button("SEÇİLİ AVANSLARI KAYDET", 210, PdksActionRole.Primary);
        save.Click += (_, _) => Save();
        bottom.Controls.Add(save);
        root.Controls.Add(bottom, 0, 3);

        Controls.Add(root);
    }

    void LoadPeople()
    {
        try
        {
            var end = period.AddMonths(1).AddDays(-1);
            data = db.Query(@"select k.PKNO,(trim(coalesce(k.AD,''))||' '||trim(coalesce(k.SOYAD,''))) PERSONEL,
                    coalesce(k.MAAS,0) MAAS
                from KIMLIK k
                where (k.IGTARIH is null or k.IGTARIH<=@B) and (k.ICTARIH is null or k.ICTARIH>=@A)
                order by k.PKNO",
                new FbParameter("@A", period),
                new FbParameter("@B", end));
            data.Columns.Add("SEC", typeof(bool));
            data.Columns.Add("MIKTAR", typeof(decimal));
            data.Columns.Add("DURUM", typeof(string));
            foreach (DataRow row in data.Rows)
            {
                row["SEC"] = false;
                row["MIKTAR"] = 0m;
                row["DURUM"] = "Hazır";
            }
            grid.DataSource = data;
            info.Text = $"{data.Rows.Count} aktif personel • Sadece seçili ve tutarı > 0 olanlar kaydedilir.";
        }
        catch (Exception ex)
        {
            info.Text = "Personel listesi yüklenemedi: " + ex.Message;
        }
    }

    void SetAll(bool value)
    {
        foreach (DataRow row in data.Rows) row["SEC"] = value;
        grid.Refresh();
    }

    void Save()
    {
        var selected = data.AsEnumerable()
            .Where(r => r.Field<bool>("SEC"))
            .Select(r => new
            {
                Row = r,
                Card = Convert.ToString(r["PKNO"])?.Trim() ?? "",
                Amount = Money(r["MIKTAR"])
            })
            .Where(x => x.Card.Length > 0 && x.Amount > 0)
            .ToArray();

        if (selected.Length == 0)
        {
            MessageBox.Show("Kaydetmek için personel seçip avans tutarı girin.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (MessageBox.Show(
                $"{selected.Length} personelin avansı {paymentDate.Value:dd.MM.yyyy} tarihine kaydedilecek.\n\nAynı kişi+tarih için daha önce TOPLU AVANS kaydı varsa mükerrer oluşturulmaz, mevcut kayıt güncellenir. Devam edilsin mi?",
                Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
            return;

        try
        {
            db.InTransaction((connection, transaction) =>
            {
                int nextCode;
                using (var max = FirebirdDatabase.CreateCommand(connection, transaction, "select coalesce(max(KOD),0)+1 from AVANS"))
                    nextCode = Convert.ToInt32(max.ExecuteScalar() ?? 1);

                foreach (var item in selected)
                {
                    int? existingCode = null;
                    using (var find = FirebirdDatabase.CreateCommand(connection, transaction,
                        "select first 1 KOD from AVANS where PKNO=@P and TARIH=@D and TURKOD=2 and upper(trim(coalesce(ACIKLAMA,'')))='TOPLU AVANS' order by KOD",
                        new FbParameter("@P", item.Card),
                        new FbParameter("@D", paymentDate.Value.Date)))
                    {
                        var raw = find.ExecuteScalar();
                        if (raw is not null && raw != DBNull.Value) existingCode = Convert.ToInt32(raw);
                    }

                    if (existingCode.HasValue)
                    {
                        using var update = FirebirdDatabase.CreateCommand(connection, transaction,
                            @"update AVANS set MIKTAR=@M,TOPMIKTAR=@M,VTARIH=@D,TAKSITSAYISI=1,TAKSITNO=1,ACIKLAMA='TOPLU AVANS'
                              where KOD=@K and PKNO=@P",
                            new FbParameter("@M", item.Amount),
                            new FbParameter("@D", paymentDate.Value.Date),
                            new FbParameter("@K", existingCode.Value),
                            new FbParameter("@P", item.Card));
                        update.ExecuteNonQuery();
                    }
                    else
                    {
                        using var insert = FirebirdDatabase.CreateCommand(connection, transaction,
                            @"insert into AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,KOD,TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA)
                              values (@P,@D,@M,@D,2,@K,@M,1,1,'TOPLU AVANS')",
                            new FbParameter("@P", item.Card),
                            new FbParameter("@D", paymentDate.Value.Date),
                            new FbParameter("@M", item.Amount),
                            new FbParameter("@K", nextCode++));
                        insert.ExecuteNonQuery();
                    }
                }
                return 0;
            });

            foreach (var item in selected) item.Row["DURUM"] = "Kaydedildi";
            grid.Refresh();
            MessageBox.Show($"{selected.Length} personelin toplu avansı kaydedildi.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            PdksErrorPresenter.Show(this, ex, Text, MessageBoxIcon.Error, "Payroll.BulkAdvance");
        }
    }

    static decimal Money(object value)
    {
        if (value is null || value == DBNull.Value) return 0m;
        if (value is decimal d) return d;
        if (decimal.TryParse(Convert.ToString(value), NumberStyles.Any, CultureInfo.GetCultureInfo("tr-TR"), out var tr)) return Math.Abs(tr);
        if (decimal.TryParse(Convert.ToString(value), NumberStyles.Any, CultureInfo.InvariantCulture, out var inv)) return Math.Abs(inv);
        return 0m;
    }
}
