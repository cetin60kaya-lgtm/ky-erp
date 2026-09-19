# KYERP PDKS durum matrisi

Durumlar aktif kaynak kodu üzerinden doğrulanmıştır. `legacy/` yalnız referanstır.

| Alan | Durum | Kod kanıtı / eksik |
|---|---|---|
| Ana PDKS açılışı ve navigation | YARIM | Native Personel uygulaması ve legacy host Bridge açılıyor; bütün PDKS modüllerini taşıyan bağımsız shell yok. |
| Personel kartı | VAR | `PersonelForm`, kart listeleme/ekleme/değiştirme, fotoğraf ve ayrıntı sekmeleri. |
| İşe giriş / işten çıkış | VAR | Yeni kartta `IGTARIH`, güvenli onayla `ICTARIH` işaretleme. |
| Kart numarası / cihaz-personel eşlemesi | YARIM | `PKNO` ve `EKC` alanları var; fiziksel cihaz master/protokol doğrulaması yok. |
| Giriş-çıkış kayıtları | VAR | `GIRCIK` listeleme ve dönem filtresi. |
| Manuel giriş-çıkış ekle/değiştir/sil | VAR | Classic dialog ve `GIRCIK` CRUD; zaman sırası validasyonu mevcut. |
| İzinler | VAR | `OZELIZIN` listeleme ve tekli/toplu CRUD. |
| Ek kazanç / kesinti | VAR | `AVANS` tablosunda tür bazlı CRUD. |
| Avans / ödeme | YARIM | Ek kazanç/kesinti ve `ODEME` kaydı var; avans tür semantiği ve taksit planı eksik. |
| Mesai / kesinti saatleri | YARIM | `PUANTAJ` alanları ve hesap çekirdeği var; kesin canlı iş kurallarıyla yeniden hesaplama henüz doğrulanmadı. |
| Puantaj | YARIM | Dönemsel bilgi/özet ve testli hesaplama çekirdeği var; yeniden hesaplama ve kapanış akışı eksik. |
| Bordro | YARIM | Kişisel dönem özeti, kazanç/kesinti dahil testli bordro hesabı ve çıktı var; batch/kapanış yok. |
| Maaş / mesai ödemesi | VAR | `ODEME` üzerinden transaction tabanlı dönemsel maaş/mesai ödeme kaydı. |
| Departman / grup / servis / görev / durum | YARIM | CRUD ekranları eklendi. Silme koruması yalnız `KIMLIK` kullanımını kontrol ediyor; `DONEM.GRUP` ve diğer olası referanslar tamamlanmadan tam güvenli sayılmaz. |
| Dönem işlemleri | YARIM | `DONEM` listeleme, oluşturma ve düzenleme eklendi; dönem kapatma kuralı/kolonu doğrulanmadı. |
| Terminal tanımı | VAR | KYERP UI içinde alan bazlı profile editor; yeni/kopyala/düzenle/sil/varsayılan/önizleme ve JSON import/export mevcut. |
| Terminalden veri alma / aktarım | YARIM | Profile-driven File/TNF adapterı ve transaction tabanlı idempotent `GIRCIK` import servisi tamam; fiziksel cihaz protokol adapterı eksik. |
| TNF import/export | VAR | Strict KYERP TNF v1 parser/exporter; alan, tarih/saat, sabit kod, boş satır ve duplicate kontrolleri mevcut. |
| Günlük operasyon | VAR | Tarih bazlı KYERP operasyon penceresi; beklenen/gelen/gelmeyen/açık kayıt ve gündüz/gece özetleri. |
| Canlı gelen-gelmeyen personel | VAR | Aktif personel rosterı ile günlük `GIRCIK` kayıtları karşılaştırılıyor. |
| Gece/gündüz vardiya akışı | YARIM | Geceye taşan kayıt ekleme mantığı var; vardiya plan/master akışı yok. |
| Raporlar | YARIM | Altı kişisel rapor önizlemesi var; toplu/operasyon/terminal rapor kapsamı eksik. |
| Yazdırma / PDF / Excel | VAR | Windows print preview ile aktif tablo için gerçek PDF ve XLSX dışa aktarma mevcut. |
| Yetki / firma / tenant bağlamı | YARIM | Tenant/company/workplace yapılandırması ve sync scope var; uygulama genelinde enforcement tamamlanmadı. |
| Desktop ↔ KYERP.NET senkronu | YARIM | Bearer push/pull client, retry outbox ve additive Worker route modülü hazır; canonical Worker session authorizer bağlantısı bekliyor. |
| Offline/queue davranışı | VAR | Atomik dosya outbox, idempotency, tamamlandı arşivi ve exponential retry/backoff mevcut. |

## Baseline

- `BUILD.ps1`: başarılı; Desktop solution ve publish 0 hata / 0 uyarı.
- Contract testleri başarılı.
- Worker typecheck/test/dry-run başarılı.
- Canlı DB smoke testi, açık test bağlantısı/secret olmadan çalıştırılmadı; mevcut test transaction + rollback kullanır.
- Remote `0003_pdks_sync.sql` migrationı uygulanmadı ve production deploy yapılmadı.
