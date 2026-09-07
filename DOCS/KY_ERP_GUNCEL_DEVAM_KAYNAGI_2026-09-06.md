# KY ERP — GÜNCEL DEVAM + YAPILAN İŞLER ANA KAYNAĞI
## 06.09.2026

**Amaç:** Yeni sohbetlerin/ajanların son yapılan işleri tekrar araştırmadan, eski notlara dönmeden ve iş sırasını bozmadan devam etmesi için güncel özet kaynak.

**Repo:** `cetin60kaya-lgtm/ky-erp`  
**Canonical production branch:** `codex/model-uretim-kontrol-merkezi-final`  
**Bu kayıt hazırlanırken production HEAD:** `e050e9c42ac32da270c672267dabf9d8413a7ab5`

> Production branch paralel sohbetlerle ilerleyebilir. Yeni sohbet bu SHA'yı körlemesine kullanmaz; her işlem öncesi güncel production HEAD'i GitHub'dan doğrular. Bu dosya yapılan işlerin ve kararların kaydıdır.

---

# 1. YENİ SOHBETİN ZORUNLU OKUMA SIRASI

1. `AGENTS.md`
2. `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`
3. `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md`
4. Canlıya alma işi varsa: `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`
5. Cloudflare/AI işi varsa: `DOCS/KY_ERP_CLOUDFLARE_PRO_AI_YAYIN_KAYNAGI_2026-09-04.md`
6. İlgili modülün özel kaynak/dokümanı

Çelişki sırası:
- teknik/güvenlikte `AGENTS.md`,
- güncel devam/iş sırası ve kullanıcı kararlarında bu dosya + Proje Kontrol Merkezi,
- production deploy yönteminde `KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`.

---

# 2. 06.09.2026 İTİBARIYLA TAMAMLANAN CLOUDFLARE ÇEKİRDEĞİ

Aşağıdakiler çekirdek production kurulumu olarak **tamam kabul edilir**:

- Cloudflare Pro aktif.
- Frontend production: Cloudflare Pages `ky-erp-frontend`.
- API production: Cloudflare Worker `ky-erp-api`.
- Canonical deploy: production branch -> Cloudflare Git Integration -> Pages / Workers Builds.
- GitHub Actions production deploy yolu değildir.
- Normal release sırasında kullanıcıdan PowerShell / Cloudflare tokenı / manuel deploy istenmez.
- Worker build kapısı: `npm run typecheck && npm test && npm run build`.
- Worker build fail olursa manuel deploy ile bypass edilmez; log okunur, kaynak düzeltilir, regression testi eklenir ve yeni production commitinin otomatik buildi beklenir.
- D1 migration auto-deploy'dan ayrıdır; backup + readiness + hedefli/additive migration şarttır.
- Cloudflare Managed WAF aktif ve **Observe/Log** modundadır.
- OWASP geniş enforce bilerek deferred; false-positive verisi görülmeden açılmaz.
- Login rate limit aktif: `/api/auth/login` için 10 / 60 sn / IP, 60 sn block.
- İkinci Pro rate-limit slotu bilerek boştur.
- `api.kyerp.net/api` ve `/api/*` cache bypass aktif.
- Bot policy audit tamam; Verified Bots allow ve geniş SBFM block/challenge kapalı/ertelenmiş durumda.
- Turnstile web login entegrasyonu server-side verify + fail-closed tamam.
- Owner/admin MFA zorunluluğu korunur.
- Uygulama sahibi için kalıcı browser restore kapalı.
- Uygulama sahibi rolling/automatic session refresh kapalı.
- Normal kullanıcı session davranışı owner düzeni nedeniyle bozulmaz.
- Uygulama sahibi eski tek kullanımlık recovery code akışı kapatıldı; özel soru-cevap + doğrulanmış iletişim + MFA step-up güvenli recovery modeli kullanılır.
- Workers AI binding `AI` aktif.
- Workers AI çağrıları Cloudflare AI Gateway `default` üzerinden yürütülür.
- AI Gateway request cache bypass edilir.
- Hassas ERP prompt/response persistent gateway logging varsayılan kapalıdır (`AI_GATEWAY_COLLECT_LOGS=false`).
- AI tenant/permission guard ve KY ERP billing ledger korunur.
- Serbest SQL / sınırsız AI write executor açılmamıştır.
- Management token least-privilege: D1 yalnız **Read**; D1 Edit/Billing/API Tokens/Account Members/DNS Edit verilmez.

---

# 3. CANLIYA ALMA DÜZENİ — KALICI KARAR

Normal akış:

`feature branch -> test/build -> kullanıcı onayı -> production merge -> Cloudflare Git Integration -> Pages + Workers Builds -> canlı smoke`

Kurallar:

- Kullanıcı `canlıya al` dediğinde PowerShell isteme.
- Production HEAD merge öncesi tekrar doğrulanır.
- Paralel sohbet yeni commit eklediyse eski SHA körlemesine deploy edilmez.
- Pages success + Worker fail = release tamam değildir.
- Canlı health/auth/modül smoke olmadan `tamam` denmez.
- GitHub Actions normal production release için çalıştırılmaz.
- Secret/token/recovery cevabı repo, doküman veya loga yazılmaz.

Ana kaynak:
`DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`

---

# 4. SON DÜZELTİLEN ÖNEMLİ INCIDENT

Cloudflare Worker build otomatik tetiklenmiş ancak `notifications-cloud.test.ts` Node ESM çözümlemesinde:

`ERR_MODULE_NOT_FOUND: .../src/auth-cloud`

hatası vermişti.

Kök neden:
- `notifications-cloud.ts` içindeki extensionless TypeScript relative import.

Final çözüm:
- explicit `.ts` import,
- regression/contract testi,
- manuel deploy ile test bypass edilmedi.

Bu incident, Cloudflare Workers Builds otomatik tetik zincirinin çalıştığını ve build kapısının hatalı backend'i production'a göndermediğini doğruladı.

---

# 5. BİLDİRİM MERKEZİ SON DURUMU

- Sağ üst sabit `3` kaldırıldı.
- Rozet gerçek `unreadCount` kullanır.
- Kaynaklar: giriş onayları, e-Belge açık sorunları, ödeme hatırlatmaları.
- Tenant + kullanıcı modül yetkisi uygulanır.
- Okundu bilgisi kullanıcı + firma bazında saklanır.
- Bildirim API canonical endpointleri:
  - `GET /api/notifications`
  - `POST /api/notifications/read`
- Ayrıntılı kaynak:
  `DOCS/KY_ERP_CANLI_YAYIN_BILDIRIM_KAYNAGI_2026-09-06.md`

---

# 6. AUTH / GİRİŞ SON DURUMU

07.09.2026 itibarıyla final kullanıcı akışı:

`Turnstile -> kullanıcı adı/şifre -> kayıtlı telefon varsa KY ERP Telefonla Onay -> gerekirse firma sahibi onayı -> session -> ERP`

Telefon kaydı yoksa veya kullanıcı açıkça isterse Google/Microsoft Authenticator 6 haneli kodu fallback olarak devam eder. iPhone/iPad için Web Push yalnız Ana Ekrana eklenmiş KY ERP web app içinde etkinleştirilir; iOS action butonu göstermese bile bildirim uygulamayı açtığında foreground onay ekranı pending isteği cihaz capability anahtarıyla çeker. Telefon push verileri yeni D1 tablosu açmadan mevcut tenant-kapsamlı `json_store` içinde tutulur; bu özellik için production migration gerekmez.

Uygulama sahibi için:

- yeni browser oturumunda tekrar giriş + MFA,
- eski kalıcı owner localStorage restore kullanılmaz,
- active browser session içinde F5/yenileme çalışabilir,
- otomatik owner refresh kapalı,
- tek kullanımlık owner recovery code devre dışı,
- özel 3 soru kaydı; kurtarmada rastgele 2 soru + doğrulanmış iletişim kanalı + MFA kontrollü yeniden kurulum.

Normal kullanıcılar için:
- owner sıkılaştırması yüzünden mevcut normal session/persistence davranışı bozulmaz.

---

# 7. CLOUDFLARE'DA BİLEREK DEFERRED OLANLAR

Aşağıdakiler **eksik çekirdek kurulum değildir**:

- WAF block/enforce: event verisi görülmeden açılmayacak.
- OWASP ikinci geniş managed enforce: false-positive riski nedeniyle deferred.
- İkinci rate-limit slotu: somut endpoint ihtiyacında kullanılacak.
- Geniş Bot Fight/SBFM challenge/block: API/mobile/PDKS/File Agent riski nedeniyle açılmayacak.
- Queues / Workflows: gerçek asenkron/uzun iş ihtiyacında feature paketi.
- Vectorize / AI Search: semantik dosya/desen araması gerektiğinde feature paketi.

Yeni sohbet bunları otomatik olarak `kalan zorunlu Cloudflare işi` diye açmamalıdır.

---

# 8. ŞİMDİKİ İŞ SIRASI — KULLANICI İLE KİLİTLENEN DEVAM

Cloudflare çekirdeği kapatıldıktan sonra modül/ürün sırası:

## 1. e-Belge / İşNet + manuel fatura / irsaliye final kontrolü
Kontrol edilecek:
- İşNet gelen/giden belge akışı,
- manuel PDF/XML/JPEG okuma,
- OCR sadece gerektiğinde,
- fatura/irsaliye eşleşmesi,
- ürün kalemlerinin doğru ayrılması,
- firma/ürün alias,
- EXPENSE / STOCK / BOYAHANE yönlendirme,
- LOT gereken ürünlerde LOT zorunluluğu,
- resmî gönderimde kullanıcı onayı.

Mevcut not:
- `0046_accounting_canonical_report_controls.sql` production D1'e otomatik uygulanmaz.
- İleride ayrı bakım penceresinde backup + readiness + hedefli additive migration.

## 2. Muhasebe / Cari / FİBE final
- hızlı cari giriş/kontrol,
- haftalık gelen/giden/borç görünümü,
- resmi/gayriresmi ve elden ödeme takibi,
- firma kartında isteğe bağlı FİBE takibi,
- normal cari ile FİBE bakiyesi ayrı tutulur.

## 3. PDKS / İK final ekran + operasyon kontrolü
- Desktop/telefon/tablet uyum,
- PDKS operasyon çekirdeği,
- günlük/aylık İK,
- toplu/tekli ödeme fişleri,
- ödeme özet listesi,
- owner/admin güvenlik kuralları bozulmadan kullanıcı deneyimi.

## 4. Depolama / KY File Hub + Mail / İletişim Merkezi
- Google Drive / OneDrive / SharePoint / yerel / NAS tek File Hub,
- Mail/Gmail/Outlook entegrasyonu uygulama içinde ortak iletişim merkezi,
- dosya ve mail ilişkileri modüllerle tek contract üzerinden.

## 5. KY ERP AI / Asistan ürünleştirme
- mevcut Workers AI + AI Gateway temelinin üzerinde,
- typed/allowlisted işlemler,
- tenant/permission guard,
- kullanıcı onayı,
- audit,
- ihtiyaç çıkarsa Queues/Workflows/Vectorize/AI Search.

Bu sıra yeni sohbetlerde varsayılan çalışma sırasıdır. Kullanıcı yeni bir öncelik verirse güncellenir.

---

# 9. YENİ SOHBETE HAZIR DEVAM CÜMLESİ

Yeni KY ERP sohbeti açıldığında şu çerçeve kabul edilir:

> **Cloudflare çekirdeği tamam. Normal deploy production merge sonrası Cloudflare Git Integration ile otomatik; PowerShell yok. Owner auth sıkı, normal kullanıcı davranışı korunuyor. AI Gateway + Workers AI hazır. Şimdi modül sırasıyla e-Belge/İşNet -> Muhasebe/Cari/FİBE -> PDKS/İK -> File Hub/Mail -> AI/Asistan ürünleştirme devam eder.**

---

# 10. KAYIT GÜNCELLEME KURALI

Aşağıdakilerden biri değişirse bu dosya ve `KY_ERP_PROJE_KONTROL_MERKEZI.md` birlikte güncellenir:

- kullanıcı iş sırasını değiştirirse,
- önemli modül final/onayı oluşursa,
- production deploy yöntemi değişirse,
- auth/security kuralı değişirse,
- Cloudflare servislerinden deferred olan biri gerçek production özelliğine dönüşürse,
- kritik incident yeni kalıcı mimari kural doğurursa.

Secret, parola, MFA kodu, recovery cevabı veya API token değeri hiçbir zaman bu kaynağa yazılmaz.


## 06.09.2026 — Mail & Dosyalar production merge + P1 hotfix

- PR #94 production branch'e merge edildi.
- Production merge commit: `efc774fc4891d6c4fa72578f4d108b2a21c80f42`.
- Merge sonrası yakalanan P1: normal kullanıcıların günlük Dosyalar sekmesi owner-only File Hub indeks endpointlerini çağırıyordu.
- P1, PR #103 ile düzeltildi; günlük dosya görünümü artık `/api/mail/files` üzerinden tenant + MAIL izni + kullanıcının modül `canView` ilişkilerine göre scope edilir.
- P1 hotfix production commit: `322362bc35a229f100f0ce6f33025b86cb7d1444`.
- `0050_mail_communication_core.sql` bu sohbet oturumunda production D1'e uygulanamadı; Cloudflare D1 write yetkili aracı mevcut değildi.
- Bu nedenle Mail Core fail-soft çalışır: Mail & Dosyalar arayüzü canlıda önizleme/kurulum bekliyor durumunda açılabilir; mail hesap talebi, bağlantı ve gönderim 0050 uygulanana kadar kapalıdır.
- 0050 aktivasyonu için canonical sıra değişmez: remote D1 full backup -> readiness -> hedefli 0050 additive migration -> schema doğrulaması. GitHub Actions production deploy için kullanılmaz.


## 06.09.2026 — PDKS / İK final ayrım feature paketi hazırlandı

- Branch: `codex/ik-pdks-yillik-izin-final-20260906`.
- İK artık yalnız personel/ücret/finans/bordro/SGK-evrak alanlarını gösterir; puantaj, giriş/çıkış, vardiya, terminal ve izin hareketleri PDKS'nin operasyon alanıdır.
- Personel Kartında yıllık izin özlük özeti tamamlandı: hakediş + devreden = toplam hak; kullanılan; kalan; hizmet yılına göre hakediş geçmişi.
- Yıllık izin kullanılan/kalan hesabı modern PDKS izin planları ile eski izin geçmişini exact duplicate kayıtları çift saymadan birleştirir.
- İK izin geçmişi aynı şekilde modern + tarihsel kayıtları birlikte okur.
- Mevcut production bordro/ödeme fişi ve Mail & Dosyalar kodu korunmuştur; paket güncel production HEAD üzerinden açılmıştır.
- Bordro çıktısı finali aynı branch'te: A4 ödeme listesi okunaklı genişliklere çekildi, HKN adın altına taşındı; EK ayrı sütun olarak kalır. 10'lu A4 fiş korunur ve EK>0 personelde kesilebilir EK ÖDEME kuponu gösterilir.
- Yeni D1 migration yok; production'a henüz merge/deploy edilmedi.
- Sonraki kapı: kontrat/static doğrulama -> kullanıcı gerçek ekran kontrolü -> açık `canlıya al` onayı -> canonical Cloudflare Git Integration yayını.


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


---

## 2026-09-07 — MAIL MERKEZİ / HOTMAIL GEÇİCİ ENTEGRASYON KARARI

Bu karar sonraki mail çalışmalarında kaynak kabul edilecektir.

- Gmail doğrudan Google OAuth + Gmail API ile çalışmaya devam edecek. Mevcut Gmail bağlantısına dokunulmayacak.
- Desen mailbox: `hkndesen@gmail.com`.
- Hotmail/Microsoft kişisel hesap için mevcut doğrudan Microsoft OAuth yolu şimdilik zorlanmayacak.
- Hakan Emprime ana mail: `hkngursu@hotmail.com`.
- Hotmail için tercih edilen ikinci yol yalnız bu hesapta aracı provider kullanmaktır.
- İlk değerlendirilecek aracı: **Nylas**.
- Mimari hedef: `Gmail -> mevcut direkt Google adapter`, `Hotmail -> Nylas Microsoft/Outlook adapter`.
- Nylas katmanı yalnız Hotmail tarafına eklenecek; Gmail kodu, OAuth secretları, senkron mantığı ve çalışan mailbox etkilenmeyecek.
- KY ERP Mail Merkezi tek arayüz olarak kalacak. Kullanıcı iki hesabı aynı posta merkezi içinde görecek.
- Hotmail adapterı şu yetenekleri sağlamadan tamamlandı sayılmayacak: gelen/giden, klasörler, okundu/okunmadı, sil/çöp kutusu, arşiv, taşıma, bayrak/sabitleme eşlemesi, ek indirme/önizleme, gönderim ve güvenli OAuth/token yenileme.
- Provider farkı kullanıcıya mümkün olduğunca gösterilmeyecek; provider-specific hata/log bilgisi yönetim tarafında tutulacak.
- Nylas hesabı açılırken secret/API key değerleri repoya veya sohbete yazılmayacak; Cloudflare secret olarak girilecek.
- Nylas uygun olmazsa ikinci alternatif araştırılacak; Gmail tarafı yine değiştirilmeyecek.
- Bu iş, mevcut Gmail final kontrolleri tamamlandıktan sonra ele alınacak.

### Uygulama sırası

1. Nylas hesabı/projesi oluştur.
2. Hotmail kişisel Microsoft hesabı desteğini ve Hosted OAuth akışını gerçek hesapla doğrula.
3. Gerekli Client ID / API key / callback değerlerini Cloudflare secret olarak tanımla.
4. Worker tarafına provider adapter ekle.
5. Mevcut `mail_accounts`, klasör, mesaj, attachment ve action contractlarını bozmadan Nylas cevabını canonical mail modeline map et.
6. `hkngursu@hotmail.com` hesabını yalnız Nylas üzerinden bağla.
7. Gelen kutusu, gönderilmiş postalar, çöp kutusu, okundu, sil, taşı, ek, gönderim ve token refresh uçtan uca testlerini tamamla.
8. Gmail hesabında regression testi yap; hiçbir davranış değişmediğini doğrula.
9. Sonra production yayını yap ve gerçek Hotmail smoke testi ile kapat.

