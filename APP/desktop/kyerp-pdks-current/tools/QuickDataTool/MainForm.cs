using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

public sealed class MainForm : Form
{
    sealed class DayChoice
    {
        public DateTime Date { get; }
        public DayChoice(DateTime date) => Date = date.Date;
        public override string ToString() => Date.ToString("dd.MM.yyyy dddd", new System.Globalization.CultureInfo("tr-TR"));
    }

    readonly TextBox dbPath = new() { Dock = DockStyle.Fill };
    readonly TextBox tnfPath = new() { Dock = DockStyle.Fill };
    readonly Label sourceStatus = new() { AutoSize = true };
    readonly TabControl tabs = new() { Dock = DockStyle.Fill };
    readonly DataGridView peopleGrid = Grid();
    readonly DataGridView ioGrid = Grid();
    readonly DataGridView payrollGrid = Grid();
    readonly DataGridView bulkGrid = Grid();
    readonly DataGridView auditGrid = Grid();
    readonly DataGridView eGrid = Grid();
    readonly DataGridView paymentGrid = Grid();
    readonly DataGridView advanceGrid = Grid();
    readonly ComboBox personFilter = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 110 };
    readonly Label personSummary = new() { AutoSize = true, Padding = new Padding(10,8,0,0) };
    readonly CheckedListBox ePeopleList = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly CheckedListBox eDayList = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly DateTimePicker eStart = new() { Format = DateTimePickerFormat.Short };
    readonly DateTimePicker eEnd = new() { Format = DateTimePickerFormat.Short };
    readonly ComboBox eSide = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    readonly CheckedListBox peopleList = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly CheckedListBox dayList = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly DateTimePicker ioMonth = MonthPicker();
    readonly NumericUpDown ioYear = new() { Minimum = 2010, Maximum = 2100, Width = 75 };
    readonly ComboBox ioMonthNo = MonthCombo();
    readonly ComboBox ioPerson = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 220 };
    readonly NumericUpDown auditYear = new() { Minimum = 2010, Maximum = 2100, Width = 75 };
    readonly ComboBox auditMonthNo = MonthCombo();
    readonly ComboBox auditPerson = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 220 };
    readonly NumericUpDown eYear = new() { Minimum = 2010, Maximum = 2100, Width = 75 };
    readonly ComboBox eMonthNo = MonthCombo();
    readonly ComboBox ePerson = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 220 };
    readonly DataGridView eHistoryGrid = Grid();
    readonly NumericUpDown eHistoryYear = new() { Minimum = 2010, Maximum = 2100, Width = 75 };
    readonly ComboBox eHistoryMonth = MonthCombo();
    readonly ComboBox eHistoryPerson = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 220 };
    readonly DateTimePicker payrollMonth = MonthPicker();
    readonly NumericUpDown payrollYear = new(){Minimum=2010,Maximum=2100,Width=75};
    readonly ComboBox payrollMonthNo = MonthCombo();
    readonly ComboBox payrollPerson = new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=220};
    readonly DateTimePicker paymentMonth = MonthPicker();
    readonly NumericUpDown paymentYear = new(){Minimum=2010,Maximum=2100,Width=75};
    readonly ComboBox paymentMonthNo = MonthCombo();
    readonly ComboBox paymentPerson = new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=220};
    readonly DateTimePicker advanceMonth = MonthPicker();
    readonly NumericUpDown advanceYear = new(){Minimum=2010,Maximum=2100,Width=75};
    readonly ComboBox advanceMonthNo = MonthCombo();
    readonly ComboBox advancePerson = new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=220};
    readonly DateTimePicker rangeStart = new() { Format = DateTimePickerFormat.Short };
    readonly DateTimePicker rangeEnd = new() { Format = DateTimePickerFormat.Short };
    readonly MaskedTextBox inMin = TimeBox("08:20"), inMax = TimeBox("08:35");
    readonly MaskedTextBox outMin = TimeBox("18:55"), outMax = TimeBox("19:05");
    FirebirdDatabase? db;
    PdksOptions? options;
    public MainForm()
    {
        Text = "HKN PDKS H\u0131zl\u0131 Veri";
        StartPosition = FormStartPosition.CenterScreen;
        Width = 1380; Height = 820; MinimumSize = new Size(1100, 700);
        Font = new Font("Segoe UI", 9f);
        personFilter.Items.AddRange(["Aktif","Pasif","T\u00fcm\u00fc"]); personFilter.SelectedIndex = 0;
        eSide.Items.AddRange(["Giri\u015f E","\u00c7\u0131k\u0131\u015f E","Giri\u015f + \u00c7\u0131k\u0131\u015f E"]); eSide.SelectedIndex = 0;
        Build();
        personFilter.SelectedIndexChanged += (_, _) => LoadPeople();
        eStart.ValueChanged += (_, _) => RebuildEDays(); eEnd.ValueChanged += (_, _) => RebuildEDays();
        eYear.ValueChanged += (_, _) => ApplyEPeriodFilter(); eMonthNo.SelectedIndexChanged += (_, _) => ApplyEPeriodFilter(); ePerson.SelectedIndexChanged += (_, _) => ApplyEPeriodFilter();
        Shown += (_, _) => { DetectSources(); Connect(); };
        ioYear.Value = auditYear.Value = eYear.Value = eHistoryYear.Value = payrollYear.Value = paymentYear.Value = advanceYear.Value = DateTime.Today.Year;
        rangeStart.ValueChanged += (_, _) => RebuildDays();
        rangeEnd.ValueChanged += (_, _) => RebuildDays();
    }

    static DataGridView Grid() => new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        MultiSelect = true,
        BackgroundColor = Color.White
    };

    static DateTimePicker MonthPicker() => new() { Format = DateTimePickerFormat.Custom, CustomFormat = "MMMM yyyy", ShowUpDown = true };
    static ComboBox MonthCombo(){ var c=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Width=110}; c.Items.AddRange(new object[]{"Tümü","Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"}); c.SelectedIndex=DateTime.Today.Month; return c; }
    static MaskedTextBox TimeBox(string value) => new("00:00") { Text = value, Width = 60 };
    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1 };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 122));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.Controls.Add(BuildSources(), 0, 0);
        tabs.TabPages.Add(Page("Personel", BuildPeople()));
        tabs.TabPages.Add(Page("Giri\u015f-\u00c7\u0131k\u0131\u015f", BuildIo()));
        tabs.TabPages.Add(Page("Toplu \u0130\u015flem", BuildBulk()));
        tabs.TabPages.Add(Page("E İşlemleri", BuildE()));
        tabs.TabPages.Add(Page("E İşlem Geçmişi", BuildEHistory()));
        tabs.TabPages.Add(Page("Bordro", BuildPayroll()));
        tabs.TabPages.Add(Page("Ödeme / Avans", BuildPayments()));
        tabs.TabPages.Add(Page("Data Kontrol", BuildAudit()));
        root.Controls.Add(tabs, 0, 1);
        Controls.Add(root);
    }

    static TabPage Page(string title, Control content)
    {
        var p = new TabPage(title) { Padding = new Padding(8), BackColor = Color.White };
        p.Controls.Add(content); return p;
    }

    Control BuildSources()
    {
        var box = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 3, Padding = new Padding(10) };
        box.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 135)); box.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        box.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 105)); box.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
        box.Controls.Add(new Label { Text = "Hedef GDB", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, 0);
        box.Controls.Add(dbPath, 1, 0); box.Controls.Add(Btn("GDB Se\u00e7", PickDb), 2, 0);
        box.Controls.Add(new Label { Text = "Terminal TNF", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, 1);
        box.Controls.Add(tnfPath, 1, 1); box.Controls.Add(Btn("TNF Se\u00e7", PickTnf), 2, 1);
        box.Controls.Add(Btn("Otomatik Tan\u0131", DetectSources), 3, 0);
        box.Controls.Add(Btn("Ba\u011flan / Yenile", Connect), 3, 1);
        box.Controls.Add(sourceStatus, 1, 2); box.SetColumnSpan(sourceStatus, 3);
        return box;
    }

    static Button Btn(string text, Action action)
    {
        var b = new Button { Text = text, Dock = DockStyle.Fill, Height = 32, FlatStyle = FlatStyle.Flat };
        b.Click += (_, _) => action(); return b;
    }

    static Button WideBtn(string text, Action action, int width)
    {
        var b = new Button { Text = text, Width = width, Height = 32, FlatStyle = FlatStyle.Flat, Margin = new Padding(3,0,3,0) };
        b.Click += (_, _) => action(); return b;
    }

    Control BuildPeople()
    {
        var p = new Panel { Dock = DockStyle.Fill };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, Padding = new Padding(2,3,2,2) };
        bar.Controls.Add(new Label { Text = "Personel Durumu", AutoSize = true, Padding = new Padding(0,8,4,0) });
        bar.Controls.Add(personFilter);
        bar.Controls.Add(Btn("Yenile", LoadPeople));
        bar.Controls.Add(WideBtn("Se\u00e7ili Personeli D\u00fczenle", EditSelectedPerson, 185));
        bar.Controls.Add(personSummary);
        p.Controls.Add(peopleGrid); p.Controls.Add(bar); return p;
    }

    Control BuildIo()
    {
        var p=new Panel{Dock=DockStyle.Fill}; var bar=new FlowLayoutPanel{Dock=DockStyle.Top,Height=46};
        bar.Controls.Add(new Label{Text="Yıl",AutoSize=true,Padding=new Padding(0,8,3,0)}); bar.Controls.Add(ioYear);
        bar.Controls.Add(new Label{Text="Ay",AutoSize=true,Padding=new Padding(7,8,3,0)}); bar.Controls.Add(ioMonthNo);
        bar.Controls.Add(new Label{Text="Personel",AutoSize=true,Padding=new Padding(7,8,3,0)}); bar.Controls.Add(ioPerson);
        bar.Controls.Add(Btn("Listele",LoadIo)); p.Controls.Add(ioGrid); p.Controls.Add(bar); return p;
    }
    Control BuildBulk()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 3, Padding = new Padding(8) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 300));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 260));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 82));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        var controls = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true };
        controls.Controls.Add(new Label { Text = "Ba\u015flang\u0131\u00e7", AutoSize = true, Padding = new Padding(0, 8, 2, 0) }); controls.Controls.Add(rangeStart);
        controls.Controls.Add(new Label { Text = "Biti\u015f", AutoSize = true, Padding = new Padding(8, 8, 2, 0) }); controls.Controls.Add(rangeEnd);
        controls.Controls.Add(new Label { Text = "Giri\u015f", AutoSize = true, Padding = new Padding(8, 8, 2, 0) }); controls.Controls.Add(inMin); controls.Controls.Add(inMax);
        controls.Controls.Add(new Label { Text = "\u00c7\u0131k\u0131\u015f", AutoSize = true, Padding = new Padding(8, 8, 2, 0) }); controls.Controls.Add(outMin); controls.Controls.Add(outMax);
        root.Controls.Add(controls, 0, 0); root.SetColumnSpan(controls, 3);
        root.Controls.Add(peopleList, 0, 1); root.Controls.Add(dayList, 1, 1); root.Controls.Add(bulkGrid, 2, 1);
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Padding = new Padding(4,6,4,2) };
        actions.Controls.Add(WideBtn("Tüm Personeli Seç", CheckAllPeople, 145)); actions.Controls.Add(WideBtn("Tüm Günleri Seç", CheckAllDays, 135)); actions.Controls.Add(WideBtn("Hafta Sonu Hariç", CheckWeekdays, 145));
        actions.Controls.Add(WideBtn("\u00d6nizleme", PreviewBulk, 115)); actions.Controls.Add(WideBtn("Uygula", ApplyBulk, 100));
        root.Controls.Add(actions, 0, 2); root.SetColumnSpan(actions, 3);
        return root;
    }

    Control BuildE()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=3,Padding=new Padding(8)};
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,300)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,250)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,78)); root.RowStyles.Add(new RowStyle(SizeType.Percent,100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
        var top=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=true}; top.Controls.Add(new Label{Text="Yıl",AutoSize=true,Padding=new Padding(0,8,2,0)}); top.Controls.Add(eYear); top.Controls.Add(new Label{Text="Ay",AutoSize=true,Padding=new Padding(8,8,2,0)}); top.Controls.Add(eMonthNo); top.Controls.Add(new Label{Text="Personel",AutoSize=true,Padding=new Padding(8,8,2,0)}); top.Controls.Add(ePerson); top.Controls.Add(new Label{Text="İşlem",AutoSize=true,Padding=new Padding(8,8,2,0)}); top.Controls.Add(eSide);
        root.Controls.Add(top,0,0); root.SetColumnSpan(top,3); root.Controls.Add(ePeopleList,0,1); root.Controls.Add(eDayList,1,1); root.Controls.Add(eGrid,2,1);
        var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.LeftToRight,WrapContents=false,Padding=new Padding(4,6,4,2)}; actions.Controls.Add(WideBtn("Tüm Aktifleri Seç",CheckAllEPeople,135)); actions.Controls.Add(WideBtn("Tüm Günleri Seç",CheckAllEDays,130)); actions.Controls.Add(WideBtn("Hafta Sonu Hariç",CheckEWeekdays,145)); actions.Controls.Add(WideBtn("E Önizleme",PreviewBulkE,115)); actions.Controls.Add(WideBtn("E Uygula",ApplyBulkE,110)); root.Controls.Add(actions,0,2); root.SetColumnSpan(actions,3); return root;
    }
    Control BuildEHistory()
    {
        var p=new Panel{Dock=DockStyle.Fill}; var bar=new FlowLayoutPanel{Dock=DockStyle.Top,Height=46};
        bar.Controls.Add(new Label{Text="Yıl",AutoSize=true,Padding=new Padding(0,8,3,0)}); bar.Controls.Add(eHistoryYear);
        bar.Controls.Add(new Label{Text="Ay",AutoSize=true,Padding=new Padding(7,8,3,0)}); bar.Controls.Add(eHistoryMonth);
        bar.Controls.Add(new Label{Text="Personel",AutoSize=true,Padding=new Padding(7,8,3,0)}); bar.Controls.Add(eHistoryPerson);
        bar.Controls.Add(Btn("Listele",LoadEHistory)); bar.Controls.Add(Btn("İmza CSV",ExportEHistoryCsv));
        p.Controls.Add(eHistoryGrid); p.Controls.Add(bar); return p;
    }
    Control BuildPayroll()
    {
        var p=new Panel{Dock=DockStyle.Fill}; var bar=new FlowLayoutPanel{Dock=DockStyle.Top,Height=46};
        bar.Controls.Add(new Label{Text="Yıl",AutoSize=true,Padding=new Padding(0,8,3,0)}); bar.Controls.Add(payrollYear);
        bar.Controls.Add(new Label{Text="Ay",AutoSize=true,Padding=new Padding(7,8,3,0)}); bar.Controls.Add(payrollMonthNo);
        bar.Controls.Add(new Label{Text="Personel",AutoSize=true,Padding=new Padding(7,8,3,0)}); bar.Controls.Add(payrollPerson);
        bar.Controls.Add(WideBtn("Bordroyu Listele",LoadPayroll,135)); bar.Controls.Add(WideBtn("Seçili Bordroyu Düzenle",EditPayrollSelected,190));
        p.Controls.Add(payrollGrid); p.Controls.Add(bar); return p;
    }
    Control BuildPayments()
    {
        var tabs2 = new TabControl { Dock = DockStyle.Fill };
        var pay = new Panel { Dock = DockStyle.Fill };
        var payBar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44 };
        payBar.Controls.Add(new Label{Text="Yıl",AutoSize=true,Padding=new Padding(0,8,3,0)}); payBar.Controls.Add(paymentYear); payBar.Controls.Add(new Label{Text="Ay",AutoSize=true,Padding=new Padding(7,8,3,0)}); payBar.Controls.Add(paymentMonthNo); payBar.Controls.Add(new Label{Text="Personel",AutoSize=true,Padding=new Padding(7,8,3,0)}); payBar.Controls.Add(paymentPerson);
        payBar.Controls.Add(WideBtn("\u00d6demeleri Listele", LoadPayments, 145)); payBar.Controls.Add(WideBtn("Se\u00e7ili \u00d6demeyi D\u00fczenle", EditSelectedPayment, 190));
        pay.Controls.Add(paymentGrid); pay.Controls.Add(payBar);
        var adv = new Panel { Dock = DockStyle.Fill };
        var advBar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44 }; advBar.Controls.Add(new Label{Text="Yıl",AutoSize=true,Padding=new Padding(0,8,3,0)}); advBar.Controls.Add(advanceYear); advBar.Controls.Add(new Label{Text="Ay",AutoSize=true,Padding=new Padding(7,8,3,0)}); advBar.Controls.Add(advanceMonthNo); advBar.Controls.Add(new Label{Text="Personel",AutoSize=true,Padding=new Padding(7,8,3,0)}); advBar.Controls.Add(advancePerson);
        advBar.Controls.Add(WideBtn("Avanslar\u0131 Listele", LoadAdvances, 145)); advBar.Controls.Add(WideBtn("Se\u00e7ili Avans\u0131 D\u00fczenle", EditSelectedAdvance, 185));
        adv.Controls.Add(advanceGrid); adv.Controls.Add(advBar);
        tabs2.TabPages.Add(Page("\u00d6demeler", pay)); tabs2.TabPages.Add(Page("Avanslar", adv));
        return tabs2;
    }

    void LoadPayments()
    {
        if (db is null) return;
        var a = new DateTime((int)paymentYear.Value, paymentMonthNo.SelectedIndex==0?1:paymentMonthNo.SelectedIndex, 1); var b = paymentMonthNo.SelectedIndex==0?a.AddYears(1):a.AddMonths(1); var card=SelectedCard(paymentPerson);
        var q="select o.PKNO,k.AD,k.SOYAD,o.BASTAR,o.BITTAR,o.NODENEN,o.NOTARIH,o.FMODENEN,o.FMOTARIH from ODEME o inner join KIMLIK k on k.PKNO=o.PKNO where (k.ICTARIH is null or k.ICTARIH>=@TODAY) and o.BASTAR>=@A and o.BASTAR<@B"+(card is null?"":" and o.PKNO=@P")+" order by o.PKNO";paymentGrid.DataSource=card is null?db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",a),new FbParameter("@B",b)):db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",a),new FbParameter("@B",b),new FbParameter("@P",card));
    }

    void LoadAdvances()
    {
        if (db is null) return;
        var a=new DateTime((int)advanceYear.Value,advanceMonthNo.SelectedIndex==0?1:advanceMonthNo.SelectedIndex,1);var b=advanceMonthNo.SelectedIndex==0?a.AddYears(1):a.AddMonths(1);var card=SelectedCard(advancePerson);var q="select a.KOD,a.PKNO,k.AD,k.SOYAD,a.TARIH,a.MIKTAR,a.VTARIH,a.TURKOD,a.TOPMIKTAR,a.TAKSITSAYISI,a.TAKSITNO,a.ACIKLAMA from AVANS a inner join KIMLIK k on k.PKNO=a.PKNO where (k.ICTARIH is null or k.ICTARIH>=@TODAY) and a.TARIH>=@A and a.TARIH<@B"+(card is null?"":" and a.PKNO=@P")+" order by a.TARIH desc,a.KOD desc";advanceGrid.DataSource=card is null?db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",a),new FbParameter("@B",b)):db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",a),new FbParameter("@B",b),new FbParameter("@P",card));
    }

    void EditSelectedPayment()
    {
        if (db is null || paymentGrid.SelectedRows.Count != 1) { MessageBox.Show("Tek \u00f6deme sat\u0131r\u0131 se\u00e7in."); return; }
        var r = paymentGrid.SelectedRows[0]; using var f = new RecordEditForm("\u00d6deme D\u00fczenle", r, "NODENEN","NOTARIH","FMODENEN","FMOTARIH");
        if (f.ShowDialog(this) != DialogResult.OK) return;
        var card = Convert.ToString(r.Cells["PKNO"].Value) ?? ""; var bas = Convert.ToDateTime(r.Cells["BASTAR"].Value);
        db.Execute("update ODEME set NODENEN=@N,NOTARIH=@NT,FMODENEN=@F,FMOTARIH=@FT where PKNO=@P and BASTAR=@B", new FbParameter("@N",Num(f.Get("NODENEN"))), new FbParameter("@NT",DateOrDbNull(f.Get("NOTARIH"))), new FbParameter("@F",Num(f.Get("FMODENEN"))), new FbParameter("@FT",DateOrDbNull(f.Get("FMOTARIH"))), new FbParameter("@P",card), new FbParameter("@B",bas));
        LoadPayments();
    }

    void EditSelectedAdvance()
    {
        if (db is null || advanceGrid.SelectedRows.Count != 1) { MessageBox.Show("Tek avans sat\u0131r\u0131 se\u00e7in."); return; }
        var r = advanceGrid.SelectedRows[0]; using var f = new RecordEditForm("Avans Düzenle", r, "TARIH","MIKTAR","VTARIH","TURKOD","TOPMIKTAR","TAKSITSAYISI","TAKSITNO","ACIKLAMA");
        if (f.ShowDialog(this) != DialogResult.OK) return;
        var kod = Convert.ToInt32(r.Cells["KOD"].Value);
        db.Execute("update AVANS set TARIH=@T,MIKTAR=@M,VTARIH=@V,TURKOD=@TK,TOPMIKTAR=@TM,TAKSITSAYISI=@TS,TAKSITNO=@TN,ACIKLAMA=@A where KOD=@K", new FbParameter("@T",DateOrDbNull(f.Get("TARIH"))), new FbParameter("@M",Num(f.Get("MIKTAR"))), new FbParameter("@V",DateOrDbNull(f.Get("VTARIH"))), new FbParameter("@TK",IntNum(f.Get("TURKOD"))), new FbParameter("@TM",Num(f.Get("TOPMIKTAR"))), new FbParameter("@TS",IntNum(f.Get("TAKSITSAYISI"))), new FbParameter("@TN",IntNum(f.Get("TAKSITNO"))), new FbParameter("@A",f.Get("ACIKLAMA")), new FbParameter("@K",kod));
        LoadAdvances();
    }

    Control BuildAudit()
    {
        var p=new Panel{Dock=DockStyle.Fill};
        var bar=new FlowLayoutPanel{Dock=DockStyle.Top,Height=82,WrapContents=true};
        bar.Controls.Add(new Label{Text="Yıl",AutoSize=true,Padding=new Padding(0,8,3,0)}); bar.Controls.Add(auditYear);
        bar.Controls.Add(new Label{Text="Ay",AutoSize=true,Padding=new Padding(7,8,3,0)}); bar.Controls.Add(auditMonthNo);
        bar.Controls.Add(new Label{Text="Aktif Personel",AutoSize=true,Padding=new Padding(7,8,3,0)}); bar.Controls.Add(auditPerson);
        bar.Controls.Add(WideBtn("Kontrol Et",LoadAudit,100));
        bar.Controls.Add(WideBtn("Seçili Eksikleri Ekle",()=>ApplyMissingTnf(true),155));
        bar.Controls.Add(WideBtn("Tüm Eksikleri Ekle",()=>ApplyMissingTnf(false),145));
        bar.Controls.Add(WideBtn("Fazla TNF Temizle",CleanExtraTnf,145));
        bar.Controls.Add(WideBtn("Saat Farkını Düzelt",FixTimeMismatchTnf,155));
        bar.Controls.Add(WideBtn("TNF Listele",LoadTnfAudit,105));
        p.Controls.Add(auditGrid); p.Controls.Add(bar); return p;
    }
    void DetectSources()
    {
        var configured = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User);
        string[] dbCandidates = [@"D:\Hedef500\Hedef500\Data\DATABASE.GDB", @"C:\Hedef500\Data\DATABASE.GDB", configured ?? ""];
        dbPath.Text = dbCandidates.FirstOrDefault(File.Exists) ?? configured ?? "";
        var root = string.IsNullOrWhiteSpace(dbPath.Text) ? "" : Directory.GetParent(Path.GetDirectoryName(dbPath.Text) ?? "")?.FullName ?? "";
        var temp = Path.Combine(root, "Temp");
        tnfPath.Text = Directory.Exists(temp) ? Directory.GetFiles(temp, "TR*.Tnf").OrderByDescending(x => x).FirstOrDefault() ?? "" : tnfPath.Text;
        UpdateSourceStatus();
    }

    void PickDb()
    {
        using var d = new OpenFileDialog { Filter = "Firebird (*.gdb;*.fdb)|*.gdb;*.fdb|T\u00fcm dosyalar|*.*", FileName = dbPath.Text };
        if (d.ShowDialog(this) == DialogResult.OK) { dbPath.Text = d.FileName; UpdateSourceStatus(); }
    }

    void PickTnf()
    {
        using var d = new OpenFileDialog { Filter = "Terminal (*.tnf;*.txt)|*.tnf;*.txt|T\u00fcm dosyalar|*.*", FileName = tnfPath.Text };
        if (d.ShowDialog(this) == DialogResult.OK) { tnfPath.Text = d.FileName; UpdateSourceStatus(); }
    }
    void UpdateSourceStatus()
    {
        var g = File.Exists(dbPath.Text); var t = File.Exists(tnfPath.Text);
        sourceStatus.Text = $"GDB: {(g ? "HAZIR" : "YOK")}   |   TNF: {(t ? "HAZIR" : "YOK")}";
        sourceStatus.ForeColor = g ? Color.DarkGreen : Color.DarkRed;
    }

    void Connect()
    {
        try
        {
            var baseOptions = PdksOptions.FromEnvironment();
            options = baseOptions with { DatabasePath = dbPath.Text.Trim() };
            db = new FirebirdDatabase(options);
            using var c = db.OpenConnection();
            sourceStatus.Text = "Ba\u011fland\u0131: " + dbPath.Text;
            LoadPeople(); LoadIo(); LoadPayroll(); LoadPayments(); LoadAdvances(); RebuildDays(); RebuildEDays(); LoadAudit();
        }
        catch (Exception ex)
        {
            sourceStatus.Text = "Ba\u011flant\u0131 yok: " + ex.Message;
            sourceStatus.ForeColor = Color.DarkRed;
        }
    }

    void LoadPeople()
    {
        if (db is null) return;
        try
        {
            var mode = personFilter.SelectedItem?.ToString() ?? "Aktif";
            var where = mode == "Aktif" ? " where (ICTARIH is null or ICTARIH>=@TODAY)" : mode == "Pasif" ? " where ICTARIH is not null and ICTARIH<@TODAY" : "";
            var order = mode == "T\u00fcm\u00fc" ? " order by case when (ICTARIH is null or ICTARIH>=@TODAY) then 0 else 1 end, PKNO" : " order by PKNO";
            peopleGrid.DataSource = db.Query("select * from KIMLIK" + where + order, new FbParameter("@TODAY", DateTime.Today));
            var active = Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where ICTARIH is null or ICTARIH>=@TODAY", new FbParameter("@TODAY", DateTime.Today)) ?? 0);
            var passive = Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where ICTARIH is not null and ICTARIH<@TODAY", new FbParameter("@TODAY", DateTime.Today)) ?? 0);
            personSummary.Text = $"Aktif: {active}   Pasif: {passive}   Toplam: {active + passive}";
            var activeRows = db.Query("select PKNO,AD,SOYAD from KIMLIK where (ICTARIH is null or ICTARIH>=@TODAY) order by PKNO", new FbParameter("@TODAY", DateTime.Today));
            peopleList.Items.Clear(); ePeopleList.Items.Clear();
            foreach (DataRow r in activeRows.Rows)
            {
                var card = Convert.ToString(r["PKNO"]) ?? ""; var text = $"{card}  {r["AD"]} {r["SOYAD"]}";
                if (card == "00001") continue;
                peopleList.Items.Add(text, false); ePeopleList.Items.Add(text, false);
            }
            if (peopleGrid.Columns.Contains("ICTARIH")) peopleGrid.Columns["ICTARIH"].HeaderText = "\u0130\u015ften \u00c7\u0131k\u0131\u015f";
            var show = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "PKNO","SICILNO","AD","SOYAD","IGTARIH","ICTARIH","DURUM","MAAS","NSUCRET","MSUCRET","BOLUM","GOREV","BHNO","GSM" };
            foreach (DataGridViewColumn c in peopleGrid.Columns) c.Visible = show.Contains(c.Name);
            var orderCols = new[] { "PKNO","AD","SOYAD","SICILNO","BOLUM","GOREV","DURUM","IGTARIH","ICTARIH","MAAS","NSUCRET","MSUCRET","BHNO","GSM" };
            for (var i = 0; i < orderCols.Length; i++) if (peopleGrid.Columns.Contains(orderCols[i])) peopleGrid.Columns[orderCols[i]].DisplayIndex = i;
            var headers = new Dictionary<string,string> { ["PKNO"]="Kart No",["AD"]="Ad",["SOYAD"]="Soyad",["SICILNO"]="Sicil No",["BOLUM"]="Bölüm",["GOREV"]="Görev",["DURUM"]="Durum",["IGTARIH"]="İşe Giriş",["ICTARIH"]="İşten Çıkış",["MAAS"]="Maaş",["NSUCRET"]="Saat Ücreti",["MSUCRET"]="Fazla Mesai",["BHNO"]="Banka Hesap No",["GSM"]="Cep Telefonu" };
            foreach (var h in headers) if (peopleGrid.Columns.Contains(h.Key)) peopleGrid.Columns[h.Key].HeaderText = h.Value;
            foreach(var cb in new[]{ioPerson,auditPerson,ePerson,eHistoryPerson,payrollPerson,paymentPerson,advancePerson}){var old=cb.SelectedItem?.ToString();cb.Items.Clear();cb.Items.Add("Tümü");foreach(DataRow pr in activeRows.Rows)cb.Items.Add($"{pr["PKNO"]}  {pr["AD"]} {pr["SOYAD"]}");cb.SelectedItem=old is not null&&cb.Items.Contains(old)?old:"Tümü";}
            ApplyEPeriodFilter(); LoadEHistory();
            ColorPeopleRows();
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Personel"); }
    }
    void ColorPeopleRows()
    {
        foreach (DataGridViewRow row in peopleGrid.Rows)
        {
            if (row.IsNewRow) continue;
            var v = row.Cells["ICTARIH"].Value;
            var active = v is null || v == DBNull.Value || (DateTime.TryParse(Convert.ToString(v), out var d) && d.Date >= DateTime.Today);
            row.DefaultCellStyle.BackColor = active ? Color.Honeydew : Color.MistyRose;
            row.DefaultCellStyle.SelectionBackColor = active ? Color.PaleGreen : Color.LightSalmon;
            row.DefaultCellStyle.ForeColor = Color.Black;
        }
    }

    void EditSelectedPerson()
    {
        if (db is null || peopleGrid.SelectedRows.Count != 1) { MessageBox.Show("Tek personel se\u00e7in."); return; }
        var row = peopleGrid.SelectedRows[0]; var card = Convert.ToString(row.Cells["PKNO"].Value) ?? "";
        using var f = new PersonnelEditForm(row); if (f.ShowDialog(this) != DialogResult.OK) return;
        if (MessageBox.Show($"{card} personel kart\u0131 g\u00fcncellenecek. Devam?", "Personel", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        var sets = new List<string>(); var pars = new List<FbParameter>(); var i = 0;
        foreach (var field in PersonnelEditForm.EditableFields)
        {
            var name = "@P" + i++; sets.Add(field + "=" + name); pars.Add(new FbParameter(name, PersonValue(field, f.Get(field))));
        }
        sets.Add("IGTARIH=@IG"); sets.Add("ICTARIH=@IC");
        pars.Add(new FbParameter("@IG", f.HireDate)); pars.Add(new FbParameter("@IC", f.ExitDate is DateTime ex ? ex : DBNull.Value)); pars.Add(new FbParameter("@CARD", card));
        db.Execute("update KIMLIK set " + string.Join(",", sets) + " where PKNO=@CARD", pars.ToArray());
        LoadPeople();
    }

    static object PersonValue(string field, string text)
    {
        string[] ints = ["GRUP","SERVIS","SIRKET","BOLUM","DURUM","GOREV","KULIZIN","CCKSAY"];
        string[] nums = ["MAAS","NSUCRET","MSUCRET","EMAAS","GYUCRET","GYEMUCRET"];
        string[] dates = ["DTARIH","NCVTAR","EVTAR","SGKGIRTAR"];
        if (ints.Contains(field)) return IntNum(text);
        if (nums.Contains(field)) return Num(text);
        if (dates.Contains(field)) return DateOrDbNull(text);
        return text;
    }

    static double Num(string s) => double.TryParse(s, out var v) ? v : 0;
    static int IntNum(string s) => int.TryParse(s, out var v) ? v : 0;
    static object DateOrDbNull(string s) => DateTime.TryParse(s, out var d) ? d : DBNull.Value;

    static string? SelectedCard(ComboBox cb){var s=cb.SelectedItem?.ToString();return string.IsNullOrWhiteSpace(s)||s=="Tümü"?null:s[..5];}
    void ApplyEPeriodFilter(){var y=(int)eYear.Value;var m=eMonthNo.SelectedIndex;var a=m==0?new DateTime(y,1,1):new DateTime(y,m,1);var b=m==0?a.AddYears(1).AddDays(-1):a.AddMonths(1).AddDays(-1);eStart.Value=a;eEnd.Value=b;RebuildEDays();var card=SelectedCard(ePerson);if(card is not null)for(var i=0;i<ePeopleList.Items.Count;i++)ePeopleList.SetItemChecked(i,ePeopleList.Items[i]!.ToString()!.StartsWith(card));}
    void LoadIo()
    {
        if (db is null) return;
        try
        {
            var y=(int)ioYear.Value;var m=ioMonthNo.SelectedIndex;var a=m==0?new DateTime(y,1,1):new DateTime(y,m,1);var b=m==0?a.AddYears(1):a.AddMonths(1);var card=SelectedCard(ioPerson);
            var q="select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR from GIRCIK g inner join KIMLIK k on k.PKNO=g.PKNO where (k.ICTARIH is null or k.ICTARIH>=@TODAY) and ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))"+(card is null?"":" and g.PKNO=@P")+" order by coalesce(g.GTARIH,g.CTARIH),g.PKNO";
            ioGrid.DataSource=card is null?db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",a),new FbParameter("@B",b)):db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",a),new FbParameter("@B",b),new FbParameter("@P",card));
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Giri\u015f-\u00c7\u0131k\u0131\u015f"); }
    }

    void LoadPayroll()
    {
        if (db is null) return;
        try
        {
            var a = new DateTime((int)payrollYear.Value, payrollMonthNo.SelectedIndex==0?1:payrollMonthNo.SelectedIndex, 1);
            var b = payrollMonthNo.SelectedIndex==0 ? a.AddYears(1) : a.AddMonths(1);
            var card = SelectedCard(payrollPerson);
            var q = "select u.*,k.AD,k.SOYAD from UCRETLER u inner join KIMLIK k on k.PKNO=u.PKNO where (k.ICTARIH is null or k.ICTARIH>=@TODAY) and u.BASTAR>=@A and u.BASTAR<@B" + (card is null ? "" : " and u.PKNO=@P") + " order by u.PKNO";
            payrollGrid.DataSource = card is null
                ? db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",a),new FbParameter("@B",b))
                : db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",a),new FbParameter("@B",b),new FbParameter("@P",card));
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Bordro"); }
    }
    void RebuildDays()
    {
        dayList.Items.Clear(); if (rangeEnd.Value.Date < rangeStart.Value.Date) return;
        for (var d = rangeStart.Value.Date; d <= rangeEnd.Value.Date; d = d.AddDays(1)) dayList.Items.Add(new DayChoice(d), true);
    }

    void CheckAllPeople() { for (var i = 0; i < peopleList.Items.Count; i++) peopleList.SetItemChecked(i, true); }
    void CheckAllDays() { for (var i=0;i<dayList.Items.Count;i++) dayList.SetItemChecked(i,true); }
    void CheckWeekdays(){ for(var i=0;i<dayList.Items.Count;i++){var d=((DayChoice)dayList.Items[i]).Date.DayOfWeek; dayList.SetItemChecked(i,d!=DayOfWeek.Saturday&&d!=DayOfWeek.Sunday);} }


    void RebuildEDays()
    {
        eDayList.Items.Clear(); if (eEnd.Value.Date < eStart.Value.Date) return;
        for (var d = eStart.Value.Date; d <= eEnd.Value.Date; d = d.AddDays(1)) eDayList.Items.Add(new DayChoice(d), true);
    }

    void CheckAllEPeople() { for (var i = 0; i < ePeopleList.Items.Count; i++) ePeopleList.SetItemChecked(i, true); }
    void CheckAllEDays() { for(var i=0;i<eDayList.Items.Count;i++) eDayList.SetItemChecked(i,true); }
    void CheckEWeekdays(){ for(var i=0;i<eDayList.Items.Count;i++){var d=((DayChoice)eDayList.Items[i]).Date.DayOfWeek; eDayList.SetItemChecked(i,d!=DayOfWeek.Saturday&&d!=DayOfWeek.Sunday);} }

    void PreviewBulkE()
    {
        try { eGrid.DataSource = BuildBulkEPreview(); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "E \u00d6nizleme", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    DataTable BuildBulkEPreview()
    {
        if (db is null) throw new InvalidOperationException("Veritaban\u0131 ba\u011fl\u0131 de\u011fil.");
        var cards = ePeopleList.CheckedItems.Cast<string>().Select(x => x[..5]).ToHashSet();
        var days = eDayList.CheckedItems.Cast<DayChoice>().Select(x => x.Date).ToHashSet();
        if (cards.Count == 0 || days.Count == 0) throw new InvalidOperationException("Personel ve g\u00fcn se\u00e7in.");
        var a = days.Min(); var b = days.Max().AddDays(1);
        var src = db.Query("select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO where g.GTARIH>=@A and g.GTARIH<@B order by g.GTARIH,g.PKNO", new FbParameter("@A",a), new FbParameter("@B",b));
        var lines = File.Exists(tnfPath.Text) ? File.ReadAllLines(tnfPath.Text).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray() : [];
        var t = new DataTable();
        foreach (var c in new[]{"SIRA","Kart No","Ad Soyad","Tarih","Taraf","Saat","Mevcut Tür","TNF Aday","Durum"}) t.Columns.Add(c);
        var mode = eSide.SelectedIndex;
        foreach (DataRow r in src.Rows)
        {
            var card = Convert.ToString(r["PKNO"]) ?? "";
            if (!cards.Contains(card)) continue;
            var day = Convert.ToDateTime(r["GTARIH"]).Date; if (!days.Contains(day)) continue;
            var name = $"{r["AD"]} {r["SOYAD"]}".Trim();
            if ((mode == 0 || mode == 2) && r["GSAAT"] != DBNull.Value && !string.IsNullOrWhiteSpace(Convert.ToString(r["GSAAT"])) && Convert.ToString(r["GTUR"]) != "E")
                AddEPreviewRow(t, lines, r, card, name, day, true);
            if ((mode == 1 || mode == 2) && r["CSAAT"] != DBNull.Value && !string.IsNullOrWhiteSpace(Convert.ToString(r["CSAAT"])) && Convert.ToString(r["CTUR"]) != "E")
                AddEPreviewRow(t, lines, r, card, name, day, false);
        }
        return t;
    }

    void AddEPreviewRow(DataTable t, string[] lines, DataRow r, string card, string name, DateTime day, bool entry)
    {
        var time = Convert.ToString(r[entry ? "GSAAT" : "CSAAT"]) ?? "";
        var type = Convert.ToString(r[entry ? "GTUR" : "CTUR"]) ?? "";
        var same = lines.Where(x => SameTnfSide(x, card, day, entry)).ToArray();
        var exact = same.Where(x => x.Split(',').Length > 1 && x.Split(',')[1] == time).ToArray();
        var candidates = exact.Length > 0 ? exact : same;
        var status = exact.Length == 1 ? "Haz\u0131r - tam e\u015fle\u015fme" : candidates.Length == 0 ? "Haz\u0131r - TNF yok" : candidates.Length == 1 ? "Haz\u0131r - tek taraf aday\u0131" : "\u00c7AKI\u015eMA";
        t.Rows.Add(r["SIRA"], card, name, day.ToString("dd.MM.yyyy"), entry ? "Giri\u015f" : "\u00c7\u0131k\u0131\u015f", time, type, string.Join(" | ", candidates), status);
    }
    void ApplyBulkE()
    {
        if (db is null) return;
        DataTable preview;
        try { preview = BuildBulkEPreview(); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "E \u0130\u015flemleri"); return; }
        if (preview.Rows.Count == 0) { MessageBox.Show("E'ye \u00e7evrilecek normal kay\u0131t bulunamad\u0131."); return; }
        if (preview.AsEnumerable().Any(r => Convert.ToString(r["Durum"]) == "\u00c7AKI\u015eMA")) { MessageBox.Show("\u00c7ak\u0131\u015fmal\u0131 TNF sat\u0131r\u0131 var. Uygulama durduruldu.", "E \u0130\u015flemleri", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (!File.Exists(tnfPath.Text)) { MessageBox.Show("TNF dosyas\u0131n\u0131 se\u00e7in."); return; }
        if (MessageBox.Show($"{preview.Rows.Count} taraf E yap\u0131lacak ve TNF kar\u015f\u0131l\u0131klar\u0131 temizlenecek. Devam?", "Toplu E", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        var backup = tnfPath.Text + ".bak_Ebulk_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
        File.Copy(tnfPath.Text, backup, true);
        var lines = File.ReadAllLines(tnfPath.Text).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        using var c = db.OpenConnection(); using var tx = c.BeginTransaction();
        try
        {
            foreach (DataRow r in preview.Rows)
            {
                var sira = Convert.ToInt32(r["SIRA"]); var card = Convert.ToString(r["Kart No"])!; var day = DateTime.ParseExact(Convert.ToString(r["Tarih"])!, "dd.MM.yyyy", null);
                var entry = Convert.ToString(r["Taraf"]) == "Giri\u015f"; var time = Convert.ToString(r["Saat"])!;
                Exec(c, tx, entry ? "update GIRCIK set GTUR='E' where SIRA=@S" : "update GIRCIK set CTUR='E' where SIRA=@S", new FbParameter("@S", sira));
                var same = lines.Select((x,i)=>(x,i)).Where(z => SameTnfSide(z.x, card, day, entry)).ToList();
                var exact = same.Where(z => z.x.Split(',').Length > 1 && z.x.Split(',')[1] == time).ToList();
                var chosen = exact.Count == 1 ? exact : same.Count == 1 ? same : [];
                if (chosen.Count == 1) lines.Remove(chosen[0].x);
            }
            File.WriteAllLines(tnfPath.Text, lines);
            tx.Commit(); eGrid.DataSource = BuildBulkEPreview(); LoadIo(); LoadAudit();
            MessageBox.Show($"Toplu E tamamland\u0131. TNF yede\u011fi: {backup}", "HKN PDKS");
        }
        catch (Exception ex)
        {
            try { tx.Rollback(); } catch { } File.Copy(backup, tnfPath.Text, true);
            MessageBox.Show(ex.Message, "Toplu E", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void PreviewBulk()
    {
        try { bulkGrid.DataSource = BuildBulkPreview(); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Toplu \u00d6nizleme", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    DataTable BuildBulkPreview()
    {
        var cards = peopleList.CheckedItems.Cast<string>().Select(x => x[..5]).OrderBy(x => x).ToList();
        var days = dayList.CheckedItems.Cast<DayChoice>().Select(x => x.Date).OrderBy(x => x).ToList();
        if (cards.Count == 0 || days.Count == 0) throw new InvalidOperationException("Personel ve g\u00fcn se\u00e7in.");
        var inA = ToMinute(inMin.Text); var inB = ToMinute(inMax.Text);
        var outA = ToMinute(outMin.Text); var outB = ToMinute(outMax.Text);
        if (inB < inA || outB < outA) throw new InvalidOperationException("Saat aral\u0131\u011f\u0131 hatal\u0131.");
        if (inB - inA + 1 < cards.Count || outB - outA + 1 < cards.Count)
            throw new InvalidOperationException($"Saat aral\u0131\u011f\u0131 dar. Personel: {cards.Count}, giri\u015f slotu: {inB-inA+1}, \u00e7\u0131k\u0131\u015f slotu: {outB-outA+1}.");
        var t = new DataTable(); t.Columns.Add("Kart No"); t.Columns.Add("Tarih", typeof(DateTime)); t.Columns.Add("Giri\u015f"); t.Columns.Add("\u00c7\u0131k\u0131\u015f");
        foreach (var day in days)
        {
            var ins = ShuffledMinutes(inA, inB, day, 17); var outs = ShuffledMinutes(outA, outB, day, 71);
            for (var i = 0; i < cards.Count; i++) t.Rows.Add(cards[i], day, FromMinute(ins[i]), FromMinute(outs[i]));
        }
        return t;
    }
    static int ToMinute(string text)
    {
        if (!TimeSpan.TryParse(text, out var t)) throw new InvalidOperationException("Saat bi\u00e7imi HH:mm olmal\u0131.");
        return (int)t.TotalMinutes;
    }
    static string FromMinute(int minute) => $"{minute / 60:00}:{minute % 60:00}";

    static List<int> ShuffledMinutes(int min, int max, DateTime day, int salt)
    {
        var list = Enumerable.Range(min, max - min + 1).ToList();
        var rng = new Random(HashCode.Combine(day.Year, day.DayOfYear, salt));
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1); (list[i], list[j]) = (list[j], list[i]);
        }
        return list;
    }

    static object? Scalar(FbConnection c, FbTransaction tx, string sql, params FbParameter[] p)
    {
        using var cmd = FirebirdDatabase.CreateCommand(c, tx, sql, p); return cmd.ExecuteScalar();
    }

    static int Exec(FbConnection c, FbTransaction tx, string sql, params FbParameter[] p)
    {
        using var cmd = FirebirdDatabase.CreateCommand(c, tx, sql, p); return cmd.ExecuteNonQuery();
    }
    void ApplyBulk()
    {
        if (db is null) return;
        DataTable preview;
        try { preview = BuildBulkPreview(); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Toplu \u0130\u015flem"); return; }
        if (!File.Exists(tnfPath.Text)) { MessageBox.Show("TNF dosyas\u0131n\u0131 se\u00e7in.", "Toplu \u0130\u015flem"); return; }
        if (MessageBox.Show($"{preview.Rows.Count} ki\u015fi/g\u00fcn kayd\u0131 uygulanacak. Mevcut dolu giri\u015f-\u00e7\u0131k\u0131\u015flar korunur. Devam?", "Toplu \u0130\u015flem", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

        var backup = tnfPath.Text + ".bak_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
        var temp = tnfPath.Text + ".tmp_quick";
        File.Copy(tnfPath.Text, backup, true);
        var lines = File.ReadAllLines(tnfPath.Text).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        var existing = new HashSet<string>(lines, StringComparer.OrdinalIgnoreCase);
        using var c = db.OpenConnection(); using var tx = c.BeginTransaction();
        try
        {
            var next = Convert.ToInt32(Scalar(c, tx, "select coalesce(max(SIRA),0)+1 from GIRCIK") ?? 1);
            foreach (DataRow r in preview.Rows)
            {
                var card = Convert.ToString(r["Kart No"])!; var day = Convert.ToDateTime(r["Tarih"]).Date;
                var gi = Convert.ToString(r["Giri\u015f"])!; var co = Convert.ToString(r["\u00c7\u0131k\u0131\u015f"])!;
                using var find = FirebirdDatabase.CreateCommand(c, tx, "select first 1 SIRA,GSAAT,CSAAT from GIRCIK where PKNO=@P and GTARIH>=@D and GTARIH<@N order by SIRA",
                    new FbParameter("@P", card), new FbParameter("@D", day), new FbParameter("@N", day.AddDays(1)));
                using var rd = find.ExecuteReader(); int? sira = null; string oldG = "", oldC = "";
                if (rd.Read()) { sira = Convert.ToInt32(rd[0]); oldG = Convert.ToString(rd[1]) ?? ""; oldC = Convert.ToString(rd[2]) ?? ""; }
                rd.Close();
                var addG = string.IsNullOrWhiteSpace(oldG); var addC = string.IsNullOrWhiteSpace(oldC);
                if (sira is null)
                {
                    Exec(c, tx, "insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,CTARIH,CSAAT,CDAKIKA) values (@S,@P,@D,@G,@GD,@D,@C,@CD)",
                        new FbParameter("@S", next), new FbParameter("@P", card), new FbParameter("@D", day), new FbParameter("@G", gi), new FbParameter("@GD", ToMinute(gi)), new FbParameter("@C", co), new FbParameter("@CD", ToMinute(co)));
                    next++; addG = addC = true;
                }
                else
                {
                    if (addG) Exec(c, tx, "update GIRCIK set GTARIH=@D,GSAAT=@G,GDAKIKA=@M,GTUR=null where SIRA=@S", new FbParameter("@D", day), new FbParameter("@G", gi), new FbParameter("@M", ToMinute(gi)), new FbParameter("@S", sira.Value));
                    if (addC) Exec(c, tx, "update GIRCIK set CTARIH=@D,CSAAT=@C,CDAKIKA=@M,CTUR=null where SIRA=@S", new FbParameter("@D", day), new FbParameter("@C", co), new FbParameter("@M", ToMinute(co)), new FbParameter("@S", sira.Value));
                }
                if (addG) { var line = $"{card},{gi},{day:ddMMyy},1,001"; if (existing.Add(line)) lines.Add(line); }
                if (addC) { var line = $"{card},{co},{day:ddMMyy},1,001"; if (existing.Add(line)) lines.Add(line); }
            }
            File.WriteAllLines(temp, SortTnf(lines));
            File.Move(temp, tnfPath.Text, true);
            try { tx.Commit(); }
            catch { File.Copy(backup, tnfPath.Text, true); throw; }
            bulkGrid.DataSource = preview; LoadIo(); LoadAudit();
            MessageBox.Show($"Toplu i\u015flem tamamland\u0131. TNF yede\u011fi: {backup}", "HKN PDKS");
        }
        catch (Exception ex)
        {
            try { tx.Rollback(); } catch { }
            if (File.Exists(temp)) File.Delete(temp);
            MessageBox.Show(ex.Message, "Toplu \u0130\u015flem", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static IEnumerable<string> SortTnf(IEnumerable<string> lines) =>
        lines.OrderBy(x => TnfKey(x).date).ThenBy(x => TnfKey(x).time).ThenBy(x => TnfKey(x).card);

    static (DateTime date, TimeSpan time, string card) TnfKey(string line)
    {
        try
        {
            var p = line.Split(','); if (p.Length < 3) return (DateTime.MaxValue, TimeSpan.MaxValue, line);
            return (DateTime.ParseExact(p[2], "ddMMyy", System.Globalization.CultureInfo.InvariantCulture), TimeSpan.Parse(p[1]), p[0]);
        }
        catch { return (DateTime.MaxValue, TimeSpan.MaxValue, line); }
    }
    static bool IsEntryTime(string time) => TimeSpan.TryParse(time, out var t) && t < TimeSpan.FromHours(12);

    static bool SameTnfSide(string line, string card, DateTime day, bool entry)
    {
        var p = line.Split(',');
        if (p.Length < 3 || p[0] != card || p[2] != day.ToString("ddMMyy")) return false;
        return IsEntryTime(p[1]) == entry;
    }

    void MarkSelectedE(bool entry)
    {
        if (db is null || ioGrid.SelectedRows.Count == 0) return;
        if (!File.Exists(tnfPath.Text)) { MessageBox.Show("TNF dosyas\u0131n\u0131 se\u00e7in.", "E D\u00fczeltme"); return; }
        var selected = ioGrid.SelectedRows.Cast<DataGridViewRow>().Where(r => !r.IsNewRow).ToList();
        var lines = File.ReadAllLines(tnfPath.Text).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        var remove = new HashSet<int>();
        try
        {
            foreach (var row in selected)
            {
                var card = Convert.ToString(row.Cells["PKNO"].Value) ?? "";
                var dateObj = entry ? row.Cells["GTARIH"].Value : row.Cells["CTARIH"].Value;
                var time = Convert.ToString(entry ? row.Cells["GSAAT"].Value : row.Cells["CSAAT"].Value) ?? "";
                if (dateObj is null || dateObj == DBNull.Value || string.IsNullOrWhiteSpace(time)) throw new InvalidOperationException($"{card}: seçilen tarafta tarih/saat yok.");
                var day = Convert.ToDateTime(dateObj).Date;
                var sameSide = lines.Select((x, i) => (x, i)).Where(z => SameTnfSide(z.x, card, day, entry)).ToList();
                var exact = sameSide.Where(z => z.x.Split(',')[1] == time).ToList();
                var candidates = exact.Count > 0 ? exact : sameSide;
                if (candidates.Count > 1) throw new InvalidOperationException($"{card} {day:dd.MM.yyyy}: ayn\u0131 tarafta birden fazla TNF aday\u0131 var.");
                if (candidates.Count == 1) remove.Add(candidates[0].i);
            }
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "E D\u00fczeltme", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (MessageBox.Show($"{selected.Count} kay\u0131t i\u00e7in {(entry ? "giri\u015f" : "\u00e7\u0131k\u0131\u015f")} taraf\u0131 E yap\u0131lacak. TNF'deki kar\u015f\u0131l\u0131k temizlenecek. Devam?", "E D\u00fczeltme", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        var backup = tnfPath.Text + ".bak_E_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
        File.Copy(tnfPath.Text, backup, true);
        using var c = db.OpenConnection(); using var tx = c.BeginTransaction();
        try
        {
            foreach (var row in selected)
            {
                var sira = Convert.ToInt32(row.Cells["SIRA"].Value);
                Exec(c, tx, entry ? "update GIRCIK set GTUR='E' where SIRA=@S" : "update GIRCIK set CTUR='E' where SIRA=@S", new FbParameter("@S", sira));
            }
            var kept = lines.Where((_, i) => !remove.Contains(i)).ToArray();
            File.WriteAllLines(tnfPath.Text, kept);
            try { tx.Commit(); }
            catch { File.Copy(backup, tnfPath.Text, true); throw; }
            LoadIo(); LoadAudit();
            MessageBox.Show($"E i\u015flemi tamamland\u0131. TNF'den {remove.Count} sat\u0131r temizlendi. Yedek: {backup}", "HKN PDKS");
        }
        catch (Exception ex)
        {
            try { tx.Rollback(); } catch { }
            File.Copy(backup, tnfPath.Text, true);
            MessageBox.Show(ex.Message, "E D\u00fczeltme", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void LoadEHistory()
    {
        if(db is null)return; var y=(int)eHistoryYear.Value;var m=eHistoryMonth.SelectedIndex;var a=m==0?new DateTime(y,1,1):new DateTime(y,m,1);var b=m==0?a.AddYears(1):a.AddMonths(1);var card=SelectedCard(eHistoryPerson);
        var q="select g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR from GIRCIK g inner join KIMLIK k on k.PKNO=g.PKNO where (k.ICTARIH is null or k.ICTARIH>=@TODAY) and (g.GTUR='E' or g.CTUR='E') and ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))"+(card is null?"":" and g.PKNO=@P")+" order by coalesce(g.GTARIH,g.CTARIH),g.PKNO";
        var rows=card is null?db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",a),new FbParameter("@B",b)):db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",a),new FbParameter("@B",b),new FbParameter("@P",card)); var t=new DataTable(); foreach(var c in new[]{"Kart No","Ad Soyad","Tarih","Gün","Taraf","Saat","Dönem","İmza"})t.Columns.Add(c);
        foreach(DataRow r in rows.Rows){if(Convert.ToString(r["GTUR"])=="E"&&r["GTARIH"]!=DBNull.Value){var d=Convert.ToDateTime(r["GTARIH"]);t.Rows.Add(r["PKNO"],$"{r["AD"]} {r["SOYAD"]}",d.ToString("dd.MM.yyyy"),d.ToString("dddd",new System.Globalization.CultureInfo("tr-TR")),"Giriş",r["GSAAT"],"Sabah","");}if(Convert.ToString(r["CTUR"])=="E"&&r["CTARIH"]!=DBNull.Value){var d=Convert.ToDateTime(r["CTARIH"]);t.Rows.Add(r["PKNO"],$"{r["AD"]} {r["SOYAD"]}",d.ToString("dd.MM.yyyy"),d.ToString("dddd",new System.Globalization.CultureInfo("tr-TR")),"Çıkış",r["CSAAT"],"Akşam","");}} eHistoryGrid.DataSource=t;
    }
    void ExportEHistoryCsv(){if(eHistoryGrid.DataSource is not DataTable t||t.Rows.Count==0){MessageBox.Show("Çıktı için kayıt yok.");return;}var path=Path.Combine(AppContext.BaseDirectory,$"E_IMZA_{(int)eHistoryYear.Value}_{eHistoryMonth.SelectedIndex:00}.csv");var lines=new List<string>{string.Join(";",t.Columns.Cast<DataColumn>().Select(c=>c.ColumnName))};foreach(DataRow r in t.Rows)lines.Add(string.Join(";",r.ItemArray.Select(x=>Convert.ToString(x)?.Replace(";",",")??"")));File.WriteAllLines(path,lines,System.Text.Encoding.UTF8);MessageBox.Show("İmza çıktısı hazır:\n"+path);}

    void LoadTnfAudit()
    {
        try
        {
            var y=(int)auditYear.Value; var m=auditMonthNo.SelectedIndex; var filterCard=SelectedCard(auditPerson);
            var yf=Path.Combine(Path.GetDirectoryName(tnfPath.Text)??"",$"TR{y}.Tnf"); var src=File.Exists(yf)?yf:tnfPath.Text;
            var t=new DataTable(); foreach(var c in new[]{"Kart No","Ad Soyad","Tarih","Gün","Saat","Taraf","Ham TNF"}) t.Columns.Add(c);
            if(!File.Exists(src)){ t.Rows.Add("","","","","","","TNF dosyası yok: "+src); auditGrid.DataSource=t; return; }
            var names=new Dictionary<string,string>(); if(db is not null){var pr=db.Query("select PKNO,AD,SOYAD from KIMLIK where ICTARIH is null or ICTARIH>=@TODAY",new FbParameter("@TODAY",DateTime.Today)); foreach(DataRow r in pr.Rows) names[Convert.ToString(r["PKNO"])??""]=$"{r["AD"]} {r["SOYAD"]}".Trim();}
            foreach(var line in File.ReadLines(src))
            {
                if(string.IsNullOrWhiteSpace(line)) continue; var a=line.Split(','); if(a.Length<3) continue; var card=a[0].Trim(); if(!names.ContainsKey(card)) continue; if(filterCard is not null&&card!=filterCard) continue;
                if(!DateTime.TryParseExact(a[2].Trim(),"ddMMyy",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out var d)) continue; if(d.Year!=y) continue; if(m!=0&&d.Month!=m) continue;
                var tm=a[1].Trim(); var side=TimeOnly.TryParse(tm,out var ti)&&ti.Hour<12?"Giriş / Sabah":"Çıkış / Akşam";
                t.Rows.Add(card,names.TryGetValue(card,out var n)?n:"",d.ToString("dd.MM.yyyy"),d.ToString("dddd",new System.Globalization.CultureInfo("tr-TR")),tm,side,line);
            }
            auditGrid.DataSource=t;
        }
        catch(Exception ex){MessageBox.Show(ex.Message,"TNF Listeleme");}
    }

    void LoadAudit()
    {
        if (db is null) return;
        try
        {
            var y = (int)auditYear.Value; var m = auditMonthNo.SelectedIndex;
            var start = m == 0 ? new DateTime(y,1,1) : new DateTime(y,m,1);
            var end = m == 0 ? start.AddYears(1) : start.AddMonths(1);
            var filterCard = SelectedCard(auditPerson);
            var yf = Path.Combine(Path.GetDirectoryName(tnfPath.Text) ?? "", $"TR{y}.Tnf");
            var src = File.Exists(yf) ? yf : tnfPath.Text;
            var lines = File.Exists(src) ? File.ReadAllLines(src).Where(x => !string.IsNullOrWhiteSpace(x)).ToList() : new List<string>();
            var activeCards = db.Query("select PKNO from KIMLIK where ICTARIH is null or ICTARIH>=@TODAY", new FbParameter("@TODAY",DateTime.Today)).AsEnumerable().Select(r=>Convert.ToString(r["PKNO"])??"").ToHashSet(StringComparer.OrdinalIgnoreCase);
            var q = "select g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR from GIRCIK g inner join KIMLIK k on k.PKNO=g.PKNO where (k.ICTARIH is null or k.ICTARIH>=@TODAY) and ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))" + (filterCard is null ? "" : " and g.PKNO=@P") + " order by coalesce(g.GTARIH,g.CTARIH),g.PKNO";
            var rows = filterCard is null ? db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",start),new FbParameter("@B",end)) : db.Query(q,new FbParameter("@TODAY",DateTime.Today),new FbParameter("@A",start),new FbParameter("@B",end),new FbParameter("@P",filterCard));
            var t = new DataTable();
            foreach (var c in new[]{"Kart No","Ad Soyad","Tarih","Gün","Taraf","Saat","Tür","TNF Karşılığı","Durum","İşlem"}) t.Columns.Add(c);
            var systemKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (DataRow r in rows.Rows)
            {
                var card = Convert.ToString(r["PKNO"]) ?? "";
                var name = $"{r["AD"]} {r["SOYAD"]}".Trim();
                AuditSystemSide(t, systemKeys, lines, card, name, r["GTARIH"], r["GSAAT"], Convert.ToString(r["GTUR"]) ?? "", true);
                AuditSystemSide(t, systemKeys, lines, card, name, r["CTARIH"], r["CSAAT"], Convert.ToString(r["CTUR"]) ?? "", false);
            }
            foreach (var line in lines)
            {
                var p = line.Split(','); if (p.Length < 3) continue;
                var card = p[0].Trim(); if (!activeCards.Contains(card)) continue; if (filterCard is not null && card != filterCard) continue;
                if (!DateTime.TryParseExact(p[2].Trim(), "ddMMyy", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d) || d < start || d >= end) continue;
                var entry = IsEntryTime(p[1].Trim());
                var key = $"{card}|{d:yyyyMMdd}|{(entry ? "G" : "C")}"; if (systemKeys.Contains(key)) continue;
                var nm = "";
                var pr = db.Query("select AD,SOYAD from KIMLIK where PKNO=@P", new FbParameter("@P",card));
                if (pr.Rows.Count > 0) nm = $"{pr.Rows[0]["AD"]} {pr.Rows[0]["SOYAD"]}".Trim();
                t.Rows.Add(card,nm,d.ToString("dd.MM.yyyy"),d.ToString("dddd",new System.Globalization.CultureInfo("tr-TR")),entry?"Giriş / Sabah":"Çıkış / Akşam",p[1].Trim(),"TNF",line,"UYUMSUZ - SİSTEMDE YOK","İNCELE");
            }
            auditGrid.DataSource = t;
            ColorAuditRows();
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Data Kontrol"); }
    }

    void AuditSystemSide(DataTable t, HashSet<string> systemKeys, List<string> lines, string card, string name, object dateObj, object timeObj, string tur, bool entry)
    {
        if(dateObj is null||dateObj==DBNull.Value)return; var time=Convert.ToString(timeObj)?.Trim()??""; if(string.IsNullOrWhiteSpace(time))return;
        var d=Convert.ToDateTime(dateObj).Date; var key=$"{card}|{d:yyyyMMdd}|{(entry?"G":"C")}"; systemKeys.Add(key);
        var same=lines.Where(x=>SameTnfSide(x,card,d,entry)).ToList(); var exact=same.Where(x=>x.Split(',').Length>1&&x.Split(',')[1].Trim()==time).ToList();
        var side=entry?"Giriş / Sabah":"Çıkış / Akşam"; var day=d.ToString("dddd",new System.Globalization.CultureInfo("tr-TR")); var isE=string.Equals(tur,"E",StringComparison.OrdinalIgnoreCase);
        if(isE){ if(same.Count==0)t.Rows.Add(card,name,d.ToString("dd.MM.yyyy"),day,side,time,"E","","UYUMLU - E / TNF YOK","YOK"); else t.Rows.Add(card,name,d.ToString("dd.MM.yyyy"),day,side,time,"E",string.Join(" | ",same),"UYUMSUZ - E AMA TNF VAR","TNF SİL E"); return; }
        if(exact.Count>0){ var keep=exact[0]; t.Rows.Add(card,name,d.ToString("dd.MM.yyyy"),day,side,time,"Normal",keep,"UYUMLU","YOK"); var extras=same.ToList(); extras.Remove(keep); foreach(var x in extras)t.Rows.Add(card,name,d.ToString("dd.MM.yyyy"),day,side,x.Split(',')[1].Trim(),"TNF",x,"UYUMSUZ - FAZLA TNF","TNF SİL FAZLA"); return; }
        if(same.Count==0){t.Rows.Add(card,name,d.ToString("dd.MM.yyyy"),day,side,time,"Normal","","UYUMSUZ - TNF EKSİK","TNF EKLE");return;}
        if(same.Count==1){t.Rows.Add(card,name,d.ToString("dd.MM.yyyy"),day,side,time,"Normal",same[0],"UYUMSUZ - SAAT FARKLI","TNF DÜZELT");return;}
        t.Rows.Add(card,name,d.ToString("dd.MM.yyyy"),day,side,time,"Normal",string.Join(" | ",same),"UYUMSUZ - ÇOKLU TNF / İNCELE","İNCELE");
    }

    void ColorAuditRows()
    {
        foreach (DataGridViewRow r in auditGrid.Rows)
        {
            if (r.IsNewRow) continue;
            var s = Convert.ToString(r.Cells["Durum"].Value) ?? "";
            r.DefaultCellStyle.BackColor = s.StartsWith("UYUMLU") ? Color.Honeydew : s.Contains("EKSİK") ? Color.LemonChiffon : Color.MistyRose;
            r.DefaultCellStyle.SelectionBackColor = s.StartsWith("UYUMLU") ? Color.PaleGreen : s.Contains("EKSİK") ? Color.Khaki : Color.LightSalmon;
        }
    }

    void ApplyMissingTnf(bool selectedOnly)
    {
        LoadAudit(); if(auditGrid.DataSource is not DataTable)return;
        var rows=(selectedOnly?auditGrid.SelectedRows.Cast<DataGridViewRow>().Where(r=>!r.IsNewRow):auditGrid.Rows.Cast<DataGridViewRow>().Where(r=>!r.IsNewRow)).Where(r=>Convert.ToString(r.Cells["İşlem"].Value)=="TNF EKLE").ToList();
        if(rows.Count==0){MessageBox.Show("Eklenecek eksik TNF kaydı yok.");return;} ApplyAuditRows(rows,$"{rows.Count} eksik TNF kaydı eklenecek.");
    }
    void CleanExtraTnf()
    {
        LoadAudit(); if(auditGrid.DataSource is not DataTable)return; var rows=auditGrid.Rows.Cast<DataGridViewRow>().Where(r=>!r.IsNewRow&&(Convert.ToString(r.Cells["İşlem"].Value)=="TNF SİL FAZLA"||Convert.ToString(r.Cells["İşlem"].Value)=="TNF SİL E")).ToList();
        if(rows.Count==0){MessageBox.Show("Temizlenecek fazla TNF kaydı yok.");return;} ApplyAuditRows(rows,$"{rows.Count} fazla/E TNF kaydı temizlenecek.");
    }
    void FixTimeMismatchTnf()
    {
        LoadAudit(); if(auditGrid.DataSource is not DataTable)return;
        var rows=auditGrid.Rows.Cast<DataGridViewRow>().Where(r=>!r.IsNewRow&&Convert.ToString(r.Cells["İşlem"].Value)=="TNF DÜZELT").ToList();
        if(rows.Count==0){MessageBox.Show("Düzeltilecek tekil saat farkı yok.");return;}
        ApplyAuditRows(rows,$"{rows.Count} saat farkı sistemdeki saate göre düzeltilecek.");
    }

    void ApplyAuditRows(List<DataGridViewRow> rows,string message)
    {
        var y=(int)auditYear.Value; var src=Path.Combine(Path.GetDirectoryName(tnfPath.Text)??"",$"TR{y}.Tnf"); if(!File.Exists(src))src=tnfPath.Text; if(!File.Exists(src)){MessageBox.Show("TNF dosyası bulunamadı.");return;}
        if(MessageBox.Show(message+" Yedek alınacak. Devam?","Data Kontrol",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return; var backup=src+".bak_AUDIT_"+DateTime.Now.ToString("yyyyMMdd_HHmmss");File.Copy(src,backup,true);var lines=File.ReadAllLines(src).Where(x=>!string.IsNullOrWhiteSpace(x)).ToList();
        foreach(var r in rows){var card=Convert.ToString(r.Cells["Kart No"].Value)??"";var d=DateTime.ParseExact(Convert.ToString(r.Cells["Tarih"].Value)??"","dd.MM.yyyy",System.Globalization.CultureInfo.InvariantCulture);var entry=(Convert.ToString(r.Cells["Taraf"].Value)??"").StartsWith("Giriş",StringComparison.OrdinalIgnoreCase);var time=Convert.ToString(r.Cells["Saat"].Value)??"";var op=Convert.ToString(r.Cells["İşlem"].Value)??"";
            if(op=="TNF EKLE")lines.Add($"{card},{time},{d:ddMMyy},1,001"); else if(op=="TNF SİL E")lines=lines.Where(x=>!SameTnfSide(x,card,d,entry)).ToList(); else if(op=="TNF SİL FAZLA"){var raw=Convert.ToString(r.Cells["TNF Karşılığı"].Value)??"";var ix=lines.FindIndex(x=>string.Equals(x,raw,StringComparison.OrdinalIgnoreCase));if(ix>=0)lines.RemoveAt(ix);} else if(op=="TNF DÜZELT"){lines=lines.Where(x=>!SameTnfSide(x,card,d,entry)).ToList();lines.Add($"{card},{time},{d:ddMMyy},1,001");}}
        File.WriteAllLines(src,SortTnf(lines));LoadAudit();MessageBox.Show("İşlem tamamlandı. Yedek: "+backup);
    }

    void EditPayrollSelected()
    {
        if (db is null || payrollGrid.SelectedRows.Count != 1) { MessageBox.Show("Tek bordro sat\u0131r\u0131 se\u00e7in."); return; }
        var row = payrollGrid.SelectedRows[0]; var card = Convert.ToString(row.Cells["PKNO"].Value) ?? ""; var startDate = Convert.ToDateTime(row.Cells["BASTAR"].Value);
        using var f = new PayrollEditForm(card, row); if (f.ShowDialog(this) != DialogResult.OK) return;
        if (MessageBox.Show($"{card} bordro kayd\u0131 g\u00fcncellenecek. Devam?", "Bordro", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        var sets = new List<string>(); var pars = new List<FbParameter>(); var i = 0;
        foreach (var field in PayrollEditForm.Fields)
        {
            var name = "@V" + i++; sets.Add(field + "=" + name); pars.Add(new FbParameter(name, PayrollValue(field, f.Get(field))));
        }
        pars.Add(new FbParameter("@P", card)); pars.Add(new FbParameter("@B", startDate));
        db.Execute("update UCRETLER set " + string.Join(",", sets) + " where PKNO=@P and BASTAR=@B", pars.ToArray());
        LoadPayroll();
    }

    static object PayrollValue(string field, string text)
    {
        string[] textFields = ["DEVS","DEVCEZAS","ERS","ERCEZAS","GECS","GECCEZAS","EKS","EKCEZAS","AYS","NCSAAT","FMSAAT","TOPEKS","MESAIKESINTIS"];
        if (field.StartsWith("SAAT", StringComparison.OrdinalIgnoreCase) || textFields.Contains(field)) return text;
        if (field is "SSKG" or "BOLUM") return IntNum(text);
        return Num(text);
    }
}
