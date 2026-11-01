# KY ERP — Firma Bazlı Ortak Dosya Merkezi / Google Drive + OneDrive
Kayıt: 01.11.2026 — çalışma dalı fix/filehub-sync-automatic-progress-20261101

## Kesin sahiplik
1. `main_company_slug` **ana firma/tenant** sınırıdır: Hakan Emprime'nin Drive, OneDrive, OAuth, File Hub dosya varlığı, lokasyon, ilişkiler, binding ve mail kayıtları başka ana firma ile karıştırılmaz.
2. `company_id / customer_id / cari_id` **bu ana firmanın müşterisi/tedarikçisi** sınırıdır; müşterinin adı yeni ana firma/tenant açmaz. Model/personel/fatura/çek için entity id ile File Hub ilişkisi tutulur.
3. SUPER_ADMIN hangi firma üzerinden işlem yaptığına dikkat etmeli; yönetim ekranında seçili ana firma adı/slug açık görünür. Bütün mutasyonlar yetkili tenant ve dosya kaydı ile sınırlıdır.
4. Yeni ana firma kendi Google Drive ve/veya OneDrive hesabını bağlar, kendi kök klasörünü seçer, bölüm/dosya türü atar; mevcut firma kayıtlarını veya OAuth anahtarlarını devralmaz.
5. Sırf OAuth sağlayıcısının sunucu Client ID/Secret yapılandırılmış olması yeni firmaya Drive erişimi vermez. Her ana firma kendi OAuth onayını vermelidir. Microsoft OneDrive için ortamda Microsoft Graph OAuth ayarları tamamlanmadan bağlantı gerçekleşmiş sayılmaz.

## File Hub tek veri yapısı
- Kanonik: `file_hub_assets` = dosya kimliği, `file_hub_locations` = fiziksel sağlayıcı + yol, `file_hub_relations` = model/cari/fatura/personel/çek/üretim ilişkisi.
- `file_hub_connections` ve `file_hub_oauth_accounts` ana firma kapsamında; bölüm atamaları `file_hub_bindings` ile.
- Google Drive / OneDrive = fiziksel kaynak; D1 = metadata ve ERP kaydı; R2 = desteklenen önizleme/cache. Kullanıcı PC, tablet, telefondan tek File Hub kimliğiyle erişir.
- Hassas personel, bordro, sağlık, banka/çek ve denetim belgeleri yalnız klasör atamasıyla açılmaz; role/entity yetkisi ayrıca doğrulanır.
- Fatura XML ve PDF aynı e-Belge kaydına ayrı asset/location olarak bağlanabilir; kopyalama zorunlu değil.

## Hakan Emp — Drive API üzerinden salt okunur kontrol
- Ana kök: 9 doğrudan alt klasör.
- `görsel/2026`: 347 dosya (341 JPG, 1 JPEG, 4 PNG, 1 TIF).
- `yerleşim dosyaları`: 684 dosya (664 PDF, 4 JPEG, 4 JPG, 5 PNG, 3 PLT, 2 XLSX, 1 PSD, 1 RAR).
- `modeller`: ilk 850 klasör metadata erişilebilir; toplam 850'den fazla olabilir, alt klasörlerin içeriği henüz tam sayılmadı.
- `giden desenler`: ilk 850 dosya metadata erişilebilir (843 PSD, 3 PSB, 1 TIF, 2 PDF, 1 JPG); daha fazla olabilir.
- `görsel`: 2017–2026 arası 10 yıl klasörü.
- `OTOMASYON`: KY-CONTROL, DTF_IZLEME ve PSD_ONIZLEME alt dizinleri.
- Veriler içerik indirilmeksizin, aynı Drive kaynaklarının metadata listelenmesiyle kontrol edildi.
- **347 Drive görselinin D1'de işlendiği, ayrı model sayısı veya tam Hakan Emp taramasının bittiği henüz ispatlanmadı.**

## Senkronizasyon ve durum
- Her ana firmanın kendi bağlantı/kuyruk/imleci; Google Drive ve Microsoft Graph sayfaları 15 öğe/grup.
- Öncelikle `görsel/2026` pilotu, sonra diğer klasörler (hiçbir klasör atlanmaz). Taranan sayfa ve son adım saati checkpoint olarak saklanır.
- Bulut sağlayıcıdan silme yok, tarama sonucunda D1 ilişki temizleme yok. Hata durumunda son sağlam cursor yeniden kullanılır.
- Worker cron 5 dakikada bir; elle tekrarlamak gerekmez. Ekran 15 saniyede yalnız salt okunur durum sorgular.
- Durumlar: RUNNING / WAITING / COMPLETED / ERROR. WAITING, gerçekten çalışan bir tarama demek değildir; CRON sırası bekleniyor.
- Hesap kaldırma: o tenant'taki aktif servisler pasifleştirilmeden silinemez; yalnız OAuth bağlantı ve şifreli token kaydı kaldırılır, **buluttaki dosyalar ve D1 asset/location/relation korunur**. Sağlayıcı tarafında erişim iznini ayrıca iptal etme işlemi bu işleme dahil değildir.

## Modül uygulama sırası / bitirme kapısı
1. Google Drive Hakan Emp tam metadata indeks + `görsel/2026` model kayıt ilişkisi, eksik/çift kayıt raporu.
2. Muhasebe/e-Belge fatura XML/PDF/irsaliye + cari, banka/çek/senet; mevcut arşiv hizmeti üzerinden gerçek entity ilişkisi.
3. İmalat/Boyahane/DTF/desen teknik föy, PSD/AI kaynak, RIP PDF, stok/lot.
4. İK/PDKS/Denetim personel kimlik/sağlık/bordro/yıllık izin ve denetim dosyası; hassas veri yetkileri.
5. Her modülde PC-tablet-telefon, önizleme/indirme, rol/tenant ve devam edilen senkron testleri.
**Kod testinden geçen iş canlı D1 indeks kabulü yerine geçmez.**

## Dokunulmayacaklar
Mevcut Drive dosyalarını taşıma/silme; eski `hakan drive` agent kaydını kendiliğinden silme; OneDrive, OAuth secret, FILE_HUB_OAUTH_KEY ve KY Güvenlik ayarını izinsiz değiştirme; D1 migration veya şemayı otomatik resetleme.
