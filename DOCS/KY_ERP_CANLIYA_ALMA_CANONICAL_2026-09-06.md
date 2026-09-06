# KY ERP — CANONICAL CANLIYA ALMA SÖZLEŞMESİ
## 06.09.2026

**Repo:** `cetin60kaya-lgtm/ky-erp`  
**Production branch:** `codex/model-uretim-kontrol-merkezi-final`  
**Frontend:** Cloudflare Pages `ky-erp-frontend`  
**Worker/API:** Cloudflare Worker `ky-erp-api`  
**ERP:** `https://app.kyerp.net`  
**API:** `https://api.kyerp.net`

Bu dosya KY ERP için **tek canonical production yayın prosedürüdür**. Yeni sohbet, ajan veya devam eden iş canlıya alma kararı verirken önce `AGENTS.md`, sonra `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`, sonra bu dosyayı okumalıdır.

---

# 1. KESİN YAYIN YOLU

Normal production release yolu:

`feature branch -> test/build -> kullanıcı onayı -> production branch merge -> Cloudflare Git Integration -> Pages + Workers Builds -> canlı doğrulama`

## Frontend / Pages

- Proje: `ky-erp-frontend`
- Production branch: `codex/model-uretim-kontrol-merkezi-final`
- Root: `APP/app/ky-erp-frontend`
- Build: `npm run build`
- Output: `dist`

## Worker / API

- Worker: `ky-erp-api`
- Production branch: `codex/model-uretim-kontrol-merkezi-final`
- Root: `APP/cloud/ky-erp-api`
- Build kapısı:
  `npm run typecheck && npm test && npm run build`
- Deploy:
  `npm run deploy`

**Worker deploy yalnız build kapısı tamamen başarılıysa gerçekleşir.** Test veya typecheck kırılırsa release başarısız kabul edilir ve Worker canlıya çıkmaz.

---

# 2. POWERSHELL NORMAL RELEASE YOLU DEĞİLDİR

Normal bir "canlıya al" işleminde kullanıcıdan:

- Cloudflare token isteme,
- PowerShell açtırma,
- manuel Pages deployment başlatma,
- manuel Worker build/deploy başlatma,
- Wrangler direct deploy çalıştırma

**istenmez.**

PowerShell veya Cloudflare API ile manuel müdahale yalnız:

- Git Integration arızası,
- build tetiklenmeme teşhisi,
- Cloudflare altyapı ayarı,
- kontrollü incident/recovery

gibi istisnai durumlarda kullanılır.

Bir build otomatik oluşmuşsa onu bypass etmek için manuel deploy yapılmaz.

---

# 3. GITHUB ACTIONS PRODUCTION YOLU DEĞİLDİR

- Production deploy için GitHub Actions kullanılmaz.
- Workflow dosyaları varsayılan olarak `workflow_dispatch` / manual-only kalır.
- Kullanıcı açıkça istemeden production branch push, PR, workflow_run veya schedule ile otomatik Actions zinciri kurulmaz.
- GitHub Actions yalnız açık kullanıcı talebiyle tanılama/test amacıyla kullanılabilir.
- Production deploy otoritesi Cloudflare Git Integration'dır.

---

# 4. PRODUCTION BRANCH İLERLERSE ESKİ COMMIT'E DÖNÜLMEZ

Paralel sohbetler production branch'e yeni commit ekleyebilir.

Kurallar:

1. Merge/deploy öncesi production HEAD tekrar doğrulanır.
2. Production branch ilerlemişse eski SHA körlemesine deploy edilmez.
3. Yeni HEAD içinde ilgili değişikliğin hâlâ bulunduğu teyit edilir.
4. Normal release'te Cloudflare en güncel production branch commitini build eder.
5. Eski commit pinleme yalnız bilinçli rollback veya açıkça tanımlanmış özel release senaryosunda yapılır.

Bu kural paralel KY ERP sohbetlerinin birbirinin işini geri almasını önler.

---

# 5. PAGES BAŞARILI + WORKER BAŞARISIZ = RELEASE TAMAM DEĞİL

Cloudflare Pages ve Worker birbirinden bağımsız build olabilir.

Örnek:

- Pages: success
- Worker: fail

Bu durumda:

- frontend yeni sürüme çıkmış olabilir,
- backend eski sürümde kalmış olabilir,
- release **kısmi / başarısız** kabul edilir.

"Canlı tamam" denmesi için ilgili release'in gerekli tüm bileşenleri başarılı olmalıdır.

Özellikle auth/API contract değişikliklerinde frontend ve Worker birlikte doğrulanmadan release tamam sayılmaz.

---

# 6. WORKER BUILD FAIL OLURSA YAPILACAKLAR

**Doğru sıra:**

1. Cloudflare Workers Build logunu oku.
2. İlk gerçek kök nedeni bul.
3. Manuel deploy ile test kapısını bypass etme.
4. Kaynak kodu feature branch üzerinde düzelt.
5. İlgili regression/contract testini ekle veya güncelle.
6. Production'a normal PR/merge ile taşı.
7. Yeni production commitinin Cloudflare tarafından otomatik build edilmesini bekle.
8. Yeni build success olmadan canlı tamam deme.

06.09.2026 doğrulanmış örnek:

- Worker build otomatik tetiklendi.
- `notifications-cloud.test.ts` Node ESM çözümlemesinde
  `ERR_MODULE_NOT_FOUND` verdi.
- Kök neden extensionless TypeScript relative import idi.
- Importlar explicit `.ts` yapıldı ve kontrat testi eklendi.
- Doğru çözüm manuel deploy değil, kaynak düzeltmesi oldu.

---

# 7. D1 MIGRATION NORMAL AUTO-DEPLOY'DAN AYRIDIR

Cloudflare Git Integration kodu otomatik yayınlayabilir; **production D1 schema write otomatik release'in parçası değildir.**

Migration varsa güvenlik kapısı:

1. remote production D1 full backup,
2. schema/readiness kontrolü,
3. yalnız hedefli ve additive migration,
4. schema doğrulaması,
5. production kod merge,
6. Worker/Pages deploy,
7. canlı smoke.

Yasak:

- D1 reset,
- kör DROP,
- backup olmadan migration,
- blind full migration apply,
- production'a test datası yazma.

---

# 8. CANLI DOĞRULAMA STANDARDI

Release türüne göre ilgili kontroller yapılır. Minimum:

1. Production branch beklenen değişikliği içeriyor.
2. Pages build gerekiyorsa success.
3. Worker build gerekiyorsa success.
4. `https://api.kyerp.net/api/health` -> OK.
5. Auth değiştiyse `/api/auth/status` ve login/MFA contract kontrolü.
6. Frontend değiştiyse canlı asset yeni bundle'ı içeriyor.
7. CORS / tenant / permission guard bozulmamış.
8. Değişen modülün gerçek canlı smoke testi yapılmış.
9. Kısmi deploy varsa açıkça belirtilmiş; "tamam" denmemiş.

---

# 9. AUTH / GÜVENLİK RELEASELERİNDE EK KURAL

- Turnstile frontend + server-side doğrulama birlikte korunur.
- Owner/admin MFA zorunludur.
- Uygulama sahibi için kalıcı browser restore kapalıdır.
- Owner otomatik rolling refresh kapalıdır.
- Normal kullanıcı session davranışı owner düzeni nedeniyle bozulmaz.
- Auth frontend ve Worker aynı contractı kullanmadan release tamam kabul edilmez.

---

# 10. YENİ SOHBETLER İÇİN KISA KURAL

Yeni bir KY ERP sohbeti "canlıya al" dediğinde varsayılan davranış:

> **PowerShell isteme. Production deploy için GitHub Actions kullanma. Güncel production HEAD'i doğrula. Kullanıcı onaylı değişikliği production branch'e merge et. Cloudflare Git Integration'ın Pages/Workers buildlerini takip et. Worker test kapısı kırılırsa logu oku ve kaynağı düzelt; manuel deploy ile bypass etme. D1 migration varsa ayrı backup/readiness kapısı uygula. Pages + Worker + canlı smoke tamamlanmadan release'i başarılı sayma.**

---

# 11. SECRET KURALI

API token, Turnstile secret, MFA secret, recovery cevabı, şifre veya başka gizli değer:

- repoya yazılmaz,
- markdown kaynağa yazılmaz,
- loga yazılmaz,
- sohbet içinde istenmez/gösterilmez.

---

# 12. İŞ BİTİŞ RAPORU

Her production release sonunda kısa olarak:

- production commit SHA,
- Pages sonucu,
- Worker sonucu,
- test/build sonucu,
- canlı health/smoke sonucu,
- varsa blocker/kısmi deploy

raporlanır.

**Normal release tamamlandığında kullanıcıdan ek terminal/PowerShell işlemi beklenmez.**
