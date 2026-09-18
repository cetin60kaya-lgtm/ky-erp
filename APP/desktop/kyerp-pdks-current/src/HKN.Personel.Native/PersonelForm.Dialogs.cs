using FirebirdSql.Data.FirebirdClient;
using System.Globalization;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    void AddIzinFull()=>ShowIzinEditorClassic(false);
    void EditIzinFull()=>ShowIzinEditorClassic(true);
    void AddEkkFull()=>ShowEkkEditorClassic(false);
    void EditEkkFull()=>ShowEkkEditorClassic(true);

    void ShowIzinEditor(bool edit)
    {
        if(currentPk=="")return;if(edit&&gIzin.CurrentRow==null)return;
        using var d=new Form{Text=edit?"İzin Değiştir":"İzin Ekleme",StartPosition=FormStartPosition.CenterParent,Size=new Size(430,310),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,Font=Font};
        var p=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=8,Padding=new Padding(12)};p.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));p.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var dt=new DateTimePicker{Format=DateTimePickerFormat.Short,Dock=DockStyle.Fill};var bs=new TextBox{Text="08:30",Dock=DockStyle.Fill};var bt=new TextBox{Text="16:00",Dock=DockStyle.Fill};var sure=new TextBox{Text="07:30",Dock=DockStyle.Fill};
        var tip=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDown};tip.Items.AddRange(new object[]{"ÜCRETLİ","ÜCRETSİZ","YILLIK İZİN","RAPORLU","MAZERET"});var maz=new TextBox{Dock=DockStyle.Fill};
        if(edit){var r=gIzin.CurrentRow!;dt.Value=Convert.ToDateTime(r.Cells["TARIH"].Value);bs.Text=Convert.ToString(r.Cells["BASSAAT"].Value)??"";bt.Text=Convert.ToString(r.Cells["BITSAAT"].Value)??"";sure.Text=Convert.ToString(r.Cells["SURESAAT"].Value)??"";tip.Text=Convert.ToString(r.Cells["TIP"].Value)??"";maz.Text=Convert.ToString(r.Cells["MAZERET"].Value)??"";}
        AddDialogRow(p,0,"Tarih",dt);AddDialogRow(p,1,"Baş. Saat",bs);AddDialogRow(p,2,"Bit. Saat",bt);AddDialogRow(p,3,"Süre",sure);AddDialogRow(p,4,"Tip",tip);AddDialogRow(p,5,"Mazeret",maz);
        var bar=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft};var cancel=new Button{Text="Kapat",Width=85,DialogResult=DialogResult.Cancel};var save=new Button{Text="Kaydet",Width=90,Font=new Font(Font,FontStyle.Bold)};bar.Controls.Add(cancel);bar.Controls.Add(save);p.Controls.Add(bar,1,7);d.Controls.Add(p);d.CancelButton=cancel;
        save.Click+=(_,_)=>{try{int mins=ParseMinutes(sure.Text);if(mins<=0&&TryTimeMinutes(bs.Text,out var bm)&&TryTimeMinutes(bt.Text,out var em))mins=Math.Max(0,em-bm);if(mins<=0)mins=450;string ss=$"{mins/60:00}:{mins%60:00}";if(edit){int s=Convert.ToInt32(gIzin.CurrentRow!.Cells["SIRA"].Value);Exec("update OZELIZIN set TARIH=@D,BASSAAT=@BS,BITSAAT=@BT,SURESAAT=@SS,SUREDAKIKA=@SM,TIP=@T,MAZERET=@M where SIRA=@S and PKNO=@PK",new FbParameter("@D",dt.Value.Date),new FbParameter("@BS",bs.Text.Trim()),new FbParameter("@BT",bt.Text.Trim()),new FbParameter("@SS",ss),new FbParameter("@SM",mins),new FbParameter("@T",tip.Text.Trim()),new FbParameter("@M",maz.Text.Trim()),new FbParameter("@S",s),new FbParameter("@PK",currentPk));}else{Exec("insert into OZELIZIN (PKNO,BASSAAT,BITSAAT,SURESAAT,SUREDAKIKA,EBALAN,TARIH,TIP,MAZERET,SIRA,OTOCIK) values (@PK,@BS,@BT,@SS,@SM,4,@D,@T,@M,@S,'0')",new FbParameter("@PK",currentPk),new FbParameter("@BS",bs.Text.Trim()),new FbParameter("@BT",bt.Text.Trim()),new FbParameter("@SS",ss),new FbParameter("@SM",mins),new FbParameter("@D",dt.Value.Date),new FbParameter("@T",tip.Text.Trim()),new FbParameter("@M",maz.Text.Trim()),new FbParameter("@S",Next("OZELIZIN","SIRA")));}RefreshFullTabs();d.DialogResult=DialogResult.OK;d.Close();}catch(Exception ex){MessageBox.Show(ex.Message,"İzin");}};
        d.ShowDialog(this);
    }

    void ShowEkkEditor(bool edit)
    {
        if(currentPk=="")return;if(edit&&gEkk.CurrentRow==null)return;
        using var d=new Form{Text=edit?"Ek Kazanç/Kesinti Değiştir":"Ek Kazanç ve Kesinti Ekleme",StartPosition=FormStartPosition.CenterParent,Size=new Size(430,285),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,Font=Font};
        var p=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=7,Padding=new Padding(12)};p.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));p.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var islem=new DateTimePicker{Format=DateTimePickerFormat.Short,Dock=DockStyle.Fill};var ver=new DateTimePicker{Format=DateTimePickerFormat.Short,Dock=DockStyle.Fill};var tur=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList};tur.Items.AddRange(new object[]{"Ek Kazanç","Kesinti"});tur.SelectedIndex=1;var mik=new TextBox{Dock=DockStyle.Fill};var ac=new TextBox{Dock=DockStyle.Fill};
        if(edit){var r=gEkk.CurrentRow!;islem.Value=Convert.ToDateTime(r.Cells["ISLEM_TARIHI"].Value);if(r.Cells["VERILIS_TARIHI"].Value is DateTime vd)ver.Value=vd;int tk=Convert.ToInt32(r.Cells["TURU"].Value);tur.SelectedIndex=tk==1?0:1;mik.Text=Convert.ToString(r.Cells["MIKTAR"].Value)??"";ac.Text=Convert.ToString(r.Cells["ACIKLAMA"].Value)??"";}
        AddDialogRow(p,0,"İşlem Tarihi",islem);AddDialogRow(p,1,"Veriliş Tarihi",ver);AddDialogRow(p,2,"Türü",tur);AddDialogRow(p,3,"Miktar",mik);AddDialogRow(p,4,"Açıklama",ac);
        var bar=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft};var cancel=new Button{Text="Kapat",Width=85,DialogResult=DialogResult.Cancel};var save=new Button{Text="Kaydet",Width=90,Font=new Font(Font,FontStyle.Bold)};bar.Controls.Add(cancel);bar.Controls.Add(save);p.Controls.Add(bar,1,6);d.Controls.Add(p);d.CancelButton=cancel;
        save.Click+=(_,_)=>{try{if(!decimal.TryParse(mik.Text.Trim(),NumberStyles.Any,new CultureInfo("tr-TR"),out var m)&&!decimal.TryParse(mik.Text.Trim(),NumberStyles.Any,CultureInfo.InvariantCulture,out m))throw new Exception("Miktar geçersiz.");int tk=tur.SelectedIndex==0?1:2;if(edit){int k=Convert.ToInt32(gEkk.CurrentRow!.Cells["KOD"].Value);Exec("update AVANS set TARIH=@D,VTARIH=@V,TURKOD=@T,MIKTAR=@M,TOPMIKTAR=@A,ACIKLAMA=@C where KOD=@K and PKNO=@PK",new FbParameter("@D",islem.Value.Date),new FbParameter("@V",ver.Value.Date),new FbParameter("@T",tk),new FbParameter("@M",Math.Abs(m)),new FbParameter("@A",Math.Abs(m)),new FbParameter("@C",ac.Text.Trim()),new FbParameter("@K",k),new FbParameter("@PK",currentPk));}else{Exec("insert into AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,KOD,TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA) values (@PK,@D,@M,@V,@T,@K,@A,1,1,@C)",new FbParameter("@PK",currentPk),new FbParameter("@D",islem.Value.Date),new FbParameter("@M",Math.Abs(m)),new FbParameter("@V",ver.Value.Date),new FbParameter("@T",tk),new FbParameter("@K",Next("AVANS","KOD")),new FbParameter("@A",Math.Abs(m)),new FbParameter("@C",ac.Text.Trim()));}RefreshFullTabs();d.DialogResult=DialogResult.OK;d.Close();}catch(Exception ex){MessageBox.Show(ex.Message,"Ek Kazanç/Kesinti");}};
        d.ShowDialog(this);
    }
    void AddDialogRow(TableLayoutPanel p,int row,string label,Control c){p.Controls.Add(new Label{Text=label,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,row);p.Controls.Add(c,1,row);}
    int ParseMinutes(string s){if(TryTimeMinutes(s,out var m))return m;return 0;}
    bool TryTimeMinutes(string s,out int m){m=0;var a=s.Trim().Split(':');if(a.Length!=2||!int.TryParse(a[0],out var h)||!int.TryParse(a[1],out var mm)||h<0||mm<0||mm>59)return false;m=h*60+mm;return true;}
}
