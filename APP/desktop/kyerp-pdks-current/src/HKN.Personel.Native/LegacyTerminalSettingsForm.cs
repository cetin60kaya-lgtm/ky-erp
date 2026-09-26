using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyTerminalSettingsForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly ComboBox terminal = new(){DropDownStyle=ComboBoxStyle.DropDownList};
    readonly CheckBox active = new(){Text="Varsayılan terminal"};
    readonly Dictionary<string,TextBox> fields = new(StringComparer.OrdinalIgnoreCase);
    readonly TextBox programPath = new();
    readonly TextBox transferFile = new();
    readonly Button save = Cmd("Kaydet");
    int? editingTip; bool isNew;

    public LegacyTerminalSettingsForm(){Text="Terminal & Aktarım Ayarları";StartPosition=FormStartPosition.CenterParent;Size=new Size(1120,700);MinimumSize=new Size(900,600);Font=new Font("Segoe UI",9f);BackColor=Color.FromArgb(246,249,253);KeyPreview=true;Build();Shown+=(_,_)=>Reload();KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};}
    static Label L(string text)=>new(){Text=text,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=Color.FromArgb(66,82,104)};
    static Button Cmd(string text,int width=112)=>new(){Text=text,Width=width,Height=36,FlatStyle=FlatStyle.Flat,Font=new Font("Segoe UI",9f,FontStyle.Bold)};
    static void Row(TableLayoutPanel t,int r,string label,Control c){t.RowStyles.Add(new RowStyle(SizeType.Absolute,38));t.Controls.Add(L(label),0,r);c.Dock=DockStyle.Fill;c.Margin=new Padding(3,6,3,6);t.Controls.Add(c,1,r);}

    void Build()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,ColumnCount=1,Padding=new Padding(14)};root.RowStyles.Add(new RowStyle(SizeType.Absolute,74));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        var header=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,Padding=new Padding(14,10,14,8),BackColor=Color.White};header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,240));header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,180));header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));header.Controls.Add(L("Terminal Profili"),0,0);terminal.Dock=DockStyle.Fill;header.Controls.Add(terminal,1,0);active.Dock=DockStyle.Fill;header.Controls.Add(active,2,0);header.Controls.Add(new Label{Text="Kart cihazı ve dosya aktarım eşleşmeleri",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleRight,ForeColor=Color.FromArgb(36,107,230),Font=new Font("Segoe UI",9f,FontStyle.Bold)},3,0);root.Controls.Add(header,0,0);
        var tabs=new TabControl{Dock=DockStyle.Fill};var map=new TabPage("Kayıt Alanları"){Padding=new Padding(16)};var keys=new TabPage("Giriş / Çıkış Kodları"){Padding=new Padding(16)};var files=new TabPage("Program & Dosya"){Padding=new Padding(16)};
        var mapGrid=new TableLayoutPanel{Dock=DockStyle.Top,ColumnCount=3,RowCount=9,AutoSize=true};mapGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,45));mapGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,27.5f));mapGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,27.5f));mapGrid.Controls.Add(new Label{Text="Alan",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold)},0,0);mapGrid.Controls.Add(new Label{Text="Başlangıç",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold)},1,0);mapGrid.Controls.Add(new Label{Text="Uzunluk / Bitiş",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold)},2,0);
        var defs=new[]{("Personel Kart Numarası","PKNO"),("Yıl","YIL"),("Ay","AY"),("Gün","GUN"),("Basılan Tuş","TUS"),("Saat","SAAT"),("Dakika","DAKIKA"),("Saat Kodu","MK")};for(int i=0;i<defs.Length;i++){var a=new TextBox();var b=new TextBox();fields[defs[i].Item2+"BAS"]=a;fields[defs[i].Item2+"BIT"]=b;mapGrid.RowStyles.Add(new RowStyle(SizeType.Absolute,38));mapGrid.Controls.Add(L(defs[i].Item1),0,i+1);a.Dock=DockStyle.Fill;b.Dock=DockStyle.Fill;a.Margin=b.Margin=new Padding(5,6,5,6);mapGrid.Controls.Add(a,1,i+1);mapGrid.Controls.Add(b,2,i+1);}map.Controls.Add(mapGrid);
        var keyGrid=new TableLayoutPanel{Dock=DockStyle.Top,ColumnCount=3,RowCount=4,AutoSize=true};keyGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,40));keyGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,30));keyGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,30));keyGrid.Controls.Add(new Label{Text="Alternatif",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold)},0,0);keyGrid.Controls.Add(new Label{Text="Giriş",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold)},1,0);keyGrid.Controls.Add(new Label{Text="Çıkış",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold)},2,0);for(int i=1;i<=3;i++){var gi=new TextBox();var ci=new TextBox();gi.MaxLength=1;ci.MaxLength=1;fields[$"GIRIS{i}"]=gi;fields[$"CIKIS{i}"]=ci;keyGrid.RowStyles.Add(new RowStyle(SizeType.Absolute,42));keyGrid.Controls.Add(L($"Kod {i}"),0,i);gi.Dock=DockStyle.Fill;ci.Dock=DockStyle.Fill;gi.Margin=ci.Margin=new Padding(5,7,5,7);keyGrid.Controls.Add(gi,1,i);keyGrid.Controls.Add(ci,2,i);}keys.Controls.Add(keyGrid);
        var fileGrid=new TableLayoutPanel{Dock=DockStyle.Top,ColumnCount=3,RowCount=2,AutoSize=true};fileGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));fileGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));fileGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,50));Row(fileGrid,0,"Programın Yolu",programPath);Row(fileGrid,1,"Aktarım Dosyası",transferFile);var bp=Cmd("…",40);var bf=Cmd("…",40);bp.Click+=(_,_)=>BrowseFile(programPath,true);bf.Click+=(_,_)=>BrowseFile(transferFile,false);fileGrid.Controls.Add(bp,2,0);fileGrid.Controls.Add(bf,2,1);files.Controls.Add(fileGrid);tabs.TabPages.AddRange([map,keys,files]);root.Controls.Add(tabs,0,1);
        var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(0,10,0,0)};var add=Cmd("Yeni Ekle");var edit=Cmd("Değiştir");var del=Cmd("Sil");var delAll=Cmd("Tümünü Sil",120);save.Enabled=false;save.Click+=(_,_)=>SaveCurrent();add.Click+=(_,_)=>BeginNew();edit.Click+=(_,_)=>BeginEdit();del.Click+=(_,_)=>DeleteOne();delAll.Click+=(_,_)=>DeleteAll();actions.Controls.AddRange([save,delAll,del,edit,add]);root.Controls.Add(actions,0,2);Controls.Add(root);SetEdit(false);terminal.SelectedIndexChanged+=(_,_)=>{if(!save.Enabled)LoadSelected();};
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
