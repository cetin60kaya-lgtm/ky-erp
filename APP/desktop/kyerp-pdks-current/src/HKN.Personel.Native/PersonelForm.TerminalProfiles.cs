using System.ComponentModel;
using KYERP.PDKS.Core.Terminal;
using KYERP.PDKS.Core.Attendance;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    string TerminalProfilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "KYERP", "PDKS", "terminal-transfer-profiles.json");

    void ShowTerminalProfiles()
    {
        var store=new TerminalProfileStore(TerminalProfilePath,options);
        var profiles=new BindingList<TerminalTransferProfile>(store.Load().ToList());
        using var dialog=new Form{Text="Terminal Aktarım Profilleri",StartPosition=FormStartPosition.CenterParent,Size=new Size(1040,590),MinimumSize=new Size(900,520),Font=Font};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(8)};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,44));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
        var heading=new Label{Text="Terminal Aktarım Profilleri",Dock=DockStyle.Fill,Font=new Font(Font.FontFamily,12,FontStyle.Bold),ForeColor=Color.Navy,TextAlign=ContentAlignment.MiddleLeft};root.Controls.Add(heading,0,0);
        var grid=new DataGridView{Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AutoGenerateColumns=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,DataSource=profiles,BackgroundColor=Color.White};
        void Column(string property,string title,int width){grid.Columns.Add(new DataGridViewTextBoxColumn{DataPropertyName=property,HeaderText=title,Width=width});}
        Column(nameof(TerminalTransferProfile.Name),"Profil",210);Column(nameof(TerminalTransferProfile.FormatType),"Format",90);Column(nameof(TerminalTransferProfile.DeviceId),"Cihaz",100);Column(nameof(TerminalTransferProfile.TenantId),"Tenant",105);Column(nameof(TerminalTransferProfile.CompanyId),"Firma",105);Column(nameof(TerminalTransferProfile.WorkplaceId),"İşyeri",105);Column(nameof(TerminalTransferProfile.Encoding),"Encoding",85);
        grid.Columns.Add(new DataGridViewCheckBoxColumn{DataPropertyName=nameof(TerminalTransferProfile.IsDefault),HeaderText="Varsayılan",Width=80});
        grid.Columns.Add(new DataGridViewCheckBoxColumn{DataPropertyName=nameof(TerminalTransferProfile.IsCanonical),HeaderText="Korumalı",Width=70});root.Controls.Add(grid,0,1);
        var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(2,7,2,2),WrapContents=false};
        Button Add(string text,Action action){var button=new Button{Text=text,AutoSize=true,Height=31,ForeColor=Color.Navy};button.Click+=(_,_)=>{try{action();}catch(Exception ex){MessageBox.Show(ex.Message,"Terminal Profilleri",MessageBoxButtons.OK,MessageBoxIcon.Warning);}};actions.Controls.Add(button);return button;}
        TerminalTransferProfile? Selected()=>grid.CurrentRow?.DataBoundItem as TerminalTransferProfile;
        void Persist(){store.Save(profiles);profiles.ResetBindings();}
        Add("Yeni Profil",()=>{var profile=NewTerminalProfile();if(EditTerminalProfile(profile,out var edited)){profiles.Add(edited);Persist();}});
        Add("Profili Kopyala",()=>{var selected=Selected()??throw new InvalidOperationException("Bir profil seçin.");var copy=selected.Copy(selected.Name+" Kopya");if(EditTerminalProfile(copy,out var edited)){profiles.Add(edited);Persist();}});
        Add("Düzenle",()=>{var selected=Selected()??throw new InvalidOperationException("Bir profil seçin.");if(selected.IsCanonical)throw new InvalidOperationException("Canonical preset doğrudan değiştirilemez; önce kopyalayın.");if(EditTerminalProfile(selected,out var edited)){var index=profiles.IndexOf(selected);profiles[index]=edited;Persist();}});
        Add("Sil",()=>{var selected=Selected()??throw new InvalidOperationException("Bir profil seçin.");if(selected.IsCanonical)throw new InvalidOperationException("Canonical preset silinemez.");if(MessageBox.Show($"{selected.Name} profili silinsin mi?","Terminal Profilleri",MessageBoxButtons.YesNo,MessageBoxIcon.Question)==DialogResult.Yes){profiles.Remove(selected);Persist();}});
        Add("Varsayılan Yap",()=>{var selected=Selected()??throw new InvalidOperationException("Bir profil seçin.");for(int i=0;i<profiles.Count;i++)profiles[i]=profiles[i] with {IsDefault=profiles[i].Id==selected.Id};Persist();});
        Add("Örnek Satır Test Et",()=>{var selected=Selected()??throw new InvalidOperationException("Bir profil seçin.");using var input=new TextEntryDialog("Örnek Satır Testi","Terminal satırını yapıştırın:");if(input.ShowDialog(dialog)!=DialogResult.OK)return;var parsed=ProfiledTerminalParser.Parse(selected,input.Value);MessageBox.Show($"Kart: {parsed.EmployeeCode}\nTarih/Saat: {parsed.OccurredAt:dd.MM.yyyy HH:mm}\nOlay: {parsed.EventCode} ({parsed.Direction})\nTerminal: {parsed.TerminalCode}","Parse Önizleme");});
        Add("Dosyadan Aktar",()=>{var selected=Selected()??throw new InvalidOperationException("Bir profil seçin.");if(string.IsNullOrWhiteSpace(selected.TransferFilePath))throw new InvalidOperationException("Profilde TransferFilePath tanımlı değil.");var records=new FileTerminalDeviceAdapter().ReadAsync(selected).GetAwaiter().GetResult();if(records.Count==0)throw new InvalidOperationException("Aktarılacak kayıt bulunamadı.");if(MessageBox.Show($"{records.Count} terminal kaydı GIRCIK tablosuna aktarılacak. Devam edilsin mi?","Terminal Aktarımı",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;var result=new AttendanceImportService(db).Import(records);MessageBox.Show($"Yeni giriş: {result.Inserted}\nÇıkış eşleşmesi: {result.Updated}\nDuplicate: {result.Duplicates}\nAtlanan: {result.Skipped}","Terminal Aktarımı");RefreshFullTabs();});
        Add("JSON Import",()=>{using var open=new OpenFileDialog{Filter="JSON (*.json)|*.json",Title="Terminal profili içe aktar"};if(open.ShowDialog(dialog)!=DialogResult.OK)return;var imported=store.Import(File.ReadAllText(open.FileName));profiles.Add(imported);Persist();});
        Add("JSON Export",()=>{var selected=Selected()??throw new InvalidOperationException("Bir profil seçin.");using var save=new SaveFileDialog{Filter="JSON (*.json)|*.json",FileName=SafeFileName(selected.Name)+".json",Title="Terminal profili dışa aktar"};if(save.ShowDialog(dialog)==DialogResult.OK)File.WriteAllText(save.FileName,store.Export(selected));});
        var close=new Button{Text="Kapat",Width=95,Height=31,DialogResult=DialogResult.OK,Anchor=AnchorStyles.Right};actions.Controls.Add(close);root.Controls.Add(actions,0,2);dialog.Controls.Add(root);dialog.AcceptButton=close;dialog.ShowDialog(this);
    }

    TerminalTransferProfile NewTerminalProfile()=>new()
    {
        Id=Guid.NewGuid(),Name="Yeni Terminal Profili",TenantId=options.TenantId??"",CompanyId=options.CompanyId??"",WorkplaceId=options.WorkplaceId??"",DeviceId="",
        FormatType=TerminalFormatType.Delimited,Separator=",",Encoding="utf-8",EmployeeCode=new(0,1),Day=new(1,1),Hour=new(2,1),EventCode=new(3,1),TerminalCode=new(4,1),DateFormat="ddMMyy",TimeFormat="HH:mm"
    };

    bool EditTerminalProfile(TerminalTransferProfile profile,out TerminalTransferProfile edited)
    {
        return TerminalProfileEditor.Edit(this, Font, profile, out edited);
    }

    static string SafeFileName(string value)=>string.Concat(value.Select(c=>Path.GetInvalidFileNameChars().Contains(c)?'_':c));

    sealed class TextEntryDialog:Form
    {
        readonly TextBox input=new(){Dock=DockStyle.Fill,Multiline=true,ScrollBars=ScrollBars.Both,Font=new Font("Consolas",10)};
        public string Value=>input.Text;
        public TextEntryDialog(string title,string prompt){Text=title;StartPosition=FormStartPosition.CenterParent;Size=new Size(620,260);var label=new Label{Text=prompt,Dock=DockStyle.Top,Height=32,Padding=new Padding(8)};var bar=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=45,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(5)};var cancel=new Button{Text="İptal",DialogResult=DialogResult.Cancel,Width=85};var ok=new Button{Text="Test Et",DialogResult=DialogResult.OK,Width=90};bar.Controls.Add(cancel);bar.Controls.Add(ok);Controls.Add(input);Controls.Add(label);Controls.Add(bar);AcceptButton=ok;CancelButton=cancel;}
    }
}
