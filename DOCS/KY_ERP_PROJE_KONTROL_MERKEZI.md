# KY ERP — PROJE KONTROL MERKEZİ

## 06.09.2026 — Mail Merkezi production onarım kaydı

- Kullanıcı yerel production eşitlemesi, yeni feature branch, temiz PR/merge ve Cloudflare Git Integration yayını için açık talimat verdi.
- Başlangıç local=origin SHA: `c2e541a618ef8b01f01a8363b1c3d1cbb28c71bb`; iki `npm ci` başarılı, source temiz. Yerel önceki değişiklikler `backup/local-before-production-sync-20260906-204004` branch'i ve aynı isimli stash ile korundu.
- Feature: `fix/mail-center-production-final-20260906`.
- Kök neden: Pages bu SHA'da başarılıyken canlı Worker v705 (`7485e463-135a-4e3e-b6cf-f9fdb993687e`, 03:13 UTC) paketinde `/api/mail/providers`, hesap, Google OAuth ve sabitleme rotaları bulunmuyor. Worker'ın commit SHA'sı canlı metadata'da yok; eski SHA tahmin edilmedi. Kaynak Worker test kapısında 11 hata tekrar üretildi.
- Eski ekran/entry sözleşmeleri güncellendi; runtime readiness içindeki kullanılmayan DDL kopyaları ve frontend build'e bağlanmış geçici Worker tanılama betiği kaldırıldı. Frontend build tekrar `vite build`.
- Mail girişinde ortak CORS/auth/hata sınırı; firma/hesap kapsamlı gerçek Microsoft/Gmail reply ilişkisi; gönderim sürerken tekrar engeli; sade bağlantı durumları ve ACTIVE hesapta posta kutusunu açma eklendi.
- D1: repo dışında 38.371.801 bayt full SQL backup alındı. SHA256 `5A14E92BE137BCD585DE891970BA8016231795E832EEEF7B7FFF314F35B5A6AD`. Sonra yalnız 0050+0051 uygulandı; 23 tablo ve 18 indeks canlı metadata üzerinden doğrulandı. Genel migration zinciri veya business test write yapılmadı.
- Eksik production bindings: `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`. `FILE_HUB_OAUTH_KEY` mevcut; yeni kasa anahtarı gerekmez. Client bilgileri olmadan OAuth/gönderim başarılı sayılmaz.
- Bu kayıt kaynak onarımını ve D1 durumunu belgeler; Pages+Worker yeni yayın ve kullanıcı OAuth onayı/gerçek hesap smoke sonuçları ayrıca doğrulanmalıdır.

> Bu dosya KY ERP projesinde yeni sohbet, yeni ajan, yeni feature branch veya yeniden başlama durumunda **ilk okunacak güncel durum kaydıdır**. Teknik ve güvenlik kuralları için `AGENTS.md` üstündür; bu dosya ise kullanıcının kararlarını, aktif çalışma yönünü, son önemli gelişmeleri, kontrol bekleyen işleri ve devam noktasını tek yerde toplar.

## 1. Zorunlu başlangıç sırası

Yeni bir çalışma başlarken sırasıyla:

1. `AGENTS.md` dosyasını oku.
2. Bu dosyayı (`DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`) oku.
3. `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md` dosyasını oku; son yapılan işler ve varsayılan modül sırası burada tutulur.
4. Çalışılacak modül için ilgili kodu ve varsa özel DOCS kaydını kontrol et.
5. Aktif branch / production branch / PR durumunu GitHub'dan doğrula.
6. Kullanıcı açıkça istemedikçe production deploy veya merge yapma.

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
- Mail & Dosyalar
- Bağlantılar & Depolama / KY File Hub
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

Bağlantılar & Depolama yönetim ekranları:

1. Genel Bakış
2. Dosya Servisleri
3. E-posta Hesapları
4. Bölüm / Dosya Atamaları
5. Dosya İndeksi
6. Senkronizasyon & Agent
7. Yedekleme & Loglar

Günlük kullanıcı alanı ayrıca **Mail & Dosyalar** modülüdür. Mail okuma/gönderme ve File Hub dosya kullanımı burada yapılır; provider/OAuth/klasör bağlantı yönetimi günlük ekrana karıştırılmaz.

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
- `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md` — son yapılan işler + yeni sohbetlerin varsayılan çalışma sırası için güncel ana kaynak.
- `DOCS/AGENTS_RULES_BASE_PRE_STORAGE_20260902.md` — eski ayrıntılı kuralların tarihsel tabanı.
- `DOCS/KY_ERP_SOHBET_KAYNAK_KAYDI_2026-09-01.md` — 01.09 İşNet/tenant/deploy kararlarının tarihsel kaydı.
- `CHANGELOG.md` — sürüm/değişiklik geçmişi.

Bu dosya bu kaynakları kaldırmaz; **devam noktası için tek güncel indeks/kontrol merkezi** olarak kullanılır.

---

## Son güncelleme


## 06.09.2026 — Yeni sohbet devam kaynağı ve iş sırası kilitlendi

- Yeni ana devam özeti oluşturuldu: `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md`.
- Yeni sohbet/ajan artık `AGENTS.md -> Proje Kontrol Merkezi -> Güncel Devam Kaynağı` sırasını kullanır.
- Cloudflare/auth/deploy/AI Gateway son durumu bu kaynakta tek özet halinde tutulur.
- Varsayılan modül sırası: e-Belge/İşNet -> Muhasebe/Cari/FİBE -> PDKS/İK -> File Hub/Mail -> AI/Asistan.
- Production HEAD paralel sohbetlerde değişebileceği için her yeni işlemde güncel HEAD doğrulanır.

## 06.09.2026 — Cloudflare çekirdek rollout tamamlandı

- Cloudflare Pro, Git Integration, Pages/Workers Builds, Turnstile, login rate limit, API cache bypass, bot policy audit ve owner session security çekirdek production katmanı olarak tamam kabul edilir.
- WAF Cloudflare Managed Ruleset **Observe/Log** modunda kalır; yeterli event verisi görülmeden kör enforce yapılmaz.
- OWASP ikinci managed paket ve geniş Bot Fight block/challenge bilerek açılmaz; API/mobile/PDKS/File Agent false-positive riski nedeniyle bunlar "eksik" değil kontrollü deferred karardır.
- Management token least-privilege kuralı: D1 yalnız **Read**; D1 Edit/Billing/API Tokens/Account Members/DNS Edit verilmez.
- Workers AI binding `AI` aktif; AI çağrıları `default` AI Gateway üzerinden, cache bypass ve varsayılan persistent prompt logging kapalı şekilde yürütülür.
- Tenant/permission guard ve KY ERP billing ledger AI çağrısından önce/sonra korunur; serbest SQL/write executor açılmaz.
- Queues/Workflows/Vectorize/AI Search mevcut ERP'nin production blocker'ı değildir. Somut ürün özelliği gerektiğinde ayrı kontrollü feature paketi olarak ele alınır.
- Cloudflare tarafında bundan sonra "çekirdek eksik kurulum" yerine modül/ürün geliştirme sırasına dönülür.

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
- 04.09 tarihli "sonraki adım token/WAF" notu tarihsel kalmıştır; güncel final durum yukarıdaki 06.09 Cloudflare çekirdek rollout kaydındadır.

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


## 06.09.2026 — Mail & Dosyalar / Bağlantılar & Depolama mimarisi kilitlendi

- Aktif geliştirme branch'i: `codex/mail-iletisim-merkezi-core-v1b-20260906`.
- PR: **#94 — Mail: İletişim & Dosyalar merkezi + provider-independent Mail Core**.
- Kullanıcı tarafındaki ana modül adı **Mail & Dosyalar** olarak netleştirildi.
- Yönetim tarafındaki ana modül adı **Bağlantılar & Depolama** olarak netleştirildi.
- Bağlantılar & Depolama sekmeleri: Genel Bakış, Dosya Servisleri, E-posta Hesapları, Bölüm / Dosya Atamaları, Dosya İndeksi, Senkronizasyon & Agent, Yedekleme & Loglar.
- Mail & Dosyalar sekmeleri: Gelen Kutusu, Gönderilenler, Taslaklar, Yanıt Bekleyenler, Şablonlar, Dosyalar, Son Kullanılanlar, Firma Dosyaları.
- Microsoft 365/Outlook ilk gerçek mail adapterıdır; mevcut File Hub Microsoft Graph OAuth uygulaması ve şifreli secret katmanı yeniden kullanılır.
- Gmail/JMAP/IMAP-SMTP adapterı hazır olmadan bağlı/kullanılabilir gösterilmez.
- Mail hesap erişimi tenant + kullanıcı posta kutusu üyeliğiyle sınırlandırılır.
- Kritik ortak/bölüm/Muhasebe/e-Belge posta kutularında Firma Sahibi -> Uygulama Sahibi sıralı çift onay uygulanır.
- Gönderim açık kullanıcı işlemi gerektirir; AI otomatik mail göndermez. Belirsiz provider sonucu otomatik retry edilmez.
- Mail Core additive D1 şeması `0050_mail_communication_core.sql` dosyasıdır; production öncesi D1 full backup + readiness + hedefli migration + schema doğrulaması gerekir.
- Bu paket henüz production merge/deploy sayılmaz; kullanıcı açıkça **canlıya al** demeden production branch'e taşınmaz.


## 06.09.2026 — Mail & Dosyalar production merge + P1 hotfix

- PR #94 production branch'e merge edildi.
- Production merge commit: `efc774fc4891d6c4fa72578f4d108b2a21c80f42`.
- Merge sonrası yakalanan P1: normal kullanıcıların günlük Dosyalar sekmesi owner-only File Hub indeks endpointlerini çağırıyordu.
- P1, PR #103 ile düzeltildi; günlük dosya görünümü artık `/api/mail/files` üzerinden tenant + MAIL izni + kullanıcının modül `canView` ilişkilerine göre scope edilir.
- P1 hotfix production commit: `322362bc35a229f100f0ce6f33025b86cb7d1444`.
- `0050_mail_communication_core.sql` bu sohbet oturumunda production D1'e uygulanamadı; Cloudflare D1 write yetkili aracı mevcut değildi.
- Bu nedenle Mail Core fail-soft çalışır: Mail & Dosyalar arayüzü canlıda önizleme/kurulum bekliyor durumunda açılabilir; mail hesap talebi, bağlantı ve gönderim 0050 uygulanana kadar kapalıdır.
- 0050 aktivasyonu için canonical sıra değişmez: remote D1 full backup -> readiness -> hedefli 0050 additive migration -> schema doğrulaması. GitHub Actions production deploy için kullanılmaz.


## 06.09.2026 — İK / PDKS kesin ayrım + yıllık izin bakiye final paketi

- Aktif feature branch: `codex/ik-pdks-yillik-izin-final-20260906`.
- İK görünür menüsü yalnız özlük ve finans yönetimidir: İK Özet, Personel Kartları, Maaş / Yol / Banka / Elden, Mesai / Avans / Kesinti, Bordro & Ödeme, SGK / Evrak / Ay Sonu.
- İK içinde ikinci PDKS/puantaj/giriş-çıkış/günlük personel ekranı açılmaz; eski İK içi PDKS rotaları güvenli biçimde personel/finans ekranlarına yönlenir.
- PDKS; giriş/çıkış, puantaj, vardiya, terminal/senkron ve izin hareketlerinin operasyonel sahibidir.
- İK Personel Kartı yıllık izin özlük özetini tek ekranda gösterir: hakediş, devreden, toplam hak, kullanılan, kalan ve hakediş geçmişi.
- Kullanılan/kalan yıllık izin hesabı modern `ik_leave_plans` ile tarihsel `hr_leave_records_v2` kayıtlarını exact tekrarları çift saymadan birlikte okur.
- Personel izin geçmişi de modern PDKS izin kayıtları + tarihsel kayıtları tek listede gösterir.
- D1 reset/drop veya yeni migration yoktur; mevcut personel/izin/bordro verisi korunur.
- İK ödeme çıktıları da aynı pakette finalleştirildi: A4 yatay ödeme listesinde HKN personel adının altına alınarak sıkışma azaltıldı; EK sütunu ayrı ve pozitif tutar vurgulu; 10'lu A4 toplu fiş kuralı korunur.
- EK ödeme tutarı olan personelde tekli ve 10'lu fişte altta kesilebilir/ayrılabilir `EK ÖDEME` kuponu oluşur; EK=0 ise kupon görünmez.
- Bu kayıt feature branch durumudur; production merge/deploy yapılmamıştır. Önce doğrulama, ardından kullanıcı açık canlı onayı gerekir.


## 06.09.2026 — Kurumsal Yönetim / Süper Yönetici modeli kilitlendi

- Yönetim modülü kurumsal isimlendirmeye geçirildi.
- `Uygulama Sahibi` kullanıcı adı/etiketi yerine **Süper Yönetici** kullanılır.
- Yönetim menüsü: **Yönetim Konsolu**, **Süper Yönetici & Güvenlik**, **Kullanıcı & Yetkiler**, **Firmalar & Organizasyon**, **Firma Paket / Kullanım**.
- Ayrı **Giriş Onayları** sekmesi kaldırıldı; eski URL/alias Yönetim Konsolu'na yönlenir.
- Bekleyen yeni cihaz girişleri Yönetim Konsolu içindeki **Karar Merkezi** kartında gösterilir.
- **Firma Sahibi / İşveren = COMPANY_ADMIN**. Kendi firmasının kullanıcı, Mail ve Drive/File Hub yönetim kararlarını verir.
- Mail hesabı bağlantı onayı tek firma-sahibi adımıdır; eski uygulama-sahibi ikinci onay adımı kaldırılmıştır.
- Firma sahibine düşen Mail ve giriş onayları **Süper Yönetici bildirim merkezine tüm firmalar üzerinden aynalanır**. Süper Yönetici gözetim görünürlüğüne sahiptir; firma sahibinin Mail karar adımını sessizce devralmaz.
- Google Drive / OneDrive / SharePoint / File Hub yazma-yönetim işlemleri ilgili firmanın Firma Sahibi / İşveren rolüne bağlandı.
- Firma kartında o firmaya bağlı **işveren, muhasebe ve diğer bölüm kullanıcıları**, aktif/pasif durumu ve kişi sayıları görünür.
- Kullanıcı & Yetki Merkezi firma filtresi, rol/firma görünürlüğü ve daha geniş kurumsal kart düzeniyle yenilendi.
- Üst sağ kullanıcı profilinde ham `SUPER_ADMIN` yerine **Süper Yönetici**, `COMPANY_ADMIN` yerine **Firma Sahibi / İşveren** gösterilir.
- Regression sözleşmesi: `APP/cloud/ky-erp-api/src/admin-governance-v2-contract.test.ts`.


## 06.09.2026 — Yönetim production sonrası erişim hotfix'i

- PR #120 production'a merge edildi ve kurumsal Süper Yönetici / Firma Sahibi modeli canlı kaynakta yerini aldı.
- Merge sonrası P1 incelemesinde Firma Sahibi / İşveren'in backend'de File Hub yönetim yetkisi olmasına rağmen frontend `STORAGE_ADMIN` modülüne erişemediği doğrulandı.
- Hotfix ile `STORAGE_ADMIN` auth module contract'a eklendi; COMPANY_ADMIN için ADMIN + STORAGE_ADMIN implicit görünür/yazılabilir yetki verildi.
- Login/session permission payload, frontend AuthContext, kullanıcı yetki editörü ve legacy Prisma enum aynı contract'a çekildi.
- Kullanıcı & Yetkiler ekranında gömülü kalan ikinci Giriş Onayları bloğu kaldırıldı. Giriş onayı tek yüzeydir: **Yönetim Konsolu -> Karar Merkezi**.


## 06.09.2026 — Süper Yönetici hesap kurtarma final düzeni

- Süper Yönetici güvenlik ekranındaki genel HTTP 500 recovery hatası için auth recovery şeması runtime-readiness ile korumaya alındı.
- `auth_owner_recovery_questions` ve `auth_owner_recovery_challenges` tabloları ile gerekli 0019/0021 security kolonları idempotent olarak doğrulanır/eksikse hazırlanır.
- Şema hazırlanamazsa global `INTERNAL_ERROR` yerine `OWNER_RECOVERY_SCHEMA_UNAVAILABLE` ile anlaşılır 503 döner.
- Eski tek kullanımlık recovery-code tablosu artık kurtarma akışının zorunlu bağımlılığı değildir; mevcutsa yalnız güvenli şekilde emekliye ayrılır.
- Süper Yönetici ekranındaki bölüm adı **Hesap Kurtarma ve Kimlik Doğrulama** olarak yenilendi.
- Durum kartları: Kurtarma Durumu, Güvenlik Soruları 3/3, E-posta, Kurtarma Kanalı.
- Üç güvenlik sorusu ayrı kartlarda gösterilir. Yeni yazılan cevaplarda **Göster / Gizle** vardır.
- Daha önce kaydedilmiş cevaplar güvenlik gereği düz metin olarak geri getirilemez; salt + PBKDF2 hash saklama kuralı korunur. Kayıtlı cevap değiştirilecekse yeni cevap yazılır.
- Kullanıcı arayüzünde eski tek kullanımlık kurtarma-kodu mantığı kaldırıldı. Canonical kurtarma: parola doğrulaması -> doğrulanmış e-posta/SMS -> rastgele 2 güvenlik sorusu -> Authenticator yeniden kurulumudur.
- Cloudflare Access / Zero Trust, ileride yalnız Süper Yönetici için ek dış güvenlik katmanı olarak değerlendirilebilir; mevcut KY ERP kurtarmasının yerine geçirilmedi ve normal kullanıcı akışına ikinci giriş eklenmedi.
- Regression: `APP/cloud/ky-erp-api/src/super-admin-recovery-final-contract.test.ts`.
