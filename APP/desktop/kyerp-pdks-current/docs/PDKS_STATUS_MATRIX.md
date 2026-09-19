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
| Puantaj | YARIM | Dönemsel bilgi/özet ve testli hesaplama çekirdeği var; yeniden hesaplama ve kapanış akışı eksik. |
| Bordro | YARIM | Kişisel dönem özeti, kazanç/kesinti dahil testli bordro hesabı ve çıktı var; batch/kapanış yok. |
| Maaş / mesai ödemesi | VAR | `ODEME` üzerinden dönemsel maaş/mesai ödeme düzenleme. |
| Departman / grup / servis / görev / durum | YARIM | Masterlar okunuyor ve filtreleniyor; yönetim CRUD ekranları yok. |
| Dönem işlemleri | YARIM | `DONEM` okunuyor; dönem oluşturma/kapatma servisleri aktif kaynakta yok. |
| Terminal tanımı | VAR | KYERP UI içinde profile store; yeni/kopyala/düzenle/sil/varsayılan/önizleme ve JSON import/export mevcut. |
| Terminalden veri alma / aktarım | YARIM | Profile-driven File adapterı ve idempotent `GIRCIK` import servisi tamam; fiziksel cihaz protokol adapterı eksik. |
| TNF import/export | VAR | Strict KYERP TNF v1 parser/exporter; alan, tarih/saat, sabit kod, boş satır ve duplicate kontrolleri mevcut. |
| Günlük operasyon | VAR | Tarih bazlı KYERP operasyon penceresi; beklenen/gelen/gelmeyen/açık kayıt ve gündüz/gece özetleri. |
| Canlı gelen-gelmeyen personel | VAR | Aktif personel rosterı ile günlük `GIRCIK` kayıtları karşılaştırılıyor. |
| Gece/gündüz vardiya akışı | YARIM | Geceye taşan kayıt ekleme mantığı var; vardiya plan/master akışı yok. |
| Raporlar | YARIM | Altı kişisel rapor önizlemesi var; toplu/operasyon/terminal raporları yok. |
| Yazdırma / PDF / Excel | VAR | Windows print preview ile aktif tablo için gerçek PDF ve XLSX dışa aktarma mevcut. |
| Yetki / firma / tenant bağlamı | YARIM | Firma alanı okunuyor; merkezi config kimlikleri eklendi, enforcement henüz yok. |
| Desktop ↔ KYERP.NET senkronu | YARIM | Bearer kullanan push/pull client, kapsamlı event sözleşmesi ve additive Worker route modülü hazır; canonical Worker auth authorizer bağlantısı bekliyor. |
| Offline/queue davranışı | VAR | Atomik dosya outbox, idempotency, tamamlandı arşivi ve exponential retry/backoff mevcut. |

## Baseline

- `BUILD.ps1`: başarılı; Native ve Bridge publish başarılı.
- Başlangıç uyarısı: Bridge içindeki kullanılmayan `brandLabel` alanı (merkezi config fazında kaldırıldı).
- Canlı DB smoke testi, açık test bağlantısı/secret olmadan çalıştırılmadı; mevcut test transaction + rollback kullanır.
