# HAKAN EMP — XLSM tüm yıllar aktarımı

Bu araç **HAKAN EMP bağımsız Windows uygulaması** içindir; KY ERP / Cloudflare D1 migrasyonu değildir.

## Kaynak ve güvenlik

- Kullanıcının verdiği `İMALAT BASKI MUHASEBE .xlsm` verilerinden **yerelde** hazırlanmış `imalat_tum_yillar.json` gerekir. Gerçek işletme verileri GitHub'a eklenmez.
- Firma `TAHA GİYİM` olarak tanımlıdır. Kaynak satırındaki yıl korunur.
- Önce salt-okunur dry-run yapılır; `--apply` olmadan hiçbir veri yazılmaz.
- Yazmadan önce `VACUUM INTO` ile tutarlı SQLite yedeği alınır.
- Aynı üretim satırının tekrar çalıştırıldığında çoğaltılmaması için mevcut DB üretimleri, **aynı içeriğe sahip birden fazla gerçek üretim satırı dahil**, sayılarak karşılaştırılır.
- Farklı firma sahibi mevcut model kaydı otomatik başka firmaya aktarılmaz; sayılır ve atlanır.
- Geçmiş kayıtlar `TAMAM` durumundaki `XLSM GEÇMİŞ <yıl>` partilerine alınır; mevcut `OPEN` partilere karışmaz.
- Tarih, model veya üretim adedi eksik satırlar raporlanır ve kesin veri uydurulmaz.

## İşlem

**Uygulamayı kapatın**, JSON ve mevcut veritabanını farklı yerde yedekleyin, sonra uygulama kodu kökünden:

```powershell
node tools/import-history.cjs --input="D:\AKTARIM\imalat_tum_yillar.json" --db="$env:APPDATA\HAKAN EMP\data\IMALAT.db" --report="D:\AKTARIM\on-kontrol.json"
node tools/import-history.cjs --input="D:\AKTARIM\imalat_tum_yillar.json" --db="$env:APPDATA\HAKAN EMP\data\IMALAT.db" --apply --report="D:\AKTARIM\sonuc.json"
npm run test:import
```

**Not:** Bu örnek terminal komutlarıdır, otomatik kurulum yapılmış olduğunu göstermez. Kaynak JSON dosyası, koddan farklıdır. Windows EXE yeniden oluşturma, kurulum ve gerçek canlı içe aktarma ayrıca doğrulanmalıdır.
