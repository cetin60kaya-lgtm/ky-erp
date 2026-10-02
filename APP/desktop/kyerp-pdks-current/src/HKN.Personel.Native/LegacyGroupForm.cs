using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyGroupForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly TextBox name = new();
    readonly TextBox periodHours = new();
    readonly TextBox dailyHours = new();
    readonly TextBox terminalCode = new();
    readonly DataGridView grid = new(){ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,MultiSelect=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,BackgroundColor=Color.White,AutoGenerateColumns=false};
    readonly TextBox[] dayShift = new TextBox[5];
    readonly TextBox[] starts = new TextBox[5];
    readonly TextBox[] ends = new TextBox[5];
    readonly TextBox[] shiftNames = new TextBox[5];
    int? selectedCode;
    bool editing;
    bool adding;

    public LegacyGroupForm()
    {
        Text="Çalışma Grupları"; StartPosition=FormStartPosition.CenterScreen; Size=new Size(1100,680); MinimumSize=new Size(900,600);
        Font=new Font("Segoe UI",9f); BackColor=PdksAppearance.Current.Canvas; KeyPreview=true;
        Build(); Shown+=(_,_)=>Reload(); KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    static Label L(string text)=>PdksUiKit.FieldLabel(text);
    static void Row(TableLayoutPanel t,int r,string text,Control c){t.RowStyles.Add(new RowStyle(SizeType.Absolute,42));t.Controls.Add(L(text),0,r);c.Dock=DockStyle.Fill;c.Margin=new Padding(0,6,0,6);t.Controls.Add(c,1,r);}
    static Button Cmd(string text,int width=112)=>PdksUiKit.Button(text,width,
        text.Contains("Kaydet",StringComparison.OrdinalIgnoreCase)?PdksActionRole.Primary:
        text.Contains("Sil",StringComparison.OrdinalIgnoreCase)?PdksActionRole.Danger:PdksActionRole.Secondary);

    void Build()
    {
        var p=PdksAppearance.Current;var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,ColumnCount=1,Padding=new Padding(16),BackColor=p.Canvas};root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=1,BackColor=p.Canvas,Margin=Padding.Empty};
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,38));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,12));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,62));

        var leftCard=PdksUiKit.Card();
        var left=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,ColumnCount=1,Padding=new Padding(16),BackColor=p.Surface};
        left.RowStyles.Add(new RowStyle(SizeType.Absolute,36));
        left.RowStyles.Add(new RowStyle(SizeType.Absolute,190));
        left.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        left.Controls.Add(PdksUiKit.SectionTitle("Çalışma Grubu"),0,0);
        var details=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=4,Padding=new Padding(0,6,0,4),BackColor=p.Surface};
        details.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));
        details.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        Row(details,0,"Grup Adı",name);
        Row(details,1,"Dönemlik Çalışma Saati",periodHours);
        Row(details,2,"Günlük Çalışma Saati",dailyHours);
        Row(details,3,"Terminal Kodu",terminalCode);
        left.Controls.Add(details,0,1);
        grid.Dock=DockStyle.Fill;grid.Columns.Add(new DataGridViewTextBoxColumn{Name="AD",DataPropertyName="AD",HeaderText="Çalışma Grubu",AutoSizeMode=DataGridViewAutoSizeColumnMode.Fill});
        grid.SelectionChanged+=(_,_)=>{if(!editing)LoadSelection();};
        grid.BorderStyle=BorderStyle.None;grid.RowHeadersVisible=false;grid.RowTemplate.Height=31;grid.ColumnHeadersHeight=35;
        left.Controls.Add(grid,0,2);leftCard.Controls.Add(left);body.Controls.Add(leftCard,0,0);
        body.Controls.Add(new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas},1,0);

        var shiftCard=PdksUiKit.Card();
        var shifts=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=7,Padding=new Padding(18),BackColor=p.Surface};
        shifts.RowStyles.Add(new RowStyle(SizeType.Absolute,36));
        shifts.RowStyles.Add(new RowStyle(SizeType.Absolute,30));
        for(var row=2;row<7;row++)shifts.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        shifts.Controls.Add(PdksUiKit.SectionTitle("Vardiya Saatleri"),0,0);
        shifts.SetColumnSpan(shifts.GetControlFromPosition(0,0)!,4);
        shifts.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));
        shifts.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,112));
        shifts.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,112));
        shifts.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        foreach(var x in new[]{("Gün Dön.",0),("Giriş Saati",1),("Çıkış Saati",2),("Vardiya Adı",3)})
            shifts.Controls.Add(new Label{Text=x.Item1,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",8.5f,FontStyle.Bold),ForeColor=p.Muted},x.Item2,1);
        for(int r=0;r<5;r++)
        {
            dayShift[r]=new TextBox();starts[r]=new TextBox();ends[r]=new TextBox();shiftNames[r]=new TextBox();
            var arr=new Control[]{dayShift[r],starts[r],ends[r],shiftNames[r]};
            for(int col=0;col<4;col++){arr[col].Dock=DockStyle.Fill;arr[col].Margin=new Padding(0,6,8,6);shifts.Controls.Add(arr[col],col,r+2);}
        }
        shiftCard.Controls.Add(shifts);body.Controls.Add(shiftCard,2,0);
        root.Controls.Add(body,0,0);
        var actions=PdksUiKit.ActionBar(true,p.Canvas);var save=Cmd("Kaydet");var add=Cmd("Yeni Ekle");var edit=Cmd("Değiştir");var del=Cmd("Sil");var delAll=Cmd("Tümünü Sil",120);save.Enabled=false;save.Click+=(_,_)=>Save();add.Click+=(_,_)=>BeginNew(save);edit.Click+=(_,_)=>BeginEdit(save);del.Click+=(_,_)=>DeleteOne();delAll.Click+=(_,_)=>DeleteAll();actions.Controls.AddRange([save,delAll,del,edit,add]);root.Controls.Add(actions,0,1);Controls.Add(root);SetEditors(false);
    }
    void Reload()
    {
        try
        {
            grid.DataSource=db.Query("select KOD,AD,VAD1,VAD2,VAD3,VAD4,VAD5,BASSAAT1,BASSAAT2,BASSAAT3,BASSAAT4,BASSAAT5,BITSAAT1,BITSAAT2,BITSAAT3,BITSAAT4,BITSAAT5,TSAAT,GSAAT,GDSAAT1,GDSAAT2,GDSAAT3,GDSAAT4,GDSAAT5,MKOD from GRUP order by KOD");
            if(grid.Rows.Count>0){grid.CurrentCell=grid.Rows[0].Cells[0];LoadSelection();}
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Error,"Definitions.Groups");}
    }

    DataRow? CurrentData()
    {
        if(grid.CurrentRow?.DataBoundItem is DataRowView v)return v.Row; return null;
    }

    void LoadSelection()
    {
        var r=CurrentData();if(r is null)return;selectedCode=Convert.ToInt32(r["KOD"]);adding=false;
        name.Text=S(r,"AD");periodHours.Text=TimeText(r,"TSAAT");dailyHours.Text=TimeText(r,"GSAAT");terminalCode.Text=S(r,"MKOD");
        for(int i=0;i<5;i++)
        {
            shiftNames[i].Text=S(r,$"VAD{i+1}");starts[i].Text=TimeText(r,$"BASSAAT{i+1}");ends[i].Text=TimeText(r,$"BITSAAT{i+1}");dayShift[i].Text=TimeText(r,$"GDSAAT{i+1}");
        }
    }

    static string S(DataRow r,string c)=>r.Table.Columns.Contains(c)&&r[c]!=DBNull.Value?Convert.ToString(r[c])??"":"";
    static string TimeText(DataRow r,string c)=>r.Table.Columns.Contains(c)&&r[c]!=DBNull.Value?ToTime(Convert.ToInt32(r[c])):"";
    static string ToTime(int minutes){minutes=Math.Max(0,minutes);return $"{minutes/60:00}:{minutes%60:00}";}
    static object ParseTime(string value)
    {
        value=value.Trim();if(value.Length==0)return DBNull.Value;
        if(TimeSpan.TryParse(value,out var ts))return (int)Math.Round(ts.TotalMinutes);
        if(int.TryParse(value,out var n))return n;
        throw new FormatException("Saat değerini SS:dd biçiminde girin.");
    }

    void SetEditors(bool enabled)
    {
        name.ReadOnly=!enabled;periodHours.ReadOnly=!enabled;dailyHours.ReadOnly=!enabled;terminalCode.ReadOnly=!enabled;
        foreach(var b in dayShift.Concat(starts).Concat(ends).Concat(shiftNames))b.ReadOnly=!enabled;
        editing=enabled;
    }

    void ClearEditors()
    {
        name.Clear();periodHours.Clear();dailyHours.Clear();terminalCode.Clear();foreach(var b in dayShift.Concat(starts).Concat(ends).Concat(shiftNames))b.Clear();
    }

    void BeginNew(Button save){selectedCode=null;adding=true;ClearEditors();SetEditors(true);save.Enabled=true;name.Focus();}
    void BeginEdit(Button save){if(selectedCode is null){MessageBox.Show("Bir grup seçin.",Text);return;}adding=false;SetEditors(true);save.Enabled=true;name.Focus();}

    void Save()
    {
        try
        {
            var ad=name.Text.Trim();if(ad.Length==0)throw new InvalidOperationException("Grup adı boş bırakılamaz.");
            if(string.IsNullOrWhiteSpace(periodHours.Text)||string.IsNullOrWhiteSpace(dailyHours.Text))throw new InvalidOperationException("Dönemlik çalışma saati veya Günlük çalışma saati alanlarını boş bırakamazsınız.");
            var cols=new List<string>{"AD","TSAAT","GSAAT","MKOD"};var vals=new List<object?>{ad,ParseTime(periodHours.Text),ParseTime(dailyHours.Text),string.IsNullOrWhiteSpace(terminalCode.Text)?DBNull.Value:terminalCode.Text.Trim()};
            for(int i=0;i<5;i++){cols.Add($"VAD{i+1}");vals.Add(string.IsNullOrWhiteSpace(shiftNames[i].Text)?DBNull.Value:shiftNames[i].Text.Trim());cols.Add($"BASSAAT{i+1}");vals.Add(ParseTime(starts[i].Text));cols.Add($"BITSAAT{i+1}");vals.Add(ParseTime(ends[i].Text));cols.Add($"GDSAAT{i+1}");vals.Add(ParseTime(dayShift[i].Text));}
            if(adding)
            {
                var code=Convert.ToInt32(db.Scalar("select coalesce(max(KOD),0)+1 from GRUP")??1);cols.Insert(0,"KOD");vals.Insert(0,code);
                var ps=vals.Select((v,i)=>new FbParameter("@P"+i,v??DBNull.Value)).ToArray();db.Execute($"insert into GRUP ({string.Join(',',cols)}) values ({string.Join(',',vals.Select((_,i)=>"@P"+i))})",ps);selectedCode=code;
            }
            else
            {
                if(selectedCode is null)throw new InvalidOperationException("Bir grup seçin.");var ps=vals.Select((v,i)=>new FbParameter("@P"+i,v??DBNull.Value)).Append(new FbParameter("@K",selectedCode.Value)).ToArray();db.Execute($"update GRUP set {string.Join(',',cols.Select((c,i)=>c+"=@P"+i))} where KOD=@K",ps);
            }
            SetEditors(false);adding=false;Reload();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions.Groups");}
    }

    void DeleteOne()
    {
        if(selectedCode is null)return;
        try
        {
            var used=Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where GRUP=@K",new FbParameter("@K",selectedCode.Value))??0)+Convert.ToInt32(db.Scalar("select count(*) from DONEM where GRUP=@K",new FbParameter("@K",selectedCode.Value))??0);
            if(used>0)throw new InvalidOperationException("Bu çalışma grubu personel veya dönem kayıtlarında kullanılıyor; önce bağlı kayıtları değiştirin.");
            if(MessageBox.Show("Seçili çalışma grubu silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
            db.Execute("delete from GRUP where KOD=@K",new FbParameter("@K",selectedCode.Value));selectedCode=null;Reload();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions.Groups");}
    }

    void DeleteAll()
    {
        try
        {
            var used=Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where GRUP is not null")??0)+Convert.ToInt32(db.Scalar("select count(*) from DONEM where GRUP is not null")??0);
            if(used>0)throw new InvalidOperationException("Çalışma grupları kullanımda olduğu için toplu silme yapılamaz.");
            if(MessageBox.Show("Tüm çalışma grupları silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
            db.Execute("delete from GRUP");selectedCode=null;Reload();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions.Groups");}
    }
}
