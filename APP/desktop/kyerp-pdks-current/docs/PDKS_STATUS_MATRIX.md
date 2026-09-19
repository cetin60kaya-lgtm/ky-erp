# KYERP PDKS durum matrisi

Durumlar aktif kaynak kodu üzerinden doğrulanmıştır. `legacy/` yalnız referanstır.

| Alan | Durum | Kod kanıtı / eksik |
|---|---|---|
| Ana PDKS açılışı ve navigation | YARIM | Native Personel uygulaması ve legacy host Bridge açılıyor; bütün PDKS modüllerini taşıyan bağımsız shell yok. |
| Personel kartı | VAR | `PersonelForm`, kart listeleme/ekleme/değiştirme, fotoğraf ve ayrıntı sekmeleri. |
| İşe giriş / işten çıkış | VAR | Yeni kartta `IGTARIH`, güvenli onayla `ICTARIH` işaretleme. |
| Kart numarası / cihaz-personel eşlemesi | YARIM | `PKNO` ve `EKC` alanları var; cihaz master/veri doğrulaması yok. |
| Giriş-çıkış kayıtları | VAR | `GIRCIK` listeleme ve dönem filtresi. |
| Manuel giriş-çıkış ekle/değiştir/sil | VAR | Classic dialog ve `GIRCIK` CRUD; zaman sırası validasyonu mevcut. |
| İzinler | VAR | `OZELIZIN` listeleme ve tekli/toplu CRUD. |
| Ek kazanç / kesinti | VAR | `AVANS` tablosunda tür bazlı CRUD. |
| Avans / ödeme | YARIM | Ek kazanç/kesinti ve `ODEME` kaydı var; avans tür semantiği ve taksit planı eksik. |
| Mesai / kesinti saatleri | YARIM | `PUANTAJ` alanları okunuyor; merkezi hesaplama servisi yok. |
| Puantaj | YARIM | Dönemsel bilgi/özet var; yeniden hesaplama ve kapanış akışı eksik. |
| Bordro | YARIM | Kişisel dönem özeti ve baskı önizleme var; bordro batch/kapanış yok. |
| Maaş / mesai ödemesi | VAR | `ODEME` üzerinden dönemsel maaş/mesai ödeme düzenleme. |
| Departman / grup / servis / görev / durum | YARIM | Masterlar okunuyor ve filtreleniyor; yönetim CRUD ekranları yok. |
| Dönem işlemleri | YARIM | `DONEM` okunuyor; dönem oluşturma/kapatma servisleri aktif kaynakta yok. |
| Terminal tanımı | YOK | Aktif kaynakta terminal masterı yok. |
| Terminalden veri alma / aktarım | YOK | Agent/terminal adapterı bu solution içinde yok. |
| TNF import/export | YOK | Aktif kaynakta TNF ayrıştırıcı/yazıcı yok. |
| Günlük operasyon | YARIM | Giriş-çıkış kişi bazında var; canlı operasyon merkezi yok. |
| Canlı gelen-gelmeyen personel | YOK | Günlük roster karşılaştırması yok. |
| Gece/gündüz vardiya akışı | YARIM | Geceye taşan kayıt ekleme mantığı var; vardiya plan/master akışı yok. |
| Raporlar | YARIM | Altı kişisel rapor önizlemesi var; toplu/operasyon/terminal raporları yok. |
| Yazdırma / PDF / Excel | YARIM | Windows print preview var; PDF/Excel dışa aktarma yok. |
| Yetki / firma / tenant bağlamı | YARIM | Firma alanı okunuyor; merkezi config kimlikleri eklendi, enforcement henüz yok. |
| Desktop ↔ KYERP.NET senkronu | YOK | Web/API PDKS yolları mevcut fakat Desktop sync istemcisi yok. |
| Offline/queue davranışı | YOK | Outbox, retry ve conflict sözleşmesi yok. |

## Baseline

- `BUILD.ps1`: başarılı; Native ve Bridge publish başarılı.
- Başlangıç uyarısı: Bridge içindeki kullanılmayan `brandLabel` alanı (merkezi config fazında kaldırıldı).
- Canlı DB smoke testi, açık test bağlantısı/secret olmadan çalıştırılmadı; mevcut test transaction + rollback kullanır.
