using System.ComponentModel;
using System.Diagnostics;
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
        using var dialog=CreateTerminalTransferDialog();
        dialog.ShowDialog(DialogOwner());
    }

    public Form CreateTerminalTransferDialog()
    {
        var store=new TerminalProfileStore(TerminalProfilePath,options);
        var profiles=store.Load().ToList();
        if(profiles.Count==0) profiles.Add(TerminalTransferProfile.CreateCanonicalTnf(options));

        var dialog=new Form
        {
            Text="Terminal Veri Transferi",StartPosition=FormStartPosition.CenterScreen,
            Size=new Size(409,553),FormBorderStyle=FormBorderStyle.FixedDialog,
            MaximizeBox=false,MinimizeBox=false,ShowInTaskbar=false,Font=Font
        };

        var fileLabel=new Label{Text="Dosya Adı",AutoSize=true,Location=new Point(4,7)};
        var fileBox=new TextBox{Location=new Point(64,0),Size=new Size(324,20),Text=ResolveLegacyTransferPath(),ReadOnly=true};
        var terminalLabel=new Label{Text="Terminal",AutoSize=true,Location=new Point(4,39)};
        var terminalBox=new ComboBox{Location=new Point(64,31),Width=153,DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember=nameof(TerminalTransferProfile.Name)};
        terminalBox.DataSource=profiles;
        var toleranceLabel=new Label{Text="Tolerans",AutoSize=true,Location=new Point(304,39)};
        var tolerance=new TextBox{Name="TransferTolerance",Location=new Point(365,31),Width=23,Text="5",MaxLength=2,TextAlign=HorizontalAlignment.Right};

        var log=new TextBox{Name="TransferLog",Location=new Point(0,55),Size=new Size(393,361),Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Both,WordWrap=false};

        var countCaption=new Label{Text="Aktarılan Kayıt Sayısı",Location=new Point(56,423),Size=new Size(97,17),TextAlign=ContentAlignment.MiddleLeft};
        var countValue=new Label{Text="0",Location=new Point(168,423),Size=new Size(40,17),TextAlign=ContentAlignment.MiddleCenter,BorderStyle=BorderStyle.FixedSingle,BackColor=Color.White};
        var progress=new ProgressBar{Location=new Point(0,449),Size=new Size(393,25),Minimum=0,Maximum=100};
        var progressText=new Label{Text="0%",Location=new Point(0,449),Size=new Size(393,25),TextAlign=ContentAlignment.MiddleCenter,BackColor=Color.Transparent};
        progressText.Parent=dialog;

        var read=new Button{Text="Cihaz Okut",Location=new Point(0,481),Size=new Size(175,33),ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold)};
        var transfer=new Button{Text="&Aktar",Location=new Point(216,481),Size=new Size(175,33),ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold)};

        IReadOnlyList<ProfiledTerminalRecord> ReadRecords(bool launchDevice)
        {
            var selected=terminalBox.SelectedItem as TerminalTransferProfile ?? profiles[0];
            var path=fileBox.Text.Trim();
            if(string.IsNullOrWhiteSpace(path)) throw new InvalidOperationException("Terminal aktarım dosyası yolu boş olamaz.");
            if(launchDevice && !string.IsNullOrWhiteSpace(selected.ProgramPath) && File.Exists(selected.ProgramPath))
            {
                Process.Start(new ProcessStartInfo(selected.ProgramPath){UseShellExecute=true});
            }
            if(!File.Exists(path))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path)??".");
                File.WriteAllText(path,string.Empty);
            }
            var effective=selected with { TransferFilePath=path };
            return new FileTerminalDeviceAdapter().ReadAsync(effective).GetAwaiter().GetResult();
        }
        void Preview(IReadOnlyList<ProfiledTerminalRecord> records)
        {
            log.Lines=records.Select(r=>$"{r.EmployeeCode,-5}  {r.OccurredAt:dd.MM.yyyy HH:mm}  {(r.Direction==TerminalDirection.Entry?"Giriş":r.Direction==TerminalDirection.Exit?"Çıkış":"-")}").ToArray();
            countValue.Text=records.Count.ToString();
            progress.Value=records.Count==0?0:100;progressText.Text=progress.Value+"%";
        }
        void Safe(Action action)
        {
            try{action();}
            catch(Exception ex){MessageBox.Show(ex.Message,"Terminal Veri Transferi",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
        }

        read.Click+=(_,_)=>Safe(()=>Preview(ReadRecords(true)));
        transfer.Click+=(_,_)=>Safe(()=>
        {
            var records=ReadRecords(false);
            Preview(records);
            if(records.Count==0){MessageBox.Show("Aktarılacak kayıt bulunamadı.","Terminal Veri Transferi",MessageBoxButtons.OK,MessageBoxIcon.Information);return;}
            if(!int.TryParse(tolerance.Text,out var toleranceMinutes)||toleranceMinutes is < 0 or > 60)throw new InvalidOperationException("Tolerans 0-60 dakika arasında olmalıdır.");
            var result=new AttendanceImportService(db).Import(records,toleranceMinutes);
            var path=fileBox.Text.Trim();
            if(File.Exists(path)) File.WriteAllText(path,string.Empty);
            log.Clear();countValue.Text="0";progress.Value=0;progressText.Text="0%";
            RefreshFullTabs();
            MessageBox.Show($"Yeni giriş: {result.Inserted}\nÇıkış eşleşmesi: {result.Updated}\nMükerrer: {result.Duplicates}\nAtlanan: {result.Skipped}\n\nAktarım dosyası işlendi ve 0 KB olarak hazır bırakıldı.","Terminal Veri Transferi",MessageBoxButtons.OK,MessageBoxIcon.Information);
        });

        dialog.Controls.Add(fileLabel);dialog.Controls.Add(fileBox);dialog.Controls.Add(terminalLabel);dialog.Controls.Add(terminalBox);dialog.Controls.Add(toleranceLabel);dialog.Controls.Add(tolerance);
        dialog.Controls.Add(log);dialog.Controls.Add(countCaption);dialog.Controls.Add(countValue);dialog.Controls.Add(progress);dialog.Controls.Add(progressText);dialog.Controls.Add(read);dialog.Controls.Add(transfer);
        progressText.BringToFront();
        return dialog;
    }

    string ResolveLegacyTransferPath()
    {
        var env=Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_FILE");
        if(!string.IsNullOrWhiteSpace(env)) return env;
        var candidates=new[]
        {
            Path.Combine(options.RuntimeRoot,"Terminal Bilgi Aktar","timerecords.txt"),
            @"D:\Hedef500\Hedef500\Terminal Bilgi Aktar\timerecords.txt",
            @"D:\Terminal Bilgi Aktar\timerecords.txt"
        };
        return candidates.FirstOrDefault(File.Exists) ?? candidates[0];
    }

    public void ShowTerminalProfileManager()
    {
        var store=new TerminalProfileStore(TerminalProfilePath,options);
        var profiles=new BindingList<TerminalTransferProfile>(store.Load().ToList());
        using var dialog=new Form{Text="Terminal Aktarım Profilleri",StartPosition=FormStartPosition.CenterParent,Size=new Size(1040,590),MinimumSize=new Size(900,520),Font=Font,ShowInTaskbar=false};
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
        var close=new Button{Text="Kapat",Width=95,Height=31,DialogResult=DialogResult.OK,Anchor=AnchorStyles.Right};actions.Controls.Add(close);root.Controls.Add(actions,0,2);dialog.Controls.Add(root);dialog.AcceptButton=close;dialog.ShowDialog(DialogOwner());
    }

    TerminalTransferProfile NewTerminalProfile()=>new()
    {
        Id=Guid.NewGuid(),Name="Yeni Terminal Profili",TenantId=options.TenantId??"*",CompanyId=options.CompanyId??"*",WorkplaceId=options.WorkplaceId??"*",DeviceId="TNF-001",
        FormatType=TerminalFormatType.Tnf,Separator=",",Encoding="utf-8",DateFormat="ddMMyy",TimeFormat="HH:mm",EntryCodeMapping=new(){["1"]="ENTRY"}
    };

    bool EditTerminalProfile(TerminalTransferProfile profile,out TerminalTransferProfile edited)
    {
        return TerminalProfileEditor.Edit(this,Font,profile,out edited);
    }
}
