using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyGroupForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly TextBox name = Box(64,0,281);
    readonly TextBox periodHours = Box(116,32,46);
    readonly TextBox dailyHours = Box(300,32,40);
    readonly TextBox terminalCode = Box(228,61,113);
    readonly DataGridView grid = new(){Location=new Point(0,88),Size=new Size(377,153),ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,MultiSelect=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,BackgroundColor=Color.White,RowHeadersWidth=20,AutoGenerateColumns=false};
    readonly TextBox[] dayShift = new TextBox[5];
    readonly TextBox[] starts = new TextBox[5];
    readonly TextBox[] ends = new TextBox[5];
    readonly TextBox[] shiftNames = new TextBox[5];
    int? selectedCode;
    bool editing;
    bool adding;

    public LegacyGroupForm()
    {
        Text="Çalışma Grupları"; StartPosition=FormStartPosition.CenterParent; ClientSize=new Size(543,448);
        FormBorderStyle=FormBorderStyle.FixedDialog; MaximizeBox=false; MinimizeBox=false; ShowInTaskbar=false;
        Font=new Font("Microsoft Sans Serif",8.25f); KeyPreview=true;
        Build(); Shown+=(_,_)=>Reload(); KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    static TextBox Box(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),BorderStyle=BorderStyle.FixedSingle};
    static Label LabelAt(string text,int x,int y)=>new(){Text=text,AutoSize=true,Location=new Point(x,y)};
    static Button Cmd(string text,int y)=>new(){Text=text,Location=new Point(392,y),Size=new Size(135,33),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold),UseVisualStyleBackColor=true};

    void Build()
    {
        Controls.Add(LabelAt("Grup Adı",0,8)); Controls.Add(LabelAt("Dönemlik Çalışma Saati",0,40)); Controls.Add(LabelAt("Günlük Çalışma Saati",192,40)); Controls.Add(LabelAt("Aktarma İşleminde Kullanılacak Terminal Kodu",0,69));
        Controls.Add(name);Controls.Add(periodHours);Controls.Add(dailyHours);Controls.Add(terminalCode);
        name.MaxLength=30;
        grid.Columns.Add(new DataGridViewTextBoxColumn{Name="AD",DataPropertyName="AD",HeaderText="Grup Adı",Width=340});
        grid.SelectionChanged+=(_,_)=>{if(!editing)LoadSelection();}; Controls.Add(grid);

        var group=new GroupBox{Text=" Grubun Çalışma Saat Aralıkları ",Location=new Point(0,248),Size=new Size(377,161)};
        group.Controls.Add(LabelAt("Gün Dön.",8,16));group.Controls.Add(LabelAt("Giriş Saati",72,16));group.Controls.Add(LabelAt("Çıkış Saati",128,16));group.Controls.Add(LabelAt("Çalışma Grubunun Adı",184,16));
        for(int i=0;i<5;i++)
        {
            int y=32+i*24;
            dayShift[i]=Box(8,y,40); starts[i]=Box(72,y,40); ends[i]=Box(128,y,40); shiftNames[i]=Box(184,y,190);
            dayShift[i].MaxLength=5;starts[i].MaxLength=5;ends[i].MaxLength=5;shiftNames[i].MaxLength=30;
            group.Controls.Add(dayShift[i]);group.Controls.Add(starts[i]);group.Controls.Add(ends[i]);group.Controls.Add(shiftNames[i]);
        }
        Controls.Add(group);

        var save=Cmd("Kaydet",56);var add=Cmd("Yeni Ekle",104);var edit=Cmd("Değiştir",152);var del=Cmd("Sil",200);var delAll=Cmd("Tümünü Sil",248);var close=Cmd("Kapat",328);
        save.Enabled=false; save.Click+=(_,_)=>Save(); add.Click+=(_,_)=>BeginNew(save);edit.Click+=(_,_)=>BeginEdit(save);del.Click+=(_,_)=>DeleteOne();delAll.Click+=(_,_)=>DeleteAll();close.Click+=(_,_)=>Close();
        Controls.AddRange([save,add,edit,del,delAll,close]);
        SetEditors(false);
    }

    void Reload()
    {
        try
        {
            grid.DataSource=db.Query("select KOD,AD,VAD1,VAD2,VAD3,VAD4,VAD5,BASSAAT1,BASSAAT2,BASSAAT3,BASSAAT4,BASSAAT5,BITSAAT1,BITSAAT2,BITSAAT3,BITSAAT4,BITSAAT5,TSAAT,GSAAT,GDSAAT1,GDSAAT2,GDSAAT3,GDSAAT4,GDSAAT5,MKOD from GRUP order by KOD");
            if(grid.Rows.Count>0){grid.CurrentCell=grid.Rows[0].Cells[0];LoadSelection();}
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Error);}
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
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
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
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
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
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
}
