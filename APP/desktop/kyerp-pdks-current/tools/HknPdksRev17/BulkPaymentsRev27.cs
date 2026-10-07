using System.Data;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed class BulkBankPaymentDialogRev27 : Form
{
    readonly FirebirdDatabase db;
    readonly DateTime period;
    readonly DataGridView grid = MakeGrid();
    readonly DateTimePicker date = new() { Format=DateTimePickerFormat.Custom, CustomFormat="dd.MM.yyyy", Width=110 };
    DataTable table = new();

    internal BulkBankPaymentDialogRev27(FirebirdDatabase database, DateTime selectedPeriod)
    {
        db=database; period=new DateTime(selectedPeriod.Year,selectedPeriod.Month,1);
        Text="Toplu Banka Ödemesi • ADMIN"; StartPosition=FormStartPosition.CenterParent; Size=new Size(980,680); Font=new Font("Segoe UI",9f);
        Build(); Shown+=(_,_)=>LoadRows();
    }

    void Build()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(10)};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,52));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,52));
        var top=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(4,7,0,0)};
        top.Controls.Add(new Label{Text=$"{period:MMMM yyyy} • Ödeme Tarihi",AutoSize=true,Padding=new Padding(0,7,5,0),Font=new Font(Font,FontStyle.Bold)});
        top.Controls.Add(date);
        top.Controls.Add(B("BORDRODAN DOLDUR",FillFromPayroll,155));
        top.Controls.Add(B("TÜMÜNÜ SEÇ",()=>SetAll(true),100));
        top.Controls.Add(B("TEMİZLE",()=>SetAll(false),85));
        root.Controls.Add(top,0,0);
        Configure();root.Controls.Add(grid,0,1);
        var bottom=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(4,7,0,0)};
        bottom.Controls.Add(B("SEÇİLİ BANKA ÖDEMELERİNİ İŞLE",Save,245));
        root.Controls.Add(bottom,0,2);Controls.Add(root);
    }

    static DataGridView MakeGrid()=>new(){Dock=DockStyle.Fill,AllowUserToAddRows=false,AllowUserToDeleteRows=false,RowHeadersVisible=false,AutoGenerateColumns=false,BackgroundColor=Color.White,SelectionMode=DataGridViewSelectionMode.FullRowSelect};
    static Button B(string t,Action a,int w){var b=new Button{Text=t,Width=w,Height=32,FlatStyle=FlatStyle.Flat};b.Click+=(_,_)=>a();return b;}
    void Configure()
    {
        grid.Columns.Add(new DataGridViewCheckBoxColumn{Name="SEC",HeaderText="Seç",DataPropertyName="SEC",Width=45});
        Add("PKNO","Kart",65,true);Add("ADSOYAD","Ad Soyad",185,true);Add("BORDRO_BANKA","Bordro Banka",105,true,"N2");
        Add("MEVCUT","Mevcut Ödeme",110,true,"N2");Add("ODENECEK","Ödenecek",105,false,"N2");Add("DURUM","Durum",180,true);
    }
    void Add(string n,string h,int w,bool ro,string? fmt=null)=>grid.Columns.Add(new DataGridViewTextBoxColumn{Name=n,HeaderText=h,DataPropertyName=n,Width=w,ReadOnly=ro,DefaultCellStyle=new DataGridViewCellStyle{Format=fmt??"",Alignment=fmt is null?DataGridViewContentAlignment.MiddleLeft:DataGridViewContentAlignment.MiddleRight}});

    void LoadRows()
    {
        var b=period.AddMonths(1);
        var raw=db.Query(@"select u.PKNO,k.AD,k.SOYAD,coalesce(u.EX2,0) BORDRO_BANKA,
                coalesce((select first 1 o.NODENEN from ODEME o where o.PKNO=u.PKNO and o.BASTAR>=@A and o.BASTAR<@B order by o.BASTAR),0) MEVCUT
            from UCRETLER u inner join KIMLIK k on k.PKNO=u.PKNO
            where u.BASTAR>=@A and u.BASTAR<@B and k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A)
            order by u.PKNO",new FbParameter("@A",period),new FbParameter("@B",b));
        table=new DataTable();table.Columns.Add("SEC",typeof(bool));table.Columns.Add("PKNO");table.Columns.Add("ADSOYAD");table.Columns.Add("BORDRO_BANKA",typeof(decimal));table.Columns.Add("MEVCUT",typeof(decimal));table.Columns.Add("ODENECEK",typeof(decimal));table.Columns.Add("DURUM");
        foreach(DataRow r in raw.Rows)
        {
            var bank=Math.Abs(M(r,"BORDRO_BANKA"));var current=Math.Abs(M(r,"MEVCUT"));
            table.Rows.Add(false,S(r,"PKNO"),$"{S(r,"AD")} {S(r,"SOYAD")}".Trim(),bank,current,Math.Max(0,bank-current),current>0?"Mevcut ödeme var":"Hazır");
        }
        grid.DataSource=table;
    }

    void FillFromPayroll(){foreach(DataRow r in table.Rows){r["ODENECEK"]=Math.Abs(Convert.ToDecimal(r["BORDRO_BANKA"]));r["SEC"]=Convert.ToDecimal(r["ODENECEK"])>0;}grid.Refresh();}
    void SetAll(bool x){foreach(DataRow r in table.Rows)r["SEC"]=x;grid.Refresh();}

    void Save()
    {
        var rows=table.AsEnumerable().Where(r=>r.Field<bool>("SEC")&&Math.Abs(r.Field<decimal>("ODENECEK"))>0).ToArray();
        if(rows.Length==0){MessageBox.Show("Ödeme için seçili personel yok.");return;}
        if(MessageBox.Show($"{rows.Length} banka ödemesi {date.Value:dd.MM.yyyy} tarihine işlenecek. Aynı kişi/ay için mükerrer satır oluşturulmayacak. Devam?","Toplu Banka",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
        var end=period.AddMonths(1);
        db.InTransaction((cn,tr)=>{
            foreach(var r in rows)
            {
                var card=S(r,"PKNO");var amount=Math.Abs(Convert.ToDecimal(r["ODENECEK"]));
                using var count=FirebirdDatabase.CreateCommand(cn,tr,"select count(*) from ODEME where PKNO=@P and BASTAR>=@A and BASTAR<@B",new FbParameter("@P",card),new FbParameter("@A",period),new FbParameter("@B",end));
                var n=Convert.ToInt32(count.ExecuteScalar()??0);
                if(n>1)throw new InvalidOperationException($"{card}: aynı ayda birden fazla ODEME satırı var; işlem yapılmadı.");
                if(n==1)
                {
                    using var up=FirebirdDatabase.CreateCommand(cn,tr,"update ODEME set NODENEN=@N,NOTARIH=@D where PKNO=@P and BASTAR>=@A and BASTAR<@B",
                        new FbParameter("@N",amount),new FbParameter("@D",date.Value.Date),new FbParameter("@P",card),new FbParameter("@A",period),new FbParameter("@B",end));
                    if(up.ExecuteNonQuery()!=1)throw new InvalidOperationException($"{card}: ödeme güvenli güncellenemedi.");
                }
                else
                {
                    using var ins=FirebirdDatabase.CreateCommand(cn,tr,"insert into ODEME (PKNO,BASTAR,BITTAR,NODENEN,NOTARIH,FMODENEN) values (@P,@A,@Z,@N,@D,0)",
                        new FbParameter("@P",card),new FbParameter("@A",period),new FbParameter("@Z",end.AddDays(-1)),new FbParameter("@N",amount),new FbParameter("@D",date.Value.Date));
                    ins.ExecuteNonQuery();
                }
            }
            return 0;
        });
        MessageBox.Show($"{rows.Length} banka ödemesi işlendi.");LoadRows();
    }
    static string S(DataRow r,string n)=>r.Table.Columns.Contains(n)&&r[n]!=DBNull.Value?Convert.ToString(r[n])?.Trim()??"":"";
    static decimal M(DataRow r,string n){try{return r.Table.Columns.Contains(n)&&r[n]!=DBNull.Value?Convert.ToDecimal(r[n]):0m;}catch{return 0m;}}
}

internal sealed class BulkAdvanceDialogRev27 : Form
{
    readonly FirebirdDatabase db;readonly DateTime period;readonly DataGridView grid=new(){Dock=DockStyle.Fill,AllowUserToAddRows=false,AllowUserToDeleteRows=false,RowHeadersVisible=false,AutoGenerateColumns=false,BackgroundColor=Color.White};
    readonly DateTimePicker date=new(){Format=DateTimePickerFormat.Custom,CustomFormat="dd.MM.yyyy",Width=110};DataTable table=new();
    internal BulkAdvanceDialogRev27(FirebirdDatabase database,DateTime selectedPeriod){db=database;period=new DateTime(selectedPeriod.Year,selectedPeriod.Month,1);Text="Toplu Avans • ADMIN";StartPosition=FormStartPosition.CenterParent;Size=new Size(850,650);Font=new Font("Segoe UI",9f);Build();Shown+=(_,_)=>LoadRows();}
    static Button B(string t,Action a,int w){var b=new Button{Text=t,Width=w,Height=32,FlatStyle=FlatStyle.Flat};b.Click+=(_,_)=>a();return b;}
    void Build(){var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(10)};root.RowStyles.Add(new RowStyle(SizeType.Absolute,52));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,52));var top=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(4,7,0,0)};top.Controls.Add(new Label{Text=$"{period:MMMM yyyy} • Avans Tarihi",AutoSize=true,Padding=new Padding(0,7,5,0),Font=new Font(Font,FontStyle.Bold)});top.Controls.Add(date);top.Controls.Add(B("TÜMÜNÜ SEÇ",()=>SetAll(true),100));top.Controls.Add(B("TEMİZLE",()=>SetAll(false),85));root.Controls.Add(top,0,0);
        grid.Columns.Add(new DataGridViewCheckBoxColumn{Name="SEC",HeaderText="Seç",DataPropertyName="SEC",Width=45});Add("PKNO","Kart",65,true);Add("ADSOYAD","Ad Soyad",190,true);Add("MAAS","Maaş",100,true,"N2");Add("MIKTAR","Avans Tutarı",120,false,"N2");Add("DURUM","Durum",160,true);root.Controls.Add(grid,0,1);var bottom=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(4,7,0,0)};bottom.Controls.Add(B("SEÇİLİ AVANSLARI KAYDET",210,Save));root.Controls.Add(bottom,0,2);Controls.Add(root);}
    static Button B(string t,int w,Action a)=>B(t,a,w);
    void Add(string n,string h,int w,bool ro,string? fmt=null)=>grid.Columns.Add(new DataGridViewTextBoxColumn{Name=n,HeaderText=h,DataPropertyName=n,Width=w,ReadOnly=ro,DefaultCellStyle=new DataGridViewCellStyle{Format=fmt??"",Alignment=fmt is null?DataGridViewContentAlignment.MiddleLeft:DataGridViewContentAlignment.MiddleRight}});
    void LoadRows(){var end=period.AddMonths(1);var raw=db.Query(@"select PKNO,AD,SOYAD,coalesce(MAAS,0) MAAS from KIMLIK where (IGTARIH is null or IGTARIH<@B) and (ICTARIH is null or ICTARIH>=@A) order by PKNO",new FbParameter("@A",period),new FbParameter("@B",end));table=new DataTable();table.Columns.Add("SEC",typeof(bool));table.Columns.Add("PKNO");table.Columns.Add("ADSOYAD");table.Columns.Add("MAAS",typeof(decimal));table.Columns.Add("MIKTAR",typeof(decimal));table.Columns.Add("DURUM");foreach(DataRow r in raw.Rows)table.Rows.Add(false,S(r,"PKNO"),$"{S(r,"AD")} {S(r,"SOYAD")}".Trim(),M(r,"MAAS"),0m,"Hazır");grid.DataSource=table;}
    void SetAll(bool x){foreach(DataRow r in table.Rows)r["SEC"]=x;grid.Refresh();}
    void Save(){var rows=table.AsEnumerable().Where(r=>r.Field<bool>("SEC")&&Math.Abs(r.Field<decimal>("MIKTAR"))>0).ToArray();if(rows.Length==0){MessageBox.Show("Personel seçip avans tutarı girin.");return;}if(MessageBox.Show($"{rows.Length} avans {date.Value:dd.MM.yyyy} tarihine kaydedilecek. Aynı kişi+tarih TOPLU AVANS varsa güncellenecek. Devam?","Toplu Avans",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
        db.InTransaction((cn,tr)=>{int next;using(var m=FirebirdDatabase.CreateCommand(cn,tr,"select coalesce(max(KOD),0)+1 from AVANS"))next=Convert.ToInt32(m.ExecuteScalar()??1);foreach(var r in rows){var card=S(r,"PKNO");var amount=Math.Abs(Convert.ToDecimal(r["MIKTAR"]));int? code=null;using(var f=FirebirdDatabase.CreateCommand(cn,tr,"select first 1 KOD from AVANS where PKNO=@P and TARIH=@D and TURKOD=2 and upper(trim(coalesce(ACIKLAMA,'')))='TOPLU AVANS' order by KOD",new FbParameter("@P",card),new FbParameter("@D",date.Value.Date))){var o=f.ExecuteScalar();if(o is not null&&o!=DBNull.Value)code=Convert.ToInt32(o);}if(code.HasValue){using var up=FirebirdDatabase.CreateCommand(cn,tr,"update AVANS set MIKTAR=@M,TOPMIKTAR=@M,VTARIH=@D,TAKSITSAYISI=1,TAKSITNO=1,ACIKLAMA='TOPLU AVANS' where KOD=@K and PKNO=@P",new FbParameter("@M",amount),new FbParameter("@D",date.Value.Date),new FbParameter("@K",code.Value),new FbParameter("@P",card));up.ExecuteNonQuery();}else{using var ins=FirebirdDatabase.CreateCommand(cn,tr,"insert into AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,KOD,TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA) values (@P,@D,@M,@D,2,@K,@M,1,1,'TOPLU AVANS')",new FbParameter("@P",card),new FbParameter("@D",date.Value.Date),new FbParameter("@M",amount),new FbParameter("@K",next++));ins.ExecuteNonQuery();}}return 0;});MessageBox.Show($"{rows.Length} toplu avans kaydedildi.");LoadRows();}
    static string S(DataRow r,string n)=>r.Table.Columns.Contains(n)&&r[n]!=DBNull.Value?Convert.ToString(r[n])?.Trim()??"":"";
    static decimal M(DataRow r,string n){try{return r.Table.Columns.Contains(n)&&r[n]!=DBNull.Value?Convert.ToDecimal(r[n]):0m;}catch{return 0m;}}
}
