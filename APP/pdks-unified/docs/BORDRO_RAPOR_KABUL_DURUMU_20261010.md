# KY PDKS — 4. Bordro & Rapor, geliştirme ve kabul durumu

Tarih: 10.10.2026. Repo: `cetin60kaya-lgtm/ky-erp`. Branch:
`feature/ky-pdks-bordro-rapor-20261010`, PR #420 **DRAFT**, mevcut 49 sekmeli ürün üzerinde.

## Değiştirilen / eklenen gerçek yollar
- `APP/cloud/ky-erp-api/src/ik-pdks-operations.ts`: mevcut yetkili PDKS operasyon-bordro GET yanıtı. Kayıtlı ücret sözleşmesinden maaş, yol, banka, elden; ilgili dönem D1 hareketlerinden ek yol, yemek, mesai, avans, kesinti, icra/haciz ve BES ayrı kaynaklı alanlar. Dönem kilidi, son audit kaydı, kayıt varlığı, tutar uyuşmazlığı, doğrulanmamış ödeme ve kaynak/puantaj onayı açık durumları.
- `APP/cloud/ky-erp-api/src/ik-pdks-payroll-adjustments.mjs`: `APPROVED`/onaylı statü + açık `Mesai oranı: %50` veya `%100` + pozitif onaylı saat + pozitif tutar **birlikte** yoksa mesai parasını onaylı toplama katmaz. Eksik oran/saat/tutar/statü sebebi ve kaynak satır ID'si ayrıca dönülür. `Mesai`/`Kesinti`/`İcra` Türkçe İ harfi sorunu test edildi. Bunun dışındaki ödeme hareketleri de yalnız onaylı kaynak tutarlarına eklenir. Bu statü gerçek ayrı imzalı onay belgesi anlamına gelmez.
- `APP/app/ky-erp-frontend/src/pages/pdksUnified/payrollEvidence.js`: D1 ön bordro/hakediş satırları, %50/%100 onaylı saat ve tutar ayrımı, banka+elden=net plan kontrolü, son işlem/dönem kontrolü, kanıtı eksik fiş taslağı. Resmî brüt ücret ya da ödeme dekontu uydurulmaz; kayıtlı toplam yoksa boş kalır.
- `APP/app/ky-erp-frontend/src/pages/pdksUnified/readService.js`, `reportProjection.js`: tüm ay için gerçek kimliği olan kartlı personelin yetkili D1 attendance-v2 yanıtları tek tek 4'lü gruplar hâlinde toplanır. Herhangi bir kişide hata, tekrar gün, yanlış ay veya eksik cevap → rapor hiç üretilmez. Günlük devam, aylık özet, ihlal, imza taslakları; kaydı olmayan saat/direction üretimi yok, manuel E fiziki kart sayılmaz.
- `reportExports.js`: CSV formül enjeksiyonu korumalı, yerinde üretilen gerçek XLSX (ZIP/SpreadsheetML), kurulu pdfmake ile A4 PDF, ayrı A4 tarayıcı yazdırma. İmzalar boş çizgilerdir.
- `PdksUnifiedApp.jsx`, `tabBindings.js`, `productModel.js`, `useUnifiedPdksData.js`, `pdksUnified.css`: 49 sekme sayısını koruyan entegrasyon, kişi/ay/yıl filtresi, düğmeler; masaüstüyle aynı React ürünü. Bordro verisi mevcut FULL sunucu izniyle okunur; DENETİM hesabına verilmez.

## Yapılan testler — gerçek durum
- Committed frontend kaynak dosyalarından çağrılan 5 özgün birim test dosyası (productModel, tabBindings, payrollEvidence, reportProjection, reportExports): **36/36 PASS**. Çalıştırıcı: ağsız V8, Node core test arayüzü taklidi. XLSX UTF-8 testinde TextDecoder eşdeğeri kullanıldı; Node paket derlemesi değildir.
- Cloud saf mesai hesap fonksiyonuna ait committed test dosyası: **4/4 PASS**, aynı V8 koşum.
- Mevcut `readService.js` kaynağına güvenli yapay kimlik/saat yanıtları enjekte edilerek tam/eksik ay, imza ve günlük rapor sevki, iptal, hata, personel sınırı: **7/7 PASS**, ağsız V8.
- Toplam **47/47 PASS**; gerçek personel adı, maaş, cihaz ve üretim FDB/TNF içermeyen sentetik koşum.

**NOT RUN:** Tam frontend `npm test`, `npm run lint`, `npm run build`; Cloud `npm test`, `npm run typecheck`, `npm run build`; Windows EXE/.NET ve cihaz/kopya FDB uçtan uca testleri. Bu çalışma oturumunda GitHub deposu konteynerde indirilemiyor (ağ/DNS kapalı), Remote Desktop bağlı bilgisayar kotası dolu ve PR üzerinde otomatik CI sonucu yok. Böyle bir PASS iddiası yoktur.

## Üretim devrine engel
1. RAW/FDB/TNF/E ve aynı gün çift vardiya, izin/tatil mutabakatlı onaylı puantajın bordro beslemesi **henüz yok**. Okunan attendance-v2 D1 özetleri ön kaynak.
2. Resmî brüt/net ve SGK kesintileri, gerçek muhasebe ücret sözleşmesi hesaplama kuralı, onaylayan kişi ve kayıt bazlı imzalı fazla mesai onayı **henüz yok**. Bu dal mevcut D1 finans kayıtlarını okur, bordro hesabını kesinleştirmez.
3. Banka dekontu, elden ödeme teslim fişi, imza kabulü, gerçek ödeme geçmişi fiili gerçekleşme kaynağı **yok**. Plan tutarlılığı ödeme yapıldığı anlamına gelmez.
4. Üretim D1, FDB, TNF, RAW ve Windows terminal kayıtlarına **hiçbir yazma/deploy** yok. PR draft ve canlıya merge yok.
5. Güncel ortak dal ve Personel/Puantaj dallarıyla seçici birleştirme, tam frontend/Cloud lint/build/test, Windows kopya FDB + fiziksel saha kabulü entegrasyon merkezi sorumluluğundadır. **Bu koşullar tamamlanmadıkça üretime hazır veya iş tamamen bitti denmez.**

## Dosya çakışma notu
`PdksUnifiedApp.jsx`, `tabBindings.js`, `productModel.js`, `readService.js`,
`useUnifiedPdksData.js`, `pdksUnified.css` ortak entegrasyon noktalarıdır.
İş mantığının ana kısmı ayrı `payrollEvidence.js`, `reportProjection.js`,
`reportExports.js` ve `ik-pdks-payroll-adjustments.mjs` dosyalarındadır.
Personel ve Puantaj branch'lerinin kodu bu branch'e zorla çekilmedi ve sıfırlanmadı.
