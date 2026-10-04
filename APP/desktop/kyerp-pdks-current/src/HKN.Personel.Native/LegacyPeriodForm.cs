using System.Data;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyPeriodForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DataGridView grid = new()
    {
        ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,
        SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,
        BackgroundColor=PdksAppearance.Current.Surface,AutoGenerateColumns=false
    };
    readonly ComboBox year = new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=120};
    readonly TextBox name = new();
    readonly ComboBox group = new(){DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="AD",ValueMember="KOD"};
    readonly DateTimePicker start = new(){Format=DateTimePickerFormat.Custom,CustomFormat="dd MMMM yyyy dddd"};
    readonly DateTimePicker end = new(){Format=DateTimePickerFormat.Custom,CustomFormat="dd MMMM yyyy dddd"};
    readonly TextBox minusTime = new(), minusDay = new(), plusTime = new(), plusDay = new();
    readonly ComboBox plusArea = new(){DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="AD",ValueMember="KOD"};
    readonly ComboBox minusArea = new(){DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="AD",ValueMember="KOD"};
    readonly Label total = new(){TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",11f,FontStyle.Bold)};
    readonly Label yearSummary = new(){AutoSize=true,ForeColor=PdksAppearance.Current.Muted,Padding=new Padding(10,10,0,0)};
    readonly Button save = PdksUiKit.Button("Kaydet",100,PdksActionRole.Primary);
    int? code;
    bool adding;
    bool editing;
    bool loading;

    public LegacyPeriodForm()
    {
        Text="Dönemler";
        StartPosition=FormStartPosition.CenterScreen;
        Size=new Size(1180,720);
        MinimumSize=new Size(920,620);
        Font=new Font("Segoe UI",9f);
        BackColor=PdksAppearance.Current.Canvas;
        KeyPreview=true;
        Build();
        Shown+=(_,_)=>ReloadAll();
        KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,ColumnCount=1,Padding=new Padding(16),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,56));

        var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=1,BackColor=p.Canvas,Margin=Padding.Empty};
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,48));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,12));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,52));

        var leftCard=PdksUiKit.Card();
        var left=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(16),BackColor=p.Surface};
        left.RowStyles.Add(new RowStyle(SizeType.Absolute,38));
        left.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        left.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        left.Controls.Add(PdksUiKit.SectionTitle("Yıllık Dönemler"),0,0);

        var yearBar=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(0,8,0,0),BackColor=p.Surface};
        yearBar.Controls.Add(new Label{Text="Yıl",AutoSize=true,ForeColor=p.Muted,Font=new Font("Segoe UI",8.5f,FontStyle.Bold),Padding=new Padding(0,8,8,0)});
        yearBar.Controls.Add(year);
        yearBar.Controls.Add(yearSummary);
        left.Controls.Add(yearBar,0,1);

        grid.Dock=DockStyle.Fill;
        grid.Margin=new Padding(0,8,0,0);
        grid.BorderStyle=BorderStyle.None;
        grid.RowHeadersVisible=false;
        grid.RowTemplate.Height=31;
        grid.ColumnHeadersHeight=34;
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="AD",DataPropertyName="AD",HeaderText="Dönem",AutoSizeMode=DataGridViewAutoSizeColumnMode.Fill});
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="GRUPAD",DataPropertyName="GRUPAD",HeaderText="Grup",Width=115});
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="BASTAR",DataPropertyName="BASTAR",HeaderText="Başlangıç",Width=92,DefaultCellStyle=new DataGridViewCellStyle{Format="dd.MM.yyyy"}});
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="BITTAR",DataPropertyName="BITTAR",HeaderText="Bitiş",Width=92,DefaultCellStyle=new DataGridViewCellStyle{Format="dd.MM.yyyy"}});
        grid.SelectionChanged+=(_,_)=>{if(!editing)LoadSelected();};
        left.Controls.Add(grid,0,2);
        leftCard.Controls.Add(left);
        body.Controls.Add(leftCard,0,0);
        body.Controls.Add(new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas},1,0);

        var rightCard=PdksUiKit.Card();
        var editor=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=7,Padding=new Padding(22),BackColor=p.Surface};
        editor.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,160));
        editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        editor.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        for(var row=1;row<=5;row++)editor.RowStyles.Add(new RowStyle(SizeType.Absolute,46));
        editor.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        editor.Controls.Add(PdksUiKit.SectionTitle("Dönem Bilgileri"),0,0);
        editor.SetColumnSpan(editor.GetControlFromPosition(0,0)!,2);
        PeriodRow(editor,1,"Dönem Adı",name);
        PeriodRow(editor,2,"Çalışma Grubu",group);
        PeriodRow(editor,3,"Başlangıç",start);
        PeriodRow(editor,4,"Bitiş",end);
        PeriodRow(editor,5,"Toplam Gün",total);
        editor.Controls.Add(new Label
        {
            Text="Dönemler yıl bazında gösterilir. Çalışma grubu yalnız MESAİLİ ve İDARİ olarak tutulur.",
            Dock=DockStyle.Top,Height=54,ForeColor=p.Muted,Font=new Font("Segoe UI",8.6f),
            Padding=new Padding(0,14,0,0)
        },0,6);
        editor.SetColumnSpan(editor.GetControlFromPosition(0,6)!,2);
        rightCard.Controls.Add(editor);
        body.Controls.Add(rightCard,2,0);
        root.Controls.Add(body,0,0);

        var actions=PdksUiKit.ActionBar(true,p.Canvas);
        var add=PdksUiKit.Button("Yeni Dönem",110,PdksActionRole.Primary);
        var edit=PdksUiKit.Button("Düzenle",90,PdksActionRole.Secondary);
        var del=PdksUiKit.Button("Sil",72,PdksActionRole.Danger);
        save.Enabled=false;
        add.Click+=(_,_)=>BeginNew();
        edit.Click+=(_,_)=>BeginEdit();
        save.Click+=(_,_)=>SaveCurrent();
        del.Click+=(_,_)=>DeleteOne();
        actions.Controls.AddRange([save,del,edit,add]);
        root.Controls.Add(actions,0,1);
        Controls.Add(root);

        year.SelectedIndexChanged+=(_,_)=>{if(!loading)ReloadGrid();};
        start.ValueChanged+=(_,_)=>{UpdateTotal();SuggestName();};
        end.ValueChanged+=(_,_)=>UpdateTotal();
        group.SelectedValueChanged+=(_,_)=>SuggestName();
        SetEdit(false);
    }

    static void PeriodRow(TableLayoutPanel table,int row,string caption,Control control)
    {
        table.Controls.Add(new Label
        {
            Text=caption,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,
            ForeColor=PdksAppearance.Current.Muted,Font=new Font("Segoe UI",8.5f,FontStyle.Bold)
        },0,row);
        control.Dock=DockStyle.Fill;
        control.Margin=new Padding(0,7,0,7);
        table.Controls.Add(control,1,row);
    }

    void ReloadAll()
    {
        try
        {
            PdksCoreWorkGroups.Normalize(db);
            group.DataSource=PdksCoreWorkGroups.CanonicalTable(db);
            var bordro=db.Query("select KOD,AD from BORDRO order by KOD");
            plusArea.DataSource=bordro.Copy();
            minusArea.DataSource=bordro.Copy();
            ReloadYears();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Error,"Periods");}
    }

    void ReloadYears()
    {
        loading=true;
        try
        {
            var bounds=db.Query("select min(BASTAR) MINA,max(BASTAR) MAXA from DONEM");
            var minYear=DateTime.Today.Year;
            var maxYear=DateTime.Today.Year;
            if(bounds.Rows.Count>0)
            {
                if(bounds.Rows[0]["MINA"]!=DBNull.Value)minYear=Convert.ToDateTime(bounds.Rows[0]["MINA"]).Year;
                if(bounds.Rows[0]["MAXA"]!=DBNull.Value)maxYear=Convert.ToDateTime(bounds.Rows[0]["MAXA"]).Year;
            }
            minYear=Math.Min(minYear,DateTime.Today.Year-1);
            maxYear=Math.Max(maxYear,DateTime.Today.Year+5);
            year.Items.Clear();
            for(var y=minYear;y<=maxYear;y++)year.Items.Add(y);
            year.SelectedItem=year.Items.Contains(DateTime.Today.Year)?DateTime.Today.Year:maxYear;
        }
        finally{loading=false;}
        ReloadGrid();
    }

    int SelectedYear()=>year.SelectedItem is int y?y:DateTime.Today.Year;

    void ReloadGrid(int? preferredCode=null)
    {
        try
        {
            var y=SelectedYear();
            var a=new DateTime(y,1,1);
            var b=a.AddYears(1);
            var dt=db.Query(
                "select d.KOD,d.AD,d.BASTAR,d.BITTAR,d.ACESAAT,d.SSKACE,d.ACFSAAT,d.SSKACF,d.EBALAN,d.CBALAN,d.GRUP,g.AD GRUPAD "+
                "from DONEM d left join GRUP g on g.KOD=d.GRUP "+
                "where d.BASTAR>=@A and d.BASTAR<@B order by d.BASTAR,d.GRUP",
                new FbParameter("@A",a),new FbParameter("@B",b));
            grid.DataSource=dt;
            yearSummary.Text=$"{dt.Rows.Count:N0} dönem • {y}";
            if(grid.Rows.Count>0)
            {
                var row=preferredCode is null?grid.Rows[0]:grid.Rows.Cast<DataGridViewRow>()
                    .FirstOrDefault(r=>r.DataBoundItem is DataRowView v&&Convert.ToInt32(v.Row["KOD"])==preferredCode.Value)??grid.Rows[0];
                grid.CurrentCell=row.Cells[0];
                LoadSelected();
            }
            else
            {
                code=null;
                ClearFields();
                SetEdit(false);
                save.Enabled=false;
            }
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Periods");}
    }

    DataRow? CurrentRow()=>grid.CurrentRow?.DataBoundItem is DataRowView v?v.Row:null;

    void LoadSelected()
    {
        var r=CurrentRow();
        if(r is null)return;
        code=Convert.ToInt32(r["KOD"]);
        adding=false;
        name.Text=S(r,"AD");
        if(r["GRUP"]!=DBNull.Value)group.SelectedValue=Convert.ToInt32(r["GRUP"]);
        if(r["BASTAR"]!=DBNull.Value)start.Value=Convert.ToDateTime(r["BASTAR"]);
        if(r["BITTAR"]!=DBNull.Value)end.Value=Convert.ToDateTime(r["BITTAR"]);
        minusTime.Text=AsTime(r["ACESAAT"]);
        minusDay.Text=S(r,"SSKACE");
        plusTime.Text=AsTime(r["ACFSAAT"]);
        plusDay.Text=S(r,"SSKACF");
        SelectValue(plusArea,r["EBALAN"]);
        SelectValue(minusArea,r["CBALAN"]);
        UpdateTotal();
        SetEdit(false);
        save.Enabled=false;
    }

    static string S(DataRow r,string c)=>r[c]==DBNull.Value?"":Convert.ToString(r[c])??"";
    static string AsTime(object value){if(value==DBNull.Value)return "";var m=Convert.ToInt32(value);return $"{Math.Max(0,m)/60:00}:{Math.Max(0,m)%60:00}";}
    static void SelectValue(ComboBox c,object value){if(value!=DBNull.Value)c.SelectedValue=Convert.ToInt32(value);}

    static object ParseTime(string value)
    {
        value=value.Trim();
        if(value.Length==0)return DBNull.Value;
        var parts=value.Split(':',StringSplitOptions.TrimEntries);
        if(parts.Length==2&&int.TryParse(parts[0],out var h)&&h>=0&&int.TryParse(parts[1],out var m)&&m>=0&&m<60)return checked(h*60+m);
        if(TimeSpan.TryParse(value,out var t)&&t.TotalMinutes>=0)return (int)Math.Round(t.TotalMinutes);
        if(int.TryParse(value,out var n)&&n>=0)return n;
        throw new FormatException("Çalışma süresini SS:dd biçiminde girin.");
    }

    static object ParseDay(string value)=>string.IsNullOrWhiteSpace(value)?DBNull.Value:int.TryParse(value.Trim(),out var n)?n:throw new FormatException("Gün sayısı sayısal olmalıdır.");
    static object ComboValue(ComboBox c)=>c.SelectedValue is null||c.SelectedValue is DataRowView?DBNull.Value:Convert.ToInt32(c.SelectedValue);

    void UpdateTotal()=>total.Text=Math.Max(0,(end.Value.Date-start.Value.Date).Days+1).ToString();

    void SetEdit(bool enabled)
    {
        name.ReadOnly=!enabled;
        group.Enabled=enabled;
        start.Enabled=enabled;
        end.Enabled=enabled;
        editing=enabled;
    }

    void ClearFields()
    {
        name.Clear();
        minusTime.Clear();minusDay.Clear();plusTime.Clear();plusDay.Clear();
        var y=SelectedYear();
        var m=y==DateTime.Today.Year?DateTime.Today.Month:1;
        start.Value=new DateTime(y,m,1);
        end.Value=start.Value.AddMonths(1).AddDays(-1);
        UpdateTotal();
    }

    void BeginNew()
    {
        code=null;
        adding=true;
        ClearFields();
        if(group.Items.Count>0)group.SelectedIndex=0;
        SetEdit(true);
        save.Enabled=true;
        SuggestName(true);
        name.Focus();
    }

    void BeginEdit()
    {
        if(code is null){MessageBox.Show("Bir dönem seçin.",Text);return;}
        adding=false;
        SetEdit(true);
        save.Enabled=true;
        name.Focus();
    }

    void SuggestName(bool force=false)
    {
        if(!adding||group.SelectedItem is not DataRowView row)return;
        var suggested=$"{start.Value:yyyy} {start.Value.ToString("MMMM",new CultureInfo("tr-TR")).ToUpper(new CultureInfo("tr-TR"))} - {Convert.ToString(row["AD"])}";
        if(force||string.IsNullOrWhiteSpace(name.Text))name.Text=suggested;
    }

    void SaveCurrent()
    {
        try
        {
            var ad=name.Text.Trim();
            if(ad.Length==0)throw new InvalidOperationException("Dönem adı boş bırakılamaz.");
            if(end.Value.Date<start.Value.Date)throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");
            if(group.SelectedValue is null||group.SelectedValue is DataRowView)throw new InvalidOperationException("Çalışma grubunu seçin.");
            var g=Convert.ToInt32(group.SelectedValue);
            var dup=Convert.ToInt32(db.Scalar(
                "select count(*) from DONEM where GRUP=@G and BASTAR=@A and BITTAR=@B"+(code is null?"":" and KOD<>@K"),
                code is null
                    ?[new FbParameter("@G",g),new FbParameter("@A",start.Value.Date),new FbParameter("@B",end.Value.Date)]
                    :[new FbParameter("@G",g),new FbParameter("@A",start.Value.Date),new FbParameter("@B",end.Value.Date),new FbParameter("@K",code.Value)])??0);
            if(dup>0)throw new InvalidOperationException("Bu ay ve çalışma grubu için dönem zaten var.");

            var values=new FbParameter[]
            {
                new("@AD",ad),new("@A",start.Value.Date),new("@B",end.Value.Date),
                new("@ACE",ParseTime(minusTime.Text)),new("@SSKACE",ParseDay(minusDay.Text)),
                new("@ACF",ParseTime(plusTime.Text)),new("@SSKACF",ParseDay(plusDay.Text)),
                new("@EBA",ComboValue(plusArea)),new("@CBA",ComboValue(minusArea)),new("@G",g)
            };

            if(adding)
            {
                code=Convert.ToInt32(db.Scalar("select coalesce(max(KOD),0)+1 from DONEM")??1);
                db.Execute("insert into DONEM (KOD,AD,BASTAR,BITTAR,ACESAAT,SSKACE,ACFSAAT,SSKACF,EBALAN,CBALAN,GRUP) values (@K,@AD,@A,@B,@ACE,@SSKACE,@ACF,@SSKACF,@EBA,@CBA,@G)",
                    [new FbParameter("@K",code.Value),..values]);
            }
            else
            {
                if(code is null)throw new InvalidOperationException("Bir dönem seçin.");
                db.Execute("update DONEM set AD=@AD,BASTAR=@A,BITTAR=@B,ACESAAT=@ACE,SSKACE=@SSKACE,ACFSAAT=@ACF,SSKACF=@SSKACF,EBALAN=@EBA,CBALAN=@CBA,GRUP=@G where KOD=@K",
                    [..values,new FbParameter("@K",code.Value)]);
            }

            var savedCode=code;
            adding=false;
            SetEdit(false);
            save.Enabled=false;
            ReloadYears();
            year.SelectedItem=start.Value.Year;
            ReloadGrid(savedCode);
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Periods");}
    }

    int PeriodUsage(int selected)=>Convert.ToInt32(db.Scalar("select count(*) from UCRETLER where DONEM=@K",new FbParameter("@K",selected))??0);

    void DeleteOne()
    {
        if(code is null)return;
        try
        {
            if(PeriodUsage(code.Value)>0)throw new InvalidOperationException("Bu döneme ait bordro/ücret bilgileri var; dönem silinemez.");
            if(MessageBox.Show("Seçili dönemi silmek istediğinizden emin misiniz?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
            db.Execute("delete from DONEM where KOD=@K",new FbParameter("@K",code.Value));
            code=null;
            ReloadGrid();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Periods");}
    }
}
