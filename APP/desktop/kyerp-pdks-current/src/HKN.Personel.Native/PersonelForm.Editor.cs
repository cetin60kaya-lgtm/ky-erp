using FirebirdSql.Data.FirebirdClient;
using System.Data;
using System.Globalization;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    sealed class EditorLookupItem{public int Code{get;}public string Name{get;}public EditorLookupItem(int code,string name){Code=code;Name=name;}public override string ToString()=>Name;}
    void OpenPersonEditor(bool create)
    {
        string sourcePk=create?"":currentPk;using var d=new Form{Text="Personel Bilgi Girişi",StartPosition=FormStartPosition.CenterParent,Size=new Size(835,525),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,Font=Font};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=2,Padding=new Padding(7)};root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,58));root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,42));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));var ed=new Dictionary<string,TextBox>();var cb=new Dictionary<string,ComboBox>();
        var left=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=5,RowCount=13,Padding=new Padding(2)};left.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,105));left.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,105));left.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,75));left.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,105));left.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        AddEditorText(left,ed,0,0,"Kart Numarası","PKNO");AddEditorText(left,ed,0,2,"Sicil No","SICILNO");AddEditorText(left,ed,1,0,"Adı","AD");AddEditorText(left,ed,1,2,"Soyadı","SOYAD");AddEditorCombo(left,cb,2,0,"Grubu","GRUP","GRUP");AddEditorCombo(left,cb,2,2,"Bölümü","BOLUM","BOLUM");AddEditorCombo(left,cb,3,0,"Görevi","GOREV","GOREV");AddEditorCombo(left,cb,3,2,"Servisi","SERVIS","SERVIS");AddEditorCombo(left,cb,4,0,"Durumu","DURUM","DURUM");AddEditorCombo(left,cb,4,2,"Şirketi","SIRKET","FIRMA");AddEditorText(left,ed,5,0,"İşe Giriş Tarihi","IGTARIH");AddEditorText(left,ed,6,0,"Maaşı","MAAS");AddEditorText(left,ed,6,2,"Normal Saat Ücreti","NSUCRET");AddEditorText(left,ed,7,0,"Eski Maaşı","EMAAS");AddEditorText(left,ed,8,0,"Mesai Saat Ücreti","MSUCRET");AddEditorText(left,ed,9,0,"İşten Ayrılma Tarihi","ICTARIH");AddEditorText(left,ed,10,0,"İşten Ayrılma Nedeni","ICIKSEBEB");
        var ph=new Panel{Dock=DockStyle.Fill,BorderStyle=BorderStyle.FixedSingle,Margin=new Padding(5)};var pl=new Label{Text="(Resim)",Dock=DockStyle.Top,Height=24,TextAlign=ContentAlignment.MiddleCenter};var pic=new PictureBox{Dock=DockStyle.Fill,SizeMode=PictureBoxSizeMode.Zoom};if(photo.Image!=null)pic.Image=new Bitmap(photo.Image);ph.Controls.Add(pic);ph.Controls.Add(pl);left.Controls.Add(ph,4,0);left.SetRowSpan(ph,7);var note=new Label{Text="Not : Lütfen Mavi ile Belirtilen Alanları Boş Bırakmayınız.",ForeColor=Color.Navy,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};left.Controls.Add(note,0,11);left.SetColumnSpan(note,5);var seri=new CheckBox{Text="Seri Şekilde Kayıt Gireceğim",Dock=DockStyle.Fill};left.Controls.Add(seri,0,12);left.SetColumnSpan(seri,3);root.Controls.Add(left,0,0);
        var tabsEdit=new TabControl{Dock=DockStyle.Fill,Font=Font};var kim=new TabPage("Kimlik Bilgileri");var ehl=new TabPage("Ehliyet Bilgileri");var dig=new TabPage("Diğer Bilgiler");var ek=new TabPage("Ek Ödemeler");BuildEditorPairs(kim,ed,new[]{"Nüfusa Kayıtlı Olduğu İl","IL","Nüfusa Kayıtlı Olduğu İlçe","ILCE","Kütük Sıra No","KSIRANO","Kayıt No","KAYITNO","Kan Grubu","KGB","N. C. Verildiği Tarih","NCVTAR","N. C. Verildiği Yer","VYER","Medeni Hali","MEDHAL","T.C. Kimlik No","UKNO","Doğum Yeri","DYER","Doğum Tarihi","DTARIH","Baba Adı","BABAAD","Ana Adı","ANAAD","Sayfa No","SAYFANO","Cinsiyeti","CINSIYET","N. C. Veriliş Nedeni","NCVNED","Askerlik Durumu","ASDURUM","Cilt No","CILTNO","Uyruğu","UYRUK"});BuildEditorPairs(ehl,ed,new[]{"Ehliyet Sınıfı","ESINIF","Ehliyet Verildiği İl/İlçe","EVILILCE","Ehliyet Belge Numarası","EBELGENO","Ehliyet Verildiği Tarih","EVTAR"});BuildEditorPairs(dig,ed,new[]{"Vergi Kimlik No","VKNO","SSK No","SSKNO","Eğitim Durumu","EGTDURUM","Yabancı Dil","YDIL","Uzmanlık Alanı","UALAN","Ev Telefonu","EVTEL","Cep Telefonu","GSM","Elbise Beden No","ELBNO","Ayakkabı No","AYNO","Çocuk Sayısı","CCKSAY","Adres","ADRES","Emekli/SGK Durumu","ESDRM","SGK Giriş Tarihi","SGKGIRTAR"});BuildEditorPairs(ek,ed,new[]{"Günlük Yol Ücreti","GYUCRET","Günlük Yemek Ücreti","GYEMUCRET","Kullandığı İzin","KULIZIN","Kullandığı Cihaz","EKC"});tabsEdit.TabPages.Add(kim);tabsEdit.TabPages.Add(ehl);tabsEdit.TabPages.Add(dig);tabsEdit.TabPages.Add(ek);root.Controls.Add(tabsEdit,1,0);
        if(!create)LoadEditorPerson(sourcePk,ed,cb);else{ed["IGTARIH"].Text=DateTime.Today.ToString("dd.MM.yyyy");if(cb["GRUP"].Items.Count>0)cb["GRUP"].SelectedIndex=0;if(cb["BOLUM"].Items.Count>0)cb["BOLUM"].SelectedIndex=0;if(cb["DURUM"].Items.Count>0)cb["DURUM"].SelectedIndex=cb["DURUM"].Items.Count>1?1:0;if(cb["GOREV"].Items.Count>0)cb["GOREV"].SelectedIndex=0;}ed["PKNO"].ReadOnly=!create;
        var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(0,9,8,0)};var cancel=new Button{Text="İptal",Width=96,Height=32,DialogResult=DialogResult.Cancel,Image=ClassicGlyph("Sil"),ImageAlign=ContentAlignment.MiddleLeft,ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold)};var clear=new Button{Text="Temizle",Width=100,Height=32,ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold)};var save=new Button{Text="Kaydet",Width=104,Height=32,Image=ClassicGlyph("Yeni"),ImageAlign=ContentAlignment.MiddleLeft,ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold)};clear.Click+=(_,_)=>{foreach(var x in ed.Values)if(!x.ReadOnly)x.Clear();foreach(var x in cb.Values)x.SelectedIndex=-1;};actions.Controls.Add(cancel);actions.Controls.Add(clear);actions.Controls.Add(save);root.Controls.Add(actions,0,1);root.SetColumnSpan(actions,2);d.Controls.Add(root);d.CancelButton=cancel;
        save.Click+=(_,_)=>{try{string newPk=ed["PKNO"].Text.Trim();if(newPk.Length!=5||!newPk.All(char.IsDigit))throw new Exception("Kart No 5 haneli rakam olmalı.");SaveEditorPerson(create,sourcePk,newPk,ed,cb);currentPk=newPk;d.DialogResult=DialogResult.OK;d.Close();}catch(Exception ex){MessageBox.Show(ex.Message,"Personel Kayıt",MessageBoxButtons.OK,MessageBoxIcon.Error);}};if(d.ShowDialog(this)==DialogResult.OK){Reload();SelectListPk(currentPk);LoadPerson(currentPk);RefreshFullTabs();}
    }

    void AddEditorText(TableLayoutPanel t,Dictionary<string,TextBox> ed,int row,int col,string label,string key)
    {
        var req=key is "PKNO" or "AD" or "GRUP" or "BOLUM" or "MAAS";var l=new Label{Text=label,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=req?Color.Blue:SystemColors.ControlText,Font=req?new Font(Font,FontStyle.Bold):Font};t.Controls.Add(l,col,row);var x=new TextBox{Dock=DockStyle.Fill,BorderStyle=BorderStyle.FixedSingle};ed[key]=x;t.Controls.Add(x,col+1,row);
    }
    void AddEditorCombo(TableLayoutPanel t,Dictionary<string,ComboBox> cb,int row,int col,string label,string key,string table)
    {
        var req=key is "GRUP" or "BOLUM";var l=new Label{Text=label,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=req?Color.Blue:SystemColors.ControlText,Font=req?new Font(Font,FontStyle.Bold):Font};t.Controls.Add(l,col,row);var x=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList};cb[key]=x;t.Controls.Add(x,col+1,row);
        try{var dt=Q($"select KOD,AD from {table} order by KOD");foreach(DataRow r in dt.Rows)x.Items.Add(new EditorLookupItem(Convert.ToInt32(r["KOD"]),Convert.ToString(r["AD"])??""));}catch{x.Items.Clear();}
    }
    void BuildEditorPairs(TabPage page,Dictionary<string,TextBox> ed,string[] z)
    {
        int rows=z.Length/2;var host=new Panel{Dock=DockStyle.Fill,AutoScroll=true};var t=new TableLayoutPanel{Dock=DockStyle.Top,AutoSize=true,ColumnCount=2,RowCount=rows,Padding=new Padding(6)};
        t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,145));t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,165));
        for(int i=0;i<z.Length;i+=2){int row=i/2;t.RowStyles.Add(new RowStyle(SizeType.Absolute,25));t.Controls.Add(new Label{Text=z[i],Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,row);var b=new TextBox{Dock=DockStyle.Fill,BorderStyle=BorderStyle.FixedSingle};ed[z[i+1]]=b;t.Controls.Add(b,1,row);}host.Controls.Add(t);page.Controls.Add(host);
    }
    void LoadEditorPerson(string pk,Dictionary<string,TextBox> ed,Dictionary<string,ComboBox> cb)
    {
        var q=Q("select * from KIMLIK where PKNO=@PK",new FbParameter("@PK",pk));if(q.Rows.Count==0)return;var r=q.Rows[0];
        foreach(var kv in ed){if(!q.Columns.Contains(kv.Key)||r[kv.Key]==DBNull.Value)continue;kv.Value.Text=r[kv.Key] is DateTime d?d.ToString("dd.MM.yyyy"):Convert.ToString(r[kv.Key])??"";}
        foreach(var kv in cb){kv.Value.SelectedIndex=-1;if(!q.Columns.Contains(kv.Key)||r[kv.Key]==DBNull.Value)continue;int code=Convert.ToInt32(r[kv.Key]);for(int i=0;i<kv.Value.Items.Count;i++)if(kv.Value.Items[i] is EditorLookupItem li&&li.Code==code){kv.Value.SelectedIndex=i;break;}}
    }
    void SaveEditorPerson(bool create,string oldPk,string newPk,Dictionary<string,TextBox> ed,Dictionary<string,ComboBox> cb)
    {
        if(create&&Convert.ToInt32(S("select count(*) from KIMLIK where PKNO='"+newPk.Replace("'","''")+"'"))>0)throw new Exception("Bu Kart No zaten kayıtlı.");
        if(create){int ps=Convert.ToInt32(S("select coalesce(max(PS),0)+1 from KIMLIK"));Exec("insert into KIMLIK (PS,PKNO,AD,SOYAD,GRUP,BOLUM,DURUM,GOREV,KULIZIN,CCKSAY) values (@PS,@PK,'','',1,1,2,1,0,0)",new FbParameter("@PS",ps),new FbParameter("@PK",newPk));}
        string target=create?newPk:oldPk;var set=new List<string>();var pars=new List<FbParameter>();
        foreach(var kv in ed.Where(x=>x.Key!="PKNO")){set.Add(kv.Key+"=@"+kv.Key);pars.Add(new FbParameter("@"+kv.Key,EditorDbValue(kv.Key,kv.Value.Text)));}
        foreach(var kv in cb){set.Add(kv.Key+"=@"+kv.Key);object v=kv.Value.SelectedItem is EditorLookupItem li?li.Code:DBNull.Value;pars.Add(new FbParameter("@"+kv.Key,v));}
        pars.Add(new FbParameter("@PK",target));Exec("update KIMLIK set "+string.Join(',',set)+" where PKNO=@PK",pars.ToArray());
        MessageBox.Show(create?"Yeni personel eklendi.":"Personel bilgileri güncellendi.","Personel Bilgileri");
    }
    object EditorDbValue(string key,string raw)
    {
        string s=raw.Trim();if(s.Length==0)return DBNull.Value;
        string[] dates={"IGTARIH","ICTARIH","DTARIH","NCVTAR","EVTAR","SGKGIRTAR"};if(dates.Contains(key)){if(DateTime.TryParse(s,new CultureInfo("tr-TR"),DateTimeStyles.None,out var d))return d.Date;throw new Exception(key+" tarih alanı geçersiz.");}
        string[] nums={"MAAS","NSUCRET","MSUCRET","EMAAS","GYUCRET","GYEMUCRET","KULIZIN","CCKSAY","AYNO","ELBNO","EKC","ESDRM"};if(nums.Contains(key)){if(decimal.TryParse(s,NumberStyles.Any,new CultureInfo("tr-TR"),out var n)||decimal.TryParse(s,NumberStyles.Any,CultureInfo.InvariantCulture,out n))return n;throw new Exception(key+" sayısal alanı geçersiz.");}
        return s;
    }
    void SelectListPk(string pk)
    {
        foreach(DataGridViewRow r in list.Rows)if(Convert.ToString(r.Cells["PKNO"].Value)==pk){list.CurrentCell=r.Cells["PKNO"];r.Selected=true;break;}
    }
}
