# KY ERP — Cloudflare Pro Security Rollout — 06.09.2026

**Branch:** `codex/cloudflare-pro-security-rollout-20260906`  
**Production branch:** `codex/model-uretim-kontrol-merkezi-final`  
**Production HEAD at start:** `eb5b406ff6c2577fdfe14a5da1b55c58dbb53b6e`

Bu dosya 06.09.2026 handoff kararını ve Cloudflare'ın güncel Pro plan kısıtlarını teknik rollout kaydı olarak tutar. Secret/token değeri bu dosyaya, GitHub'a veya loga yazılmaz.

## 1. Production doğrulaması

Başlangıçta GitHub production branch doğrudan GitHub Branch API ile doğrulandı.

Sonuç:

```text
codex/model-uretim-kontrol-merkezi-final
HEAD eb5b406ff6c2577fdfe14a5da1b55c58dbb53b6e
docs: save Cloudflare Pro continuation checkpoint
```

`AGENTS.md`, `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`, `DOCS/KY_ERP_CLOUDFLARE_PRO_AI_YAYIN_KAYNAGI_2026-09-04.md` production branch üzerinden tekrar okundu.

## 2. Management token canonical kararı

Yeni handoff daha güncel olduğu için token adı:

`KY ERP Pro Otomasyon`

Token normal kullanıcı profili üzerinden oluşturulan **user-scoped API token** olmalıdır. Workers Builds API account-owned token kabul etmez.

Resource scope:

- Account: yalnız KY ERP'nin bulunduğu Cloudflare hesabı.
- Zone: yalnız `kyerp.net`.
- All zones kullanılmaz.
- İlk kurulumda IP filter boş bırakılabilir.
- Sürekli otomasyon için TTL boş bırakılabilir.
- Token değeri chat/repo/plaintext dosyaya yazılmaz.

### Account izinleri

- Workers Builds Configuration — Edit
- Workers Scripts — Edit
- Workers CI — Edit, yalnız gerçekten gerekiyorsa
- Cloudflare Pages — Edit
- Workers AI — Edit
- AI Gateway — Read
- AI Gateway — Edit
- AI Gateway — Run
- Vectorize — Edit
- Queues — Edit
- Turnstile — Edit
- Workers R2 Storage — Edit
- D1 — **Read only**
- Account Analytics — Read
- Account Settings — Read
- Account Rulesets — Edit
- Account Filter Lists — Edit
- Email Routing Addresses — Edit

### Zone izinleri

- Zone — Read
- Zone Settings — Edit
- Zone WAF — Edit
- Bot Management — Edit
- Cache Rules — Edit
- Cache Purge
- Config Rules — Edit
- Firewall Services — Edit
- Analytics — Read
- Email Routing Rules — Edit

### Verilmeyecekler

- Billing Edit
- API Tokens Edit
- Account Members Edit
- DNS Edit
- D1 Edit
- Global API Key
- gereksiz Zero Trust PII yetkileri

Not: 04.09 kaynak dosyasında D1 Edit yazıyordu. 06.09 handoff bunu açıkça **D1 Read** olarak daralttığı için yeni rollout bu daha sıkı kararı kullanır.

## 3. Cloudflare Pro rate-limit gerçeği

Cloudflare Pro planında zone seviyesinde rate limiting kullanılacaktır. Account-level rate limiting Enterprise özelliğidir.

Pro planın güncel sınırı: **2 rate limiting rule**.

Bu nedenle ilk production düzeni:

1. `/api/auth/login`
   - IP bazlı
   - 10 istek / 60 saniye
   - 60 saniye block
2. `/api/auth/mfa/*` + `/api/auth/recovery*`
   - tek güvenli auth-sensitive kuralında birleşir
   - IP bazlı
   - 6 istek / 60 saniye
   - 60 saniye block

`/api/ai/*` için üçüncü Cloudflare rate-limit kuralı Pro limitine sığmadığından ilk aşamada mevcut backend AI usage/metering korunur.

Pro plan kural expression alanlarında method alanına güvenilmez; bu nedenle login kuralı host + path ile sınırlandırılır.

## 4. WAF rollout

İlk aşama:

- Cloudflare Managed Ruleset
- Cloudflare OWASP Core Ruleset

her ikisi de **observe/log** ile başlatılır.

Araç mevcut enforce/default kuralını log seviyesine düşürmez. Daha güçlü mevcut kural varsa dokunmadan bırakır.

OWASP false-positive riski nedeniyle log gözlem sonrası gerektiğinde override/exception ile sıkılaştırılır.

## 5. Cache

Production frontend kaynak kuralı zaten:

- `/` no-store
- `/index.html` no-store
- `/assets/*` immutable long cache

Cloudflare zone tarafında ayrıca:

`api.kyerp.net/api/* -> cache bypass`

kuralı oluşturulur.

Bu kural auth, İK, Muhasebe, e-Belge, İşNet ve diğer hassas JSON endpointlerinin edge cache'e alınmasını engeller.

## 6. Güvenli rollout aracı

Yeni dosyalar:

- `tools/cloudflare/kyerp-pro-security.mjs`
- `tools/cloudflare/kyerp-pro-security.test.mjs`
- `DEPLOY/KYERP_CLOUDFLARE_PRO_SECURITY_V1.ps1`

PowerShell wrapper tokenı:

- environment variable varsa onu kullanır,
- yoksa `Read-Host -AsSecureString` ile ekranda göstermeden ister,
- dosyaya yazmaz,
- iş bitince kendi oluşturduğu environment değerini temizler.

### Modlar

`audit`
- read-only
- token verify
- zone/account discovery
- WAF/rate-limit/cache mevcut state raporu

`observe`
- audit +
- eksik Cloudflare Managed WAF'i log modunda ekler
- eksik OWASP'i log modunda ekler
- `/api/*` cache bypass ekler
- mevcut daha güçlü WAF kuralını zayıflatmaz

`enforce`
- observe +
- iki Pro auth rate-limit kuralını kurar/günceller
- plan kapasitesi aşılacaksa write başlamadan hata verir

## 7. Test

Yerel Node 22 ile:

```text
node --check tools/cloudflare/kyerp-pro-security.mjs
node --test tools/cloudflare/kyerp-pro-security.test.mjs
```

Sonuç: 7 test / 7 başarılı.

Kontrol edilenler:

- Pro için yalnız iki rate-limit kuralı
- MFA + recovery birleşimi
- API cache bypass
- WAF log override
- rate-limit kapasite guard
- exact active zone discovery
- bearer token API header davranışı

## 8. Sonraki adım

1. Kullanıcı Cloudflare panelinde `KY ERP Pro Otomasyon` user-scoped tokenını oluşturur.
2. Token değeri chat'e yazılmaz.
3. Önce `audit`.
4. Mevcut kurallar incelenir.
5. Sonra `observe`.
6. Security Analytics/WAF eventleri kontrol edilir.
7. Sonra auth rate limitleri `enforce`.
8. PDKS / File Agent / OAuth callback / mobil API smoke doğrulanır.
9. Ardından Turnstile + AI Gateway aşamasına geçilir.

Production merge/deploy bu branch hazırlanmış diye otomatik yapılmaz.
