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

Final kullanıcı akışı:

`Turnstile -> kullanıcı adı/şifre -> MFA -> session -> ERP`

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
