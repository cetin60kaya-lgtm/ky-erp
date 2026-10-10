# KY PDKS — Bordro & Rapor — 10.10.2026

**Kaynak branch:** `feature/ky-pdks-unified-product-shell-20261008`  
**Bu işin feature branch'i:** `feature/ky-pdks-bordro-rapor-20261010`  
**Kapsam:** Mevcut `PdksUnifiedApp.jsx` ve mevcut PDKS D1 okuma yolları; ikinci bir ürün/menü veya canlı veriye müdahale yok.

## Kaynağa bağlanan ön raporlar

- Mevcut yetkili `/operations/payroll` okumasından maaş, yol, ek yol, yemek, mesai, avans, kesinti, icra/haciz, BES, banka, elden ve **yalnız kaynakta kayıtlı ise** net toplam gösterimi.
- `payrollEvidence.js` tek saf projeksiyon: yanlış dönem, tekrar personel veya geçersiz cevap reddedilir. Brüt kaynağı bulunmayan alan `—`; banka/elden ayarları ödenmiş para sayılmaz.
- Banka + elden = kayıtlı toplam tutar kontrolü hesaplanır. Bu yalnız **plan aritmetik kontrolüdür**, dekont/fiş/elden teslim kanıtı değildir.
- Ödeme fişi sekmesi salt okunur taslak satır gösterir; imza ve ödeme kanıtı olmadığında bunlar boş/bekliyor durumundadır.
- İmza formları tüm seçili ay çalışanlarının `attendance-v2` gün kaynaklarını **isteğe bağlı, tam ay, 4'lü gruplar hâlinde** okur. Başarısız tek bir cevap bile kısmi aylık belgeye izin vermez.
- `KART_YOK` gününde sabah/akşam ayrı imza alanları; tek taraflı `EKSIK_BASIM` gününde yalnız eksik hareketin imzası. Bilinen saat korunur, boş saati otomatik doldurmaz. `MANUAL_OVERRIDE` fiziksel kartmış gibi gösterilmez.
- CSV, A4 yatay yazdırma ve boş imza çizgileri; mevcut 49 sekmeli tek uygulamaya bağlandı.
- Bordro okuma yetkisi mevcut backend FULL kontrolünden geçer; DENETIM hesabı maaş/ödemeyi okuyamaz. İmza taslağı finans tutarı içermez.

## Şu anda **tamamlandı denemeyecek** üretim kabul maddeleri

1. D1 puantajı ile gerçek cihaz RAW, legacy Firebird/FDB, yıllık TNF normal/E ve çift vardiyanın bağımsız mutabakatı **yok**. D1 `attendance-v2` satırı, onaylı üretim puantajı değildir.
2. Bordro için dönem/SGK, ücret sözleşmesi, tatil/izin/yemek/yol politikası ve fazla mesai oranlarının ortak hesap motorunda kanıtlanmış üretim mutabakatı **yok**. Bu branch mevcut D1 finans kayıtlarını **hesaplamayıp okur**.
3. Gerçek banka ödeme dekontları, imzalı fişler, ödeme durumu, resmî brüt-net hesap ve nihai bordro onayı bağlanmadı. Gösterilen `plan tutarlı` **ödeme yapılmış** anlamına gelmez.
4. Gerçek Windows/FDB/TNF ve Cloudflare staging uçtan uca testi tamamlanmadı. Bağlı PC için Remote Desktop kullanım kotası dolmuş; bu kaynaklarda test veya canlı yazma yapılmadı.
5. Tüm uygulama frontend/Cloud build ve cihaz saha kabulü olmadan tam üretim/hazır statüsü işaretlenmez. Ana branch'e merge ve production deploy yapılmaz.

## Geliştirici kontrolü

- Yeni bordro/rapor kaynak test dosyası: `APP/app/ky-erp-frontend/src/pages/pdksUnified/payrollEvidence.test.js`.
- Mevcut `tabBindings.test.js` kaynak beklentileri güncellendi.
- 10 Ekim 2026: GitHub'dan okunan gerçek kaynak metinleri V8 bellek içi test çalıştırıcısında birleştirilerek 3 gerçek test dosyasının toplam **30 testi** çalıştırıldı: **30 PASS / 0 FAIL**. Bu, Node.js proje bağımlılıklarıyla `npm test`, ESLint, Vite/Cloud typecheck veya gerçek cihaz testi çalıştırıldığı anlamına gelmez.
- Canlı D1/FDB/TNF/cihaz/terminal kayıtlarına hiçbir test yazısı gönderilmedi.
