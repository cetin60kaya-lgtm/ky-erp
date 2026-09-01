# KY ERP — SOHBET KAYNAK KAYDI
## 2026-09-01 — İşNet, Çoklu Firma, Resend Mail, Production Deploy ve Public Site

> Bu belge, bu geliştirme sohbetinde alınan kararları, yapılan düzenlemeleri ve canlıya çıkmadan önce zorunlu kontrolleri proje kaynağı için tek yerde toplar. Kod ile belge çelişirse güncel production branch kodu esas alınır; aşağıdaki mimari/güvenlik kararları kasıtlı olarak değiştirilmedikçe korunmalıdır.

## 1. Canonical proje ve production yolu

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production branch: `codex/model-uretim-kontrol-merkezi-final`
- Canonical Windows deploy: `KY ERP CANLIYA YUKLE.bat`
- Ana deploy scripti: `DEPLOY/KYERP_DIRECT_PRODUCTION.ps1`
- Yerel ana klasör: `D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ`

Kalıcı kural:
- GitHub Actions production yolu ana deploy yolu değildir.
- `git reset --hard` ve `git clean` kullanılmayacak.
- Yerel tracked değişiklik otomatik silinmeyecek.
- D1 için kör/genel migration zinciri çalıştırılmayacak.

## 2. Domain mimarisi

- `https://kyerp.net` → public kurumsal site
- `https://app.kyerp.net` → ERP uygulaması + login
- `https://api.kyerp.net` → Worker API

Public hostlarda `/giris`, `/login`, `/app` ERP uygulamasına yönlenir.

## 3. Public landing / kurumsal site

Ana dosyalar:
- `APP/app/ky-erp-frontend/src/pages/PublicLandingPage.jsx`
- `APP/app/ky-erp-frontend/src/styles/public-landing.css`

Tanıtılan ana modüller:
- PDKS & Personel
- İnsan Kaynakları
- Muhasebe
- e-Fatura / e-İrsaliye / İşNet
- İmalat
- Boyahane
- Desen
- KY ERP Asistan

Kurumsal footer düzeni:
- Public iletişim: `iletisim@kyerp.net`
- Telefon: `+90 542 394 06 54`
- Sistem sender: `KY ERP <admin@kyerp.net>`
- `© 2026 KY ERP. Tüm hakları saklıdır.`
- KVKK / Gizlilik / Kullanım Koşulları / Çerez Politikası başlıkları gerçek sayfalar oluşmadan sahte URL’ye bağlanmamalıdır.

`admin@kyerp.net` sistem göndericisidir. Gelen kutusu olduğu otomatik varsayılmamalıdır. `iletisim@kyerp.net` için gerçek incoming mail istenirse ayrıca Cloudflare Email Routing veya gerçek mailbox sağlayıcısı gerekir.

## 4. CORS / app origin düzeltmesi

Production allowlist:

```ts
const LIVE_ORIGINS = new Set([
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
]);
```

Wildcard CORS kullanılmamalıdır.

Önceki `LEGACY_FRONTEND_ORIGIN_BLOCKED` hatasının sebebi eski frontend-origin blacklist ve stale test sözleşmesiydi. Düzeltilen önceki commitler:

- `009dcd018c164b30cc0d596a2dad7890ff55c288`
- `99fe9f8341840833f73f3a64db1943aff9efc7c7`
- `1594b5bd464273239290eecf5a2ba60d08e79af3`

## 5. Resend / sistem mail mimarisi

Ana dosyalar:
- `DEPLOY/KYERP_RESEND_BOOTSTRAP.ps1`
- `DEPLOY/KYERP_RESEND_BOOTSTRAP_SAFE.ps1`
- `DEPLOY/KYERP_RESEND_ACTIVE_SECRET_REPAIR.ps1`
- `DEPLOY/KYERP_RESEND_ACTIVE_SECRET_REPAIR.bat`
- `APP/cloud/ky-erp-api/wrangler.jsonc`

Canonical sender:
`KY ERP <admin@kyerp.net>`

Resend domain:
`kyerp.net`

Mail bootstrap sırası:
1. Wrangler session kontrolü.
2. Gerekirse standart `wrangler login`.
3. DNS için Wrangler OAuth kullanılmaz.
4. Gerekirse yalnız `kyerp.net` Zone/DNS Edit token istenir.
5. Resend domain kontrol edilir.
6. Domain VERIFIED ise DNS token tekrar istenmez.
7. Gerekli DNS kayıtları kontrollü eklenir; mevcut farklı kaydın üstüne kör yazılmaz.
8. `RESEND_API_KEY` aktif Worker secret olarak yazılır.
9. D1’den owner e-postası okunur.
10. Gerçek test maili atılır.
11. Resend kabul kimliği dönmeden hazır sayılmaz.
12. D1’e `SYSTEM_EMAIL_READY_V1` kanıtı yazılır.

Secret hiçbir zaman chat’e, repoya veya plaintext dosyaya yazılmamalıdır.

## 6. Mail hatasının kök nedeni

Admin > Kullanıcılar > Giriş & MFA ekranındaki:

`Gerçek e-posta servisi bağlı değil; sahte başarı mesajı gösterilmez.`

uyarısı frontend hatası değildi.

Backend capability:
```ts
email: Boolean(c?.env?.RESEND_API_KEY)
```

Bu yüzden uyarı, aktif Worker’ın `RESEND_API_KEY` binding’ini görmediğini gösterir. F5/cache sorunu değildir.

## 7. Wrangler secret kuralı

Canlı standard:
```text
wrangler secret put RESEND_API_KEY
```

Tek başına yeterli olmayan:
```text
wrangler versions secret put RESEND_API_KEY
```

`versions secret put` secret-bearing version oluşturabilir fakat aktif deployment’a otomatik geçirmeyebilir.

Bu hatayı düzelten önemli commit:
`dd4af5d6fedf93ad593804ce0057563effd5ef7b`

Safe wrapper artık canlı command’i değiştirmemeli; sadece standard command’in varlığını doğrulamalıdır.

Global stdin ile her soruya otomatik `Y` basan BAT secret işlemlerinde kullanılmamalıdır. Secret prompt ayrı ve güvenli kalmalıdır.

## 8. Wrangler config hardening

`APP/cloud/ky-erp-api/wrangler.jsonc` içinde `RESEND_API_KEY` production için zorunlu secret olarak kabul edildi.

Amaç:
- Worker source deploy edilirken secret eksikse sessizce geçmemek.
- Sonraki source deploy’da mail binding’inin tekrar kaybolmasını engellemek.

`RECOVERY_EMAIL_FROM = "KY ERP <admin@kyerp.net>"` canonical sender olarak korunur.

## 9. GitHub Actions kararı

Production branch üzerindeki `.github/workflows/production-release.yml` guard-only durumdadır ve bilinçli olarak production deploy yapmaz.

Eski gerçek workflow:
- Worker deploy
- Pages deploy
- D1 backup
- `wrangler d1 migrations apply ...`

yaptığı için mail-only onarımda kullanılmadı.

Kalıcı karar:
Mail/secret onarımı için tüm pending D1 migration zincirini çalıştıran eski Action yeniden kullanılmayacak.

## 10. İşNet outgoing recovery

Ana kaynaklar:
- `APP/cloud/ky-erp-api/src/isnet-outgoing-recovery.ts`
- `APP/cloud/ky-erp-api/src/isnet-outgoing-recovery.test.ts`

Kullanılan kaynaklar:
- `GetSentStagingInvoiceList`
- `GetEArchiveInvoiceList`
- `GetSentStagingDespatchList`
- `AllOutgoingInvoiceByFilter`
- `AllOutgoingDespatchByFilter`

Document tipleri:
- Giden fatura → `CUSTOMER_INVOICE`
- Giden irsaliye → `OUTGOING_DISPATCH`
- Direction → `outgoing`
- Source → `ISNET_OUTGOING_RECOVERY`

## 11. İşNet pagination / partial kuralı

API:
- `API_PAGE_SIZE = 250`
- `API_MAX_PAGES = 20`

Portal:
- `PORTAL_PAGE_SIZE = 300`
- `PORTAL_MAX_START = 5000`

Limit nedeniyle kapsam doğrulanamazsa sessiz completion yasaktır.

Durum:
`PARTIAL_REVIEW_REQUIRED`

Tamamlanmış transport:
`apiComplete || portalComplete`

Eksik pagination, tanımsız kimlik, geçersiz tarih veya persistence problemi varsa yeşil başarı gösterilmemelidir.

## 12. Tarih / tutar / kimlik normalizasyonu

Recovery:
- `YYYY-MM-DD`
- `GG.AA.YYYY`
- Microsoft `/Date(...)`

formatlarını kontrollü canonical tarihe çevirir.

Belge kimliği önceliği:
1. `documentNo`
2. `sourceId`
3. `uuid`

Üçü de yoksa kayıt güvenli persist edilmez ve `unidentifiedSkipped` ile sayılır.

Bir veya daha fazla belge D1’e yazılamazsa:
`ISNET_OUTGOING_PERSIST_PARTIAL`

İşlem tamamlanmış sayılmaz.

## 13. İşNet frontend senkronizasyonu

Frontend service:
`APP/app/ky-erp-frontend/src/services/isnetApi.js`

`startDailySync` şu iki kaynağı birlikte değerlendirir:
- `/isnet/full-sync`
- `/isnet/outgoing/recover`

Amaç:
- portal sync başarılı olsa bile outgoing recovery sorunu varsa gizlememek
- partial sonucu başarı gibi göstermemek
- outgoing invoice / dispatch sayılarını sonuçta göstermek

Accounting clean start:
`2026-08-01`

## 14. İşNet Yönetim Merkezi

Yönetim merkezi:
- connection status
- son sync
- local belge sayısı
- eksik PDF/XML
- muhasebe bekleyen tedarikçi faturaları
- model bekleyen müşteri irsaliyeleri
- gönderilecek irsaliye taslakları
- fiyat bekleyen faturalar
- hata / kontrol gereken işler

gösterir.

`PARTIAL_REVIEW_REQUIRED` sonucu success notice’a çevrilmemelidir.

## 15. Çoklu ana firma / tenant hardening

KY ERP tek firmalık değildir.

Kalıcı mimari:
- Hakan Emprime → İşNet kullanabilir.
- Başka firma → Paraşüt kullanabilir.
- Başka firma → Excel/manual kullanabilir.
- Başka providerlar modül olarak eklenebilir.

Muhasebe çekirdeği provider bağımsızdır.

İşNet credential/token/cookie/state tenant-specific olmalıdır.

Non-owner:
- kendi `mainCompanySlug` bağlamı yoksa fail-closed
- başka tenant slug isterse erişim reddedilir

Owner/admin tenant seçebilir; hedef tenant açıkça belirlenmelidir.

## 16. Eski global İşNet kayıtları

Eski tek-firma dönemindeki:
`json_store.main_company_slug IS NULL`

İşNet kayıtları çoklu firma mimarisinde risklidir.

Eklenen migration:
`APP/cloud/ky-erp-api/migrations/0027_isnet_tenant_scope_backfill.sql`

Amaç:
- legacy global İşNet satırlarını doğru Hakan tenantına bağlamak
- yeni firmaların Hakan İşNet ayarına fallback etmesini engellemek

Migration kör genel zincir ile uygulanmamalıdır.

## 17. Central İşNet tenant guard

Ana Worker shell:
`APP/cloud/ky-erp-api/src/main.ts`

`/api/isnet/*` için merkezi tenant guard eklendi.

Amaç:
- eski endpointlerde kalan `"mecit-hakan"` default fallback’in güvenlik etkisini kesmek
- non-owner tenant izolasyonunu merkezi seviyede zorlamak

Yeni İşNet endpoint yazılırken tenant bağlamı zorunlu olmalıdır. Frontend `"main"` gibi belirsiz fallback üretmemelidir.

## 18. Regression / contract testleri

Korunan ana sözleşmeler:
- `app.kyerp.net` valid production origin
- mail bootstrap `wrangler secret put`
- `versions secret put` canlı secret yerine kullanılmamalı
- system sender `admin@kyerp.net`
- public contact `iletisim@kyerp.net`
- İşNet pagination partial
- İşNet persistence partial
- İşNet tenant boundary
- frontend partial sync başarı gibi görünmemeli

Önemli test dosyaları:
- `APP/cloud/ky-erp-api/src/isnet-outgoing-recovery.test.ts`
- `APP/cloud/ky-erp-api/src/resend-bootstrap-contract.test.ts`
- `APP/cloud/ky-erp-api/src/browser-origin-contract.test.ts`

## 19. Bu sohbetin önemli commit zinciri

Önceki ilgili:
- `2dd5d7545c5d09886fa8f31259baf7fddbc523ed`
- `e8774fc1414e3e94115a9659e6f20488f96e49ba`
- `b9ce002f4f4db245289814f97e3507e5dc6ab860`
- `1307ac00cfb2ca7dac21c31a42600eb4b942128c`
- `a5b014c40372e986929c469ea754b1681a894eb8`
- `da137e1104d23750fd5877dfe747d2ab61219c45`
- `009dcd018c164b30cc0d596a2dad7890ff55c288`
- `99fe9f8341840833f73f3a64db1943aff9efc7c7`
- `1594b5bd464273239290eecf5a2ba60d08e79af3`
- `dd4af5d6fedf93ad593804ce0057563effd5ef7b`

Son geniş düzenleme turu:
- `4712ad01bd6666de4faa83b5317cc7e04d31ac10`
- `6ecd21be69ba7ef197b2bc8582aca7d30bcc5b77`
- `62e524e583b977c7cc19ef044b3833fa865c5293`
- `928c2b5dd06102077c1472e4463f71ca4b8bb4ae`
- `33186f3c9f3c26b33e0cedbf85f721ed0ea1acd6`
- `49479250817831f29c7e60bbf2fc6e36a92f5a3a`
- `9caca7a7bd0df6cc2b2dd5a59e68cf86c2d610c2`
- `1b2f26e032dd723c707582c697b9343e6aed35f7`
- `3d4eb1cb8ddc69d4887c599e29055ac8331d51d4`
- `0fd601b913eff94435c868c56c9312b76e68fec4`
- `346e565932d0628813cd3a1c2ea85b8b973b8cd2`
- `b10b255b168be3417215a00fa7d4f5221e011d5d`
- `59ed743143b495dc93f91af1750ae94c3ff9d3a5`
- `a990a3295ce35e692bc6a5d3a87c6f83cdec2117`
- `39297b0fb5c0ffc1ee42843addc8ce6035dbe517`

Not: Kesin commit→dosya eşlemesi gerektiğinde Git history üzerinden doğrulanmalıdır.

## 20. Canlıya çıkmadan önce zorunlu final kontrol

Kaynak:
- production branch son HEAD tekrar okunmalı
- commit zincirinin branch üzerinde olduğu doğrulanmalı
- tracked working tree temiz olmalı

Worker:
- TypeScript/node testleri
- İşNet outgoing contract
- tenant guard contract
- Resend bootstrap contract
- browser origin contract

Frontend:
- build
- İşNet Management Center render
- partial sync notice
- public landing/footer responsive kontrol

Wrangler:
- config schema
- required secret davranışı
- active deployment `RESEND_API_KEY`

D1:
- blind migrations apply yapılmamalı
- tenant backfill kontrollü uygulanmalı

## 21. Live mail checklist

- [ ] Active Worker `RESEND_API_KEY` görüyor.
- [ ] Kırmızı “gerçek e-posta servisi bağlı değil” uyarısı yok.
- [ ] “Doğrulama Kodu Gönder” aktif.
- [ ] Gerçek Resend çağrısı yapılıyor.
- [ ] Gerçek mail ulaşıyor.
- [ ] Provider message id dönüyor.
- [ ] Kod doğrulaması tamamlanabiliyor.
- [ ] Sahte success yok.

Bunlar olmadan “mail tamamen canlı” denmez.

## 22. Live İşNet checklist

- [ ] Aktif ana firma açık seçili.
- [ ] Hakan tenantında İşNet settings var.
- [ ] Başka tenant Hakan İşNet ayarını okuyamıyor.
- [ ] İşNet connection test başarılı.
- [ ] Dar tarih aralığında full-sync başarılı.
- [ ] Giden fatura recovery çalışıyor.
- [ ] Giden irsaliye recovery çalışıyor.
- [ ] Pagination partial değil.
- [ ] `persistenceErrors=0`.
- [ ] `unidentifiedSkipped=0` veya açık review nedeni var.
- [ ] Frontend partial sonucu success göstermiyor.
- [ ] Muhasebe document tipleri doğru.

## 23. Production smoke test

Kontrol:
- `https://kyerp.net/`
- `https://app.kyerp.net/`
- `https://api.kyerp.net/api/health`

Ayrıca:
- public landing doğru hostta
- app login doğru hostta
- `Origin: https://app.kyerp.net` kabul ediliyor
- auth/MFA çalışıyor
- İşNet tenant hatası yok
- admin mail capability aktif
- footer iletişim bilgileri doğru

## 24. Kalıcı “bir daha bozma” kuralları

1. KY ERP çoklu ana firma sistemidir.
2. Muhasebe çekirdeği provider bağımsızdır.
3. İşNet firma bazlı provider/modüldür.
4. Paraşüt vb. aynı modüler prensiple eklenir.
5. Excel/manual firma desteklenir.
6. Provider credential’ı global singleton olmaz.
7. İşNet token/cookie/state tenant dışına taşmaz.
8. Domain ayrımı korunur.
9. Canonical production Windows BAT’tır.
10. Secret chat/repo/plaintext dosyaya yazılmaz.
11. Mail yoksa UI sahte başarı göstermez.
12. Partial İşNet sync success sayılmaz.
13. D1 blind reset/migration yapılmaz.
14. Global auto-Y secret promptlarında kullanılmaz.

## 25. Son durum

```text
SOURCE CHANGES       : REPOYA COMMITLENMİŞ
FINAL TEST & BUILD   : TEKRAR ÇALIŞTIRILMALI
LIVE RESEND SECRET   : AKTİF WORKER'DA DOĞRULANMALI
LIVE MAIL DELIVERY   : GERÇEK MAIL İLE KANITLANMALI
ISNET TENANT BACKFILL: KONTROLLÜ PRODUCTION UYGULAMASI GEREKİR
FULL PRODUCTION DONE : HENÜZ İDDİA EDİLMEZ
```

Belge tarihi: `2026-09-01`  
Proje: `KY ERP`  
Kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
