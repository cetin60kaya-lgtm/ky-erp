using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed class MonthlyPayrollAdjustmentForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly NumericUpDown year = new() { Minimum=2020, Maximum=2100, Width=78 };
    readonly ComboBox month = new() { DropDownStyle=ComboBoxStyle.DropDownList, Width=125 };
    readonly ComboBox person = new() { DropDownStyle=ComboBoxStyle.DropDownList, Width=210 };
    readonly DataGridView grid = new()
    {
        Dock=DockStyle.Fill, AllowUserToAddRows=false, AllowUserToDeleteRows=false,
        AutoGenerateColumns=false, SelectionMode=DataGridViewSelectionMode.FullRowSelect,
        MultiSelect=true, BackgroundColor=Color.White, BorderStyle=BorderStyle.FixedSingle
    };
    readonly Label summary = new() { AutoSize=true, Font=new Font("Segoe UI",9.5f,FontStyle.Bold), ForeColor=Color.FromArgb(31,78,121), Padding=new Padding(8,8,0,0) };
    DataTable data = new();
    bool loading;

    public MonthlyPayrollAdjustmentForm()
    {
        Text="Aylık Düzeltme ve Hızlı Ödeme";
        StartPosition=FormStartPosition.CenterParent;
        Width=1500; Height=780; MinimumSize=new Size(1180,650);
        Font=new Font("Segoe UI",9f); BackColor=Color.FromArgb(244,247,251);
        year.Value=DateTime.Today.Year;
        month.Items.AddRange(System.Globalization.CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.MonthNames.Take(12).Cast<object>().ToArray());
        month.SelectedIndex=DateTime.Today.Month-1;
        person.Items.Add("Tüm Aktif Personel"); person.SelectedIndex=0;
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
        AddMoney("NCKALAN","Maaş Kalan",94,false);
        AddMoney("FMKALAN","Mesai Kalan",94,false);
        AddMoney("NET","Net",94,true);
        AddMoney("EX2","Banka",94,false,Color.FromArgb(235,246,255));
        AddMoney("ELDEN","Elden",94,false,Color.FromArgb(255,246,229));
        AddText("DURUM","Durum",105,true,true);

        grid.EnableHeadersVisualStyles=false;
        grid.ColumnHeadersDefaultCellStyle.BackColor=Color.FromArgb(225,237,252);
        grid.ColumnHeadersDefaultCellStyle.ForeColor=Color.FromArgb(20,55,95);
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
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,ColumnCount=1,Padding=new Padding(12)};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,54)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,52));

        var filters=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(4,7,0,0)};
        filters.Controls.Add(L("Yıl")); filters.Controls.Add(year); filters.Controls.Add(L("Ay")); filters.Controls.Add(month);
        filters.Controls.Add(L("Personel")); filters.Controls.Add(person); filters.Controls.Add(B("Yenile",82,Reload)); filters.Controls.Add(summary);
        root.Controls.Add(filters,0,0);

        var fast=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(4,5,0,0)};
        fast.Controls.Add(B("Tümünü Seç",92,()=>SetAll(true))); fast.Controls.Add(B("Seçimi Kaldır",104,()=>SetAll(false)));
        fast.Controls.Add(B("Seçili → Banka",112,()=>AllocateSelected(true))); fast.Controls.Add(B("Seçili → Elden",112,()=>AllocateSelected(false)));
        fast.Controls.Add(B("Geçen Ay Banka/Elden",158,CopyPreviousDistribution));
        root.Controls.Add(fast,0,1); root.Controls.Add(grid,0,2);

        var bottom=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,WrapContents=false,Padding=new Padding(0,8,0,0)};
        var save=B("Ayı Kaydet",130,SaveMonth); Primary(save); bottom.Controls.Add(save);
        var pay=B("Seçili Ödemeleri İşle",165,PostSelectedPayments); Primary(pay); bottom.Controls.Add(pay);
        bottom.Controls.Add(B("Kapat",90,Close));
        root.Controls.Add(bottom,0,3); Controls.Add(root);
    }

    void AddCheck(string name,string header,int width)=>grid.Columns.Add(new DataGridViewCheckBoxColumn{Name=name,HeaderText=header,DataPropertyName=name,Width=width});
    void AddText(string name,string header,int width,bool readOnly,bool fill=false)=>grid.Columns.Add(new DataGridViewTextBoxColumn{Name=name,HeaderText=header,DataPropertyName=name,Width=width,ReadOnly=readOnly,AutoSizeMode=fill?DataGridViewAutoSizeColumnMode.Fill:DataGridViewAutoSizeColumnMode.None});
    void AddMoney(string name,string header,int width,bool readOnly,Color? back=null)=>grid.Columns.Add(new DataGridViewTextBoxColumn{Name=name,HeaderText=header,DataPropertyName=name,Width=width,ReadOnly=readOnly,DefaultCellStyle=new DataGridViewCellStyle{Format="N2",Alignment=DataGridViewContentAlignment.MiddleRight,BackColor=back??Color.White}});
    static Label L(string text)=>new(){Text=text,AutoSize=true,Padding=new Padding(4,7,3,0)};
    Button B(string text,int width,Action action){var b=new Button{Text=text,Width=width,Height=32,Margin=new Padding(4,0,4,0),Font=new Font("Segoe UI",9f,FontStyle.Bold),FlatStyle=FlatStyle.Flat,BackColor=Color.White};b.FlatAppearance.BorderColor=Color.FromArgb(190,205,224);b.Click+=(_,_)=>action();return b;}
    static void Primary(Button b){b.BackColor=Color.FromArgb(31,111,235);b.ForeColor=Color.White;b.FlatAppearance.BorderSize=0;}

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
            data.Columns.Add("SEC",typeof(bool)); data.Columns.Add("NET",typeof(decimal)); data.Columns.Add("ELDEN",typeof(decimal)); data.Columns.Add("DURUM",typeof(string));
            foreach(DataRow r in data.Rows){r["SEC"]=false;RecalcRow(r,"Temiz");}
            grid.DataSource=data;
            LoadPeopleFilter(); ApplyPersonFilter(); RefreshSummary();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
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
        var view=grid.Rows[e.RowIndex].DataBoundItem as DataRowView;if(view is null)return;var r=view.Row;
        var name=grid.Columns[e.ColumnIndex].Name;
        if(name=="ELDEN"){var net=Dec(r,"NET");var elden=Math.Max(0,Dec(r,"ELDEN"));r["EX2"]=Math.Max(0,net-elden);}
        RecalcRow(r,"Değişti"); RefreshSummary();
    }

    void RecalcRow(DataRow r,string state)
    {
        var net=Math.Max(0,Dec(r,"NCKALAN")+Dec(r,"FMKALAN")); var banka=Math.Max(0,Dec(r,"EX2")); var elden=net-banka;
        r["NET"]=net; r["ELDEN"]=elden;
        r["DURUM"] = banka>net+0.01m || elden<-.01m ? "Hata" : state;
    }

    void GridCellFormatting(object? s,DataGridViewCellFormattingEventArgs e)
    {
        if(e.RowIndex<0)return;var row=grid.Rows[e.RowIndex];var durum=Convert.ToString(row.Cells["DURUM"].Value)??"";
        row.DefaultCellStyle.BackColor=durum=="Hata"?Color.FromArgb(255,232,232):durum=="Değişti"?Color.FromArgb(255,248,220):Color.White;
    }

    static decimal Dec(DataRow r,string c){if(!r.Table.Columns.Contains(c)||r[c]==DBNull.Value)return 0;try{return Convert.ToDecimal(r[c]);}catch{return decimal.TryParse(Convert.ToString(r[c]),out var x)?x:0;}}
    IEnumerable<DataRow> Selected()=>data.AsEnumerable().Where(r=>r.Field<bool>("SEC"));
    void SetAll(bool value){foreach(DataRow r in data.Rows)r["SEC"]=value;RefreshSummary();}
    void AllocateSelected(bool bank){foreach(var r in Selected()){var net=Dec(r,"NET");r["EX2"]=bank?net:0m;RecalcRow(r,"Değişti");}RefreshSummary();grid.Refresh();}

    void CopyPreviousDistribution()
    {
        try
        {
            var p=Period();var prevA=p.A.AddMonths(-1);var prevB=p.A.AddDays(-1);
            foreach(var r in Selected())
            {
                var q=db.Query("select first 1 coalesce(EX2,0) BANKA,(coalesce(NCKALAN,0)+coalesce(FMKALAN,0)) NET from UCRETLER where PKNO=@P and BASTAR<=@B and coalesce(BITTAR,BASTAR)>=@A order by BASTAR desc",
                    new FbParameter("@P",Convert.ToString(r["PKNO"])??""),new FbParameter("@A",prevA),new FbParameter("@B",prevB));
                if(q.Rows.Count==0)continue;var oldNet=Convert.ToDecimal(q.Rows[0]["NET"]);var oldBank=Convert.ToDecimal(q.Rows[0]["BANKA"]);var net=Dec(r,"NET");
                var ratio=oldNet<=0?0m:Math.Clamp(oldBank/oldNet,0m,1m);r["EX2"]=Math.Round(net*ratio,2);RecalcRow(r,"Değişti");
            }
            RefreshSummary();grid.Refresh();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text);}
    }

    void SaveMonth()
    {
        try
        {
            ValidateRows(data.Rows.Cast<DataRow>());
            db.InTransaction((c,t)=>
            {
                foreach(DataRow r in data.Rows)
                {
                    using var cmd=FirebirdDatabase.CreateCommand(c,t,"update UCRETLER set DMAAS=@M,GUN1=@G1,SAAT1=@S1,SAAT2=@S2,SAAT3=@S3,GUN4=@G4,DEVG=@DG,EKS=@ES,EKKAZ=@EK,EKKES=@KS,EX1=@AV,EX2=@BN,EX4=@IC,NCKALAN=@NC,FMKALAN=@FM where PKNO=@P and BASTAR=@A and BITTAR=@B",
                        new FbParameter("@M",Val(r,"DMAAS")),new FbParameter("@G1",Obj(r,"GUN1")),new FbParameter("@S1",Obj(r,"SAAT1")),new FbParameter("@S2",Obj(r,"SAAT2")),new FbParameter("@S3",Obj(r,"SAAT3")),new FbParameter("@G4",Obj(r,"GUN4")),new FbParameter("@DG",Obj(r,"DEVG")),new FbParameter("@ES",Obj(r,"EKS")),new FbParameter("@EK",Val(r,"EKKAZ")),new FbParameter("@KS",Val(r,"EKKES")),new FbParameter("@AV",Val(r,"EX1")),new FbParameter("@BN",Val(r,"EX2")),new FbParameter("@IC",Val(r,"EX4")),new FbParameter("@NC",Val(r,"NCKALAN")),new FbParameter("@FM",Val(r,"FMKALAN")),new FbParameter("@P",Convert.ToString(r["PKNO"])??""),new FbParameter("@A",Convert.ToDateTime(r["BASTAR"])),new FbParameter("@B",Convert.ToDateTime(r["BITTAR"])));
                    if(cmd.ExecuteNonQuery()!=1)throw new InvalidOperationException($"{r["PKNO"]} bordro satırı güncellenemedi.");
                }
                return 0;
            });
            MessageBox.Show($"{data.Rows.Count} personelin aylık bordro kaynağı güncellendi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);Reload();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }

    void PostSelectedPayments()
    {
        var rows=Selected().ToList();if(rows.Count==0){MessageBox.Show("Ödeme için personel seçin.",Text);return;}
        try
        {
            ValidateRows(rows);
            db.InTransaction((c,t)=>
            {
                foreach(var r in rows)
                {
                    var pk=Convert.ToString(r["PKNO"])??"";var a=Convert.ToDateTime(r["BASTAR"]);var b=Convert.ToDateTime(r["BITTAR"]);
                    using(var del=FirebirdDatabase.CreateCommand(c,t,"delete from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b)))del.ExecuteNonQuery();
                    using var ins=FirebirdDatabase.CreateCommand(c,t,"insert into ODEME(PKNO,BASTAR,BITTAR,NODENEN,NOTARIH,FMODENEN,FMOTARIH) values(@P,@A,@B,@N,@D,@F,@D)",new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b),new FbParameter("@N",Dec(r,"NCKALAN")),new FbParameter("@D",DateTime.Today),new FbParameter("@F",Dec(r,"FMKALAN")));ins.ExecuteNonQuery();
                }
                return 0;
            });
            MessageBox.Show($"{rows.Count} personelin ödemesi işlendi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }

    static object Obj(DataRow r,string c)=>r[c]==DBNull.Value?0:r[c];
    static decimal Val(DataRow r,string c)=>Dec(r,c);
    static void ValidateRows(IEnumerable<DataRow> rows)
    {
        foreach(var r in rows)
        {
            var card=Convert.ToString(r["PKNO"])??"";var net=Dec(r,"NCKALAN")+Dec(r,"FMKALAN");var bank=Dec(r,"EX2");var elden=net-bank;
            if(Dec(r,"DMAAS")<0)throw new InvalidOperationException($"{card}: maaş negatif olamaz.");
            if(Dec(r,"GUN1")<0||Dec(r,"GUN1")>31)throw new InvalidOperationException($"{card}: normal gün 0-31 arasında olmalı.");
            if(net<0||bank<0||elden<-.01m)throw new InvalidOperationException($"{card}: Banka/Elden dağılımı Net tutarla uyumlu değil.");
        }
    }

    void RefreshSummary()
    {
        var rows=Selected().ToList();summary.Text=$"Seçili: {rows.Count}   Net: {rows.Sum(r=>Dec(r,"NET")):N2} ₺   Banka: {rows.Sum(r=>Dec(r,"EX2")):N2} ₺   Elden: {rows.Sum(r=>Dec(r,"ELDEN")):N2} ₺";
    }
}
