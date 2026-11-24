# KY ERP NetteFatura Chrome Aktarım v0.1.0 — ilk kabul
Yalnız gerçek https://nettefatura.isnet.net.tr portalı; mevcut normal kullanıcı oturumu.
Kullanıcı portalın gelen/giden fatura/irsaliye listesini açar, kendi tarih filtresini uygular.
Eklenti sağ alt panelde açılır, aktif DataTables sayfasındaki gerçek satırları gösterir.
En fazla 2 belge seçilir. XML/PDF ayrı GET istekleri; parola, cookie API veya token kopyalama yok.
XML türü, UBL namespace ve belge no; PDF magic/EOF; 20 MB/dosya ve 100 MB/paket sınırı.
Tüm çiftler başarılı olmadan ZIP indirme yapılmaz. Başarılı ZIP tarayıcıdan İndirilenler'e gider.
İlk sürüm KY ERP D1, Drive, File Hub veya resmi gönderim işlemi yapmaz. Mevcut ERP Belge Yükleme ekranına kullanıcı paketi açarak doğrulanmış dosyaları seçer. Otomatik aktarım kabulü ayrı.
Kurulum: Chrome chrome://extensions > Geliştirici modu > Paketlenmemiş öğe yükle; manifest.json bulunan klasör.
Giriş ekranlarında veya diğer sitelerde panel açılmaz. Yalnız dört portal liste yolu. Tarayıcı izinleri kapatılmaz.
Gerçek portal DataTables alanları ve indirme adresleri önceki canonical isnet-live-sync.ts koduna dayanıyor; gerçek tarayıcı testi yapılmadan PASS denmez.
