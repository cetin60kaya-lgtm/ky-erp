using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyPeriodForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DataGridView grid = new()
    {
        Location=new Point(0,0),Size=new Size(213,345),ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,
        SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,BackgroundColor=Color.White,RowHeadersWidth=20,
        AutoGenerateColumns=false
    };
    readonly TextBox name = new(){Location=new Point(334,16),Size=new Size(200,21)};
    readonly ComboBox group = new(){Location=new Point(334,48),Size=new Size(200,21),DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="AD",ValueMember="KOD"};
    readonly DateTimePicker start = new(){Location=new Point(334,81),Size=new Size(200,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMMM yyyy dddd"};
    readonly DateTimePicker end = new(){Location=new Point(334,121),Size=new Size(200,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMMM yyyy dddd"};
    readonly TextBox minusTime = TimeBox(382,144,40);
    readonly TextBox minusDay = TimeBox(382,168,25);
    readonly TextBox plusTime = TimeBox(382,192,40);
    readonly TextBox plusDay = TimeBox(382,216,25);
    readonly ComboBox plusArea = new(){Location=new Point(542,144),Size=new Size(180,21),DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="AD",ValueMember="KOD"};
    readonly ComboBox minusArea = new(){Location=new Point(542,192),Size=new Size(180,21),DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="AD",ValueMember="KOD"};
    readonly Label total = new(){Location=new Point(670,92),Size=new Size(40,20),BorderStyle=BorderStyle.Fixed3D,TextAlign=ContentAlignment.MiddleCenter};
    readonly DateTimePicker filterStart = new(){Location=new Point(38,20),Size=new Size(171,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy"};
    readonly DateTimePicker filterEnd = new(){Location=new Point(276,20),Size=new Size(171,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy"};
    readonly Button save = Cmd("Kaydet",6,350,106);
    int? code;
    bool adding;
    bool editing;

    public LegacyPeriodForm()
    {
        Text="Dönem Tanımlamaları";StartPosition=FormStartPosition.CenterParent;ClientSize=new Size(738,422);
        FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;ShowInTaskbar=false;
        Font=new Font("Microsoft Sans Serif",8.25f);KeyPreview=true;
        Build();Shown+=(_,_)=>ReloadAll();KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    static Label L(string t,int x,int y)=>new(){Text=t,Location=new Point(x,y),AutoSize=true};
    static TextBox TimeBox(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),BorderStyle=BorderStyle.FixedSingle};
    static Button Cmd(string text,int x,int y,int w)=>new(){Text=text,Location=new Point(x,y),Size=new Size(w,33),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold),UseVisualStyleBackColor=true};

    void Build()
    {
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="AD",DataPropertyName="AD",HeaderText="Dönem Adı",Width=175});
        grid.SelectionChanged+=(_,_)=>{if(!editing)LoadSelected();};Controls.Add(grid);
        Controls.AddRange([L("Dönem Adı",238,24),L("Grubu",238,56),L("Başlangıç",238,89),L("Bitiş Tarihi",238,123),L("Dönemlik Çalışma Eksiği",238,152),L("Dönemlik Çalışma Eksiği",238,176),L("Dönemlik Çalışma Fazlası",238,200),L("Dönemlik Çalışma Fazlası",238,224),L("Toplam Gün Sayısı",550,97),L("Ekleneceği Alan",438,152),L("Çıkarılacağı Alan",438,200),L("Gün",409,176),L("Gün",409,224)]);
        Controls.AddRange([name,group,start,end,minusTime,minusDay,plusTime,plusDay,plusArea,minusArea,total]);

        var filters=new GroupBox{Text="Filtreleme Bilgileri",Location=new Point(224,256),Size=new Size(489,89)};
        filters.Controls.Add(filterStart);filters.Controls.Add(filterEnd);filters.Controls.Add(L("İle",234,25));
        var between=Cmd("Arasındaki Dönemler",46,56,160);between.Height=30;var all=Cmd("Tüm Dönemleri Listele",284,56,160);all.Height=30;
        between.Click+=(_,_)=>ReloadGrid(true);all.Click+=(_,_)=>ReloadGrid(false);filters.Controls.Add(between);filters.Controls.Add(all);Controls.Add(filters);

        var add=Cmd("Yeni Ekle",126,350,106);var edit=Cmd("Değiştir",246,350,106);var del=Cmd("Sil",366,350,106);var delAll=Cmd("Tümünü Sil",486,350,106);var close=Cmd("Kapat",606,350,106);
        Controls.AddRange([save,add,edit,del,delAll,close]);save.Enabled=false;
        add.Click+=(_,_)=>BeginNew();edit.Click+=(_,_)=>BeginEdit();save.Click+=(_,_)=>SaveCurrent();del.Click+=(_,_)=>DeleteOne();delAll.Click+=(_,_)=>DeleteAll();close.Click+=(_,_)=>Close();
        start.ValueChanged+=(_,_)=>UpdateTotal();end.ValueChanged+=(_,_)=>UpdateTotal();SetEdit(false);
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
