namespace HKN.Personel.Native;

internal sealed class AboutKy6Form : Form
{
    public AboutKy6Form()
    {
        Text="KY PDKS 6.4.0 CANLI Hakkında";
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
        root.Controls.Add(new Label{Text="KY PDKS 6.4.0 CANLI",Dock=DockStyle.Fill,Font=new Font("Segoe UI",24f,FontStyle.Bold),ForeColor=Color.FromArgb(30,75,145)},0,0);
        root.Controls.Add(new Label{Text="Seri Operasyon • Terminal • Puantaj • Bordro • Rol ve Lisans Yönetimi",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold)},0,1);
        root.Controls.Add(new Label{Text="CANLI SÜRÜM • güvenli veri erişimi, terminal kayıt koruması ve kontrollü düzeltme akışı",Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f,FontStyle.Bold),ForeColor=Color.FromArgb(32,122,78)},0,2);
        root.Controls.Add(new Label
        {
            Dock=DockStyle.Fill,
            AutoSize=false,
            TextAlign=ContentAlignment.TopLeft,
            Text="REV 6.4.0 CANLI; sade ana menü, kararlı pencere açılışı, güvenli terminal aktarımı ve personel/puantaj iş akışını tek masaüstü uygulamada toplar.\n\n• Ana pencere ilk çizimden önce normal/ortalı boyuta alınır; görünür pencere sıçraması önlenir.\n• Canlı Personel Denetimi yalnız veri değiştiğinde ekranı günceller; gereksiz grid yeniden çizimi azaltılmıştır.\n• Canlı ekran yeni açılışta bugünün tarihiyle başlar; manuel geçmiş gün seçimi korunur.\n• Terminal / Kart Cihazı Ayarları Ayarlar menüsünde doğrudan erişilebilir.\n• Hedef cihaz profili ve TerminalBridge akışı korunur; canlı aktarım tek geçişte ve bir dakikalık güvenli periyotta çalışır.\n• Fiziksel cihaz kayıtları aktarım sonrası otomatik silinmez; cihaz kaydı kaynak kanıt olarak korunur.\n• TNF + FDB aktarımı doğrulama katmanlarıyla yürütülür; ana TNF/FDB verisi arşiv temizliği sırasında silinmez.\n• Super Admin ve Firma Sorumlusu rolleri ayrıdır; yetkisiz yönetim ekranları kullanıcıya gösterilmez.\n\nCanlı Firebird FDB/GDB dosyasının fiziksel disk şifrelemesi lisans kilidinden ayrı bir güvenlik katmanıdır; uygulama veri dosyasını sessizce yeniden şifrelemez veya silmez."
        },0,3);
        var close=new Button{Text="Kapat",Width=110,Height=32,Anchor=AnchorStyles.Right};
        close.Click+=(_,_)=>Close();
        root.Controls.Add(close,0,4);
        Controls.Add(root);
    }
}
