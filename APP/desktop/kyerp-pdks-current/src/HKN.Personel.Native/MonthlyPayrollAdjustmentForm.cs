using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Payroll;

namespace HKN.Personel.Native;

public sealed class MonthlyPayrollAdjustmentForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly NumericUpDown year = new() { Minimum=2020, Maximum=2100, Width=78 };
    readonly ComboBox month = new() { DropDownStyle=ComboBoxStyle.DropDownList, Width=125 };
    readonly ComboBox person = new() { DropDownStyle=ComboBoxStyle.DropDownList, Width=210 };
    readonly DataGridView grid = new()
    {
        Dock=DockStyle.Fill, AllowUserToAddRows=false, AllowUserToDeleteRows=false,
        AutoGenerateColumns=false, SelectionMode=DataGridViewSelectionMode.FullRowSelect,
        MultiSelect=true, BackgroundColor=PdksAppearance.Current.Surface, BorderStyle=BorderStyle.None
    };
    readonly Label summary = new() { AutoSize=true, Font=new Font("Segoe UI",8.5f,FontStyle.Bold), ForeColor=PdksAppearance.Current.Muted };
    readonly Label selectedValue = KpiValue();
    readonly Label entitlementValue = KpiValue();
    readonly Label officialValue = KpiValue();
    readonly Label differenceValue = KpiValue();
    readonly Button periodLockButton;
    readonly Label periodLockState = new(){AutoSize=true,Font=new Font("Segoe UI",8.5f,FontStyle.Bold),Padding=new Padding(10,8,0,0)};
    readonly string? initialPersonCard;
    DataTable data = new();
    bool loading;
    bool periodProtected;

    public MonthlyPayrollAdjustmentForm(string? initialPersonCard = null, DateTime? initialPeriod = null)
    {
        this.initialPersonCard = initialPersonCard;
        Text="Aylık Düzeltme ve Hızlı Ödeme";
        StartPosition=FormStartPosition.CenterParent;
        Width=1500; Height=780; MinimumSize=new Size(1180,650);
        Font=new Font("Segoe UI",9f); BackColor=PdksAppearance.Current.Canvas;
        var selectedPeriod=initialPeriod??DateTime.Today;
        year.Value=selectedPeriod.Year;
        month.Items.AddRange(System.Globalization.CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.MonthNames.Take(12).Cast<object>().ToArray());
        month.SelectedIndex=selectedPeriod.Month-1;
        person.Items.Add("Tüm Aktif Personel"); person.SelectedIndex=0;
        periodLockButton=B("Ayı Kilitle",118,TogglePeriodLock);
        BuildGrid(); BuildUi();
        Shown+=(_,_)=>Reload();
    }

    void BuildGrid()
    {
        AddCheck("SEC","Seç",42);
        AddText("PKNO","Kart",62,true);
        AddText("PERSONEL","Personel",180,true);
        AddMoney("DMAAS","Maaş",88,false);
        AddText("GUN1","Normal Gün",76,false);
        AddText("SAAT1","Normal Saat",82,false);
        AddText("SAAT2","%50 Mesai",78,false);
        AddText("SAAT3","%100 Mesai",82,false);
        AddText("GUN4","Ücr. İzin Gün",84,false);
        AddText("DEVG","Devamsız Gün",88,false);
        AddText("EKS","Eksik Saat",78,false);
        AddMoney("EKKAZ","Ek Kazanç",88,false);
        AddMoney("EKKES","Kesinti",78,false);
        AddMoney("EX1","Avans",76,false);
        AddMoney("EX4","İcra",72,false);
        AddMoney("NCKALAN","Maaş Kalan",94,true,PdksAppearance.Current.SurfaceAlt);
        AddMoney("FMKALAN","Mesai Kalan",94,true,PdksAppearance.Current.SurfaceAlt);
        AddMoney("HAKEDIS_NET","Hak Edilen Net",105,true,PdksAppearance.Current.PrimarySoft);
        AddMoney("PEK_BRUT","Hesaplanan PEK",108,true,PdksAppearance.Current.SurfaceAlt);
        AddMoney("RESMI_NET","Resmî Bordro Neti",112,true,PdksAppearance.Current.SurfaceAlt);
        AddMoney("FARK","Aradaki Fark",100,true,PdksAppearance.Current.PrimarySoft);
        AddMoney("EX2","Bankaya Ödenecek",112,true,PdksAppearance.Current.PrimarySoft);
        AddText("DURUM","Durum",135,true,true);

        grid.EnableHeadersVisualStyles=false;
        grid.ColumnHeadersDefaultCellStyle.BackColor=PdksAppearance.Current.GridHeader;
        grid.ColumnHeadersDefaultCellStyle.ForeColor=PdksAppearance.Current.Text;
        grid.ColumnHeadersDefaultCellStyle.Font=new Font("Segoe UI",9f,FontStyle.Bold);
        grid.RowTemplate.Height=28;
        grid.CellBeginEdit+=(_,e)=>{ if(grid.Columns[e.ColumnIndex].ReadOnly) e.Cancel=true; };
        grid.CellEndEdit+=GridCellEndEdit;
        grid.CurrentCellDirtyStateChanged+=(_,_)=>{ if(grid.IsCurrentCellDirty) grid.CommitEdit(DataGridViewDataErrorContexts.Commit); };
        grid.CellValueChanged+=(_,e)=>{ if(!loading && e.RowIndex>=0 && grid.Columns[e.ColumnIndex].Name=="SEC") RefreshSummary(); };
        grid.CellFormatting+=GridCellFormatting;
    }

    void BuildUi()
    {
        var p=PdksAppearance.Current;
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=5,ColumnCount=1,Padding=new Padding(16),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,116));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,102));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,54));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,56));

        var header=PdksUiKit.Card(16);
        var headerGrid=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,BackColor=p.Surface,Margin=Padding.Empty};
        headerGrid.RowStyles.Add(new RowStyle(SizeType.Absolute,34));
        headerGrid.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        headerGrid.Controls.Add(new Label
        {
            Text="Aylık Bordro Düzeltme ve Hızlı Ödeme",
            Dock=DockStyle.Fill,
            Font=new Font("Segoe UI",12f,FontStyle.Bold),
            ForeColor=p.Text,
            TextAlign=ContentAlignment.MiddleLeft
        },0,0);

        var filters=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(0,7,0,0),BackColor=p.Surface};
        filters.Controls.Add(L("Yıl"));filters.Controls.Add(year);
        filters.Controls.Add(L("Ay"));filters.Controls.Add(month);
        filters.Controls.Add(L("Personel"));filters.Controls.Add(person);
        filters.Controls.Add(B("Yenile",86,Reload));
        filters.Controls.Add(periodLockButton);
        filters.Controls.Add(periodLockState);
        summary.Text="Kaynak: UCRETLER • Resmî net / banka otomatik";
        summary.Padding=new Padding(12,8,0,0);
        filters.Controls.Add(summary);
        headerGrid.Controls.Add(filters,0,1);
        header.Controls.Add(headerGrid);
        root.Controls.Add(header,0,0);

        var kpis=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,BackColor=p.Canvas,Padding=new Padding(0,10,0,4),Margin=Padding.Empty};
        for(var i=0;i<4;i++)kpis.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25));
        kpis.Controls.Add(KpiCard("Seçili Personel",selectedValue,"Ödeme / işlem seçimi"),0,0);
        kpis.Controls.Add(KpiCard("Hak Edilen Net",entitlementValue,"İç hakediş toplamı"),1,0);
        kpis.Controls.Add(KpiCard("Resmî Net / Banka",officialValue,"Banka ödeme toplamı"),2,0);
        kpis.Controls.Add(KpiCard("Aradaki Fark",differenceValue,"Hakediş - resmî net"),3,0);
        root.Controls.Add(kpis,0,1);

        var fast=PdksUiKit.ActionBar(false,p.Canvas);
        fast.Controls.Add(B("Tümünü Seç",96,()=>SetAll(true)));
        fast.Controls.Add(B("Seçimi Kaldır",112,()=>SetAll(false)));
        fast.Controls.Add(B("Resmî Bordroyu Yenile",166,RecalculateAll));
        fast.Controls.Add(new Label{Text="Banka tutarı resmî bordro netinden otomatik hesaplanır; PEK uyumsuzluğu varsa ödeme engellenir.",AutoSize=true,Padding=new Padding(14,8,0,0),ForeColor=p.Muted});
        root.Controls.Add(fast,0,2);

        grid.Margin=Padding.Empty;
        grid.BorderStyle=BorderStyle.None;
        grid.RowHeadersVisible=false;
        grid.RowTemplate.Height=31;
        grid.ColumnHeadersHeight=36;
        root.Controls.Add(grid,0,3);

        var bottom=PdksUiKit.ActionBar(true,p.Canvas);
        bottom.Controls.Add(B("Ayı Kaydet",130,SaveMonth));
        bottom.Controls.Add(B("Seçili Ödemeleri İşle",170,PostSelectedPayments));
        bottom.Controls.Add(B("Kapat",90,Close));
        root.Controls.Add(bottom,0,4);
        Controls.Add(root);
    }

    static Label KpiValue()=>new()
    {
        Text="0",
        Dock=DockStyle.Fill,
        TextAlign=ContentAlignment.MiddleLeft,
        Font=new Font("Segoe UI",15f,FontStyle.Bold),
        ForeColor=PdksAppearance.Current.Text
    };

    static Control KpiCard(string title,Label value,string hint)
    {
        var p=PdksAppearance.Current;
        var card=PdksUiKit.Card(12);
        card.Margin=new Padding(0,0,10,0);
        var grid=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,BackColor=p.Surface,Margin=Padding.Empty};
        grid.RowStyles.Add(new RowStyle(SizeType.Absolute,20));
        grid.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        grid.RowStyles.Add(new RowStyle(SizeType.Absolute,18));
        grid.Controls.Add(new Label{Text=title,Dock=DockStyle.Fill,Font=new Font("Segoe UI",8.3f,FontStyle.Bold),ForeColor=p.Muted},0,0);
        grid.Controls.Add(value,0,1);
        grid.Controls.Add(new Label{Text=hint,Dock=DockStyle.Fill,Font=new Font("Segoe UI",7.8f),ForeColor=p.Muted},0,2);
        card.Controls.Add(grid);
        return card;
    }

    void AddCheck(string name,string header,int width)=>grid.Columns.Add(new DataGridViewCheckBoxColumn{Name=name,HeaderText=header,DataPropertyName=name,Width=width});
    void AddText(string name,string header,int width,bool readOnly,bool fill=false)=>grid.Columns.Add(new DataGridViewTextBoxColumn{Name=name,HeaderText=header,DataPropertyName=name,Width=width,ReadOnly=readOnly,AutoSizeMode=fill?DataGridViewAutoSizeColumnMode.Fill:DataGridViewAutoSizeColumnMode.None});
    void AddMoney(string name,string header,int width,bool readOnly,Color? back=null)=>grid.Columns.Add(new DataGridViewTextBoxColumn{Name=name,HeaderText=header,DataPropertyName=name,Width=width,ReadOnly=readOnly,DefaultCellStyle=new DataGridViewCellStyle{Format="N2",Alignment=DataGridViewContentAlignment.MiddleRight,BackColor=back??PdksAppearance.Current.Surface}});
    static Label L(string text)=>new(){Text=text,AutoSize=true,Padding=new Padding(4,7,3,0),ForeColor=PdksAppearance.Current.Muted};
    Button B(string text,int width,Action action)
    {
        var role=text.Contains("Kaydet",StringComparison.OrdinalIgnoreCase) ||
                 text.Contains("Ödemeleri İşle",StringComparison.OrdinalIgnoreCase) ||
                 text.Contains("Yenile",StringComparison.OrdinalIgnoreCase)
            ? PdksActionRole.Primary
            : text.Contains("Kapat",StringComparison.OrdinalIgnoreCase)
                ? PdksActionRole.Quiet
                : PdksActionRole.Secondary;
        var b=PdksUiKit.Button(text,width,role,action);
        b.Height=32;b.MinimumSize=new Size(width,32);b.MaximumSize=new Size(width,32);
        b.Margin=new Padding(4,0,4,0);
        return b;
    }
    static void Primary(Button b)=>PdksUiKit.ApplyButtonPalette(b,PdksAppearance.Current,PdksActionRole.Primary);

    (DateTime A,DateTime B) Period(){var a=new DateTime((int)year.Value,month.SelectedIndex+1,1);return(a,a.AddMonths(1).AddDays(-1));}

    void Reload()
    {
        try
        {
            loading=true;
            var p=Period();
            data=db.Query("select u.PKNO,(k.AD||' '||k.SOYAD) PERSONEL,u.BASTAR,u.BITTAR,u.DMAAS,u.GUN1,u.SAAT1,u.SAAT2,u.SAAT3,u.GUN4,u.DEVG,u.EKS,u.EKKAZ,u.EKKES,u.EX1,u.EX2,u.EX4,u.NCKALAN,u.FMKALAN " +
                "from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO where u.BASTAR<=@B and coalesce(u.BITTAR,u.BASTAR)>=@A and (k.ICTARIH is null or k.ICTARIH>=@A) order by u.PKNO",
                new FbParameter("@A",p.A),new FbParameter("@B",p.B));
            data.Columns.Add("SEC",typeof(bool));
            data.Columns.Add("HAKEDIS_NET",typeof(decimal));
            data.Columns.Add("PEK_BRUT",typeof(decimal));
            data.Columns.Add("RESMI_NET",typeof(decimal));
            data.Columns.Add("FARK",typeof(decimal));
            data.Columns.Add("DURUM",typeof(string));
            foreach(DataRow r in data.Rows){r["SEC"]=false;RecalcRow(r,"Temiz");}
            grid.DataSource=data;
            LoadPeopleFilter();
            if(!string.IsNullOrWhiteSpace(initialPersonCard))
            {
                var item=person.Items.Cast<object>().Select(Convert.ToString).FirstOrDefault(x=>x is not null && x.StartsWith(initialPersonCard+" ",StringComparison.OrdinalIgnoreCase));
                if(item is not null) person.SelectedItem=item;
            }
            ApplyPersonFilter(); RefreshSummary(); RefreshPeriodLockUi();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Payroll.Adjustment");}
        finally{loading=false;}
    }

    void LoadPeopleFilter()
    {
        var selected=person.SelectedIndex<=0?"":Convert.ToString(person.SelectedItem)??"";
        person.BeginUpdate(); person.Items.Clear(); person.Items.Add("Tüm Aktif Personel");
        foreach(DataRow r in data.Rows) person.Items.Add($"{r["PKNO"]} {r["PERSONEL"]}".Trim());
        var idx=person.Items.IndexOf(selected); person.SelectedIndex=idx>=0?idx:0; person.EndUpdate();
        person.SelectedIndexChanged-=PersonChanged; person.SelectedIndexChanged+=PersonChanged;
    }
    void PersonChanged(object? s,EventArgs e)=>ApplyPersonFilter();
    void ApplyPersonFilter(){if(data.Rows.Count==0)return;var v=data.DefaultView;v.RowFilter=person.SelectedIndex<=0?"":$"PKNO='{person.Text.Split(' ')[0].Replace("'","''")}'";grid.DataSource=v;}

    void GridCellEndEdit(object? s,DataGridViewCellEventArgs e)
    {
        if(e.RowIndex<0)return;
        var view=grid.Rows[e.RowIndex].DataBoundItem as DataRowView;
        if(view is null)return;
        RecalcRow(view.Row,"Değişti");
        RefreshSummary();
    }

    void RecalcRow(DataRow r,string state)
    {
        var card=Convert.ToString(r["PKNO"])?.Trim()??string.Empty;
        var entitlement=Math.Max(0,Dec(r,"NCKALAN")+Dec(r,"FMKALAN"));
        r["HAKEDIS_NET"]=entitlement;
        try
        {
            var selectedYear=(int)year.Value;
            var rules=TurkishPayrollRules.ForYear(selectedYear);
            var profile=PayrollProfileStore.Load(card,Math.Max(0,Dec(r,"DMAAS")));
            var unpaid=Math.Max(0,Dec(r,"GUN4"));
            var absent=Math.Max(0,Dec(r,"DEVG"));
            var payableDays=Math.Clamp((int)Math.Round(30m-unpaid-absent,MidpointRounding.AwayFromZero),0,30);
            if(entitlement<=0||payableDays==0)
            {
                r["PEK_BRUT"]=0m;r["RESMI_NET"]=0m;r["FARK"]=entitlement;r["EX2"]=0m;r["DURUM"]=state;return;
            }

            var requiredGross=TurkishPayrollCalculator.GrossForTargetNet(entitlement,selectedYear,0m,payableDays);
            decimal gross;
            var mismatch=false;
            if(profile.PekMode==PekMode.Manual)
            {
                gross=Math.Round(profile.ManualPekGross*payableDays/30m,2,MidpointRounding.AwayFromZero);
                mismatch=gross+0.01m<requiredGross;
            }
            else gross=requiredGross;

            var official=TurkishPayrollCalculator.Calculate(new OfficialPayrollInput(gross,0m,payableDays),rules);
            r["PEK_BRUT"]=official.PrimeEarnings;
            r["RESMI_NET"]=official.NetWage;
            r["FARK"]=Math.Round(entitlement-official.NetWage,2,MidpointRounding.AwayFromZero);
            r["EX2"]=official.NetWage;
            r["DURUM"]=mismatch?"PEK UYUMSUZ":state;
        }
        catch(NotSupportedException)
        {
            r["PEK_BRUT"]=0m;r["RESMI_NET"]=0m;r["FARK"]=entitlement;r["EX2"]=0m;r["DURUM"]="YIL PARAMETRESİ YOK";
        }
    }

    void GridCellFormatting(object? s,DataGridViewCellFormattingEventArgs e)
    {
        if(e.RowIndex<0)return;
        var p=PdksAppearance.Current;
        var row=grid.Rows[e.RowIndex];
        var durum=Convert.ToString(row.Cells["DURUM"].Value)??"";
        row.DefaultCellStyle.BackColor=durum=="Hata"?p.DangerSoft:durum=="Değişti"?p.PrimarySoft:p.Surface;
        row.DefaultCellStyle.ForeColor=p.Text;
    }

    static decimal Dec(DataRow r,string c){if(!r.Table.Columns.Contains(c)||r[c]==DBNull.Value)return 0;try{return Convert.ToDecimal(r[c]);}catch{return decimal.TryParse(Convert.ToString(r[c]),out var x)?x:0;}}
    IEnumerable<DataRow> Selected()=>data.AsEnumerable().Where(r=>r.Field<bool>("SEC"));
    void SetAll(bool value){foreach(DataRow r in data.Rows)r["SEC"]=value;RefreshSummary();}
    void RecalculateAll()
    {
        foreach(DataRow row in data.Rows) RecalcRow(row,"Değişti");
        grid.Refresh();
        RefreshSummary();
    }

    void SaveMonth()
    {
        try
        {
            var changed=data.AsEnumerable().Where(r=>!string.Equals(Convert.ToString(r["DURUM"]),"Temiz",StringComparison.OrdinalIgnoreCase)).ToList();
            if(changed.Count==0)
            {
                if(!string.Equals(Environment.GetEnvironmentVariable("KY_PDKS_UI_AUDIT"),"1",StringComparison.Ordinal))
                    MessageBox.Show("Kaydedilecek değişiklik yok.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
                return;
            }
            ValidateRows(changed);
            db.InTransaction((c,t)=>
            {
                foreach(DataRow r in changed)
                {
                    using var cmd=FirebirdDatabase.CreateCommand(c,t,"update UCRETLER set DMAAS=@M,GUN1=@G1,SAAT1=@S1,SAAT2=@S2,SAAT3=@S3,GUN4=@G4,DEVG=@DG,EKS=@ES,EKKAZ=@EK,EKKES=@KS,EX1=@AV,EX2=@BN,EX4=@IC where PKNO=@P and BASTAR=@A and BITTAR=@B",
                        new FbParameter("@M",Val(r,"DMAAS")),new FbParameter("@G1",Obj(r,"GUN1")),new FbParameter("@S1",Obj(r,"SAAT1")),new FbParameter("@S2",Obj(r,"SAAT2")),new FbParameter("@S3",Obj(r,"SAAT3")),new FbParameter("@G4",Obj(r,"GUN4")),new FbParameter("@DG",Obj(r,"DEVG")),new FbParameter("@ES",Obj(r,"EKS")),new FbParameter("@EK",Val(r,"EKKAZ")),new FbParameter("@KS",Val(r,"EKKES")),new FbParameter("@AV",Val(r,"EX1")),new FbParameter("@BN",Val(r,"EX2")),new FbParameter("@IC",Val(r,"EX4")),new FbParameter("@P",Convert.ToString(r["PKNO"])??""),new FbParameter("@A",Convert.ToDateTime(r["BASTAR"])),new FbParameter("@B",Convert.ToDateTime(r["BITTAR"])));
                    if(cmd.ExecuteNonQuery()!=1)throw new InvalidOperationException($"{r["PKNO"]} bordro satırı güncellenemedi.");
                }
                return 0;
            });
            if(!string.Equals(Environment.GetEnvironmentVariable("KY_PDKS_UI_AUDIT"),"1",StringComparison.Ordinal))MessageBox.Show($"{changed.Count} personelin aylık bordro kaynağı güncellendi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);Reload();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Error,"Payroll.Adjustment");}
    }

    void PostSelectedPayments()
    {
        var rows=Selected().ToList();if(rows.Count==0){MessageBox.Show("Ödeme için personel seçin.",Text);return;}
        if(rows.Any(r=>string.Equals(Convert.ToString(r["DURUM"]),"PEK UYUMSUZ",StringComparison.OrdinalIgnoreCase)))
        {
            MessageBox.Show("Seçimde PEK uyumsuzluğu bulunan personel var. Resmî bordro/PEK düzeltilmeden banka ödeme kaydı oluşturulmaz.",Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);
            return;
        }
        try
        {
            ValidateRows(rows);
            db.InTransaction((c,t)=>
            {
                foreach(var r in rows)
                {
                    var pk=Convert.ToString(r["PKNO"])??"";var a=Convert.ToDateTime(r["BASTAR"]);var b=Convert.ToDateTime(r["BITTAR"]);
                    using(var del=FirebirdDatabase.CreateCommand(c,t,"delete from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b)))del.ExecuteNonQuery();
                    using var ins=FirebirdDatabase.CreateCommand(c,t,"insert into ODEME(PKNO,BASTAR,BITTAR,NODENEN,NOTARIH,FMODENEN,FMOTARIH) values(@P,@A,@B,@N,@D,0,@D)",new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b),new FbParameter("@N",Dec(r,"EX2")),new FbParameter("@D",DateTime.Today));ins.ExecuteNonQuery();
                }
                return 0;
            });
            if(!string.Equals(Environment.GetEnvironmentVariable("KY_PDKS_UI_AUDIT"),"1",StringComparison.Ordinal))MessageBox.Show($"{rows.Count} personelin ödemesi işlendi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Error,"Payroll.Adjustment");}
    }

    static object Obj(DataRow r,string c)=>r[c]==DBNull.Value?0:r[c];
    static decimal Val(DataRow r,string c)=>Dec(r,c);
    static void ValidateRows(IEnumerable<DataRow> rows)
    {
        foreach(var r in rows)
        {
            var card=Convert.ToString(r["PKNO"])??"";
            if(Dec(r,"DMAAS")<0)throw new InvalidOperationException($"{card}: maaş negatif olamaz.");
            if(Dec(r,"GUN1")<0||Dec(r,"GUN1")>31)throw new InvalidOperationException($"{card}: normal gün 0-31 arasında olmalı.");
            if(Dec(r,"HAKEDIS_NET")<0||Dec(r,"RESMI_NET")<0||Dec(r,"EX2")<0)throw new InvalidOperationException($"{card}: bordro tutarları negatif olamaz.");
            if(Math.Abs(Dec(r,"EX2")-Dec(r,"RESMI_NET"))>0.01m)throw new InvalidOperationException($"{card}: bankaya ödenecek tutar resmî bordro netiyle uyumlu değil.");
        }
    }

    void RefreshSummary()
    {
        var rows=Selected().ToList();
        selectedValue.Text=rows.Count.ToString("N0");
        entitlementValue.Text=$"{rows.Sum(r=>Dec(r,"HAKEDIS_NET")):N2} ₺";
        officialValue.Text=$"{rows.Sum(r=>Dec(r,"RESMI_NET")):N2} ₺";
        differenceValue.Text=$"{rows.Sum(r=>Dec(r,"FARK")):N2} ₺";
        differenceValue.ForeColor=Math.Abs(rows.Sum(r=>Dec(r,"FARK")))>0.01m?PdksAppearance.Current.Warning:PdksAppearance.Current.Text;
    }
}
