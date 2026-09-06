# KY ERP — PROJE KONTROL MERKEZİ

> Bu dosya KY ERP projesinde yeni sohbet, yeni ajan, yeni feature branch veya yeniden başlama durumunda **ilk okunacak güncel durum kaydıdır**. Teknik ve güvenlik kuralları için `AGENTS.md` üstündür; bu dosya ise kullanıcının kararlarını, aktif çalışma yönünü, son önemli gelişmeleri, kontrol bekleyen işleri ve devam noktasını tek yerde toplar.

## 1. Zorunlu başlangıç sırası

Yeni bir çalışma başlarken sırasıyla:

1. `AGENTS.md` dosyasını oku.
2. Bu dosyayı (`DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`) oku.
3. Çalışılacak modül için ilgili kodu ve varsa özel DOCS kaydını kontrol et.
4. Aktif branch / production branch / PR durumunu GitHub'dan doğrula.
5. Kullanıcı açıkça istemedikçe production deploy veya merge yapma.

Eski sohbet notları veya tarihli kaynak kayıtları bu dosyaya göre tarihsel referanstır. Güncel kod gerçeği ve bu dosyadaki son kararlar önceliklidir.

## 2. Sabit proje kimliği

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
- Public site: `https://kyerp.net`
- ERP uygulaması: `https://app.kyerp.net`
- Canlı API: `https://api.kyerp.net`
- Frontend: `APP/app/ky-erp-frontend`
- Cloudflare API/Worker: `APP/cloud/ky-erp-api`
- Windows Desktop kaynakları: `APP/desktop/ky-pdks`
- File Hub Agent kaynağı: `tools/file-hub-agent`

## 3. 03.09.2026 itibarıyla ana çalışma kararı

Kullanıcının kesin kararı:

**KY ERP Desktop = geliştirme sonrası ilk gerçek kontrol ortamı.**

**GitHub = ana kaynak kodu, geçmiş ve güvenlik/yedek merkezi.**

**kyerp.net = yalnız Desktop üzerinde kontrol edilip kullanıcı tarafından onaylanan değişikliklerin yayınlandığı canlı ortam.**

Yeni akış:

`Kullanıcı isteği -> GitHub feature branch -> otomatik test/build -> KY ERP Desktop güncellemesi -> kullanıcı kontrolü -> düzeltmeler -> kullanıcı onayı -> gerekirse production/web yayını`

Kurallar:

- Canlı `kyerp.net` üzerinde deneme/geliştirme yapılmaz.
- Her küçük değişiklik için kullanıcı VS Code veya GitHub ile uğraştırılmaz.
- VS Code zorunlu çalışma bağı değildir; gerektiğinde yerel teknik müdahale için kullanılabilir.
- Asistanın güvenilir yazma noktası GitHub'dır.
- Desktop için mümkün olan en az kullanıcı müdahalesi hedeflenir.
- İleride Desktop'a `Güncelle ve yeniden başlat` tipi otomatik güncelleme kanalı eklenecek; **03.09.2026 itibarıyla bu özellik henüz tamamlanmış sayılmaz.**
- Production merge/deploy yalnız kullanıcı açıkça onayladıktan sonra yapılır.

## 4. Aktif Desktop çalışması

Aktif feature branch:

`codex/ky-erp-desktop-final-20260903`

Draft PR:

`#56 — KY ERP Desktop 1.7.2 — tam Windows ERP uygulaması`

Durum:

- Desktop normal/tam uygulama olarak ele alınıyor; demo/pilot değildir.
- Güncel React frontend masaüstü paketine gömülür; ayrı ikinci masaüstü tasarımı veya farklı menü oluşturulmaz.
- Paketli arayüz canonical origin ile `https://app.kyerp.net/index.html` kimliğinde çalışır.
- Canlı business API `https://api.kyerp.net` kullanılır.
- Kullanıcı 03.09.2026 tarihinde 1.7.2 sürümünün açıldığını ve gerçek KY ERP oturumuna giriş yapıldığını ekran görüntüsü ile doğruladı.
- PR #56 draft kalacak; kullanıcı modül kontrollerini bitirmeden production'a merge edilmeyecek.

### Desktop 1.7.x önemli düzeltmeler

- `1.7.0`: paket kök sanal-host navigasyonunda `ERR_ACCESS_DENIED` görüldü.
- `1.7.1`: doğrudan `index.html` açılışı çözüldü; ancak `http://localhost` origin sebebiyle canlı giriş API'si CORS/transport hatası verdi.
- `1.7.2`: paketli UI tekrar canonical `https://app.kyerp.net/index.html` origin'ine alındı; hem açılış hem canlı API giriş akışı birlikte çalışır hale geldi.

Bu iki hata tekrar üretilmemeli; Desktop origin kararı değiştirilirken API CORS/auth sözleşmesi birlikte kontrol edilmelidir.

## 5. Desktop kapsamı

Desktop içinde web ile aynı kaynak üzerinden şu ana bölümler bulunur:

- Muhasebe
- e-Belge / İşNet
- Desen
- Boyahane
- İK
- PDKS
- İmalat
- Depolama / KY File Hub
- Yönetim
- KY ERP Asistan

### İK özel kullanıcı kararı

Kullanıcı özellikle **İK Günlük Giriş / günlükçü girişi** tarafının webdeki mevcut çalışma ve tasarımla **bire bir aynı** olmasını istiyor. Masaüstü için ayrı ekran, ayrı tasarım veya farklı iş akışı yapılmayacak.

İK Günlük Personel ana ekranları:

- Günlük Giriş
- Günlük Personel Kartları
- Haftalık Özet
- Günlük Ödeme Fişleri

Aylık İK tarafı da aynı canonical frontend kaynağını kullanır.

Kontrol sırasında öncelik: **İK > Günlük Giriş**.

## 6. PDKS / Windows cihaz düzeni

- PDKS, KY ERP Desktop'ın bir modülüdür; Desktop'ın tamamı PDKS uygulaması değildir.
- Mevcut native kart cihazı entegrasyonu `KYERP.PDKS.Agent` Windows servisi üzerinden korunur.
- Native PDKS ekranı aynı ERP oturum/token bağlamını kullanır.
- Denetim/audit kullanıcılarında write yetkisi kapalı tutulur.

## 7. Depolama / KY File Hub ana kararı

Tek File Hub modeli korunacak.

Desteklenen V1 provider tipleri:

- `GOOGLE_DRIVE`
- `ONEDRIVE`
- `SHAREPOINT`
- `LOCAL_FOLDER`
- `NAS`

Desktop paketi mevcut KY File Agent + gömülü Node runtime yaklaşımını içerir. Kullanıcının ayrıca Node kurması hedeflenmez.

File Hub ekranları:

1. Genel Bakış
2. Bağlantılar
3. Bölüm / Dosya Atamaları
4. Dosya İndeksi
5. Senkronizasyon / Agent
6. Yedekleme / Loglar

Provider veya yerel path hiçbir modüle sabit kodlanmamalıdır; `AGENTS.md` File Hub kuralları geçerlidir.

## 8. Kullanıcının çalışma tercihi

- Minimum soru, minimum manuel işlem.
- Tek kurulum / tek güncelleme / mümkün olduğunca tek tık.
- Kurumsal ve temiz ürün; geçici demo isimleri kullanılmaz.
- Uygulama adı `KY ERP` / `KY ERP Desktop` çizgisinde kalır.
- Küçük görsel değişiklikler için yeniden ayrı masaüstü tasarımı yapılmaz; canonical frontend korunur.
- Kullanıcı uygulamayı açıp gerçek kullanım üzerinden ekran görüntüsüyle kontrol etmek istiyor.
- Asistan önemli kararları ve teknik dönüm noktalarını bu dosyaya kaydetmelidir.

## 9. Değişiklik kayıt kuralı

Bu dosya yalnız büyük kararlar ve devam için gerekli bilgilerle güncellenir. Her commit'in ayrıntısını buraya doldurma.

Aşağıdakilerden biri olduğunda güncelle:

- kullanıcı yeni bir kalıcı çalışma kuralı koyduysa,
- branch/PR ana yönü değiştiyse,
- yeni Desktop sürümü kullanıcı tarafından gerçek cihazda doğrulandıysa,
- önemli bir kök neden bulundu ve mimari karar değiştiyse,
- bir modül kullanıcı tarafından tamam/onaylandıysa,
- production'a geçiş kararı verildiyse,
- kritik açık iş veya blocker ortaya çıktıysa,
- eski bir karar geçersiz kılındıysa.

Her güncellemede mümkünse şu dört bilgiyi yaz:

- tarih,
- karar/gelişme,
- ilgili branch/PR/commit,
- sonraki net adım.

Şifre, MFA secret, API key, token veya kişisel gizli bilgiler bu dosyaya yazılmaz.

## 10. Kontrol ve yayın kuralı

Bir modül için doğru sıra:

1. Feature branch üzerinde değişiklik.
2. Test/lint/build.
3. Desktop paketi veya Desktop güncellemesi.
4. Kullanıcı gerçek kullanım kontrolü.
5. Gerekirse revizyon.
6. Kullanıcının açık `tamam / onay / canlıya al` kararı.
7. Production branch merge/deploy.
8. Canlı smoke/health/auth/modül kontrolü.

**Desktop'ta çalıştı = otomatik olarak production'a al demek değildir.**

## 11. Yeni sohbet için hazır devam özeti

Yeni sohbet KY ERP işiyle açılırsa şu gerçekler varsayılmalıdır:

- Ana hedef şu anda Desktop-first geliştirme/kontrol düzenidir.
- Aktif Desktop çalışma branch'i `codex/ky-erp-desktop-final-20260903` ve draft PR #56'dır.
- Kullanıcı Desktop 1.7.2'de uygulamanın açıldığını ve oturumun çalıştığını doğrulamıştır.
- İlk ayrıntılı modül kontrolü İK > Günlük Giriş tarafında yapılacaktır.
- GitHub kaynak merkezi olmaya devam eder; kullanıcı GitHub/VS Code işlemleriyle uğraştırılmaz.
- Onaylanmamış Desktop değişiklikleri kyerp.net'e taşınmaz.
- Sonraki ürünleştirme hedeflerinden biri Desktop otomatik güncelleme mekanizmasıdır.

## 12. Tarihsel yardımcı kaynaklar

- `AGENTS.md` — üstün teknik/güvenlik çalışma sözleşmesi.
- `DOCS/AGENTS_RULES_BASE_PRE_STORAGE_20260902.md` — eski ayrıntılı kuralların tarihsel tabanı.
- `DOCS/KY_ERP_SOHBET_KAYNAK_KAYDI_2026-09-01.md` — 01.09 İşNet/tenant/deploy kararlarının tarihsel kaydı.
- `CHANGELOG.md` — sürüm/değişiklik geçmişi.

Bu dosya bu kaynakları kaldırmaz; **devam noktası için tek güncel indeks/kontrol merkezi** olarak kullanılır.

---

## Son güncelleme

**04.09.2026 — Cloudflare Pro + Actions'sız production yayın düzeni kesinleştirildi.**

- `kyerp.net` için Cloudflare Pro aktif.
- Frontend `ky-erp-frontend` Cloudflare Pages Git Integration production deploy'u başarıyla doğrulandı.
- Worker `ky-erp-api` Cloudflare Workers Builds production deploy'u başarıyla doğrulandı.
- Production branch her iki Cloudflare projesinde de `codex/model-uretim-kontrol-merkezi-final`.
- Frontend root `APP/app/ky-erp-frontend`; build `npm run build`; output `dist`; `VITE_API_URL=https://api.kyerp.net`.
- Worker root `APP/cloud/ky-erp-api`; build `npm run typecheck && npm test && npm run build`; deploy `npm run deploy`.
- Preview/non-production automatic deployments kapatıldı.
- GitHub Actions production/push otomasyonu manual fallback'e çevrildi; canonical yayın Cloudflare Git Integration.
- D1 migration normal Git auto-deploy'a bırakılmaz; full backup + readiness + hedefli migration ayrı güvenlik kapısıdır.
- Cloudflare Pro / AI / yetki / rollout ana kaynağı:
  `DOCS/KY_ERP_CLOUDFLARE_PRO_AI_YAYIN_KAYNAGI_2026-09-04.md`.
- Sonraki net adım: Cloudflare management token için least-privilege yetkileri tanımlamak; ardından WAF/rate-limit/AI Gateway/Queues/Workflows/Vectorize rollout'u.

**03.09.2026 — Desktop-first çalışma düzeni kesinleştirildi.**

- Desktop 1.7.2 gerçek Windows cihazda açıldı ve ERP oturumu doğrulandı.
- GitHub ana kaynak olarak kalacak.
- Kullanıcı GitHub/VS Code ile manuel uğraşmayacak.


---

## 06.09.2026 — e-Belge / İşNet canonical finalizasyon paketi

Aktif feature branch:

`codex/e-belge-isnet-canonical-final-20260906`

Production tabanı:

`eb5b406ff6c2577fdfe14a5da1b55c58dbb53b6e`

### Bulunan kök neden

Yeni `e-Belge Merkezi` ekranı `accounting_documents` canonical havuzunu okurken, İşNet `full-sync` akışı belgeleri esas olarak eski `documents` uyumluluk tablosuna yazıyordu. Bu nedenle İşNet bağlantısı mevcut olsa bile senkronlanan belgelerin yeni e-Belge havuzuna eksiksiz düşmesi garanti değildi.

### Bu branch'te yapılan final düzeni

- İşNet `full-sync` XML/PDF indirme motoru korunur.
- İşNet'ten alınan dört belge yönü/türü canonical e-Belge havuzuna beslenir:
  - gelen fatura,
  - giden fatura,
  - gelen irsaliye,
  - giden irsaliye.
- UBL-TR XML, provider bağımsız ortak parser ile canonical belge/kalem modeline çevrilir.
- İşNet provider kimliği `provider_type=ISNET`, `provider_document_id` ve `source_type=ISNET_DIRECT` olarak izlenir.
- PDF/XML dosyaları mevcut R2 kaynağından File Hub asset/relation + canonical arşiv kuyruğuna bağlanır.
- Eski `documents` yazımı uyumluluk için korunur ancak hata vermesi canonical e-Belge ingest yolunu kesmez.
- İşNet canonical yazım hatası sessiz başarıya çevrilmez; `PARTIAL_REVIEW_REQUIRED` olarak görünür.
- e-Belge Entegrasyonlar ekranı tenant bazlı gerçek İşNet yapılandırma/bağlantı, son senkron ve canonical belge sayısını gösterir.
- e-Belge iç navigasyonu gelen/giden fatura ve irsaliyeleri ayrı sekmeler olarak gösterir.
- Normal operasyon için e-Belge Entegrasyonlar içinden “Şimdi Senkronize Et” kullanılabilir.
- Legacy İşNet çalışma alanı yalnız provider ayarı/özel uyumluluk işlemleri için içeride korunur; ayrı ana modül olarak geri getirilmez.
- Resmî e-Fatura/e-İrsaliye gönderimi bu paketle otomatikleştirilmez; açık kullanıcı onayı kuralı aynen korunur.
- Yeni D1 migration gerekmez; mevcut `0034_accounting_document_core.sql` şeması kullanılır.

### Test / yayın kapısı

- Yeni saf UBL parser için incoming/outgoing yön testleri eklendi.
- Worker için `npm test`, `npm run typecheck`, `npm run build`; frontend için `npm test`, `npm run lint`, `npm run build` çalıştırılmadan production'a taşınmış sayılmaz.
- Bu feature branch production değildir. Kullanıcı açıkça “canlıya al” demeden production branch'e merge/deploy yapılmaz.


### 06.09.2026 — Manuel e-Belge / ürün / LOT audit revizyonu

Kullanıcının ayrıca istediği manuel belge havuzu ve ürün/LOT kontrolü PR #77 üzerinde tekrar denetlendi.

Tamamlanan ilgili düzen:

- Manuel havuz XML, PDF, JPG/JPEG, PNG, WEBP, BMP, TIF/TIFF kabul eder.
- XML UBL-TR doğrudan parser ile; PDF/görsel Azure Document Intelligence OCR + belge analizi ile okunur.
- AUTO taramada OCR metninden fatura/irsaliye türü belirlenir; fatura tespitinde structured invoice modeli ile refine edilir.
- Entegrasyonlar ekranı OCR servisinin gerçekten hazır olup olmadığını secret göstermeden bildirir.
- Firma eşleşmesi VKN + alias ile yapılır; kullanıcı elle cari seçerse OCR'dan gelen eski firma adı tenant-scoped company alias olarak öğrenilebilir.
- Ürün alias eşleşmesi firma kapsamını aşamaz; başka tedarikçinin özel aliası yanlış firmaya uygulanmaz.
- Kalem yönlendirmesi merkezileştirildi: EXPENSE / STOCK / BOYAHANE.
- Normal gider kalemi ürün kartı veya LOT zorunlu olmadan “Mal ve Hizmet Alımı” gider akışında kalabilir.
- Ürün kartındaki expenseCategoryId/expenseCategoryName taşınır.
- STOCK ürünü stok girişine gider; ürün kartında LOT zorunluysa final onaydan önce LOT aranır.
- Boyahane/kimya tedarikçisi ve Boyahane ürünü için ürün + LOT zorunluluğu uygulanır.
- Firma sonradan elle seçilirse tüm belge kalemleri o firmanın ürün aliası ve kimya profiliyle yeniden eşleştirilir.
- Boyahane LOT girişi ve stock movement aynı belge kalemi için idempotent hale getirildi; retry LOT miktarını ikinci kez artırmaz.
- Boyahane LOT ürün çatışması muhasebe postundan önce preflight edilir.
- Finalizasyon sırası: validation -> stok/LOT -> canonical muhasebe postu.
- Cari hareket, ledger ve KDV postları canonical belge üzerinden çalışır; ledger aynı source_document_id için idempotent hale getirildi.
- Kalem detayında yönlendirme kullanıcıya Gider / Stok / Boyahane·LOT olarak görünür.
- UBL irsaliye + LOT, AUTO fatura/irsaliye ayrımı ve ürün routing kuralları için unit testler eklendi.
- PR yerel smoke workflow'una Worker unit-test adımı eklendi.

Açık bırakılan ikinci paketler:

1. Muhasebe rapor read-model birleşmesi: bazı eski kar-zarar/rapor ekranları hâlâ legacy `documents` okuyor. Canonical `accounting_documents` + `accounting_ledger_entries` kaynak yapılacak, legacy fallback/dedupe sonra kaldırılacak.
2. Gider sınıflandırma ürünleştirmesi: normal gider kalemlerinde opsiyonel ürün/kategori seçimi, firma varsayılan gider kategorisi ve satır bazlı hızlı kategori düzeltme e-Belge ekranına taşınacak.
3. OCR dayanıklılığı: Azure primary adapter korunacak; secondary OCR/vision fallback ve düşük-confidence karşılaştırmalı doğrulama ayrı paket olacak.
4. File Hub arşiv tamamlama: e-Belge archive queue mevcut; gerçek Google Drive/OneDrive/SharePoint/Yerel/NAS hedefe yazma File Hub bağlantı/OAuth paketinin tamamlanmasıyla uçtan uca doğrulanacak.
5. Eski `documents` / İşNet legacy uyumluluk katmanı: rapor ve entegrasyon tüketicileri canonical'a taşındıkça read/write compatibility kodu kontrollü azaltılacak.

Bu audit production deploy değildir; PR #77 üzerinde test kapısı tamamlandıktan ve kullanıcı açıkça canlıya al dedikten sonra production merge değerlendirilir.
