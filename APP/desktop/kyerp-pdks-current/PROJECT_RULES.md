# HKN PDKS / PERSONEL KART — ÇALIŞMA KURALI

Bu belge bu proje için kalıcı çalışma düzenidir.

## Tek yerel çalışma klasörü
- Canonical yerel kök: `D:\Googledrive\KYERP-PDKS-HIZLI-VERİ`
- Bundan sonra kaynak kod, test düzeni ve paket takibi bu kök üzerinden yürütülür.
- Eski dağınık çalışma klasörleri yeni geliştirme kaynağı olarak kullanılmaz.

## GitHub
- Repo: `cetin60kaya-lgtm/ky-erp`
- Aktif branch: `codex/quickdata-tnf-tab-rev4`
- Uygulama kaynak kökü: `APP/desktop/kyerp-pdks-current`
- Hızlı Veri aracı: `APP/desktop/kyerp-pdks-current/tools/QuickDataTool`
- GitHub ana geliştirme ve build kaynağıdır.
- Yerel klasör GitHub branch ile eşit tutulur; yerelde farklı, takipsiz kaynak geliştirilmez.

## Remote kullanım kuralı
- Remote Desktop yoğun geliştirme için kullanılmaz.
- Öncelik: GitHub kaynak düzenleme + GitHub Actions build.
- Remote yalnız gerektiğinde canlı dosya/DB kontrolü, son doğrulama ve kısa yerel test için kullanılır.
- Remote üzerinden yapılan kalıcı kod değişikliği GitHub'a aktarılmadan bırakılmaz.

## Yerel klasör düzeni
- `_REFERANS`: Hedef 5.0.29 ve eski referans dosyaları; Git'e girmez.
- `_PAKETLER/GUNCEL`: kullanım/test için son paketler; Git'e girmez.
- `_PAKETLER/ESKI`: eski release paketleri; Git'e girmez.
- `_YEDEK`: yerel geçici yedekler; Git'e girmez.

## DB / TNF çalışma prensibi
- Uygulama açılışta DB veya TNF yolunu otomatik seçmez.
- Firebird DB kullanıcı tarafından seçilir; önce `SYSDBA/masterkey` denenir, kabul edilmezse kullanıcı/şifre sorulur.
- TNF/TXT kullanıcı tarafından seçilir.
- Normal DB–TNF eşitlemede DB referanstır; TNF hedefidir.
- Personel kontrollerinde bütün geçmiş personel taranmaz; önce ilgili dönem DB hareketlerinden kart kümesi çıkarılır.
- Aktif/pasif, işe giriş ve çıkış tarihleri yalnız ilgili kartlar için değerlendirilir.
- Eski ve ilgisiz personel, seçili dönemde DB/TNF hareketi yoksa işleme alınmaz.
- Nihai `SON TAM KONTROL`, seçilen TNF'nin tamamını DB ile karşılaştırır ve eksik/fazla/saat farkı/E/mükerrer/dönem dışı durumları gösterir.

## Güvenlik
- Canlı DB üzerinde toplu/silme işlemleri açık kullanıcı onayı olmadan yapılmaz.
- Silme/düzeltme öncesi ilgili TNF yedeği alınır.
- Personel ana kartı (`KIMLIK`) otomatik temizleme sırasında silinmez; hareket kayıtları kapsamlı kurala göre ele alınır.
- DB parolası kaynak koda düz metin olarak yazılmaz.

## Release düzeni
- Windows hedefi: `win-x64`, .NET 8, self-contained, tek EXE.
- Build mümkün olduğunca GitHub Actions üzerinden yapılır.
- Build başarılı olmadan kullanıcıya final EXE verilmez.
- Aktif test tabanı: REV12 DB-first mimarisi ve sonrasında bunun devam revizyonlarıdır.

Son güncelleme: 01.10.2026
