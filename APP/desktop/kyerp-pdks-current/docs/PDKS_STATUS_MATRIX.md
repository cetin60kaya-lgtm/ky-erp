# KYERP PDKS durum matrisi

Durumlar aktif kaynak kodu üzerinden doğrulanmıştır. `legacy/` yalnız referanstır.

| Alan | Durum | Kod kanıtı / eksik |
|---|---|---|
| Ana PDKS açılışı ve navigation | VAR | Bağımsız native shell; legacy menü, toolbar, gizli WC kaynağı ve modal modül açılışları ShellSmokeTest ile korunuyor. |
| Personel kartı | VAR | `PersonelForm`, kart listeleme/ekleme/değiştirme, fotoğraf ve ayrıntı sekmeleri. |
| İşe giriş / işten çıkış | VAR | Yeni kartta `IGTARIH`, güvenli onayla `ICTARIH` işaretleme. |
| Kart numarası / cihaz-personel eşlemesi | YARIM | `PKNO` ve `EKC` alanları var; fiziksel cihaz master/protokol doğrulaması yok. |
| Giriş-çıkış kayıtları | VAR | `GIRCIK` listeleme ve dönem filtresi. |
| Manuel giriş-çıkış ekle/değiştir/sil | VAR | Classic dialog ve `GIRCIK` CRUD; zaman sırası validasyonu mevcut. |
| İzinler | VAR | `OZELIZIN` listeleme ve tekli/toplu CRUD. |
| Ek kazanç / kesinti | VAR | `AVANS` tablosunda tür bazlı CRUD. |
| Avans / ödeme | YARIM | Ek kazanç/kesinti ve `ODEME` kaydı var; avans tür semantiği ve taksit planı eksik. |
| Mesai / kesinti saatleri | YARIM | `PUANTAJ` alanları ve hesap çekirdeği var; kesin canlı iş kurallarıyla yeniden hesaplama henüz doğrulanmadı. |
| Puantaj | YARIM | Seçili personel/tarih aralığında `GIRCIK`, `OZELIZIN`, `PERPLANTAT` ve `GRUP` verisinden transactional günlük PUANTAJ upsert var. `YUVARLA`, `PUANBILGI` ceza katsayıları ve dönem kapanışı henüz uygulanmadı. |
| Bordro | YARIM | `GUN1`, `DAKIKA2/3`, kazanç ve kesintilerden toplu bordro; preview, gerçek yazdırma ve PDF/XLSX aktarım var. Dönem kapanışı/muhasebe transferi yok. |
| Maaş / mesai ödemesi | VAR | `ODEME` üzerinden transaction tabanlı dönemsel maaş/mesai ödeme kaydı. |
| Departman / grup / servis / görev / durum | YARIM | CRUD ekranları eklendi. Silme koruması yalnız `KIMLIK` kullanımını kontrol ediyor; `DONEM.GRUP` ve diğer olası referanslar tamamlanmadan tam güvenli sayılmaz. |
| Dönem işlemleri | YARIM | `DONEM` listeleme, oluşturma ve düzenleme eklendi; dönem kapatma kuralı/kolonu doğrulanmadı. |
| Terminal tanımı | VAR | KYERP UI içinde alan bazlı profile editor; yeni/kopyala/düzenle/sil/varsayılan/önizleme ve JSON import/export mevcut. |
| Terminalden veri alma / aktarım | YARIM | Legacy `409x553` transfer formu, File/TNF adapterı, 0-60 dakika mükerrer toleransı ve transaction tabanlı `GIRCIK` import tamam; fiziksel cihaz protokol adapterı eksik. |
| TNF import/export | VAR | Strict KYERP TNF v1 parser/exporter; alan, tarih/saat, sabit kod, boş satır ve duplicate kontrolleri mevcut. |
| Günlük operasyon | VAR | Tarih bazlı KYERP operasyon penceresi; beklenen/gelen/gelmeyen/açık kayıt ve gündüz/gece özetleri. |
| Canlı gelen-gelmeyen personel | VAR | Aktif personel rosterı ile günlük `GIRCIK` kayıtları karşılaştırılıyor. |
| Gece/gündüz vardiya akışı | YARIM | Geceye taşan kayıt ekleme mantığı var; vardiya plan/master akışı yok. |
| Raporlar | YARIM | Altı kişisel rapora ek olarak beş doğrudan operasyon raporu, toplu bordro, print preview ve PDF/XLSX çıktı var. 56 legacy FR3 şablonunun birebir render parity'si yok. |
| Yazdırma / PDF / Excel | VAR | Windows print preview ile aktif tablo için gerçek PDF ve XLSX dışa aktarma mevcut. |
| Yetki / firma / tenant bağlamı | YARIM | Tenant/company/workplace yapılandırması ve sync scope var; uygulama genelinde enforcement tamamlanmadı. |
| Desktop ↔ KYERP.NET senkronu | YARIM | Bearer push/pull client, retry outbox ve additive Worker route modülü hazır; canonical Worker session authorizer bağlantısı bekliyor. |
| Offline/queue davranışı | VAR | Atomik dosya outbox, idempotency, tamamlandı arşivi ve exponential retry/backoff mevcut. |

## Baseline

- `dotnet build KYERP.PDKS.sln -c Release`: başarılı; 0 hata / 0 uyarı (2026-09-20).
- Contract testleri: 22/22 başarılı.
- Shell parity smoke: başarılı.
- Worker typecheck/test/dry-run önceki baseline'da başarılıydı; bu desktop parity turunda yeniden çalıştırılmadı.
- Canlı Firebird smoke: başarılı; KIMLIK/GIRCIK/PUANTAJ/OZELIZIN/AVANS işlemleri rollback edildi, terminal toleransı ve beş operasyon raporu sorgusu doğrulandı, öncesi/sonrası toplamlar değişmedi.
- Remote `0003_pdks_sync.sql` migrationı uygulanmadı ve production deploy yapılmadı.
