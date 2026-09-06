# KY ERP — CANLI YAYIN + BİLDİRİM MERKEZİ ANA KAYNAĞI
## 06.09.2026

**Repo:** `cetin60kaya-lgtm/ky-erp`  
**Canonical production branch:** `codex/model-uretim-kontrol-merkezi-final`  
**Public site:** `https://kyerp.net`  
**ERP:** `https://app.kyerp.net`  
**API:** `https://api.kyerp.net`

Bu dosya 06.09.2026 itibarıyla KY ERP'nin **production canlıya alma** ve **uygulama bildirim merkezi** için güncel devam kaynağıdır. Yeni sohbet/ajan önce `AGENTS.md`, sonra `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`, sonra bu dosyayı okumalıdır.

---

# 1. KESİN CANLIYA ALMA KURALI

## Canonical yol

`GitHub production source branch push -> Cloudflare Git Integration -> Cloudflare Pages / Workers Builds -> production`

### Frontend
- Cloudflare Pages projesi: `ky-erp-frontend`
- Production branch: `codex/model-uretim-kontrol-merkezi-final`
- Root: `APP/app/ky-erp-frontend`
- Build: `npm run build`
- Output: `dist`
- Production API: `https://api.kyerp.net`

### Worker
- Cloudflare Worker: `ky-erp-api`
- Production branch: `codex/model-uretim-kontrol-merkezi-final`
- Root: `APP/cloud/ky-erp-api`
- Build: `npm run typecheck && npm test && npm run build`
- Deploy command: `npm run deploy`

## GitHub Actions kararı

**Production canlıya alma için GitHub Actions kullanılmayacaktır.**

- `.github/workflows/production-release.yml` ve diğer workflow'lar production deploy yolu değildir.
- Normal release/hotfix sırasında GitHub Actions production workflow'u tetiklenmez.
- Gerektiğinde yalnız açık kullanıcı isteğiyle tanılama/test amaçlı manual workflow çalıştırılabilir; bu production deploy yerine geçmez.
- Canlı deploy başarı iddiası Cloudflare Pages / Workers Builds ve canlı endpoint doğrulamasıyla yapılır.
- Eski Windows `KY ERP CANLIYA YUKLE.bat` / direct deploy scriptleri canonical otomatik yayın yolu değildir; bakım/geri dönüş referansı olarak kalabilir.

## D1 migration ayrı güvenlik kapısıdır

Cloudflare Git Integration kodu otomatik yayınlayabilir; D1 schema write otomatik deploy'a bırakılmaz.

Migration varsa sıra:
1. remote production D1 tam backup,
2. schema readiness,
3. yalnız hedefli/additive migration,
4. schema audit,
5. production branch push / Worker deploy,
6. frontend deploy,
7. canlı health/auth/modül kontrolü.

Yasak:
- D1 reset,
- kör DROP,
- blind `migrations apply`,
- test datasını production'a yazma,
- backup olmadan schema write.

---

# 2. 06.09.2026 BİLDİRİM MERKEZİ KÖK NEDENİ

Uygulamanın sağ üstündeki zil ikonunda görünen **3** sayısı gerçek sistemden gelmiyordu.

Kök neden:

`APP/app/ky-erp-frontend/src/layouts/AppShellV3.jsx`

içinde sabit:

`<span>3</span>`

kullanılıyordu.

Bu nedenle bildirim yokken bile ekranda 3 görünüyordu.

---

# 3. BİLDİRİM MERKEZİ FINAL DAVRANIŞI

Bildirim rozeti artık gerçek veriye bağlıdır.

- Gerçek okunmamış bildirim yoksa rozet görünmez.
- Bildirim varsa gerçek `unreadCount` gösterilir.
- 99'dan fazla ise `99+`.
- Zile tıklanınca gerçek Bildirim Merkezi paneli açılır.
- Panel firma/tenant ve kullanıcı modül yetkilerine göre veri gösterir.
- Okundu durumu kullanıcı + firma bazında saklanır.
- Yeni gerçek olay oluşursa tekrar okunmamış olur.
- 60 saniyede bir ve pencere tekrar focus olduğunda güncellenir.
- API kaynaklarından biri geçici hata verirse panel sahte başarı göstermez; kısmi veri uyarısı verir.

## İlk canlı kaynaklar

### 1. Güvenlik / Giriş Onayları
Kaynak: `auth_login_approvals`

Koşul:
- status = PENDING,
- süresi dolmamış,
- doğru tenant,
- kullanıcı owner/company-admin veya onay yetkili.

Tıklama:
`Yönetim -> Giriş Onayları`

### 2. e-Belge Onay / Sorunlar
Kaynak:
- `accounting_documents`
- `accounting_document_issues`

Koşul:
- açık / çözülmemiş belge sorunu,
- doğru tenant,
- ISNET / BELGE_ISLEM / MUHASEBE görüntüleme yetkisi.

Tıklama:
`e-Belge Merkezi -> Onay / Sorunlar`

### 3. Ödeme Hatırlatmaları
Kaynak: `accounting_payment_plans`

Koşul:
- PAID/CANCELLED değil,
- vadesi gelmiş/geçmiş veya aktif reminder zamanı gelmiş,
- doğru tenant,
- Muhasebe / Çek-Ödeme yetkisi.

Tıklama:
`Muhasebe -> Çek / Ödeme`

---

# 4. BİLDİRİM OKUNDU DURUMU

Yeni D1 migration gerektirilmedi.

Mevcut `json_store` ortak store kullanılır:

- scope: `SYSTEM_NOTIFICATIONS_READ_V1`
- key/id: kullanıcı + tenant bazlı
- yalnız desteklenen gerçek notification id'leri saklanır
- maksimum 1000 read id tutulur

Bu tercih canlıya alma sırasında gereksiz D1 migration riskini önler.

---

# 5. BİLDİRİM API

Yeni canonical endpointler:

- `GET /api/notifications`
- `POST /api/notifications/read`

Kurallar:
- auth zorunlu,
- tenant fail-closed,
- başka tenant verisi okunmaz,
- modül yetkisi olmayan kaynağın bildirimi gösterilmez,
- DENETIM özel read-only kuralı korunur,
- notification write yalnız okundu bilgisidir; işletme kaydı değiştirmez.

---

# 6. DEĞİŞEN ANA DOSYALAR

Backend:
- `APP/cloud/ky-erp-api/src/notifications-cloud.ts`
- `APP/cloud/ky-erp-api/src/notifications-cloud.test.ts`
- `APP/cloud/ky-erp-api/src/main.ts`

Frontend:
- `APP/app/ky-erp-frontend/src/services/notificationApi.js`
- `APP/app/ky-erp-frontend/src/layouts/AppShellV3.jsx`
- `APP/app/ky-erp-frontend/src/layouts/AppShellV3.notification.test.js`
- `APP/app/ky-erp-frontend/src/styles/shell-v3.css`

---

# 7. CANLI DOĞRULAMA KRİTERİ

Canlı tamamlandı denmesi için:

1. Production branch yeni commit'i içeriyor.
2. Cloudflare Pages production build başarılı.
3. Cloudflare Workers Build başarılı.
4. `https://api.kyerp.net/api/health` -> ok.
5. `app.kyerp.net` yeni asset sürümünü veriyor.
6. Zilde sabit 3 görünmüyor.
7. Gerçek bildirim yoksa badge yok.
8. Gerçek pending kayıt varsa doğru sayı geliyor.
9. Zile tıklayınca panel açılıyor.
10. Bildirime tıklayınca doğru modül/sekme açılıyor.
11. Okundu işareti sonrası unreadCount düşüyor.
12. Firma değişince tenant bildirimleri yenileniyor.

---

# 8. YENİ SOHBET KURALI

Yeni KY ERP sohbetinde deploy sorusu gelirse şu cümle kesin kabul edilir:

> **Production deploy GitHub Actions ile yapılmaz. Canonical yayın production branch -> Cloudflare Git Integration -> Pages / Workers Builds yoludur. D1 migration varsa backup + hedefli migration ayrı güvenlik kapısıdır.**

Bildirim sorusu gelirse:

> **Sağ üst zil gerçek notification API'ye bağlıdır; sabit sayaç kullanılmaz. Bildirimler tenant + kullanıcı yetkisine göre Güvenlik, e-Belge ve Ödeme kaynaklarından üretilir.**

Secret/API key/token bu dosyaya yazılmaz.
