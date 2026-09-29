namespace HKN.Personel.Native;

internal sealed class AboutKy6Form : Form
{
    public AboutKy6Form()
    {
        Text="KY PDKS 6.3 TEST Hakkında";
        StartPosition=FormStartPosition.CenterParent;
        ClientSize=new Size(760,540);
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
        root.Controls.Add(new Label{Text="KY PDKS 6.3 TEST",Dock=DockStyle.Fill,Font=new Font("Segoe UI",24f,FontStyle.Bold),ForeColor=Color.FromArgb(30,75,145)},0,0);
        root.Controls.Add(new Label{Text="Seri Operasyon • Otomatik Puantaj Kontrolü • Bordro • Rol ve Lisans Yönetimi",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold)},0,1);
        root.Controls.Add(new Label{Text="TEST SÜRÜMÜ • gerçek firma verisi ve terminal ile saha kabulü tamamlanmadan final değildir",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold),ForeColor=Color.FromArgb(190,82,54)},0,2);
        root.Controls.Add(new Label
        {
            Dock=DockStyle.Fill,
            AutoSize=false,
            TextAlign=ContentAlignment.TopLeft,
            Text="REV 6.3 ile günlük kullanım akışı sadeleştirildi ve kritik eksikler toparlandı.\n\n• Ana pencere tam ekran yerine geniş ve ortalı açılır.\n• Menü/toolbar sıkıştırıldı; yetkisiz yönetim alanları görünmez.\n• Personel kayıt sekmelerinde Yeni Ekle / Değiştir / Sil / Tümünü Sil görünür ve aynı işlem motoruna bağlıdır.\n• Sağ tık, satır seçimi, sütun taşıma/genişletme ve sütun kilitleme ortak davranış oldu.\n• Dönem seçimi ile tarih aralığı senkron tutulur.\n• Puantaj ekranı hesap üretme ekranı olmaktan çok kontrol / gerektiğinde yeniden hesaplama olarak açıklanır.\n• Firma Sorumlusu için 6 kartlı Hızlı İşlemler merkezi yalnız yetkili hesaplarda görünür.\n• 7 günlük demo ilk çalıştırmada otomatik başlar; demo/süresi dolmuş lisanslarda veri değiştiren kritik işlemler kapalıdır.\n• Super Admin lisans nedeniyle uygulama dışında kalmaz; lisans tarihi önizlenerek tek Kaydet işlemiyle yönetilir.\n• Online lisans için api.kyerp.net temeli ve dijital imzalı paket doğrulama altyapısı hazırdır.\n\nCanlı Firebird FDB/GDB dosyasının fiziksel disk şifrelemesi lisans kilidinden ayrı bir güvenlik katmanıdır; REV 6.3 veri dosyasını sessizce yeniden şifrelemez veya silmez."
        },0,3);
        var close=new Button{Text="Kapat",Width=110,Height=32,Anchor=AnchorStyles.Right};
        close.Click+=(_,_)=>Close();
        root.Controls.Add(close,0,4);
        Controls.Add(root);
    }
}
