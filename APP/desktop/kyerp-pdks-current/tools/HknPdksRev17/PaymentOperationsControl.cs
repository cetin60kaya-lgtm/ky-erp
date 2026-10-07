using System.Data;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed class PaymentOperationsControl : UserControl
{
    readonly MainForm main;
    readonly NumericUpDown year = new() { Minimum = 2010, Maximum = 2100, Width = 75 };
    readonly ComboBox month = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 105 };
    readonly DateTimePicker paymentDate = new() { Format = DateTimePickerFormat.Short, Width = 110 };
    readonly DataGridView bankGrid = Grid(false);
    readonly Label bankStatus = new() { Dock = DockStyle.Bottom, Height = 34, Padding = new Padding(8) };

    readonly DataGridView advanceGrid = Grid(true);
    readonly ComboBox advancePerson = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 220 };
    readonly Label advanceStatus = new() { Dock = DockStyle.Bottom, Height = 32, Padding = new Padding(8) };

    internal PaymentOperationsControl(MainForm owner)
    {
        main = owner;
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI", 9);
        month.Items.AddRange(CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.MonthNames.Take(12).Cast<object>().ToArray());
        var previous = DateTime.Today.AddMonths(-1);
        year.Value = previous.Year;
        month.SelectedIndex = previous.Month - 1;
        Build();
        ConfigureBankGrid();
        VisibleChanged += (_, _) => { if (Visible) LoadBank(); };
        year.ValueChanged += (_, _) => LoadBank();
        month.SelectedIndexChanged += (_, _) => LoadBank();
    }

    static DataGridView Grid(bool readOnly) => new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = readOnly,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        BackgroundColor = Color.White,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        MultiSelect = true,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        AutoGenerateColumns = readOnly
    };

    void Build()
    {
        var tabs = new TabControl { Dock = DockStyle.Fill };
        tabs.TabPages.Add(new TabPage("Toplu Banka Ödemesi") { Controls = { BuildBank() } });
        tabs.TabPages.Add(new TabPage("Avanslar") { Controls = { BuildAdvance() } });
        Controls.Add(tabs);
    }

    Control BuildBank()
    {
        var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8) };
        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 48, Padding = new Padding(3) };
        void Field(string title, Control control)
        {
            top.Controls.Add(new Label { Text = title, AutoSize = true, Padding = new Padding(5, 8, 2, 0) });
            top.Controls.Add(control);
        }
        Field("Yıl", year); Field("Ay", month); Field("Ödeme Tarihi", paymentDate);
        top.Controls.Add(Button("LİSTELE", LoadBank, 95));
        top.Controls.Add(Button("TÜMÜNÜ SEÇ", SelectAllBank, 110));
        top.Controls.Add(Button("SEÇİMİ TEMİZLE", ClearBankSelection, 125));
        top.Controls.Add(Button("BORDRODAN DOLDUR", FillFromPayroll, 155));
        top.Controls.Add(Button("TOPLU BANKA ÖDEMESİ", ApplyBank, 180, Color.Honeydew));
        top.Controls.Add(new Label
        {
            Text = "Bordrodaki Banka (EX2) değeri aynen kullanılabilir. ODEME kaydı yoksa yeni kayıt açılır; mevcut tekil kayıt varsa güncellenir. Mükerrer kayıt otomatik işlenmez.",
            AutoSize = true, Padding = new Padding(12, 8, 0, 0), ForeColor = Color.DarkSlateGray
        });
        panel.Controls.Add(bankGrid);
        panel.Controls.Add(bankStatus);
        panel.Controls.Add(top);
        return panel;
    }

    Control BuildAdvance()
    {
        var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8) };
        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 48, Padding = new Padding(3) };
        top.Controls.Add(new Label { Text = "Personel", AutoSize = true, Padding = new Padding(5, 8, 2, 0) });
        top.Controls.Add(advancePerson);
        top.Controls.Add(Button("AVANSLARI LİSTELE", LoadAdvances, 145));
        top.Controls.Add(Button("SEÇİLİ AVANSI DÜZENLE", EditAdvance, 180));
        top.Controls.Add(new Label { Text = "Yıl / Ay üstteki banka dönemiyle aynıdır.", AutoSize = true, Padding = new Padding(10, 8, 0, 0), ForeColor = Color.DimGray });
        panel.Controls.Add(advanceGrid);
        panel.Controls.Add(advanceStatus);
        panel.Controls.Add(top);
        return panel;
    }

    Button Button(string text, Action action, int width, Color? back = null)
    {
        var b = new Button { Text = text, Width = width, Height = 32 };
        if (back is Color color) b.BackColor = color;
        b.Click += (_, _) => action();
        return b;
    }

    void ConfigureBankGrid()
    {
        bankGrid.ReadOnly = false;
        bankGrid.Columns.Clear();
        bankGrid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "Sec", HeaderText = "Seç", DataPropertyName = "Sec", Width = 42, FillWeight = 42 });
        void C(string name, string title, int weight, bool readOnly = true)
        {
            bankGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = name, HeaderText = title, DataPropertyName = name, ReadOnly = readOnly, FillWeight = weight });
        }
        C("Kart","Kart",65);
        C("AdSoyad","Ad Soyad",160);
        C("BankaBordro","Bordro Banka",95);
        C("MevcutOdeme","Mevcut Ödeme",95);
        C("Odenecek","Ödenecek",95,false);
        C("SonOdemeTarihi","Son Ödeme Tarihi",95);
        C("Durum","Durum",180);
        bankGrid.CellValidating += (sender, e) =>
        {
            if (bankGrid.Columns[e.ColumnIndex].Name != "Odenecek") return;
            if (!TryNumber(Convert.ToString(e.FormattedValue) ?? "", out _))
            {
                e.Cancel = true;
                MessageBox.Show(main, "Ödenecek alanı sayısal olmalıdır.", "Banka Ödemesi");
            }
        };
    }

    (DateTime Start, DateTime End, DateTime Last) Period()
    {
        var a = new DateTime((int)year.Value, month.SelectedIndex + 1, 1);
        var b = a.AddMonths(1);
        return (a,b,b.AddDays(-1));
    }

    void LoadBank()
    {
        var db = main.Database;
        if (db is null) { bankStatus.Text = "Önce DB'ye bağlanın."; return; }
        try
        {
            var (a,b,last) = Period();
            var payroll = db.Query(@"select u.PKNO,k.AD,k.SOYAD,u.EX2
                from UCRETLER u inner join KIMLIK k on k.PKNO=u.PKNO
                where u.BASTAR=@A and u.BITTAR=@E
                  and k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A)
                order by u.PKNO",
                new FbParameter("@A",a),new FbParameter("@B",b),new FbParameter("@E",last));
            var payments = db.Query(@"select PKNO,BASTAR,BITTAR,NODENEN,NOTARIH
                from ODEME where BASTAR=@A and BITTAR=@E order by PKNO",
                new FbParameter("@A",a),new FbParameter("@E",last));
            var grouped = payments.AsEnumerable().GroupBy(row => Convert.ToString(row["PKNO"]) ?? "", StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.OrdinalIgnoreCase);

            var t = new DataTable();
            t.Columns.Add("Sec",typeof(bool));
            t.Columns.Add("Kart");
            t.Columns.Add("AdSoyad");
            t.Columns.Add("BankaBordro",typeof(double));
            t.Columns.Add("MevcutOdeme",typeof(double));
            t.Columns.Add("Odenecek",typeof(double));
            t.Columns.Add("SonOdemeTarihi");
            t.Columns.Add("Durum");
            foreach (DataRow row in payroll.Rows)
            {
                var card = Convert.ToString(row["PKNO"]) ?? "";
                var bank = row["EX2"] == DBNull.Value ? 0d : Convert.ToDouble(row["EX2"],CultureInfo.CurrentCulture);
                var rows = grouped.GetValueOrDefault(card) ?? [];
                var ready = rows.Length == 1;
                var current = ready && rows[0]["NODENEN"] != DBNull.Value ? Convert.ToDouble(rows[0]["NODENEN"],CultureInfo.CurrentCulture) : 0d;
                var date = ready && rows[0]["NOTARIH"] != DBNull.Value ? Convert.ToDateTime(rows[0]["NOTARIH"]).ToString("dd.MM.yyyy") : "";
                var state = rows.Length == 0 ? "Yeni kayıt açılacak" : rows.Length > 1 ? "Mükerrer ODEME kaydı" : "Hazır";
                t.Rows.Add(rows.Length <= 1 && bank != 0d, card,
                    ((Convert.ToString(row["AD"]) ?? "")+" "+(Convert.ToString(row["SOYAD"]) ?? "")).Trim(),
                    bank,current,current,date,state);
            }
            bankGrid.DataSource = t;
            FormatMoney();
            LoadAdvancePeople();
            bankStatus.Text = $"{a:MMMM yyyy}: {t.Rows.Count} aktif bordrolu personel • Mevcut ödeme kaydı {t.AsEnumerable().Count(r=>Convert.ToString(r["Durum"])=="Hazır")} • Yeni açılacak {t.AsEnumerable().Count(r=>Convert.ToString(r["Durum"])=="Yeni kayıt açılacak")} • Mükerrer {t.AsEnumerable().Count(r=>Convert.ToString(r["Durum"])=="Mükerrer ODEME kaydı")}";
        }
        catch (Exception ex) { bankStatus.Text = ex.Message; MessageBox.Show(main, ex.Message, "Banka Ödemesi", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    void FormatMoney()
    {
        foreach (var name in new[] { "BankaBordro","MevcutOdeme","Odenecek" })
            if (bankGrid.Columns.Contains(name)) bankGrid.Columns[name].DefaultCellStyle.Format = "N2";
    }

    void SelectAllBank()
    {
        bankGrid.EndEdit();
        foreach (DataGridViewRow row in bankGrid.Rows)
        {
            if (row.IsNewRow) continue;
            var state = Convert.ToString(row.Cells["Durum"].Value) ?? "";
            row.Cells["Sec"].Value = state != "Mükerrer ODEME kaydı";
        }
        bankStatus.Text = "Mükerrer ODEME kaydı olanlar hariç tüm personel seçildi.";
    }

    void ClearBankSelection()
    {
        bankGrid.EndEdit();
        foreach (DataGridViewRow row in bankGrid.Rows)
            if (!row.IsNewRow) row.Cells["Sec"].Value = false;
        bankStatus.Text = "Ödeme seçimi temizlendi.";
    }

    void FillFromPayroll()
    {
        bankGrid.EndEdit();
        foreach (DataGridViewRow row in bankGrid.Rows)
        {
            if (row.IsNewRow || Convert.ToString(row.Cells["Durum"].Value) == "Mükerrer ODEME kaydı") continue;
            row.Cells["Sec"].Value = true;
            row.Cells["Odenecek"].Value = Convert.ToDouble(row.Cells["BankaBordro"].Value ?? 0d);
        }
        bankStatus.Text = "Bordrodaki Banka tutarları Ödenecek alanına aktarıldı. Kontrol edip TOPLU BANKA ÖDEMESİ'ne basın.";
    }

    void ApplyBank()
    {
        var db = main.Database;
        if (db is null) return;
        bankGrid.EndEdit();
        var selected = bankGrid.Rows.Cast<DataGridViewRow>()
            .Where(row => !row.IsNewRow && Convert.ToBoolean(row.Cells["Sec"].Value ?? false))
            .ToArray();
        if (selected.Length == 0) { MessageBox.Show(main,"Ödeme yapılacak personel seçilmedi."); return; }
        var invalid = selected.Where(row => Convert.ToString(row.Cells["Durum"].Value) == "Mükerrer ODEME kaydı").ToArray();
        if (invalid.Length > 0) { MessageBox.Show(main,"Seçimde mükerrer ODEME kaydı olan personel var. Önce mükerrer kaydı düzeltin; işlem yapılmadı."); return; }
        var values = new List<(string Card,double Amount)>();
        foreach (var row in selected)
        {
            if (!TryNumber(Convert.ToString(row.Cells["Odenecek"].Value) ?? "", out var amount))
            {
                MessageBox.Show(main,$"{row.Cells["Kart"].Value}: Ödenecek tutarı geçersiz."); return;
            }
            values.Add((Convert.ToString(row.Cells["Kart"].Value) ?? "",amount));
        }
        var (a,_,last) = Period();
        var createCount = selected.Count(row => Convert.ToString(row.Cells["Durum"].Value) == "Yeni kayıt açılacak");
        var updateCount = selected.Length - createCount;
        if (MessageBox.Show(main,$"{values.Count} personele banka ödemesi kaydedilecek.\nYeni ODEME kaydı: {createCount}\nGüncellenecek kayıt: {updateCount}\nToplam: {values.Sum(x=>x.Amount):N2}\n\nDevam?","Toplu Banka Ödemesi",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes) return;
        string backup;
        try { backup = MonthlyDbWriter.BackupAsync(db,CancellationToken.None).GetAwaiter().GetResult(); }
        catch(Exception ex){MessageBox.Show(main,ex.Message,"DB yedeği alınamadı",MessageBoxButtons.OK,MessageBoxIcon.Error);return;}

        try
        {
            db.InTransaction((connection,tx) =>
            {
                foreach (var item in values)
                {
                    using var countCommand = FirebirdDatabase.CreateCommand(connection,tx,
                        "select count(*) from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@E",
                        new FbParameter("@P",item.Card),new FbParameter("@A",a),new FbParameter("@E",last));
                    var rowCount = Convert.ToInt32(countCommand.ExecuteScalar() ?? 0);
                    if (rowCount > 1) throw new InvalidOperationException(item.Card+": mükerrer ODEME satırı var. Tüm toplu ödeme geri alındı.");

                    if (rowCount == 0)
                    {
                        using var insert = FirebirdDatabase.CreateCommand(connection,tx,
                            "insert into ODEME (PKNO,BASTAR,BITTAR,NODENEN,NOTARIH,FMODENEN,FMOTARIH) values (@P,@A,@E,@N,@T,@F,@FT)",
                            new FbParameter("@P",item.Card),new FbParameter("@A",a),new FbParameter("@E",last),
                            new FbParameter("@N",item.Amount),new FbParameter("@T",paymentDate.Value.Date),
                            new FbParameter("@F",0d),new FbParameter("@FT",DBNull.Value));
                        if (insert.ExecuteNonQuery()!=1) throw new InvalidOperationException(item.Card+": yeni ODEME kaydı açılamadı. Tüm toplu ödeme geri alındı.");
                    }
                    else
                    {
                        using var update = FirebirdDatabase.CreateCommand(connection,tx,
                            "update ODEME set NODENEN=@N,NOTARIH=@T where PKNO=@P and BASTAR=@A and BITTAR=@E",
                            new FbParameter("@N",item.Amount),new FbParameter("@T",paymentDate.Value.Date),
                            new FbParameter("@P",item.Card),new FbParameter("@A",a),new FbParameter("@E",last));
                        if (update.ExecuteNonQuery()!=1) throw new InvalidOperationException(item.Card+": ODEME satırı değişti. Tüm toplu ödeme geri alındı.");
                    }
                }
                return 0;
            });
            MessageBox.Show(main,$"{values.Count} banka ödemesi kaydedildi.\nDB yedeği: {backup}","Toplu Banka Ödemesi",MessageBoxButtons.OK,MessageBoxIcon.Information);
            LoadBank();
        }
        catch(Exception ex){MessageBox.Show(main,ex.Message,"Toplu ödeme geri alındı",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }

    static bool TryNumber(string text,out double value)
    {
        text=text.Trim();
        return double.TryParse(text,NumberStyles.Number,CultureInfo.CurrentCulture,out value) ||
               double.TryParse(text.Replace(',','.'),NumberStyles.Number,CultureInfo.InvariantCulture,out value);
    }

    void LoadAdvancePeople()
    {
        var db=main.Database;
        if(db is null)return;
        var (a,b,_) = Period();
        var persons=PeriodPersonnelService.ReadActive(db,a,b.AddDays(-1));
        var selected=advancePerson.SelectedItem?.ToString();
        advancePerson.Items.Clear(); advancePerson.Items.Add("Tümü");
        foreach(var person in persons) advancePerson.Items.Add(person.ToString());
        advancePerson.SelectedItem=selected is not null && advancePerson.Items.Contains(selected)?selected:"Tümü";
    }

    string? AdvanceCard()
    {
        var text=advancePerson.SelectedItem?.ToString();
        return string.IsNullOrWhiteSpace(text)||text=="Tümü"?null:text[..Math.Min(5,text.Length)];
    }

    void LoadAdvances()
    {
        var db=main.Database;
        if(db is null)return;
        try
        {
            var (a,b,_)=Period();
            var card=AdvanceCard();
            var sql=@"select a.KOD,a.PKNO,k.AD,k.SOYAD,a.TARIH,a.MIKTAR,a.VTARIH,a.TURKOD,a.TOPMIKTAR,a.TAKSITSAYISI,a.TAKSITNO,a.ACIKLAMA
                from AVANS a inner join KIMLIK k on k.PKNO=a.PKNO
                where a.TARIH>=@A and a.TARIH<@B"+(card is null?"":" and a.PKNO=@P")+" order by a.TARIH desc,a.KOD desc";
            advanceGrid.DataSource=card is null
                ? db.Query(sql,new FbParameter("@A",a),new FbParameter("@B",b))
                : db.Query(sql,new FbParameter("@A",a),new FbParameter("@B",b),new FbParameter("@P",card));
            advanceStatus.Text=$"{a:MMMM yyyy} avansları listelendi.";
        }
        catch(Exception ex){MessageBox.Show(main,ex.Message,"Avans",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }

    void EditAdvance()
    {
        var db=main.Database;
        if(db is null||advanceGrid.SelectedRows.Count!=1){MessageBox.Show(main,"Tek avans satırı seçin.");return;}
        var row=advanceGrid.SelectedRows[0];
        using var form=new RecordEditForm("Avans Düzenle",row,"TARIH","MIKTAR","VTARIH","TURKOD","TOPMIKTAR","TAKSITSAYISI","TAKSITNO","ACIKLAMA");
        if(form.ShowDialog(main)!=DialogResult.OK)return;
        try
        {
            var key=Convert.ToInt32(row.Cells["KOD"].Value);
            var affected=db.Execute(@"update AVANS set TARIH=@T,MIKTAR=@M,VTARIH=@V,TURKOD=@TK,TOPMIKTAR=@TM,TAKSITSAYISI=@TS,TAKSITNO=@TN,ACIKLAMA=@X where KOD=@K",
                new FbParameter("@T",DateValue(form.Get("TARIH"))),
                new FbParameter("@M",Number(form.Get("MIKTAR"))),
                new FbParameter("@V",DateValue(form.Get("VTARIH"))),
                new FbParameter("@TK",IntValue(form.Get("TURKOD"))),
                new FbParameter("@TM",Number(form.Get("TOPMIKTAR"))),
                new FbParameter("@TS",IntValue(form.Get("TAKSITSAYISI"))),
                new FbParameter("@TN",IntValue(form.Get("TAKSITNO"))),
                new FbParameter("@X",form.Get("ACIKLAMA")),new FbParameter("@K",key));
            if(affected!=1)throw new InvalidOperationException("Avans kaydı tekil değil veya değişti.");
            LoadAdvances();
        }
        catch(Exception ex){MessageBox.Show(main,ex.Message,"Avans kaydedilemedi",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }

    static object DateValue(string text)
    {
        text=text.Trim();
        if(text.Length==0)return DBNull.Value;
        if(DateTime.TryParse(text,CultureInfo.GetCultureInfo("tr-TR"),DateTimeStyles.None,out var value))return value.Date;
        throw new InvalidOperationException("Tarih geçersiz: "+text);
    }
    static double Number(string text)=>TryNumber(text,out var value)?value:throw new InvalidOperationException("Sayısal değer geçersiz: "+text);
    static int IntValue(string text)=>int.TryParse(text.Trim(),out var value)?value:throw new InvalidOperationException("Tam sayı geçersiz: "+text);
}
