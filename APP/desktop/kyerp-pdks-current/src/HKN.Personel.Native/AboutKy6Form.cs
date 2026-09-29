namespace HKN.Personel.Native;

internal sealed class AboutKy6Form : Form
{
    public AboutKy6Form()
    {
        Text="KY PDKS 6.3.3 TEST Hakkında";
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
        root.Controls.Add(new Label{Text="KY PDKS 6.3.3 TEST",Dock=DockStyle.Fill,Font=new Font("Segoe UI",24f,FontStyle.Bold),ForeColor=Color.FromArgb(30,75,145)},0,0);
        root.Controls.Add(new Label{Text="Seri Operasyon • Terminal • Puantaj • Bordro • Rol ve Lisans Yönetimi",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold)},0,1);
        root.Controls.Add(new Label{Text="TEST SÜRÜMÜ • gerçek firma verisi ve terminal ile saha kabulü tamamlanmadan final değildir",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold),ForeColor=Color.FromArgb(190,82,54)},0,2);
        root.Controls.Add(new Label
        {
            Dock=DockStyle.Fill,
            AutoSize=false,
            TextAlign=ContentAlignment.TopLeft,
            Text="REV 6.3.3 işyeri testinde görülen pencere sıçraması, canlı ekran titremesi ve terminal kayıt güvenliğine odaklanır.\n\n• Ana pencere görünmeden önce normal/ortalı boyuta alınır; ilk açılıştaki tam ekran → küçülme geçişi kaldırıldı.\n• Canlı Personel Denetimi 5 saniyede komple grid/kart yeniden çizmek yerine 20 saniyede kontrol eder ve veri değişmediyse ekrana dokunmaz.\n• Canlı ekran her yeni açılışta bugünün tarihiyle başlar; manuel geçmiş gün seçimi korunur.\n• Terminal / Kart Cihazı Ayarları artık Ayarlar menüsünde doğrudan görünür ve Terminal Merkezi'nde ilk karttır.\n• Hedef cihaz profili korunur: Cihaz1, Makine 1, Ethernet, COM1, 38400, 192.168.1.224:5005, GİRİŞ.\n• Fiziksel cihaz kayıtlarını aktarım sonrası otomatik silme 6.3.3 TEST'te tamamen kapalıdır; eski ayarlarda açık kalmış olsa bile güvenli moda çevrilir.\n• Cihazda veri yoksa açıkça 'Aktarılacak veri yok' bilgisi verilir; hata gibi gösterilmez.\n• TNF + FDB aktarımı doğrulanır ve fiziksel cihaz kaydı kaynak kanıt olarak korunur.\n\nCanlı Firebird FDB/GDB dosyasının fiziksel disk şifrelemesi lisans kilidinden ayrı bir güvenlik katmanıdır; uygulama veri dosyasını sessizce yeniden şifrelemez veya silmez."
        },0,3);
        var close=new Button{Text="Kapat",Width=110,Height=32,Anchor=AnchorStyles.Right};
        close.Click+=(_,_)=>Close();
        root.Controls.Add(close,0,4);
        Controls.Add(root);
    }
}
