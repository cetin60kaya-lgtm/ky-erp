# KY ERP — Muhasebe / e-Belge / İmalat / Desen — 24 Ekran Saha Kontrolü

**Tarih:** 29.10.2026 · **Kanonik kaynak:** `codex/model-uretim-kontrol-merkezi-final` · **Talep:** önce günlük gerçek kullanım, eski Excel (2022 dahil) içeri aktarma yok.

**Kabul kuralı:** Buradaki `KOD` bir sekmenin doğrudan kanonik JSX/API akışının incelendiğini gösterir; `CI` gerçek otomatik test + build kanıtıdır; `SAHA` ise yetkili gerçek oturumla iş akışının adım adım yapılmasıdır. Kaynak kodun mevcut olması ya da CI PASS, sahada her işlemin çalıştığı anlamına gelmez. Kasıtlı olarak canlı fatura, banka, kasa, stok, LOT, İşNet resmî gönderim veya veri mutasyonu yaratılmadı.

## Muhasebe — 7 ana sekme

| No | Sekme (gerçek menü) | Kanonik işlem/kod bağlantısı | Saha kabul |
| --- | --- | --- | --- |
| M1 | Yönetim Özeti | `ManagementOverviewWorkspace.jsx` → `GET /muhasebe/yonetim-ozeti`; seçilen ana firmanın KPI'sı | Bekliyor: firma/banka/KDV gerçek tutar teyidi |
| M2 | Firmalar & Cari | `CompaniesCurrentWorkspace.jsx` firma CRUD, profiller, alias, hareket ve yetki; finans D1 | Bekliyor: 2 firmada oluştur/düzenle, mutabakat |
| M3 | Tedarikçi / Alış Belgeleri | `SupplierDocumentsWorkspace.jsx` gelen irsaliye 50'li sayfa; `CanonicalSupplierInventoryWorkspace.jsx` XML/LOT/ürün/fatura kalemleri; e-Belge detay geçişi | Bekliyor: gerçek irsaliye/LOT, çift stok engeli |
| M4 | Müşteri / Satış Belgeleri | `CustomerDocumentsWorkspace.jsx` kısmi irsaliye–fatura ve satış listesi; `InvoiceDispatchControlWorkspace.jsx` belge detay geçişi | Bekliyor: kısmi fatura, aynı model iki irsaliye |
| M5 | Finans İşlemleri | `FinanceOperationsWorkspace.jsx` ödeme, tahsilat, çek, banka/kasa, plan ve defter alt görünümleri | Bekliyor: gerçek onaylı rol, kuruş ve fiş |
| M6 | Ekstre & Mutabakat | `MailAccountingWorkspace.jsx` ekstre/mutabakat, posta yetkisi ve şablon bağlantısı | Bekliyor: gerçek firma ve izinli gönderim |
| M7 | Mali Kontrol & Raporlar | `FinancialControlWorkspace.jsx` ve `AccountingReportsListWorkspace.jsx` mali belge/KDV/defter/CSV/çıktı | Bekliyor: dönem ve net tutar karşılaştırması |

## e-Belge — 9 sekme

| No | Sekme | Kanonik işlem | Saha kabul |
| --- | --- | --- | --- |
| E1 | Genel Bakış | `EBelgeCenterPage.jsx` günlük/aylık kartlar, işlem kuyruğu, sorun ve eşleşme yönlendirmeleri | Bekliyor |
| E2 | Gelen Belgeler | Kanonik belge havuzunda yön ve sayfalama, belge detay/düzenle | Bekliyor |
| E3 | Giden Belgeler | Kanonik belge havuzunda giden yön, resmî POSTED kilidi, belge detay | Bekliyor |
| E4 | Belge Havuzu | XML/PDF/görsel yükleme, satır kalite kontrolü, mükerrer belge | Bekliyor |
| E5 | Eşleştirmeler | Firma/model/irsaliye/LOT kontrollü eşleştirme ve açık kullanıcı onayı | Bekliyor |
| E6 | Onay & Sorunlar | Kesinleşme öncesi onay ve CAS, fiziksel 0062 journal sonucu, retry/rollback | Bekliyor |
| E7 | İş Akışları | Kanonik irsaliye→model→fatura belge bağlantısı; otomatik resmî gönderim yok | Bekliyor |
| E8 | Arşiv & Çıktı | Orijinal dosya/preview/File Hub/işlem sonucu | Bekliyor |
| E9 | Entegrasyonlar | İşNet bağlantı sağlığı yalnız gerçek, geçersiz 200 yanıtı CONNECTED sayılmaz | Bekliyor |

## İmalat — 3 sekme

| No | Sekme | Kanonik işlem | Saha kabul |
| --- | --- | --- | --- |
| İ1 | Model ve Üretim Merkezi | `ProductionControlCenterPageV2.jsx` Desen→model, üretim fişi oluştur/düzelt/arşiv, zemin/sakat/makine/vardiya, hedef plan, doğru firma eşleşmesi, 100+ sayfalama | Bekliyor: gerçek model ve vardiya |
| İ2 | Üretim Raporları | `ImalatKontrolRapor.jsx` kanonik `/model-flow/reconciliation` ve `/production-center/machines`; bölge/operasyon/makine/makinacı/yıl filtre, güvenli Excel TSV | Bekliyor: Windows Excel, gerçek fiş-kalan-adet |
| İ3 | Makine & Vardiya Ayarları | `ProductionSettingsPage.jsx` kanonik Worker makine CRUD, geri al/kısmi kayıt, pasif→aktif, makine-makinacı | Bekliyor: 2 gerçek makine/vardiya |

## Desen — 5 sekme

| No | Sekme | Kanonik işlem | Saha kabul |
| --- | --- | --- | --- |
| D1 | Gelen Desenler | `DesenModelMasasi.jsx`, `DesenInboxUploadButton.jsx`: File Hub gelenler, tarama, eşleştirme, model oluşturma | Bekliyor: gerçek dosya, sağlayıcı ve model bağı |
| D2 | Desen Havuzu | `DesenModeller.jsx`: tek model, görsel, düzenle, arşiv, renk/kanal, Boyahane, tek tık İmalata Al (kanonik kimlik) | Bekliyor: gerçek model açma/aktar |
| D3 | Yerleşim / Kalıp | `YerlesimKalipPage.jsx`: baskı bölgesi, ölçü ve kaynak dosya / yerleşim kontrolü | Bekliyor: gerçek PLT/PDF/ölçü |
| D4 | Desen Raporları | `DesenRaporlari.jsx`: model/renk/hata/filtre, güvenli CSV | Bekliyor |
| D5 | Desen Depolama Ayarları | `DesenFolderSettingsBar.jsx`: File Hub module+purpose binding, Google Drive/OneDrive/LOCAL/NAS durumunu açık gösterir | Bekliyor: gerçek izinli bağ testleri |

## Yapılan somut son rötuşlar (PR #479 ve #480)

- **PR #479**: üretim fişi edit/archive CAS, model hedef planı, kanonik makine ayarları, Desen→İmalat kimlik bağlantısı, Muhasebe→e-Belge detay ve yenileme, yanlış firma/model eşleşmesini engelleme. Worker+Pages production yayınlandı.
- **PR #480**: pasif makine ayarlardan kaybolma hatası, legacy rapor endpointlerinin kanonik raporla değiştirilmesi ve testleri, irsaliye–fatura detayından belgeye hızlı geçiş, üretim zemin düzenleme, eski CSV'yi ikincil menüye alma, boş şirket etiketinin düzeltilmesi.
- 0062 fiziksel stok/LOT migration **26.10.2026 canlıda uygulanmış**; bu çalışmada yeni migration yok.
- **Gerçek veri yüklendi / 24/24 saha testi geçti denemez:** hiçbir yetkili oturumda gerçek fatura/ödeme/LOT veya yerleşim yazması yapılmadı. Mevcut test sınırı, repo CI ve Cloudflare health/bundle doğrulamasıdır.

## Kontrollü son saha kabul iş sırası

1. Firma sahibi/yetkiliyle Desen: bir gerçek model kartı ve baskı bölgelerini görüntüle; tek tık İmalat'a aç; aynı model ID'yi doğrula.
2. İmalat: gündüz/gece makine ve makinacı seçimi; bir gerçek üretim fişi, baskı/kumaş sakatı ve zemin; rapor adet ve kalan karşılaştırması.
3. e-Belge: gerçek belgede doğru yön/UUID/firma/irsaliye/LOT eşleştirmesini yetkili gözle onayla, tekrar/yanlış eklemeye bak.
4. Muhasebe: aynı belgeyi alış/satış listesinde aç; yalnız onaylı gerçek muhasebe kaydıyla cari/KDV/defteri kontrol et; tekrar finalizasyonu engelle.
5. Rol/tenant: diğer ana firmanın modeli, cari, dosyası veya raporu görünmemeli; 1366×768, 1920×1080 ve mobil arayüzde alt sekme/çekmece/scroll testleri.
6. İşNet resmî gönderim, canlı banka, stok/LOT ve üretim satırı **gerçek yetkili kullanıcı onayı ve desteklenen belgeyle** yapılmadan PASS yazılmaz.

**Sınır:** D1 kayıtları test için sıfırlanmaz, eski 2022/Excel toplu aktarımı yapılmaz, ikinci klon/test sitesi kurulmaz.
