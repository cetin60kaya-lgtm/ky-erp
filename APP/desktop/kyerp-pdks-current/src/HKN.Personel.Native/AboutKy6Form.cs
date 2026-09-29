namespace HKN.Personel.Native;

internal sealed class AboutKy6Form : Form
{
    public AboutKy6Form()
    {
        Text="KY PDKS 6.3.2 TEST Hakkında";
        StartPosition=FormStartPosition.CenterParent;
        ClientSize=new Size(760,560);
        FormBorderStyle=FormBorderStyle.FixedDialog;
        MaximizeBox=false;
        MinimizeBox=false;
        Font=new Font("Segoe UI",9f);
        Build();
    }

    void Build()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=5,Padding=new Padding(24)};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,62));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,36));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
        root.Controls.Add(new Label{Text="KY PDKS 6.3.2 TEST",Dock=DockStyle.Fill,Font=new Font("Segoe UI",24f,FontStyle.Bold),ForeColor=Color.FromArgb(30,75,145)},0,0);
        root.Controls.Add(new Label{Text="Seri Operasyon • Terminal • Puantaj • Bordro • Rol ve Lisans Yönetimi",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold)},0,1);
        root.Controls.Add(new Label{Text="TEST SÜRÜMÜ • gerçek firma verisi ve terminal ile saha kabulü tamamlanmadan final değildir",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold),ForeColor=Color.FromArgb(190,82,54)},0,2);
        root.Controls.Add(new Label
        {
            Dock=DockStyle.Fill,
            AutoSize=false,
            TextAlign=ContentAlignment.TopLeft,
            Text="REV 6.3.2 işyeri terminal kabulüne odaklanan kararlı test paketidir.\n\n• Kart cihazı ayarları Hedef PDKS'deki gerçek cihaz mantığına göre düzenlendi: cihaz/makine, Ethernet, COM, baudrate, IP, port ve giriş/çıkış.\n• Cihaz bağlantı testi, cihaz tarih/saat okuma, PC saatine ayarlama, cihazdan kart kayıtlarını önizleme ve doğrulanmış aktarım aynı merkezde toplandı.\n• Cihaz kayıt sayacı 0/-1 dönse bile cihaz günlükleri okunmayı denenir; boş cihaz artık hata yerine açık bilgi verir.\n• Aktarılacak veri yoksa işlem hata üretmez ve 'Aktarılacak veri yok.' mesajı gösterilir.\n• Terminal kayıtları TNF + FDB doğrulanmadan cihazdan silinmez; yedek seçeneği açıksa ham cihaz kaydı ayrıca yedeklenir.\n• Terminal IP/port/makine ayarı uygulamanın gerçek bağlantı motoruyla aynı kayıt dosyasından okunur.\n• Disposed ModuleHost yaşam döngüsü, personel Aktif/Pasif/Tüm filtresi, kompakt menüler ve ortalı pencere düzeltmeleri korunur.\n• Firma Sorumlusu ve Super Admin ayrımı korunur; yetkisiz yönetim alanları görünmez.\n• Lisans süresi veri silmez; erişimi yönetir.\n\nCanlı Firebird FDB/GDB dosyasının fiziksel disk şifrelemesi lisans kilidinden ayrı bir güvenlik katmanıdır; uygulama veri dosyasını sessizce yeniden şifrelemez veya silmez."
        },0,3);
        var close=new Button{Text="Kapat",Width=110,Height=32,Anchor=AnchorStyles.Right};
        close.Click+=(_,_)=>Close();
        root.Controls.Add(close,0,4);
        Controls.Add(root);
    }
}
