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

Production yayınında tek canonical prosedür `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md` dosyasıdır. Normal canlıya almada kullanıcıdan PowerShell/Cloudflare tokenı istenmez; production merge sonrası Cloudflare Git Integration Pages ve Workers Builds'i otomatik yürütür. Worker build/test fail olursa manuel deploy ile bypass edilmez; log okunur, kaynak düzeltilir ve yeni production commitinin otomatik buildi beklenir.

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


## 06.09.2026 — Canonical Cloudflare canlıya alma prosedürü kilitlendi

- Kullanıcı kararı: normal production release sırasında **PowerShell veya manuel Cloudflare deploy adımı olmayacak**.
- Tek yayın kaynağı: `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`.
- Normal yol: feature branch -> test/build -> kullanıcı onayı -> production merge -> Cloudflare Git Integration -> Pages + Workers Builds -> canlı smoke.
- GitHub Actions production deploy yolu değildir.
- Worker build kapısı `npm run typecheck && npm test && npm run build`; fail olursa deploy durur.
- Cloudflare otomatik Worker build failinde doğru davranış: log -> kök neden -> feature branch düzeltme -> regression testi -> production merge -> yeni otomatik build. Manuel deploy ile test kapısı bypass edilmez.
- Pages success + Worker fail = release tamam değildir.
- Paralel sohbetler production HEAD'i ilerletirse eski SHA körlemesine deploy edilmez; en güncel production HEAD doğrulanır.
- D1 migration backup/readiness/hedefli migration ile ayrı güvenlik kapısıdır.
- 06.09.2026 doğrulanmış incident: bildirim Worker testindeki extensionless Node ESM importu `ERR_MODULE_NOT_FOUND` oluşturdu; kaynak düzeltmesi explicit `.ts` import + kontrat testi ile yapıldı. Bu olay otomatik Worker buildin çalıştığını, test kapısının deployu doğru şekilde durdurduğunu doğruladı.

## 06.09.2026 — Canlı yayın ve Bildirim Merkezi final kararı

- Production deploy **GitHub Actions ile yapılmayacak**.
- Canonical yol: `production branch push -> Cloudflare Git Integration -> Cloudflare Pages / Workers Builds`.
- GitHub Actions yalnız açık kullanıcı isteğiyle manual tanılama/test için çalıştırılabilir; production deploy yolu değildir.
- D1 migration ayrı güvenlik kapısıdır: backup -> readiness -> hedefli/additive migration -> schema audit.
- Sağ üst bildirim zilindeki sabit `3` kaldırıldı.
- Bildirim Merkezi gerçek veriye bağlandı: bekleyen giriş onayları, e-Belge açık sorunları, vadesi gelen/geciken ödemeler.
- Rozet gerçek unreadCount gösterir; 0 ise görünmez.
- Bildirimler tenant + kullanıcı modül yetkisine göre filtrelenir.
- Okundu durumu mevcut `json_store` içinde kullanıcı + firma bazında tutulur; yeni migration gerekmez.
- Ana devam kaynağı: `DOCS/KY_ERP_CANLI_YAYIN_BILDIRIM_KAYNAGI_2026-09-06.md`.

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

## 06.09.2026 — e-Belge / Muhasebe canonical canlı yayın onayı

- Kullanıcı PR #77 kapsamı için açıkça **canlıya al** onayı verdi.
- Canlı birleşimde güncel production auth, PDKS, Bildirim Merkezi ve Cloudflare-only yayın sözleşmesi korunur.
- İşNet + manuel e-Belge havuzu canonical `accounting_documents` akışına alınır; rapor read-modeli canonical kaynakları kullanır.
- XML/PDF/görsel OCR, firma/ürün alias, EXPENSE/STOCK/BOYAHANE yönlendirme ve LOT kuralları aynı paket içindedir.
- Resmî e-Fatura/e-İrsaliye gönderimi otomatikleştirilmez; kullanıcı onayı zorunluluğu devam eder.
- `0046_accounting_canonical_report_controls.sql` bu canlı yayında production D1'e uygulanmaz. İlgili kod tablo yoksa mevcut `json_store` fallback'ini kullanır; veri kaybı riski alınmaz.
- 0046 ileride ayrı bakım penceresinde remote D1 full backup + readiness + hedefli additive migration ile ele alınacaktır.


## 06.09.2026 — PDKS Agent gerçek kart importunda eski SGK filtresi bulundu

- Kök neden: `/api/auth/pdks-device/time-events/import` cihaz importu aktif kartlı personeli seçerken hâlâ `e.sgk_status='VAR'` şartı kullanıyordu.
- Bu şart 06.09.2026 tarihli emekli/aylık SGK kararına aykırıydı; emekli ama çalışan veya SGK kapsamı ayrı yönetilen aktif kartlı personelin gerçek terminal hareketini reddedebilirdi.
- Web kart köprüsündeki canonical davranış esas alındı: **aktif + kartlı personel**, SGK durumundan bağımsız gerçek kart hareketi.
- Çalışma branch'i: `codex/pdks-agent-sgk-independent-20260906`.
- Production'a merge/deploy yapılmadı. Önce Worker test/typecheck/build ve ilgili regression kontratı geçmelidir.
- DENETİM aylık SGK + kart kapsamı ayrı read-only kural olarak korunur; normal kart importuna taşınmaz.
