# KY ERP — DENETİM / Drive Klasör ve File Hub Kabul Sözleşmesi
**Tarih:** 23.11.2026 · **Modül:** Denetim, Boyahane, Muhasebe · **Durum:** Kod/Drive klasör doğrulaması tamamlanınca canlı test kapısı ayrı.

## 1. Kaynak ve depolama otoritesi
- Canlı iş kayıtları: Cloudflare D1; dosya orijinalleri: firma tarafından seçilen File Hub sağlayıcısı.
- Hakan Emp Google Drive **DENETİM** klasör yapısı yerinde incelendi. Beş var olan üst klasör (Standartlar, Periyodik Bakımlar, TDS, MSDS, Denetim Evrakları) korunmuştur.
- Dokuz ek üst klasör: Prosedürler ve Talimatlar; Kimyasal Envanter ve Deklarasyonlar; Çevre ve Emisyon; Eğitimler ve Katılım Kayıtları; Denetim Raporları ve CAPA; İmzalı Orijinaller ve Revizyonlar; LOT ve Reçete Kanıtları; İSG ve Acil Durum; Kalite ve Test Raporları.
- Standartlar altında LC Waikiki (LCW), ZDHC, GOTS; Kimyasal Envanter ve Deklarasyonlar altında Kimyasal Envanterler, Tedarikçi Deklarasyonları, ZDHC ve GOTS Ortak Listeleri; Denetim Evrakları altında mevcut FAMA/Disney korunup LC Waikiki eklendi.
- Son Drive listeleme: ana DENETİM'de **14 doğrudan alt klasör**, Standartlar'da **3**, Kimyasal Envanter ve Deklarasyonlar'da **3**, Denetim Evrakları'nda **3**. Bu yalnız **klasör varlığı** kabulüdür; henüz fiziksel File Hub ataması veya otomatik belge içeriği kabulü değildir.

## 2. Eski evrak ve gerçek kaynak bulguları
- Tarihsel ayrı denetim dosyasında **hava emisyon kaynakları** (3 fikse baca, VOC/toz; geçerli emisyon izin/ölçüm raporu gibi işaretlenmez), kimyasal satın alma prosedürü (30.01.2020, Rev.00), kimyasal yönetim politikası, kimyasal yönetimi sorumluluk tanımı, eski tedarikçi listesi vardır.
- LCW kimyasal eğitim dosyasında LOT'un stok, reçete ve sipariş bazında izlenmesi istenir. Süreç sorumluları tarihsel nüshadan otomatik güncel kişiye atanmaz.
- Hammadde kontrol araçlarında Rev06 / Rev07; **kimyasal envanter Rev09 / Mart 2025** de mevcuttur. Rev09 kaynağı önceki revizyonun üstüne yazılmaz. Listede “MSDS VAR” / “Deklarasyon alındı” bilgisi yetkili evrak içeriği onayı yerine geçmez.
- ZDHC ve GOTS dosyaları ortak liste olarak ürünlere tek dosya referansı ile bağlanır. Belgelerin kapsam/ürün satırı, geçerlilik tarihi ve güncelliği yetkili tarafından doğrulanmadan sertifikalı/uygun statüsü üretilmez.
- Tarihsel Drive belgeleri topluca **taşınmamış, silinmemiş veya yeniden adlandırılmamıştır**. Tedarikçi MSDS/TDS kaynakları mevcut konumlarında kalır.

## 3. Uygulama sözleşmesi
1. `DENETIM + purpose` yazılabilir File Hub ataması kullanıcı tarafından mevcut Bağlantılar & Depolama ekranından seçilir. **Yeni ikinci Drive giriş sistemi yok**.
2. Denetim Ayarlar ekranındaki `/api/compliance/file-hub/readiness` yalnız firma yöneticisine, amaç bazında bağlantı durumunu gösterir; “ayarlı” gerçek sağlayıcı PUT/GET testi değildir.
3. Evrakta `/api/compliance/file-hub/candidates` ile mevcut indeksli dosya aranır. Seçilen dosya `/api/compliance/documents/:id/attach-file-hub` üzerinden firma, izin, mime/uzantı, kaynak ve gerçek sağlayıcı okuması doğrulandıktan sonra **yeni revizyon** olarak bağlanır.
4. Orijinal dosya ikinci kez kopyalanmaz; ilk ve önceki bütün `compliance_document_versions` sürümleri saklanır. İlgili eski kaynak arşivdeki yerinden hareket etmez.
5. Yeni sürüm ya da mevcut arşiv referansı bağlanınca evrak tekrar `PENDING` incelemeye döner, dış denetçi paylaşım izni sıfırlanır. Hazırlayan/kontrol eden/onaylayan alanları ve yeni imzalı nüsha ayrı izlenir.
6. Başka modülün personel/özlük/maaş dosyası Denetim bağlantısından dış paylaşıma alınmaz. Onay ve paylaşım yalnız firma yetkilisi tarafından yapılır. D1 geçmiş kayıtları ve mevcut içerik fiziksel olarak silinmez.
7. Aktif evrak havuzu ayrı, arşiv geçmişi ayrı sayfalı listelenir. Eski arşiv belgesinin orijinali ve versiyonları **salt okunur** açılır.

## 4. Kullanıcı canlı test kapısı
- **T1:** Denetim → Ayarlar: 14 dosya amacı için File Hub bağlantısı, kapsam ve gerçek yazma atamaları kontrol edilmeli; eksikler `ATAMA_YOK` vb. gösterilmeli.
- **T2:** Evraklar: “hava emisyon kaynakları” adında manuel kayıt; gerçek PDF varsa File Hub'dan seç/bağla; orijinalin tek kopya kalması, PDF'nin açılması.
- **T3:** Hazırlayan / kontrol eden / onaylayan / geçerlilik / 3-6-12 ay, boş ve süresiz doküman; yeni revizyon ve imzalı nüsha; önceki sürümü aç.
- **T4:** Arşive al, “Arşivdekiler” ile bul, geçmiş asıl dosyayı aç; aktif skora katılmadığını doğrula.
- **T5:** Ürün kartı MSDS/TDS; ortak ZDHC/GOTS listesi; ürün satırı, revizyon ve son geçerlilik; süresi geçmiş kanıt engeli.
- **T6:** Muhasebe tedarikçi faturası → onaylı Boyahane ürün/LOT → reçete ve model/sipariş izleri; gerçek üretim verisine müdahale etmeden kontrollü test.
- **T7:** Denetçi Odası: yalnız ayrıca izin verilmiş belge; kişisel/özlük/payroll dokümanı erişilmez.
- **T8:** Test bitişinde GitHub test, Cloudflare Pages/Worker prod commit ancestry, yetkili canlı D1 ve gerçek File Hub provider okuma/yazma sonuçları ayrı kayıt edilir.

## 5. Kabul etiketleri
`DRIVE_FOLDERS_VERIFIED` yalnız klasörleri; `CODE_CI_PASS` ilgili testleri; `PAGES_DEPLOY_PASS` ve `WORKER_DEPLOY_PASS` ilgili Cloudflare buildleri; `FILE_HUB_ORIGINAL_VERIFIED` gerçek kimlikli orijinalin sağlayıcıdan tekrar açılmasını; `LIVE_END_TO_END_PASS` tüm oturumlu testleri ifade eder. Hiçbir etiket diğeri yerine geçmez.

**Güvenlik:** Drive dosya kimliği, firma içeriği, kişi adı, API token/secret ve gerçek Windows görüntüleri bu public kaynakta tutulmaz.