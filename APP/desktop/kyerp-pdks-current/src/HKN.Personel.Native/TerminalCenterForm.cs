using System.Globalization;

namespace HKN.Personel.Native;

public sealed class TerminalCenterForm : Form
{
    readonly Label status=new(){AutoSize=false,Height=30,Dock=DockStyle.Top,TextAlign=ContentAlignment.MiddleLeft};
    readonly Label counters=new(){AutoSize=false,Height=28,Dock=DockStyle.Top,TextAlign=ContentAlignment.MiddleLeft};
    readonly Label lastSync=new(){AutoSize=false,Height=28,Dock=DockStyle.Top,TextAlign=ContentAlignment.MiddleLeft};
    readonly CheckBox autoEnabled=new(){Text="Otomatik eşitleme açık",AutoSize=true};
    readonly TextBox times=new(){Width=180};
    readonly Form? transferForm;
    readonly Form? settingsForm;

    public TerminalCenterForm(Form? transferForm=null, Form? settingsForm=null)
    {
        this.transferForm=transferForm;this.settingsForm=settingsForm;Text="Terminal & Cihaz Merkezi";Size=new Size(1050,720);MinimumSize=new Size(900,620);StartPosition=FormStartPosition.CenterParent;Font=new Font("Segoe UI",9f);BackColor=Color.FromArgb(246,249,253);
        Build();Shown+=async (_,_)=>{LoadSettings();LoadLast();await TestAsync();};
    }
    static Button B(string text,int width=130)=>new(){Text=text,Width=width,Height=36,FlatStyle=FlatStyle.Flat,Font=new Font("Segoe UI",9f,FontStyle.Bold)};
    void Build()
    {
        var tabs=new TabControl{Dock=DockStyle.Fill};tabs.TabPages.Add(BuildDeviceTab());tabs.TabPages.Add(BuildAutoTab());
        if(transferForm is not null)
        {
            var page=new TabPage("Dosya / TNF Aktarımı");transferForm.TopLevel=false;transferForm.FormBorderStyle=FormBorderStyle.None;transferForm.Dock=DockStyle.Fill;page.Controls.Add(transferForm);tabs.TabPages.Add(page);transferForm.Show();
        }
        if(settingsForm is not null)
        {
            var page=new TabPage("Terminal Profili");settingsForm.TopLevel=false;settingsForm.FormBorderStyle=FormBorderStyle.None;settingsForm.Dock=DockStyle.Fill;page.Controls.Add(settingsForm);tabs.TabPages.Add(page);settingsForm.Show();
        }
        Controls.Add(tabs);
    }
    TabPage BuildDeviceTab()
    {
        var page=new TabPage("Cihaz Yönetimi"){Padding=new Padding(18)};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=7,ColumnCount=1};root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));root.RowStyles.Add(new RowStyle(SizeType.Absolute,44));root.RowStyles.Add(new RowStyle(SizeType.Absolute,44));root.RowStyles.Add(new RowStyle(SizeType.Absolute,44));root.RowStyles.Add(new RowStyle(SizeType.Absolute,62));root.RowStyles.Add(new RowStyle(SizeType.Absolute,70));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var ip=Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_IP")??"192.168.1.224";var port=Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_PORT")??"5005";var machine=Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_MACHINE")??"1";
        root.Controls.Add(new Label{Text=$"Cihaz ID: {machine}     IP: {ip}     Port: {port}",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",13f,FontStyle.Bold),ForeColor=Color.FromArgb(27,44,68)},0,0);
        root.Controls.Add(status,0,1);root.Controls.Add(counters,0,2);root.Controls.Add(lastSync,0,3);
        var buttons=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false};var test=B("Bağlantı Testi");var readTime=B("Saat Oku");var setTime=B("PC Saatini Yaz",145);var sync=B("Eşitle",110);var clear=B("Canlıyı Temizle",145);
        test.Click+=async(_,_)=>await TestAsync();readTime.Click+=async(_,_)=>await TestAsync();setTime.Click+=async(_,_)=>await SetTimeAsync();sync.Click+=async(_,_)=>await SyncAsync();clear.Click+=(_,_)=>{TerminalSyncService.ClearLive();MessageBox.Show("Canlı geçmiş temizlendi. TNF ve FDB kayıtları korunuyor.",Text);};buttons.Controls.AddRange([test,readTime,setTime,sync,clear]);root.Controls.Add(buttons,0,4);
        root.Controls.Add(new Label{Text="Eşitle akışı: cihazdan oku → live.dat → TNF → FDB → doğrula → cihaz kayıtlarını temizle. Herhangi bir kayıt/işlem hatasında cihaz temizlenmez.",Dock=DockStyle.Fill,Padding=new Padding(0,8,0,0),ForeColor=Color.FromArgb(66,82,104)},0,5);
        page.Controls.Add(root);return page;
    }
    TabPage BuildAutoTab()
    {
        var page=new TabPage("Otomatik Eşitleme"){Padding=new Padding(24)};var p=new FlowLayoutPanel{Dock=DockStyle.Top,Height=120,FlowDirection=FlowDirection.LeftToRight,WrapContents=false};
        p.Controls.Add(autoEnabled);p.Controls.Add(new Label{Text="Saatler (HH:mm, virgülle):",AutoSize=true,Padding=new Padding(18,8,4,0)});p.Controls.Add(times);var save=B("Kaydet",100);save.Click+=(_,_)=>SaveSettings();p.Controls.Add(save);page.Controls.Add(p);
        page.Controls.Add(new Label{Dock=DockStyle.Bottom,Height=80,Text="Uygulama açık veya simge durumunda olduğu sürece arka planda çalışır. Aynı gün aynı saat ikinci kez çalıştırılmaz.",ForeColor=Color.FromArgb(66,82,104)});return page;
    }
    async Task TestAsync()
    {
        status.Text="Cihaz kontrol ediliyor...";var s=await TerminalDeviceClient.ReadAsync(false);status.Text=s.Connected?$"Bağlantı: BAŞARILI   Cihaz saati: {s.DeviceTime:dd.MM.yyyy HH:mm:ss}":"Bağlantı: BAŞARISIZ   "+s.Message;status.ForeColor=s.Connected?Color.DarkGreen:Color.DarkRed;counters.Text=s.Connected?$"Yeni kayıt: {Math.Max(0,s.NewLogCount)}   Kullanıcı: {Math.Max(0,s.UserCount)}   Kart: {Math.Max(0,s.CardCount)}":"";
    }
    async Task SetTimeAsync(){var r=await TerminalDeviceClient.ExecuteAsync("settime");MessageBox.Show(r.Success?"Cihaz saati bilgisayar saatiyle eşitlendi.":r.Message,Text,r.Success?MessageBoxButtons.OK:MessageBoxButtons.OK,r.Success?MessageBoxIcon.Information:MessageBoxIcon.Warning);await TestAsync();}
    async Task SyncAsync(){status.Text="Eşitleniyor...";var r=await TerminalSyncService.SyncAsync("Manuel");LoadLast();MessageBox.Show(r.Message,Text,MessageBoxButtons.OK,r.DeviceCleared||r.ReadCount==0?MessageBoxIcon.Information:MessageBoxIcon.Warning);await TestAsync();}
    void LoadSettings(){var s=TerminalSyncService.LoadSettings();autoEnabled.Checked=s.Enabled;times.Text=string.Join(", ",s.Times);}
    void SaveSettings(){var values=times.Text.Split([',',';',' '],StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries);if(values.Any(x=>!TimeOnly.TryParseExact(x,"HH:mm",CultureInfo.InvariantCulture,DateTimeStyles.None,out _))){MessageBox.Show("Saatleri HH:mm biçiminde girin. Örnek: 08:50, 10:00",Text);return;}TerminalSyncService.SaveSettings(new(autoEnabled.Checked,values));MessageBox.Show("Otomatik eşitleme ayarları kaydedildi.",Text);}
    void LoadLast(){var s=TerminalSyncService.ReadState();lastSync.Text=s?.LastAt is null?"Son eşitleme: yok":$"Son eşitleme: {s.LastAt:dd.MM.yyyy HH:mm:ss}   Okunan: {s.ReadCount}   Eklenen/Güncellenen: {s.Inserted}/{s.Updated}   {s.Message}";}
}
