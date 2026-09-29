namespace HKN.Personel.Native;

/// <summary>
/// Son kullanıcı için uygulama içi kısa kullanım rehberi.
/// Teknik tablo adları yerine günlük iş akışını anlatır.
/// </summary>
public sealed class PdksQuickGuideForm : Form
{
    readonly ListBox topics = new()
    {
        Dock = DockStyle.Fill,
        IntegralHeight = false,
        BorderStyle = BorderStyle.None,
        Font = new Font("Segoe UI", 10f)
    };

    readonly Label title = new()
    {
        Dock = DockStyle.Top,
        Height = 42,
        Font = new Font("Segoe UI", 16f, FontStyle.Bold),
        ForeColor = Color.FromArgb(27, 44, 68),
        TextAlign = ContentAlignment.MiddleLeft
    };

    readonly Label description = new()
    {
        Dock = DockStyle.Fill,
        Font = new Font("Segoe UI", 10f),
        ForeColor = Color.FromArgb(62, 78, 101),
        AutoSize = false,
        Padding = new Padding(0, 10, 0, 0)
    };

    readonly Dictionary<string, GuideTopic> guide = new(StringComparer.OrdinalIgnoreCase)
    {
        ["1. Günlük İş Akışı"] = new(
            "Günlük İş Akışı",
            "Önerilen sıra:\r\n\r\n" +
            "1) Canlı İzleme: Bugün kim geldi, kim kart basmadı, kim içeride/çıkış bekliyor kontrol edilir.\r\n" +
            "2) Giriş-Çıkış: Eksik veya hatalı hareket varsa gerçek kayda göre düzeltilir.\r\n" +
            "3) İzinler: İzinli/raporlu personelin kayıtları kontrol edilir.\r\n" +
            "4) Puantaj: Kart + izin + tatil + çalışma planından günlük/aylık hesap yapılır.\r\n" +
            "5) Bordro/Ödemeler: Puantaj sonuçları üzerinden ücret, mesai, ek kazanç ve kesintiler kontrol edilir.\r\n" +
            "6) Raporlar: Sonuçlar yazdırılır veya PDF/Excel olarak alınır.\r\n\r\n" +
            "Kural: Gerçek kart hareketi yoksa sistemde yapay giriş/çıkış oluşturmayın. Eksik kaydı önce doğrulayın, sonra düzeltin."),

        ["2. Genel Bakış"] = new(
            "Genel Bakış",
            "Uygulamanın başlangıç ekranıdır. Günün aktif personel, gelen personel, kart basmayan ve çıkış bekleyen sayılarını hızlıca gösterir.\r\n\r\n" +
            "Buradaki kartlar ayrıntı ekranlarının yerine geçmez; hangi bölüme bakmanız gerektiğini hızlıca anlamanız içindir."),

        ["3. Canlı İzleme"] = new(
            "Canlı Personel Denetimi",
            "Bugünün hareketlerini operasyon gözüyle takip eder. Beklenen/gelen personel, kart basmayanlar, izinliler, içeride kalanlar, çıkışı eksik olanlar ve eşleşmeyen kartlar ayrı görünür.\r\n\r\n" +
            "Eşitle: terminalden yeni hareketleri alır.\r\n" +
            "Yenile: mevcut veriyi tekrar değerlendirir.\r\n" +
            "Otomatik yenile: ekran açıkken güncel durumu izler.\r\n\r\n" +
            "Bir sorun gördüğünüzde önce personelin kart ve izin durumunu doğrulayın; düzeltmeyi Giriş-Çıkış ekranından yapın."),

        ["4. Giriş-Çıkış"] = new(
            "Giriş-Çıkış Kayıtları",
            "Terminalden veya onaylı TNF kaynağından gelen gerçek kart hareketlerini inceler. Giriş ve çıkış çiftleri, tarih ve saat aralığı bu ekrandan kontrol edilir.\r\n\r\n" +
            "Elle düzeltme yalnız gerçek durumu doğrulamak için kullanılmalıdır. Aynı hareketi ikinci kez eklemeyin ve personelin işe giriş/çıkış tarihleri dışına kayıt taşımayın."),

        ["5. Personel"] = new(
            "Personel Bilgileri",
            "Personelin özlük kartını ve kişi bazlı PDKS geçmişini tek yerde toplar.\r\n\r\n" +
            "Personel Bilgileri: kimlik ve kişisel bilgiler.\r\n" +
            "Giriş ve Çıkışları: seçili dönemde kart hareketleri.\r\n" +
            "İzinler: izin/rapor kayıtları.\r\n" +
            "Ek Kazanç ve Kesintiler: avans, ek kazanç ve kesinti hareketleri.\r\n" +
            "Bilgi: puantaj özeti; normal çalışma, mesai, devamsızlık, geç kalma ve eksik süre.\r\n" +
            "Ödemeler: seçili personelin aylık bordro ve ödeme kontrolü."),

        ["6. Puantaj"] = new(
            "Günlük ve Aylık Puantaj",
            "Kart hareketleri, izinler, tatiller ve çalışma grubu/planına göre personel-gün sonuçlarını hesaplar.\r\n\r\n" +
            "Günlük Puantaj: dar bir tarih aralığı veya günlük kontrol için.\r\n" +
            "Aylık Puantaj: bordro öncesi ayın tamamını hesaplamak için.\r\n" +
            "Puantaj Sonuçları: hesaplanan normal çalışma, mesai, izin, devamsızlık, geç kalma ve eksik süreleri incelemek için.\r\n\r\n" +
            "Hesaplamadan önce eksik kart/izin kayıtlarını düzeltmek daha güvenlidir."),

        ["7. Bordro ve Ödemeler"] = new(
            "Bordro ve Ödemeler",
            "Aylık puantaj sonucunu ücret tarafında kontrol eder. Genel Maaş Bordrosu toplu görünüm; Personel > Ödemeler kişi bazlı görünüm içindir.\r\n\r\n" +
            "Yıl, ay ve bordro türünü seçip Göster ile veriyi getirirsiniz. Alanlar / Sıralama ekranı görünür kolonları ve sırasını ayarlar. Düzeni Kilitle yanlışlıkla kolon düzeninin bozulmasını önler.\r\n\r\n" +
            "PDF/Excel ve yazdırma işlemleri ekranda seçili/görünür bordro düzenini esas alır."),

        ["8. Terminal"] = new(
            "Terminal ve Veri Aktarımı",
            "Kart cihazından ham hareketleri güvenli biçimde PDKS'e taşır. Son eşitleme zamanı ve okunan/eklenen/güncellenen kayıt sayıları terminalin çalışıp çalışmadığını anlamanıza yardım eder.\r\n\r\n" +
            "TNF canonical formatı: KartNo,Saat,GGAAYY,1,001. Aynı gerçek hareket tekrar aktarılırsa mükerrer kayıt üretilmemelidir."),

        ["9. Tanımlar"] = new(
            "Yapılandırma / Tanımlar",
            "Günlük kullanımda sık değiştirilmemesi gereken sistem kurallarıdır. Bölüm, servis, görev, durum, firma, çalışma grubu, dönem, tatil ve çalışma planları burada tutulur.\r\n\r\n" +
            "Bu alanlardaki değişiklik puantaj sonucunu etkileyebileceği için yetkili kullanıcı tarafından yapılmalıdır."),

        ["10. Raporlar"] = new(
            "Raporlama ve Denetim",
            "Personel, izin, ek kazanç/kesinti, çalışma sistemi, yıllık izin ve bordro sonuçlarını çıktı haline getirir.\r\n\r\n" +
            "Rapor ekranı veri düzeltme yeri değildir. Hatalı sonuç görürseniz önce kaynağı (kart, izin, puantaj veya ödeme) düzeltip raporu yeniden oluşturun."),

        ["11. Sorun Görürsem"] = new(
            "Sorun Görürsem Nereden Başlamalıyım?",
            "Personel gelmiş ama görünmüyor → Canlı İzleme > Eşitle ve Terminal durumunu kontrol edin.\r\n" +
            "Giriş var çıkış yok → Giriş-Çıkış kaydını ve terminal hareketini kontrol edin.\r\n" +
            "İzinli kişi devamsız görünüyor → İzin kaydı ve tarihini kontrol edin, sonra puantajı yeniden hesaplayın.\r\n" +
            "Mesai yanlış → çalışma grubu/planı, giriş-çıkış saatleri ve puantaj sonucunu sırayla kontrol edin.\r\n" +
            "Bordro yanlış → önce puantajı doğrulayın; sonra ek kazanç/kesinti ve ödeme alanlarını kontrol edin.\r\n" +
            "Kart numarası bilinmiyor → eşleşmeyen kart listesinden personel-kart eşleşmesini doğrulayın.")
    };

    public PdksQuickGuideForm()
    {
        Text = "KY PDKS • Hızlı Kullanım Rehberi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(900, 620);
        MinimumSize = new Size(760, 520);
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.FromArgb(246, 249, 253);

        Build();
        topics.Items.AddRange(guide.Keys.Cast<object>().ToArray());
        topics.SelectedIndexChanged += (_, _) => ShowTopic();
        topics.SelectedIndex = 0;
    }

    void Build()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 2,
            Padding = new Padding(16),
            BackColor = BackColor
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 245));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));

        var left = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(8) };
        left.Controls.Add(topics);
        root.Controls.Add(left, 0, 0);

        var body = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(22, 16, 22, 16), Margin = new Padding(12, 0, 0, 0) };
        body.Controls.Add(description);
        body.Controls.Add(title);
        root.Controls.Add(body, 1, 0);

        var hint = new Label
        {
            Text = "Günlük kullanım için soldan konuyu seçin. Bu rehber veri değiştirmez.",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = Color.FromArgb(88, 103, 124)
        };
        var close = new Button
        {
            Text = "Kapat",
            Dock = DockStyle.Right,
            Width = 110,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.White
        };
        close.Click += (_, _) => Close();

        var bottom = new Panel { Dock = DockStyle.Fill, BackColor = BackColor, Padding = new Padding(0, 8, 0, 0) };
        bottom.Controls.Add(hint);
        bottom.Controls.Add(close);
        root.Controls.Add(bottom, 0, 1);
        root.SetColumnSpan(bottom, 2);

        Controls.Add(root);
    }

    void ShowTopic()
    {
        var key = topics.SelectedItem?.ToString();
        if (key is null || !guide.TryGetValue(key, out var topic)) return;
        title.Text = topic.Title;
        description.Text = topic.Description;
    }

    sealed record GuideTopic(string Title, string Description);
}
