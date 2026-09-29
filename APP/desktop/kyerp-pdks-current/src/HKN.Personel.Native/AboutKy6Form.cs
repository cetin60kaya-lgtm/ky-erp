namespace HKN.Personel.Native;

internal sealed class AboutKy6Form : Form
{
    public AboutKy6Form()
    {
        Text="KY PDKS 6.3.1 TEST Hakkında";
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
        root.Controls.Add(new Label{Text="KY PDKS 6.3.1 TEST",Dock=DockStyle.Fill,Font=new Font("Segoe UI",24f,FontStyle.Bold),ForeColor=Color.FromArgb(30,75,145)},0,0);
        root.Controls.Add(new Label{Text="Seri Operasyon • Terminal • Puantaj • Bordro • Rol ve Lisans Yönetimi",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold)},0,1);
        root.Controls.Add(new Label{Text="TEST SÜRÜMÜ • gerçek firma verisi ve terminal ile saha kabulü tamamlanmadan final değildir",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold),ForeColor=Color.FromArgb(190,82,54)},0,2);
        root.Controls.Add(new Label
        {
            Dock=DockStyle.Fill,
            AutoSize=false,
            TextAlign=ContentAlignment.TopLeft,
            Text="REV 6.3.1 işyeri testinde görülen kritik sorunlara odaklanan düzeltme paketidir.\n\n• Canlı İzleme / Terminal / diğer modüllerdeki disposed ModuleHost yaşam döngüsü hatası giderildi.\n• Personel Aktif / Pasif / Tüm filtresi, arama ile birlikte gerçek liste görünümüne uygulanır.\n• Ana pencere eski kayıtlı düzen tam ekran istese bile geniş ve ortalı açılır.\n• Sistem Yönetimi ve Çalışma Alanı üst menü kalabalığı kaldırıldı; ilgili işlemler Yönetim ve Ayarlar altına toplandı.\n• Kart cihazı bulut anahtarından bağımsız, doğrudan yerel terminal bağlantısıyla kontrol edilir.\n• Terminal merkezinde Cihaz Bağlantısı, Şimdi Al ve Sürücüyü Onar akışı bulunur.\n• Paket, Hedef 5.0.29 ile eşleşen 32-bit FP_CLOCK / destek DLL setiyle dağıtılır; kayıt eksikse uygulama yönetici onayıyla onarabilir.\n• Terminal kayıtları TNF + FDB doğrulanmadan cihazdan silinmez.\n• Firma Sorumlusu ve Super Admin ayrımı korunur; yetkisiz yönetim alanları görünmez.\n• Lisans süresi veri silmez; erişimi yönetir.\n\nCanlı Firebird FDB/GDB dosyasının fiziksel disk şifrelemesi lisans kilidinden ayrı bir güvenlik katmanıdır; uygulama veri dosyasını sessizce yeniden şifrelemez veya silmez."
        },0,3);
        var close=new Button{Text="Kapat",Width=110,Height=32,Anchor=AnchorStyles.Right};
        close.Click+=(_,_)=>Close();
        root.Controls.Add(close,0,4);
        Controls.Add(root);
    }
}
