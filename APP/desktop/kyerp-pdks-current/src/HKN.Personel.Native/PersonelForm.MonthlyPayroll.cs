using FirebirdSql.Data.FirebirdClient;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    readonly ComboBox personPayrollMonth = new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=120};
    readonly NumericUpDown personPayrollYear = new(){Minimum=2015,Maximum=2100,Width=82};
    readonly Label personPayrollLockState = new(){AutoSize=true,Font=new Font("Segoe UI",8.5f,FontStyle.Bold),Padding=new Padding(8,7,0,0)};
    readonly DataGridView personPayrollGrid = new()
    {
        Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,
        RowHeadersVisible=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,
        BackgroundColor=PdksAppearance.Current.Surface,BorderStyle=BorderStyle.None
    };

    TabPage BuildPersonMonthlyPayrollTab()
    {
        var p=PdksAppearance.Current;
        var page=new TabPage("Bordro"){BackColor=p.Canvas,Padding=new Padding(10)};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,74));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));

        personPayrollMonth.Items.AddRange(System.Globalization.CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.MonthNames.Take(12).Cast<object>().ToArray());
        personPayrollMonth.SelectedIndex=DateTime.Today.Month-1;
        personPayrollYear.Value=DateTime.Today.Year;

        var top=PdksUiKit.Card(12);
        var filters=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(0,9,0,0),BackColor=p.Surface};
        filters.Controls.Add(new Label{Text="Ay",AutoSize=true,Padding=new Padding(0,7,4,0),ForeColor=p.Muted});
        filters.Controls.Add(personPayrollMonth);
        filters.Controls.Add(new Label{Text="Yıl",AutoSize=true,Padding=new Padding(12,7,4,0),ForeColor=p.Muted});
        filters.Controls.Add(personPayrollYear);
        filters.Controls.Add(PdksUiKit.Button("Yenile",86,PdksActionRole.Secondary,LoadPersonPayrollTab));
        filters.Controls.Add(personPayrollLockState);
        top.Controls.Add(filters);
        root.Controls.Add(top,0,0);

        personPayrollGrid.EnableHeadersVisualStyles=false;
        personPayrollGrid.ColumnHeadersDefaultCellStyle.BackColor=p.GridHeader;
        personPayrollGrid.ColumnHeadersDefaultCellStyle.ForeColor=p.Text;
        personPayrollGrid.DefaultCellStyle.SelectionBackColor=p.Selection;
        personPayrollGrid.DefaultCellStyle.SelectionForeColor=p.Text;
        var card=PdksUiKit.Card(1);card.Controls.Add(personPayrollGrid);root.Controls.Add(card,0,1);

        var bar=PdksUiKit.ActionBar(true,p.Canvas);
        bar.Controls.Add(PdksUiKit.Button("Ay Kilidi",110,PdksActionRole.Secondary,TogglePersonPayrollLock));
        bar.Controls.Add(PdksUiKit.Button("Bordroyu Düzenle",150,PdksActionRole.Primary,OpenPersonPayrollEditor));
        root.Controls.Add(bar,0,2);

        personPayrollMonth.SelectedIndexChanged+=(_,_)=>{if(fullTabsReady)LoadPersonPayrollTab();};
        personPayrollYear.ValueChanged+=(_,_)=>{if(fullTabsReady)LoadPersonPayrollTab();};
        page.Controls.Add(root);
        return page;
    }

    DateTime PersonPayrollPeriod() => new((int)personPayrollYear.Value,Math.Max(1,personPayrollMonth.SelectedIndex+1),1);

    void LoadPersonPayrollTab()
    {
        if(string.IsNullOrWhiteSpace(currentPk))return;
        try
        {
            var a=PersonPayrollPeriod();var b=a.AddMonths(1);
            personPayrollGrid.DataSource=Q(
                "select BASTAR as DONEM_BASLANGIC,BITTAR as DONEM_BITIS,DMAAS as MAAS,GUN1 as NORMAL_GUN,SAAT1 as NORMAL_SAAT,UCRET1 as NORMAL_UCRET,"+
                "SAAT2 as MESAI_50,SAAT3 as MESAI_100,GUN4 as UCRETSIZ_IZIN,DEVG as DEVAMSIZ_GUN,DEVS as DEVAMSIZ_SAAT,"+
                "EKKAZ as EK_KAZANC,EKKES as KESINTI,EX1 as AVANS,EX2 as BANKA,NCKALAN as MAAS_KALAN,FMKALAN as MESAI_KALAN "+
                "from UCRETLER where PKNO=@P and BASTAR<@B and coalesce(BITTAR,BASTAR)>=@A order by BASTAR desc",
                new FbParameter("@P",currentPk),new FbParameter("@A",a),new FbParameter("@B",b));
            var info=PayrollPeriodLockService.Get(db,a);
            personPayrollLockState.Text=PayrollPeriodLockService.Caption(info);
            personPayrollLockState.ForeColor=info.Locked?p.Warning:p.Success;
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,"Personel Bordro",MessageBoxIcon.Warning,"Personnel.Payroll");}
    }

    void OpenPersonPayrollEditor()
    {
        if(string.IsNullOrWhiteSpace(currentPk))return;
        using var form=new MonthlyPayrollAdjustmentForm(currentPk,PersonPayrollPeriod());
        form.ShowDialog(this);
        LoadPersonPayrollTab();
    }

    void TogglePersonPayrollLock()
    {
        if(string.IsNullOrWhiteSpace(currentPk))return;
        var a=PersonPayrollPeriod();
        var info=PayrollPeriodLockService.Get(db,a);
        var next=!info.Locked;
        if(next && MessageBox.Show($"{a:MMMM yyyy} dönemi kilitlensin mi? Puantaj hesaplama ve bordro kaynak düzenleme bu ayı değiştiremez.","Ay Kilidi",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
        PayrollPeriodLockService.Set(db,a,next,next?"Personel ekranından bordro dönemi kilitlendi":"Personel ekranından kilit açıldı");
        LoadPersonPayrollTab();
    }
}
