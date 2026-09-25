using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyTerminalSettingsForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly ComboBox terminal = new(){Location=new Point(200,0),Size=new Size(89,21),DropDownStyle=ComboBoxStyle.DropDownList};
    readonly CheckBox active = new(){Text="Varsayılan",Location=new Point(328,4),Size=new Size(73,17)};
    readonly Dictionary<string,TextBox> fields = new(StringComparer.OrdinalIgnoreCase);
    readonly TextBox programPath = new(){Location=new Point(80,348),Size=new Size(329,21)};
    readonly TextBox transferFile = new(){Location=new Point(80,382),Size=new Size(329,21)};
    readonly Button save = Cmd("Kaydet",392,28);
    int? editingTip;
    bool isNew;

    public LegacyTerminalSettingsForm()
    {
        Text="Terminal Aktarım Ayarları";StartPosition=FormStartPosition.CenterParent;ClientSize=new Size(506,444);
        FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;ShowInTaskbar=false;
        Font=new Font("Microsoft Sans Serif",8.25f);KeyPreview=true;
        Build();Shown+=(_,_)=>Reload();KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    static Label L(string text,int x,int y)=>new(){Text=text,Location=new Point(x,y),AutoSize=true};
    static TextBox E(int x,int y,int w=20)=>new(){Location=new Point(x,y),Size=new Size(w,21),BorderStyle=BorderStyle.FixedSingle};
    static Button Cmd(string text,int x,int y)=>new(){Text=text,Location=new Point(x,y),Size=new Size(98,33),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold),UseVisualStyleBackColor=true};

    void Build()
    {
        Controls.Add(L("Bilgilerini Görmek istediğiniz  Saati Seçiniz",0,4));Controls.Add(terminal);Controls.Add(active);
        Controls.Add(L("Başlangıç Karekteri",168,28));Controls.Add(L("Kaç Tane",336,28));
        AddPair("Personel Kart Numarası","PKNO",49,44);
        AddPair("Yıl","YIL",73,68);
        AddPair("Ay","AY",97,92);
        AddPair("Gün","GUN",121,116);
        AddPair("Basılan Tuş (Giriş/Çıkış)","TUS",147,140);
        AddPair("Saat","SAAT",169,164);
        AddPair("Dakika","DAKIKA",193,188);
        AddPair("Saat Kodu","MK",217,212);

        Controls.Add(L("Giriş",198,236));Controls.Add(L("Çıkış",350,236));Controls.Add(L("Giriş Çıkış Tuşları",80,260));
        for(int i=1;i<=3;i++)
        {
            var y=252+i*24;var gi=E(200,y);var ci=E(352,y);gi.MaxLength=1;ci.MaxLength=1;fields[$"GIRIS{i}"]=gi;fields[$"CIKIS{i}"]=ci;Controls.Add(gi);Controls.Add(ci);
        }

        Controls.Add(L("Programın Yolu",0,356));Controls.Add(programPath);
        var browseProgram=new Button{Text="...",Location=new Point(408,346),Size=new Size(25,25)};browseProgram.Click+=(_,_)=>BrowseFile(programPath,true);Controls.Add(browseProgram);
        Controls.Add(L("Aktarım Dosyası",0,390));Controls.Add(transferFile);
        var browseTransfer=new Button{Text="...",Location=new Point(408,380),Size=new Size(25,25)};browseTransfer.Click+=(_,_)=>BrowseFile(transferFile,false);Controls.Add(browseTransfer);

        var add=Cmd("Yeni Ekle",392,68);var edit=Cmd("Değiştir",392,108);var del=Cmd("Sil",392,148);var delAll=Cmd("Tümünü Sil",392,188);var close=Cmd("Kapat",392,260);
        Controls.AddRange([save,add,edit,del,delAll,close]);
        save.Enabled=false;SetEdit(false);
        terminal.SelectedIndexChanged+=(_,_)=>{if(!save.Enabled)LoadSelected();};
        add.Click+=(_,_)=>BeginNew();edit.Click+=(_,_)=>BeginEdit();save.Click+=(_,_)=>SaveCurrent();del.Click+=(_,_)=>DeleteOne();delAll.Click+=(_,_)=>DeleteAll();close.Click+=(_,_)=>Close();
    }

    void AddPair(string label,string prefix,int labelY,int editY)
    {
        Controls.Add(L(label,80,labelY));var a=E(200,editY);var b=E(352,editY);a.MaxLength=3;b.MaxLength=3;fields[prefix+"BAS"]=a;fields[prefix+"BIT"]=b;Controls.Add(a);Controls.Add(b);
    }

    void Reload()
    {
        try
        {
            var dt=db.Query("select TIP,AKTIF from SAAT order by TIP");terminal.DataSource=dt;terminal.DisplayMember="TIP";terminal.ValueMember="TIP";
            if(dt.Rows.Count>0)terminal.SelectedIndex=0;else ClearFields();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }

    void LoadSelected()
    {
        try
        {
            if(terminal.SelectedValue is null||terminal.SelectedValue is DataRowView)return;var tip=Convert.ToString(terminal.SelectedValue)??"";if(tip.Length==0)return;
            var dt=db.Query("select * from SAAT where TIP=@T",new FbParameter("@T",tip));if(dt.Rows.Count==0)return;var r=dt.Rows[0];
            editingTip=terminal.SelectedIndex;isNew=false;active.Checked=string.Equals(Convert.ToString(r["AKTIF"]),"E",StringComparison.OrdinalIgnoreCase)||string.Equals(Convert.ToString(r["AKTIF"]),"1",StringComparison.OrdinalIgnoreCase);
            foreach(var key in fields.Keys)fields[key].Text=r.Table.Columns.Contains(key)&&r[key]!=DBNull.Value?Convert.ToString(r[key])??"":"";
            programPath.Text=r["EXEPATH"]==DBNull.Value?"":Convert.ToString(r["EXEPATH"])??"";transferFile.Text=r["TRANSFILE"]==DBNull.Value?"":Convert.ToString(r["TRANSFILE"])??"";
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void BeginNew()
    {
        isNew=true;editingTip=null;terminal.DataSource=null;terminal.Items.Clear();terminal.DropDownStyle=ComboBoxStyle.DropDown;terminal.Text="";ClearFields();SetEdit(true);save.Enabled=true;terminal.Focus();
    }

    void BeginEdit()
    {
        if(terminal.SelectedValue is null){MessageBox.Show("Bir terminal seçin.",Text);return;}isNew=false;editingTip=terminal.SelectedIndex;terminal.DropDownStyle=ComboBoxStyle.DropDown;SetEdit(true);save.Enabled=true;
    }

    void ClearFields(){active.Checked=false;foreach(var b in fields.Values)b.Clear();programPath.Clear();transferFile.Clear();}
    void SetEdit(bool enabled){active.Enabled=enabled;foreach(var b in fields.Values)b.ReadOnly=!enabled;programPath.ReadOnly=!enabled;transferFile.ReadOnly=!enabled;terminal.Enabled=true;}
    static object DbNumber(string value)=>int.TryParse(value.Trim(),out var n)?n:DBNull.Value;
    static object DbText(string value)=>string.IsNullOrWhiteSpace(value)?DBNull.Value:value.Trim();

    void SaveCurrent()
    {
        try
        {
            var tip=terminal.Text.Trim();if(tip.Length==0)throw new InvalidOperationException("Terminal adı boş bırakılamaz.");if(tip.Length>10)throw new InvalidOperationException("Terminal adı en fazla 10 karakter olabilir.");
            var parameters=new List<FbParameter>{new("@TIP",tip),new("@AKTIF",active.Checked?"E":"H"),new("@EXEPATH",DbText(programPath.Text)),new("@TRANSFILE",DbText(transferFile.Text))};
            foreach(var key in new[]{"YILBAS","YILBIT","AYBAS","AYBIT","GUNBAS","GUNBIT","PKNOBAS","PKNOBIT","TUSBAS","TUSBIT","SAATBAS","SAATBIT","MKBAS","MKBIT","DAKIKABAS","DAKIKABIT"})parameters.Add(new FbParameter("@"+key,DbNumber(fields[key].Text)));
            foreach(var key in new[]{"GIRIS1","GIRIS2","GIRIS3","CIKIS1","CIKIS2","CIKIS3"})parameters.Add(new FbParameter("@"+key,DbText(fields[key].Text)));
            const string cols="TIP,YILBAS,YILBIT,AYBAS,AYBIT,GUNBAS,GUNBIT,PKNOBAS,PKNOBIT,TUSBAS,TUSBIT,SAATBAS,SAATBIT,MKBAS,MKBIT,GIRIS1,GIRIS2,GIRIS3,CIKIS1,CIKIS2,CIKIS3,EXEPATH,DAKIKABAS,DAKIKABIT,TRANSFILE,AKTIF";
            if(isNew)
            {
                if(Convert.ToInt32(db.Scalar("select count(*) from SAAT where TIP=@T",new FbParameter("@T",tip))??0)>0)throw new InvalidOperationException("Bu terminal adı zaten kayıtlı.");
                db.Execute($"insert into SAAT ({cols}) values (@TIP,@YILBAS,@YILBIT,@AYBAS,@AYBIT,@GUNBAS,@GUNBIT,@PKNOBAS,@PKNOBIT,@TUSBAS,@TUSBIT,@SAATBAS,@SAATBIT,@MKBAS,@MKBIT,@GIRIS1,@GIRIS2,@GIRIS3,@CIKIS1,@CIKIS2,@CIKIS3,@EXEPATH,@DAKIKABAS,@DAKIKABIT,@TRANSFILE,@AKTIF)",parameters.ToArray());
            }
            else
            {
                var old=terminal.SelectedValue is DataRowView?tip:Convert.ToString(terminal.SelectedValue)??tip;
                parameters.Add(new FbParameter("@OLD",old));
                db.Execute("update SAAT set TIP=@TIP,YILBAS=@YILBAS,YILBIT=@YILBIT,AYBAS=@AYBAS,AYBIT=@AYBIT,GUNBAS=@GUNBAS,GUNBIT=@GUNBIT,PKNOBAS=@PKNOBAS,PKNOBIT=@PKNOBIT,TUSBAS=@TUSBAS,TUSBIT=@TUSBIT,SAATBAS=@SAATBAS,SAATBIT=@SAATBIT,MKBAS=@MKBAS,MKBIT=@MKBIT,GIRIS1=@GIRIS1,GIRIS2=@GIRIS2,GIRIS3=@GIRIS3,CIKIS1=@CIKIS1,CIKIS2=@CIKIS2,CIKIS3=@CIKIS3,EXEPATH=@EXEPATH,DAKIKABAS=@DAKIKABAS,DAKIKABIT=@DAKIKABIT,TRANSFILE=@TRANSFILE,AKTIF=@AKTIF where TIP=@OLD",parameters.ToArray());
            }
            terminal.DropDownStyle=ComboBoxStyle.DropDownList;save.Enabled=false;SetEdit(false);Reload();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void DeleteOne()
    {
        var tip=Convert.ToString(terminal.SelectedValue);if(string.IsNullOrWhiteSpace(tip))return;
        if(MessageBox.Show("Seçili terminal ayarı silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
        try{db.Execute("delete from SAAT where TIP=@T",new FbParameter("@T",tip));Reload();}catch(Exception ex){MessageBox.Show(ex.Message,Text);}
    }

    void DeleteAll()
    {
        if(MessageBox.Show("Tüm terminal ayarları silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
        try{db.Execute("delete from SAAT");Reload();}catch(Exception ex){MessageBox.Show(ex.Message,Text);}
    }

    void BrowseFile(TextBox target,bool executable)
    {
        using var dlg=new OpenFileDialog{CheckFileExists=true,Filter=executable?"Program (*.exe)|*.exe|Tüm dosyalar (*.*)|*.*":"Aktarım dosyası (*.*)|*.*"};if(dlg.ShowDialog(this)==DialogResult.OK)target.Text=dlg.FileName;
    }
}
