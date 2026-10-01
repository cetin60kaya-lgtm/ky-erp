using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyPeriodForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DataGridView grid = new(){ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,BackgroundColor=Color.White,AutoGenerateColumns=false};
    readonly TextBox name = new();
    readonly ComboBox group = new(){DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="AD",ValueMember="KOD"};
    readonly DateTimePicker start = new(){Format=DateTimePickerFormat.Custom,CustomFormat="dd MMMM yyyy dddd"};
    readonly DateTimePicker end = new(){Format=DateTimePickerFormat.Custom,CustomFormat="dd MMMM yyyy dddd"};
    readonly TextBox minusTime = new(), minusDay = new(), plusTime = new(), plusDay = new();
    readonly ComboBox plusArea = new(){DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="AD",ValueMember="KOD"};
    readonly ComboBox minusArea = new(){DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="AD",ValueMember="KOD"};
    readonly Label total = new(){TextAlign=ContentAlignment.MiddleCenter,Font=new Font("Segoe UI",11f,FontStyle.Bold)};
    readonly DateTimePicker filterStart = new(){Format=DateTimePickerFormat.Short};
    readonly DateTimePicker filterEnd = new(){Format=DateTimePickerFormat.Short};
    readonly Button save = Cmd("Kaydet");
    int? code; bool adding; bool editing;

    public LegacyPeriodForm(){Text="Dönem Tanımlamaları";StartPosition=FormStartPosition.CenterScreen;Size=new Size(1180,720);MinimumSize=new Size(920,620);Font=new Font("Segoe UI",9f);BackColor=Color.FromArgb(246,249,253);KeyPreview=true;Build();Shown+=(_,_)=>ReloadAll();KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};}
    static Label L(string t)=>new(){Text=t,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=Color.FromArgb(66,82,104)};
    static Button Cmd(string text,int width=112)=>new(){Text=text,Width=width,Height=36,FlatStyle=FlatStyle.Flat,Font=new Font("Segoe UI",9f,FontStyle.Bold)};
    static void Row(TableLayoutPanel t,int r,string text,Control c){t.RowStyles.Add(new RowStyle(SizeType.Absolute,38));t.Controls.Add(L(text),0,r);c.Dock=DockStyle.Fill;c.Margin=new Padding(3,6,3,6);t.Controls.Add(c,1,r);}

    void Build()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,ColumnCount=1,Padding=new Padding(14)};root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        var split=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=1,Margin=Padding.Empty};split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,46));split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,54));
        var left=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,ColumnCount=1};left.RowStyles.Add(new RowStyle(SizeType.Absolute,98));left.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var filterBox=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=2,Padding=new Padding(10)};filterBox.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,90));filterBox.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var range=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=true,FlowDirection=FlowDirection.LeftToRight};filterStart.Width=112;filterEnd.Width=112;var between=Cmd("Aralığı Listele",120);var all=Cmd("Tümünü Listele",120);between.Click+=(_,_)=>ReloadGrid(true);all.Click+=(_,_)=>ReloadGrid(false);range.Controls.AddRange([filterStart,new Label{Text="—",AutoSize=true,Padding=new Padding(4,8,4,0)},filterEnd,between,all]);filterBox.Controls.Add(L("Filtre"),0,0);filterBox.Controls.Add(range,1,0);left.Controls.Add(filterBox,0,0);
        grid.Dock=DockStyle.Fill;grid.Columns.Add(new DataGridViewTextBoxColumn{Name="AD",DataPropertyName="AD",HeaderText="Dönem Adı",AutoSizeMode=DataGridViewAutoSizeColumnMode.Fill});grid.SelectionChanged+=(_,_)=>{if(!editing)LoadSelected();};left.Controls.Add(grid,0,1);split.Controls.Add(left,0,0);
        var editor=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=11,Padding=new Padding(18)};editor.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,190));editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        Row(editor,0,"Dönem Adı",name);Row(editor,1,"Çalışma Grubu",group);Row(editor,2,"Başlangıç",start);Row(editor,3,"Bitiş",end);Row(editor,4,"Toplam Gün",total);Row(editor,5,"Dönemlik Çalışma Eksiği",minusTime);Row(editor,6,"Eksik Gün",minusDay);Row(editor,7,"Ekleneceği Alan",plusArea);Row(editor,8,"Dönemlik Çalışma Fazlası",plusTime);Row(editor,9,"Fazla Gün",plusDay);Row(editor,10,"Çıkarılacağı Alan",minusArea);split.Controls.Add(editor,1,0);root.Controls.Add(split,0,0);
        var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(0,10,0,0)};var add=Cmd("Yeni Ekle");var edit=Cmd("Değiştir");var del=Cmd("Sil");var delAll=Cmd("Tümünü Sil",120);save.Enabled=false;add.Click+=(_,_)=>BeginNew();edit.Click+=(_,_)=>BeginEdit();save.Click+=(_,_)=>SaveCurrent();del.Click+=(_,_)=>DeleteOne();delAll.Click+=(_,_)=>DeleteAll();actions.Controls.AddRange([save,delAll,del,edit,add]);root.Controls.Add(actions,0,1);Controls.Add(root);start.ValueChanged+=(_,_)=>UpdateTotal();end.ValueChanged+=(_,_)=>UpdateTotal();SetEdit(false);
    }
    void ReloadAll()
    {
        try
        {
            group.DataSource=db.Query("select KOD,AD from GRUP order by KOD");
            var bordro=db.Query("select KOD,AD from BORDRO order by KOD");plusArea.DataSource=bordro.Copy();minusArea.DataSource=bordro.Copy();
            filterStart.Value=new DateTime(DateTime.Today.Year,1,1);filterEnd.Value=DateTime.Today.AddYears(1).Date;
            ReloadGrid(false);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }

    void ReloadGrid(bool filtered)
    {
        try
        {
            var sql="select KOD,AD,BASTAR,BITTAR,ACESAAT,SSKACE,ACFSAAT,SSKACF,EBALAN,CBALAN,GRUP from DONEM";
            DataTable dt;
            if(filtered)dt=db.Query(sql+" where BASTAR<=@B and BITTAR>=@A order by BASTAR,GRUP",new FbParameter("@A",filterStart.Value.Date),new FbParameter("@B",filterEnd.Value.Date));
            else dt=db.Query(sql+" order by BASTAR,GRUP");
            grid.DataSource=dt;if(grid.Rows.Count>0){grid.CurrentCell=grid.Rows[0].Cells[0];LoadSelected();}else{code=null;ClearFields();}
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    DataRow? CurrentRow()=>grid.CurrentRow?.DataBoundItem is DataRowView v?v.Row:null;
    void LoadSelected()
    {
        var r=CurrentRow();if(r is null)return;code=Convert.ToInt32(r["KOD"]);adding=false;
        name.Text=S(r,"AD");if(r["GRUP"]!=DBNull.Value)group.SelectedValue=Convert.ToInt32(r["GRUP"]);
        if(r["BASTAR"]!=DBNull.Value)start.Value=Convert.ToDateTime(r["BASTAR"]);if(r["BITTAR"]!=DBNull.Value)end.Value=Convert.ToDateTime(r["BITTAR"]);
        minusTime.Text=AsTime(r["ACESAAT"]);minusDay.Text=S(r,"SSKACE");plusTime.Text=AsTime(r["ACFSAAT"]);plusDay.Text=S(r,"SSKACF");
        SelectValue(plusArea,r["EBALAN"]);SelectValue(minusArea,r["CBALAN"]);UpdateTotal();SetEdit(false);save.Enabled=false;
    }
    static string S(DataRow r,string c)=>r[c]==DBNull.Value?"":Convert.ToString(r[c])??"";
    static string AsTime(object value){if(value==DBNull.Value)return "";var m=Convert.ToInt32(value);return $"{Math.Max(0,m)/60:00}:{Math.Max(0,m)%60:00}";}
    static void SelectValue(ComboBox c,object value){if(value!=DBNull.Value)c.SelectedValue=Convert.ToInt32(value);}
    static object ParseTime(string value){if(string.IsNullOrWhiteSpace(value))return DBNull.Value;if(TimeSpan.TryParse(value.Trim(),out var t))return (int)Math.Round(t.TotalMinutes);if(int.TryParse(value,out var n))return n;throw new FormatException("Çalışma süresini SS:dd biçiminde girin.");}
    static object ParseDay(string value)=>string.IsNullOrWhiteSpace(value)?DBNull.Value:int.TryParse(value.Trim(),out var n)?n:throw new FormatException("Gün sayısı sayısal olmalıdır.");
    static object ComboValue(ComboBox c)=>c.SelectedValue is null||c.SelectedValue is DataRowView?DBNull.Value:Convert.ToInt32(c.SelectedValue);

    void UpdateTotal()=>total.Text=Math.Max(0,(end.Value.Date-start.Value.Date).Days+1).ToString();
    void SetEdit(bool enabled){name.ReadOnly=!enabled;group.Enabled=enabled;start.Enabled=enabled;end.Enabled=enabled;minusTime.ReadOnly=!enabled;minusDay.ReadOnly=!enabled;plusTime.ReadOnly=!enabled;plusDay.ReadOnly=!enabled;plusArea.Enabled=enabled;minusArea.Enabled=enabled;editing=enabled;}
    void ClearFields(){name.Clear();minusTime.Clear();minusDay.Clear();plusTime.Clear();plusDay.Clear();start.Value=DateTime.Today;end.Value=DateTime.Today;UpdateTotal();}
    void BeginNew(){code=null;adding=true;ClearFields();SetEdit(true);save.Enabled=true;name.Focus();}
    void BeginEdit(){if(code is null){MessageBox.Show("Bir dönem seçin.",Text);return;}adding=false;SetEdit(true);save.Enabled=true;name.Focus();}

    void SaveCurrent()
    {
        try
        {
            var ad=name.Text.Trim();if(ad.Length==0)throw new InvalidOperationException("Dönem adı alanını boş bırakamazsınız. Lütfen dönem adını girin..!");
            if(end.Value.Date<start.Value.Date)throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");
            if(group.SelectedValue is null||group.SelectedValue is DataRowView)throw new InvalidOperationException("Çalışma grubunu seçin.");var g=Convert.ToInt32(group.SelectedValue);
            var dup=Convert.ToInt32(db.Scalar("select count(*) from DONEM where GRUP=@G and BASTAR=@A and BITTAR=@B"+(code is null?"":" and KOD<>@K"),code is null?[new FbParameter("@G",g),new FbParameter("@A",start.Value.Date),new FbParameter("@B",end.Value.Date)]:[new FbParameter("@G",g),new FbParameter("@A",start.Value.Date),new FbParameter("@B",end.Value.Date),new FbParameter("@K",code.Value)])??0);
            if(dup>0)throw new InvalidOperationException("Aynı grup ve tarih aralığına sahip dönem zaten var.");
            var values=new FbParameter[]{new("@AD",ad),new("@A",start.Value.Date),new("@B",end.Value.Date),new("@ACE",ParseTime(minusTime.Text)),new("@SSKACE",ParseDay(minusDay.Text)),new("@ACF",ParseTime(plusTime.Text)),new("@SSKACF",ParseDay(plusDay.Text)),new("@EBA",ComboValue(plusArea)),new("@CBA",ComboValue(minusArea)),new("@G",g)};
            if(adding)
            {
                code=Convert.ToInt32(db.Scalar("select coalesce(max(KOD),0)+1 from DONEM")??1);
                db.Execute("insert into DONEM (KOD,AD,BASTAR,BITTAR,ACESAAT,SSKACE,ACFSAAT,SSKACF,EBALAN,CBALAN,GRUP) values (@K,@AD,@A,@B,@ACE,@SSKACE,@ACF,@SSKACF,@EBA,@CBA,@G)",[new FbParameter("@K",code.Value),..values]);
            }
            else
            {
                if(code is null)throw new InvalidOperationException("Bir dönem seçin.");
                db.Execute("update DONEM set AD=@AD,BASTAR=@A,BITTAR=@B,ACESAAT=@ACE,SSKACE=@SSKACE,ACFSAAT=@ACF,SSKACF=@SSKACF,EBALAN=@EBA,CBALAN=@CBA,GRUP=@G where KOD=@K",[..values,new FbParameter("@K",code.Value)]);
            }
            adding=false;SetEdit(false);save.Enabled=false;ReloadGrid(false);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    int PeriodUsage(int selected)=>Convert.ToInt32(db.Scalar("select count(*) from UCRETLER where DONEM=@K",new FbParameter("@K",selected))??0);
    void DeleteOne()
    {
        if(code is null)return;
        try
        {
            if(PeriodUsage(code.Value)>0)throw new InvalidOperationException("Bu döneme ait bordro/ücret bilgileri var; dönem silinemez.");
            if(MessageBox.Show("Seçili dönemi silmek istediğinizden emin misiniz ?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
            db.Execute("delete from DONEM where KOD=@K",new FbParameter("@K",code.Value));code=null;ReloadGrid(false);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
    void DeleteAll()
    {
        try
        {
            if(Convert.ToInt32(db.Scalar("select count(*) from UCRETLER where DONEM is not null and DONEM>0")??0)>0)throw new InvalidOperationException("Dönemlere ait bordro/ücret bilgileri var; toplu silme yapılamaz.");
            if(MessageBox.Show("Tüm dönem kayıtları silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
            db.Execute("delete from DONEM");code=null;ReloadGrid(false);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
}
