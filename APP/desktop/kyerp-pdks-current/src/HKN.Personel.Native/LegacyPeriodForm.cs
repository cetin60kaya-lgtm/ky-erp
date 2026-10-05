using System.Data;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyPeriodForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly ComboBox year = new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=120};
    readonly DataGridView grid = new()
    {
        ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,
        SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,
        BackgroundColor=PdksAppearance.Current.Surface,AutoGenerateColumns=false
    };
    readonly Label yearSummary = new(){AutoSize=true,ForeColor=PdksAppearance.Current.Muted,Padding=new Padding(10,10,0,0)};
    readonly Label selectedMonth = ValueLabel(15f,FontStyle.Bold);
    readonly Label selectedRange = ValueLabel();
    readonly Label overallState = ValueLabel(11f,FontStyle.Bold);
    bool loading;

    public LegacyPeriodForm()
    {
        Text="Aylık Dönemler";
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

    static Label ValueLabel(float size=9.5f,FontStyle style=FontStyle.Regular)=>new()
    {
        Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,
        ForeColor=PdksAppearance.Current.Text,Font=new Font("Segoe UI",size,style)
    };

    void Build()
    {
        var p=PdksAppearance.Current;
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,ColumnCount=1,Padding=new Padding(16),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));

        var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=1,BackColor=p.Canvas,Margin=Padding.Empty};
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,58));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,12));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,42));

        var leftCard=PdksUiKit.Card();
        var left=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,Padding=new Padding(16),BackColor=p.Surface};
        left.RowStyles.Add(new RowStyle(SizeType.Absolute,38));
        left.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        left.RowStyles.Add(new RowStyle(SizeType.Absolute,36));
        left.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        left.Controls.Add(PdksUiKit.SectionTitle("Yıl → Ay"),0,0);

        var yearBar=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(0,8,0,0),BackColor=p.Surface};
        yearBar.Controls.Add(new Label
        {
            Text="Yıl",AutoSize=true,ForeColor=p.Muted,
            Font=new Font("Segoe UI",8.5f,FontStyle.Bold),Padding=new Padding(0,8,8,0)
        });
        yearBar.Controls.Add(year);
        yearBar.Controls.Add(yearSummary);
        left.Controls.Add(yearBar,0,1);

        left.Controls.Add(new Label
        {
            Text="Yılı seçin; 12 ay tek listede görünür. Her ayın MESAİLİ ve İDARİ teknik kayıtları sistem tarafından birlikte hazırlanır.",
            Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=p.Muted,
            Font=new Font("Segoe UI",8.5f)
        },0,2);

        grid.Dock=DockStyle.Fill;
        grid.Margin=new Padding(0,8,0,0);
        grid.BorderStyle=BorderStyle.None;
        grid.RowHeadersVisible=false;
        grid.RowTemplate.Height=31;
        grid.ColumnHeadersHeight=34;
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="AY",DataPropertyName="AY",HeaderText="Dönem",AutoSizeMode=DataGridViewAutoSizeColumnMode.Fill});
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="BASTAR",DataPropertyName="BASTAR",HeaderText="Başlangıç",Width=105,DefaultCellStyle=new DataGridViewCellStyle{Format="dd.MM.yyyy"}});
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="BITTAR",DataPropertyName="BITTAR",HeaderText="Bitiş",Width=105,DefaultCellStyle=new DataGridViewCellStyle{Format="dd.MM.yyyy"}});
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="DURUM",DataPropertyName="DURUM",HeaderText="Durum",Width=92});
        grid.SelectionChanged+=(_,_)=>LoadSelected();
        left.Controls.Add(grid,0,3);
        leftCard.Controls.Add(left);
        body.Controls.Add(leftCard,0,0);
        body.Controls.Add(new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas},1,0);

        var rightCard=PdksUiKit.Card();
        var details=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=6,Padding=new Padding(22),BackColor=p.Surface};
        details.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));
        details.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        details.RowStyles.Add(new RowStyle(SizeType.Absolute,46));
        for(var i=1;i<=3;i++)details.RowStyles.Add(new RowStyle(SizeType.Absolute,52));
        details.RowStyles.Add(new RowStyle(SizeType.Absolute,120));
        details.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        details.Controls.Add(PdksUiKit.SectionTitle("Seçili Dönem"),0,0);
        details.SetColumnSpan(details.GetControlFromPosition(0,0)!,2);
        DetailRow(details,1,"Dönem",selectedMonth);
        DetailRow(details,2,"Tarih Aralığı",selectedRange);
        DetailRow(details,3,"Durum",overallState);
        var note=new Label
        {
            Text="Standart kullanım: Ay ve yıl kullanıcı tarafından seçilir; çalışma grubu ayrıntıları kullanıcıya ayrı dönemler olarak gösterilmez. MESAİLİ / İDARİ altyapı kayıtları sistem tarafından arka planda tamamlanır.",
            Dock=DockStyle.Fill,ForeColor=p.Muted,Font=new Font("Segoe UI",8.7f),
            Padding=new Padding(0,14,4,0)
        };
        details.Controls.Add(note,0,4);
        details.SetColumnSpan(note,2);
        rightCard.Controls.Add(details);
        body.Controls.Add(rightCard,2,0);
        root.Controls.Add(body,0,0);

        var actions=PdksUiKit.ActionBar(true,p.Canvas);
        var refresh=PdksUiKit.Button("Yenile",82,PdksActionRole.Primary);
        var close=PdksUiKit.Button("Kapat",82,PdksActionRole.Secondary);
        refresh.Click+=(_,_)=>ReloadGrid();
        close.Click+=(_,_)=>Close();
        actions.Controls.AddRange([close,refresh]);
        root.Controls.Add(actions,0,1);
        Controls.Add(root);

        year.SelectedIndexChanged+=(_,_)=>{if(!loading)ReloadGrid();};
    }

    static void DetailRow(TableLayoutPanel table,int row,string caption,Control control)
    {
        table.Controls.Add(new Label
        {
            Text=caption,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,
            ForeColor=PdksAppearance.Current.Muted,Font=new Font("Segoe UI",8.5f,FontStyle.Bold)
        },0,row);
        control.Margin=new Padding(0,4,0,4);
        table.Controls.Add(control,1,row);
    }

    void ReloadAll()
    {
        try
        {
            PdksCoreWorkGroups.Normalize(db);
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
            var current=DateTime.Today.Year;
            var minYear=current-1;
            var maxDbYear=current;
            if(bounds.Rows.Count>0)
            {
                if(bounds.Rows[0]["MINA"]!=DBNull.Value)
                    minYear=Math.Min(minYear,Convert.ToDateTime(bounds.Rows[0]["MINA"]).Year);
                if(bounds.Rows[0]["MAXA"]!=DBNull.Value)
                    maxDbYear=Convert.ToDateTime(bounds.Rows[0]["MAXA"]).Year;
            }
            var maxYear=Math.Min(9998,Math.Max(current+5,maxDbYear+5));
            year.Items.Clear();
            for(var y=Math.Max(1900,minYear);y<=maxYear;y++)year.Items.Add(y);
            year.SelectedItem=year.Items.Contains(current)?current:maxYear;
        }
        finally{loading=false;}
        ReloadGrid();
    }

    int SelectedYear()=>year.SelectedItem is int y?y:DateTime.Today.Year;

    void ReloadGrid(int? preferredMonth=null)
    {
        try
        {
            var y=SelectedYear();
            var inserted=y>=DateTime.Today.Year?PdksPeriodService.EnsureYear(db,y):0;

            var dt=PdksPeriodService.BuildYearOverview(db,y);
            grid.DataSource=dt;
            var ready=dt.AsEnumerable().Count(r=>string.Equals(Convert.ToString(r["DURUM"]),"Hazır",StringComparison.Ordinal));
            yearSummary.Text=$"12 aylık dönem • {ready}/12 hazır"+(inserted>0?$" • {inserted} altyapı kaydı tamamlandı":"");

            if(grid.Rows.Count==0)return;
            var month=preferredMonth??(y==DateTime.Today.Year?DateTime.Today.Month:1);
            var row=grid.Rows.Cast<DataGridViewRow>()
                .FirstOrDefault(r=>r.DataBoundItem is DataRowView v&&Convert.ToInt32(v.Row["AYNO"])==month)
                ??grid.Rows[0];
            grid.CurrentCell=row.Cells[0];
            LoadSelected();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Periods");}
    }

    void LoadSelected()
    {
        if(grid.CurrentRow?.DataBoundItem is not DataRowView view)return;
        var r=view.Row;
        selectedMonth.Text=$"{S(r,"AY")} {SelectedYear()}";
        selectedRange.Text=$"{Convert.ToDateTime(r["BASTAR"]):dd.MM.yyyy} – {Convert.ToDateTime(r["BITTAR"]):dd.MM.yyyy}";
        overallState.Text=S(r,"DURUM");
    }

    static string S(DataRow r,string column)=>r[column]==DBNull.Value?"":Convert.ToString(r[column])??"";
}
