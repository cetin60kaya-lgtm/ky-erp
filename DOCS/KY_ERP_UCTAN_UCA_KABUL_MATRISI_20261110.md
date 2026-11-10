# KY ERP — Talepten canlı kabulüne eksiksiz karşılaştırma

Tarih: **10.11.2026** | Kapsam: Desen, File Hub / Drive, İşNet e-Belge, Muhasebe, İmalat, Boyahane, Outlook / Mail, ortak model kartı ve telefon.
**Durum: KISMEN YAYINDA, OPERASYONEL KABUL AÇIK.**

Bu kaynak, aynı işi tekrar kodlayan PR'lar açmamak ve `kod / test / merge / yayın / gerçek kullanıcı kabulü` kavramlarını ayırmak içindir. Hiçbir gerçek işletme dosyası, kayıt, token veya e-posta içeriği buraya alınmaz.

## 1. Kanıtlı son teslim zinciri

| Teslim | GitHub kanıtı | Doğrulanan | Kabul sınırı |
| --- | --- | --- | --- |
| PR #548, İşNet e-Belge/Drive/model dosya paketi/çoklu BOY | merge `d52b6a2e1f8e1575d923d263a59c0d2eae5dc94d`; Canonical CI #42706495506 SUCCESS | Worker #42706860180 SUCCESS; frontend #42707229072 SUCCESS | Yetkili gerçek oturumda dosya bağlama ve muhasebe son onayı uçtan uca teyit edilmedi |
| PR #542, giden PSD bulut bağlantısı seçeneği | merge `ee1fe8b413fa436857b2dbd5624d1a60a398f2ca` | frontend #42757663987 SUCCESS; yayın `d561bd7b120c4bfd1cbab7d2a4a706c2bc50e38a` | Gerçek `DESEN/OUTGOING_DESIGN` binding düğmesine yetkili kullanıcıdan onay/sonuç yok |
| PR #549, ikinci PSD-model-BOY paneli | taslak / CI SUCCESS | alternatif `placements` şema/ekranı var | canonical `variants` ile **çakışıyor**, merge yasak; ikinci panel açılmayacak |
| PR #550, HKN/DDM Outlook rotalama | taslak / CI SUCCESS (son head `4edfa824`) | e-posta adres/profil + ek doğrulama taslağı | canlı değil; P0 mükerrer gönderim kimliği ve sağlayıcı kabulü-sonrası kayıt onarımı tamamlanmalı |
| PR #521 / #522, İmalat 2026 rapor/60 gün takip | taslak / CI geçmişte başarılı | kendi dalında kod | canonical üstüne çakışma/senaryo analizi, güncel yayın ve gerçek kullanıcı kabulü yok |

**Not:** `https://kyerp.net/` tek canonical ERP adresidir. `app.kyerp.net` DNS kaydının yokluğu mevcut resmî uygulamanın canlılık engeli değildir.

## 2. Kullanıcının doğal iş akışına karşılık gelen tek düzen

| Kullanıcı | Doğal işlem | Çekirdek kod/ekran | Nihai kabul senaryosu | Durum |
| --- | --- | --- | --- | --- |
| Desenci | Model kartını açar; tek `modeller/MODEL` klasöründe 1, 2, 3+ teknik föy/PDF/AI/TIFF/görseli birlikte bağlar; isim değiştirmez | `ModelFilesPanel` ve `model-file-transfer.ts`, `MODEL_SOURCE` binding; mevcut Drive klasörü önizle/bağla veya klasör sürükle | Üç dosyalı klasör, alt klasör, dosya tekrarında kopyasız/idempotent ilişki, yanlış firmaya model açmama | **Kod yayında; gerçek kabul yok** |
| Desenci | Giden tek PSD/PSB içindeki MODEL-A küçük BOY, MODEL-A büyük BOY, MODEL-B büyük BOY + ön/arka/kol alanları tanımlar | `ModelFilesPanel` → mevcut Drive giden PSD bul ve bağla; `file_hub_relations.metadata.variants` | 1 fiziksel PSD, üç ayrı model+BOY/bölge ilişkisi; her kartta doğru boy; tekrar kayıt yeni kopya üretmemeli | **Kod yayında; canlı indeks/binding/kabul açık** |
| Desenci/yönetici | `giden desenler` ve `yerleşim dosyaları` Drive köklerini bir kez File Hub'a bağlar | `DesenFolderSettingsBar`, `DESEN/OUTGOING_DESIGN` ve `DESEN/PLACEMENT` | Owner onayı, CLOUD_API okunabilir ve senkron, gerçek indeks sayıları, orijinal dosyalar değişmez | **Atama kullanıcı aksiyonu ve okuma teyidi bekliyor** |
| Muhasebeci | İşNet'ten gelen/giden HKN fatura, DDM irsaliye XML/PDF'yi olduğu adla alır; e-Belge havuzuna bırakır | `e-belge-center-cloud.ts`, UBL/XML, Drive/File Hub, belge havuzu | Orijinal belge numarası/değişmeyen dosya kimliği, yön, VKN, firma, KDV, mükerrer XML+PDF ve aynı belgenin ikinci yüklenmesi | **Kod yayında; gerçek örnek ve onay testi açık** |
| Muhasebeci | İrsaliye ve faturaları eşleştirir; örnek 3500 sevk / 2000 fatura → 1500 faturalama bakiyesi | `accounting-dispatch-control-canonical.ts` ve e-Belge eşleştirme | çoklu irsaliye, bir faturanın birkaç sevki karşılaması, iade/iptal, farklı firma/model, birim uyuşmazlığı | **Kod var; gerçek senaryo kabulü açık** |
| Muhasebeci | Tedarikçi belgesinden malzeme/kimyasal/LOT girişini kontrol eder, sonra SON ONAY | `e-belge-center-cloud.ts`, `accounting-physical-journal.ts`, Boyahane stok/LOT | fiziksel teslim teyidi, gerekli LOT, fatura+irsaliye çifte stok oluşturmama, onaysız cari/KDV/stock yazmama, 0062 şema kontrolü | **Şema/gerçek stok kabulü açık; migration ayrıca onay gerektirir** |
| İmalatçı | Model işini açar; dosya ve teknik föyü görür; net/defolu/adet kapanışını kayıt eder | `ProductionWorkPoolPage`, ortak dosya paneli salt okunur | model UUID doğru, üretim adedi faturalama bakiyesinin yerine geçmez, tarihsel işler açık sanılmaz | **Dosya paneli kodda; gerçek oturum/kapanış ve eski taslak PR'lar açık** |
| Boyahane | Model/LOT/reçete bağlantısını görür; fiziksel kimyasal giriş ve tüketimi izler | `BoyahaneWorkPageV4`, `boyahane-inventory`, fiziksel journal | doğru malzeme, LOT, irsaliye, miktar, müşteri/ürün; yanlış veya mükerrer stok yok | **Görünüm kodda; üretim kabulü yok** |
| Yetkili muhasebeci | Modelden doğru HKN/DDM PDF'lerini ve alıcıyı seçip Outlook'tan **bilinçli onaylı** gönderir | PR #550, `InvoiceMailWorkspace` | tam aynı belge çifti için tek mantıksal idempotency anahtarı, TO/CC/BCC ve e-posta hesabı değişince yanlış tekrar yok; ACCEPTED sonrası link recovery | **Taslak; P0 kapanmadan merge yok** |
| Yönetici/muhasebeci | Haftalık XLSX müşteri ekstresi, 120/125/130/150/165 grup farkı, eski borç/ödeme/mahsup ve doğru mail yanıt zinciri | Proje Kontrol Merkezi 10.11 planı | deterministik HKN+firma eşlemesi, toplam bakiye, kısmi ödeme, eski dönem, grup, geri alınabilir taslak; onaysız mesaj yok | **PLANLANDI, üretim kodu/acceptance kanıtı yok** |
| Tüm yetkililer | Model kartı ve formlar açılır modal; telefonda/tablette sade görünüm, dosya okuma yetkisi | `KyRecordDialog`, ortak `ModelFilesPanel`, modül ACL | Desen düzenler; İmalat/Boyahane salt-okunur; Muhasebe faturayı okur, PSD yüklemez; Android/PC responsive kabul | **Kod var; rol+cihaz saha kabulü açık** |

## 3. Açık P0 riskler: bunlar kapatılmadan nihai PASS yok

1. **PR #550 mükerrer gönderim:** `InvoiceMailWorkspace` gönderim anahtarı ile `invoiceMailRouting` ve server preflight anahtarının farklı tanımları PR incelemesinde saptandı. Tenant + tam HKN + tam DDM tek belirleyici olmalı. Alıcı, grup, Outlook hesabı değişince aynı evrak yeniden gönderilmemeli. `ACCEPTED` ardından `invoice-mail-links` başarısızlığında yeniden **gönderim değil, bağ kurtarma** yapılmalı.
2. **PR #549 tek PSD contract:** İkinci `PsdModelLinksPanel` ve `placements` ayrı canlı model olmamalı. Canonical `variants` ilişkisi korunurken BOY için Küçük/Büyük/Özel ve baskı bölgesi normalizasyonu/testleri bütün kartlarda uyarlanmalı. Mevcut metadata kayıpsız.
3. **Drive fiziki arşiv ve indeks:** Klasörün varlığını Drive'da görmek, File Hub binding, sync tamamlanması ve model kartına dosya relation kurulduğunu kanıtlamaz. `MODEL_IMAGE/MODEL_SOURCE/PLACEMENT/OUTGOING_DESIGN` binding satırları + en son sync + indeks + bağlı model sayıları yetkili hesapta okunmalı. Orijinaller değişmez.
4. **Muhasebe son onay ve Boyahane/LOT:** Gerçek iş kaydı test için üretilemez. Yetkili kullanıcı test/onayı veya izole fixture ve D1 check-only; 0062 migration için ayrıca hedefli açık onay + tam yedek gerekir.
5. **Rol/tenant sınırları:** Desen çalışanı gelen/giden model kaynaklarını, muhasebeci İşNet evrakını görür. Model salt-okunur tüketen İmalat/Boyahane kullanıcılarının muhasebe özel belgelerine erişimi ayrıca negatif test ile doğrulanmalı. Model isim benzerliği otomatik aynı kayıt değildir.

## 4. Operasyonel kabul testi sırası

1. **Sadece okuma:** canonical SHA, en son başarılı Pages/Worker release, API health, D1 şema hazır mı, File Hub 4 özel binding ve senkron durumları.
2. **Drive kaynak:** mevcut model klasörü için farklı sayıda dosya ve alt klasörleri önizle; yeni dosya yüklemeden önce `bağlı/eksik` ayır.
3. **PSD örnek:** sentetik MODEL-A/MODEL-B seçimiyle tek gerçek indeksli PSD'yi küçük/büyük BOY ve baskı bölgesi üzerinden teyit; fiziksel dosya değişimi yok, model kartında doğru görüntü.
4. **İşNet e-Belge:** anonimleştirilmiş test fixture XML ve PDF, yön/VKN/mükerrerlik/KDV/irsaliye-fatura adet farkı ve negatif durumlar. Gerçek gelir/gider defterine onaysız yazma yok.
5. **İmalat + Boyahane:** iş ekranında kaynak dosyalar salt-okunur, LOT ve adet yalnız doğru kaynaktan; tarihsel ve güncel açık işler ayrımı.
6. **Outlook / PR #550:** kimlik birleştirme + tekrar gönderme negatif testleri ve recovery PASS; kullanıcı tıklaması olmadan gerçek gönderim yok.
7. **Telefon/PC:** aynı model kartı, mobil modal, klasör seçimi izinleri, browser-limited folder drag uyarısı, gerçek oturum ve network/readiness.

Her satır için gerçek `PASS / FAIL / BLOCKED`, kullanıcı/cihaz bağlamı, commit, test run ve (varsa) geri alma kaydı tutulur. Önceki CI PASS, üretim verisiyle kabul yerine geçmez.

## 5. Çakışmasız iş sırası ve sorumluluk

- **P0:** PR #550 mükerrer gönderim ve provider sonuç kurtarma. Yayınlanmadan kapat.
- **P0:** Gerçek File Hub Drive 4 atama + sync/read-only kabul, model klasörü/PSD BOY indeks ilişkisi.
- **P0:** İşNet HKN/DDM ve LOT/irsaliye-fatura testleri; gerçek mutasyon öncesi yedek ve onay.
- **P1:** PR #549'u canonical `variants` içine kayıpsız birleştir veya gereksiz iki paneli kapat; üçüncü yol kurma.
- **P1:** PR #521/#522 ile mevcut İmalat 2026 kontrolünü diff karşılaştır, yalnız eksik fonksiyonu al.
- **P1:** Outlook son 12 aylık kişi/alıcı/grup tanıma ve haftalık XLSX cari mutabakatı (10.11 planı), mevcut Microsoft Graph/File Hub/muhasebe çekirdeği.
- **P1:** Android/Windows yetkili kullanıcı saha kabulü ve teknik dosya indirme denetimi.

**Koordinasyon:** Kod işinde önce aynı dosyaya yazan açık PR ve canonical HEAD kontrol edilir. Yalnızca kaynakta olmayan eksik uygulanır. Aynı anahtara iki backend veya ikinci model kartı dosya paneli eklenmez. Yeni Windows ZIP/token veya ikinci depo gerekmez. Token, parola, personel/müşteri verisi ve gerçek özel dosya GitHub'a taşınmaz. Günlük takip raporu yalnız değişen kanıtlara dayanır.
