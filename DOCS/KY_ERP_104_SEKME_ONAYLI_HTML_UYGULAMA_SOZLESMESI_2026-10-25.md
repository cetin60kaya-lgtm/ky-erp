# KY ERP — 104 Sekmeli Onaylı HTML Tasarım Uygulama Sözleşmesi
**25.10.2026 · referans/iş koordinasyonu, alternatif canonical değildir.**

## Kullanıcı kararı
Kullanıcı `KY_ERP_104_SEKME_TEK_HTML_TASARIM_ONAY_2026-10-25.html` prototipinin görsel yönünü onayladı; tasarım ve gerçek modül işlemlerinin birlikte, tekrarlı ekran yazımı olmadan geliştirilmesini istedi. HTML sohbet eki/prototipidir; bu belge tek başına o HTML'nin bütün etkileşimlerini production'a taşıdığımız anlamına gelmez.

Ana canonical: `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`; production branch `codex/model-uretim-kontrol-merkezi-final`. Kaynak, yetki, firma ve Cloudflare D1 iş kuralları değişmez.

## Sahiplik sınırı
- **Tek ortak tasarım katmanı**: `APP/app/ky-erp-frontend/src/styles/approved-html-shell.css`, `AppShellV3.jsx`. Tüm modül sohbetleri aynı tasarım sözleşmesini kullanır; ortak dosyaları bağımsızca değiştirmez.
- Her operasyon sohbeti yalnız kendi modül bileşeni, API ve testine dokunur. Ortak CSS, Shell, `moduleRegistry`, auth, production deployment ve merkezi belgelerde çakışma varsa yönetim sohbeti koordine eder.
- Günlük Operasyon 5 sekmeli canlı işlemler ve İK Aylık veri/hesap/kart düzenleri korunur; içerik üzerinde kütlesel CSS override yapılmaz.
- `main` geçmiş/referans; yeni iş production branch'in güncel SHA'sından çıkar. Feature branch → PR → mevcut canonical CI → merge → var olan production release → ancestry/smoke.
- Gerçek ödeme, muhasebe fişi, personel, PDKS terminal ve resmî e-Belge gönderimi otomatik test amacıyla üretim D1'e yazılamaz. Gereken işlemler ayrı onay/yedek/readiness kapısından geçer.

## Onaylı HTML'den ortak görsel ölçüler
- 258px sabit sol modül menüsü, beyaz zemin, küçük kompakt modül butonları; 1024px altında mobil çekmece.
- Üst menü beyaz 64px; açık sekmeler 42px; bölüm yol gösterimi 34px; en altta 27px sistem durumu; içerik alanı `minmax(0,1fr)` ve kendi içinde kaydırma.
- #f3f6fa açık kırık beyaz arka plan, #192437 metin, #e3e9f0 ince çizgi; mevcut modüle özel renk değişkenleri korunur.
- Formlar, filtreler ve tablolarda ortak kart sınırı/odak görünümü; düzenleme/silme/para çıkışı tek tıkta gerçek işlem yapmaz, onay ve yetki kontrolü korunur.
- 1366x768 / 1920x1080 / mobil tarayıcı gerçek kabulü; yatay/dikey overflow, modal footer, sekme değiştirince veri kaybı ayrıca kontrol edilir.

## İlk uygulanmış dikey dilim (kod değişikliği)
1. Shell ortak kabuk CSS: `approved-html-shell.css`, en son import.
2. PDKS hızlı işlem: `mecit-hakan` sabit fallback kaldırılır; aktif firma zorunlu, işleme giriş korumalı.
3. Mail & Dosyalar → Mail Şablonları: artık var olmayan `muhasebe/mail-sablonlari` yerine gerçek `muhasebe/mail-ekstre` sekmesine yönlenir; bir defalık oturum-içi işaret ile gerçek Mail Şablonları paneli açılır.
4. Görünüm/Aygıtlar → KY Güvenlik yükleyici: /guvenlik/ yerine canonical /ky-guvenlik/.
5. `approvedUiHandoffs.test.js` modüller arası işlem sözleşmesini test eder.

## Sonraki kabul sırası
1. Ortak kabuğun 1366x768 / 1920x1080 / mobil screenshot karşılaştırması; üretim oturumunda yetki nedeniyle gizlenen sekmelerin beklenen görünümü.
2. Muhasebe 7 + e-Belge 9 sekmede ekran/düzen / API / geçmiş / ödeme confirm.
3. İK Aylık 7 ve Günlük Operasyon 5 sekmede davranışı koruyarak ekran düzeni ve gerçek cihaz kabulü.
4. PDKS 18 görünür + 5 bağlamsal: personel ana kaynağı, cihaz, yetki, dönem ve senkron.
5. Desen 4, Boyahane 6, İmalat 3, İletişim 9, Denetim 8, Bağlantılar 7, Sistem Merkezi 1, Yönetim 3+11 bağlamsal, Asistan 1. Her sekme için açılma, şirket/rol/yetki, filtre, yeni/düzenle, hata/boş/yükleme, API, kayıt/geri alma ve responsive kabul matrisini bitir.
6. Ortak tasarımda renk/typography/spacing değişikliği varsa yalnız tasarım sahibi dalı yönetir.

**Kanıt kuralı:** CI başarı canlı değildir. Browser görsel kabulü, gerçek işlem, D1 entegrasyonu ve Windows/PDKS fiziksel kabulleri kanıtsız `PASS` yazılamaz.