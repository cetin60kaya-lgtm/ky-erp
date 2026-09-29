# SYNC CONTRACT

## Eşitle sırası
1. Cihazdan kayıtları oku.
2. Tek geçici dosya `live.dat` güncellensin.
3. Yıllık `TRYYYY.Tnf` arşivine yaz.
4. `KY_PDKS_DATA.FDB` içine işle.
5. Kayıt/adet doğrulaması yap.
6. Yalnız 1-5 tamamen başarılıysa cihaz kayıtlarını temizle.
7. Cloud Outbox'a değişiklik/job sonucu ekle.
8. kyerp.net tarafına push/pull senkron yap.

Hata halinde cihaz silinmez. TNF elle sonradan değiştirilmez.
`Canlıyı Temizle` yalnız `live.dat` içeriğini temizler.

## Offline-first
Desktop internet olmadan Personel, Giriş/Çıkış, İzin, Puantaj, Bordro, Rapor/Denetim ve terminal işlemlerini sürdürür.
Aktive edilmiş cihazda internet yokluğu üyelik/login kilidi üretmez; imzalı yerel aktivasyon kullanılır.
Bağlantı gelince Outbox/Inbox otomatik eşitlenir.

## Çift yönlü kayıt metası
Cloud senkron kaydında en az: `RecordId`, `UpdatedAt`, `UpdatedBy`, `Source`, `DeviceId`, `Version`, `SyncStatus`.
Source: `DESKTOP`, `WEB`, `TABLET`, `TERMINAL`.
Personel/izin/tanım kayıtlarında version kontrolü; giriş-çıkış/denetim kayıtlarında geçmişi ezmek yerine audit.

## Webden terminal komutu
Web/tablet `Eşitle` => Cloud `SYNC_TERMINAL` job => ana Desktop Agent => fiziksel cihaz => sonuç Cloud => web sonucu gösterir.
Web fiziksel cihaza doğrudan TCP/SDK bağlantısı kurmaz.