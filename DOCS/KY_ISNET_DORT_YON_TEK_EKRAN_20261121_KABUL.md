# KY ERP — İşNet Dört Yönlü Tek Ekran Otomasyonu / Kabul
**Tarih:** 21.11.2026 · **Durum:** kodlanmış test dalı, production KABUL BEKLİYOR
**Kaynak:** `TOOLS/isnet-drive-archive/isnet-drive-yerel.mjs`, `TOOLS/isnet-drive-archive/sync-core.mjs`, `APP/cloud/ky-erp-api/src/e-belge-center-cloud.ts`, `APP/app/ky-erp-frontend/src/pages/modules/muhasebe/EBelgeIsnetPortalSync.jsx`.

## Bir tek işlem
Kullanıcı **KY ERP Masaüstü → İşNet/e-Belge → İşNet Panelini Bu Ekranda Aç** ekranında, kurumsal hesabıyla giriş yapar, yetkili portal firmasını seçer ve **Dört Yönü Otomatik Senkronize Et** düğmesini bir kez kullanır. Ayrı Chrome indirme pencereleri günlük arşivleme adımı değildir. Yerel 8791 işlemi pencereyi kapatınca da Node sunucusu açıkken sürer. Aktif portal oturumu varken seçilebilir 15 dakikalık kontrol tekrarı vardır; şifre, cookie ve token dosyada tutulmaz.

## Dört yön / tek canonical belge
- Gelen e-Fatura / Giden e-Fatura / Gelen e-İrsaliye / Giden e-İrsaliye, orijinal XML + orijinal PDF birlikte.
- 31 gün bir sorgu dönemi sınırıdır, saklama süresi değildir. Büyük dönemler 31 günlük parçalara, portalda 200 kayıt sınırına dayanan kesitler daha küçük tarih pencerelerine bölünür. **Tek günde 200 sınırına erişilirse eksiksiz denmez; incelemeye ayrılır.**
- Belgelerin gerçek kimliği portal kaynak ID + yön/tür + XML ETTN/UUID + sağlayıcı referansıdır. Dosya adı otomatik ikinci belgenin tek kimliği değildir. Mevcut ve aynı SHA-256 orijinaller yalnız yeniden kullanılır; yalnız eksik olan tekrar istenir. İçerik farklıysa orijinalin üzerine yazılmaz, `NEEDS_REVIEW` olur.
- Aynı belgenin `orijinal.xml` / `orijinal.pdf` veya `BELGENO.xml` / `BELGENO.pdf` kayıtları tek D1 canonical belgeye bağlanır; PDF'yi ikinci resmî belge sanan OCR veya mükerrer cari/KDV hareketi yok.
- Senkron durumu `_DURUM/ISNET_OTOMATIK_SENKRON_DURUM.json` dosyasına sadece işlem sayıları, aralıklar ve güvenli hata kodlarıyla yazılır; dosya/kişisel kimlik/portal bilgisi içermez.

## Fatura ↔ İrsaliye otomatik ilişki
- Faturada `DespatchDocumentReference/ID` bulunuyorsa ilk ve güçlü kaynak odur. UBL XML'deki irsaliye referansı, karşı taraf VKN veya kesin eşlenmiş cari kimliği, belge yönü, ürün kodu/alias, birim ve miktar doğrulanır.
- Aynı firma ve yön içinde önce gelen fatura oluşturulduğunda irsaliye henüz yoksa taslak, `DISPATCH_REFERENCE_MISSING` / `DISPATCH_UNMATCHED` bekler. İrsaliye daha sonra geldiğinde `autoReconcileInvoicesAfterDispatch` **yalnız aynı tenant, yön, karşı taraf ve 90 günlük taslak fatura penceresinde** otomatik eşleştirmeyi yeniden yürütür.
- `MATCHED` ilişki yalnız mevcut motorun tam referans, firma ve miktar testi sonucudur. `PARTIAL`, `SUGGESTED`, `MISMATCH`, `NEEDS_REVIEW` belgeleri resmî mali/stok işlemini otomatik kesinleştirmez. Çoklu irsaliye, eksik LOT, kg/adet ambalaj farkı, yanlış VKN incelemeye ayrılır.
- İmalat yalnız kendisiyle model ilişkili irsaliyeyi rol yetkisiyle görür; tüm muhasebe faturaları diğer modüllere açılmaz.

## Gerçek teknik kabul zinciri
1. **X yerel test:** X'te Node `--check`, yedi `sync-core` testi ve `KY_ISNET_SELFTEST=1` güvenli QA arşiv testi geçti. `8792` QA sunucusu HTTP 200, güvenilir KY ERP frame origin CSP, CSRF ve kimlik olmadan `/sync-start` reddi doğrulandı. X'teki gerçek `8791` henüz yeni sürümle değiştirilmedi; gerçek İŞNET oturumuna dokunulmadı.
2. **Muhasebe eşleştirme:** Node TypeScript testinde gelen/giden eşleştirme, VKN/yön/ürün/birim/miktar çakışması ve geç gelen irsaliye kuralları 5/5 geçti. `npm run typecheck` ve frontend `npm run build` X'te çıkış 0. Kapsamlı test raporu ayrıca belirtilir.
3. **Google Drive gerçek durumu:** İlk test faturası X'in yetkili yerel Drive eşitleme klasöründe PDF (100.734 bayt) ve XML (154.415 bayt) olarak bulunuyor. Buna karşın Google Drive bulut listelemesinde **yalnız PDF görünüyordu**. Bu blokaj nedeniyle `CLOUD_VERIFIED` ve `ERP_IMPORTED` başarısı **VERİLMEMİŞTİR**. Orijinali silip yeniden adlandırmak veya ikinci kopya üretmek yasak.
4. **KY ERP File Hub/D1:** Seçilen ana firmada `GOOGLE_DRIVE/CLOUD_API` bağlantısı ve `E_BELGE/E_DOCUMENT` kayıpsız klasör ataması, gerçek File Hub indekslemesi, XML+PDF'nin tek D1 belge id'sine bağlanması, belge kalemleri, KDV, tedarikçi cari ve irsaliye ilişki kaydının iki cihazda görülmesi gerçek kayıtlar üzerinden **henüz doğrulanmadı**. D1/cari/stok finalizasyonu otomatik başlatılmayacak.
5. **Yayın:** PR derleme/test geçse bile Cloudflare Worker ve Pages sürüm SHA doğrulanmadan canlı değildir. Yeni 8791 onaylı kaynakla test edilirken kullanıcı açık portal oturumu/PDKS hizmeti düşürülmez. KY ERP Yönetim → indir/kurul kalıcı kurulum dağıtımı ayrı yetki, hash ve yayın kabulü gerektirir.

## Çoklu firma / erişim
Dört belge türünün klasörleri tek belirlenmiş fiziksel arşivde tür + firma + yıl/ay + kaynak belge ID altında tutulabilir. **Kök yolu her KY ERP firması için kullanıcı/yönetici bağlar; hiçbir Hakan Emp veya DESEN yolu ürün koduna sabitlenmez.** Masaüstü entegrasyon başlatıcısı 8791'i ancak mutlak ve mevcut `KY_ISNET_ARCHIVE_ROOT` yolu kullanıcı/sistem tarafından önceden onaylanmışsa açar; ikinci çalışan 8791 oluşturmaz. Bu sürümde firma başına çoklu File Hub fiziksel route yönetimi ayrı PR #632 kapsamındadır ve canlı tamamlandı sayılmaz.
