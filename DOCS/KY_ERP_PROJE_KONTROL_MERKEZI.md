# KY ERP — PROJE KONTROL MERKEZİ

> Bu dosya KY ERP projesinde yeni sohbet, yeni ajan, yeni feature branch veya yeniden başlama durumunda **ilk okunacak güncel durum kaydıdır**. `main` branch kod için canonical değildir; gerçek production kaynak branch `codex/model-uretim-kontrol-merkezi-final` dalıdır. Teknik ve güvenlik kuralları için o branch'teki `AGENTS.md` üstündür.

## Zorunlu başlangıç

1. Gerçek production kaynak branch'i doğrula: `codex/model-uretim-kontrol-merkezi-final`.
2. O branch'teki `AGENTS.md` dosyasını oku.
3. Bu kontrol merkezinin aktif feature branch üzerindeki daha yeni kopyası varsa aktif iş için onu oku.
4. Kullanıcı açıkça onaylamadan production merge/deploy yapma.

## Sabit proje kimliği

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
- Public site: `https://kyerp.net`
- ERP uygulaması: `https://app.kyerp.net`
- Canlı API: `https://api.kyerp.net`
- Frontend: `APP/app/ky-erp-frontend`
- Cloudflare API/Worker: `APP/cloud/ky-erp-api`
- Windows Desktop: `APP/desktop/ky-pdks`
- File Hub Agent: `tools/file-hub-agent`

## 03.09.2026 ana çalışma kararı

**KY ERP Desktop = geliştirme sonrası ilk gerçek kontrol ortamı.**

**GitHub = ana kaynak kodu, geçmiş ve güvenlik/yedek merkezi.**

**kyerp.net = yalnız Desktop'ta kullanıcı tarafından kontrol edilip onaylanan değişikliklerin yayınlandığı canlı ortam.**

Akış:

`Kullanıcı isteği -> GitHub feature branch -> otomatik test/build -> KY ERP Desktop -> kullanıcı kontrolü -> revizyon -> kullanıcı onayı -> production/web`

- Canlı `kyerp.net` üzerinde geliştirme/deneme yapılmaz.
- Kullanıcı GitHub veya VS Code ile manuel uğraştırılmaz.
- VS Code zorunlu senkron çalışma bağı değildir.
- Desktop otomatik `Güncelle ve yeniden başlat` mekanizması planlanmıştır; 03.09.2026 itibarıyla henüz tamamlanmış sayılmaz.

## Aktif Desktop işi

- Branch: `codex/ky-erp-desktop-final-20260903`
- Draft PR: `#56 — KY ERP Desktop 1.7.2 — tam Windows ERP uygulaması`
- Kullanıcı 03.09.2026 tarihinde Desktop 1.7.2'nin açıldığını ve gerçek ERP oturumunun çalıştığını ekran görüntüsüyle doğruladı.
- PR #56 kullanıcı kontrolü tamamlanmadan production'a merge edilmeyecek.

### Desktop 1.7.x kök neden kaydı

- `1.7.0`: sanal host kökünde `ERR_ACCESS_DENIED`.
- `1.7.1`: `index.html` açıldı fakat `http://localhost` origin canlı giriş API'sinde CORS/transport hatası üretti.
- `1.7.2`: canonical `https://app.kyerp.net/index.html` origin'i kullanıldı; açılış ve canlı API giriş akışı birlikte çalıştı.

## Kullanıcının özellikle istediği kontrol

İlk ayrıntılı kontrol: **İK > Günlük Giriş / günlükçü girişi**.

Masaüstünde bu ekran webdeki canonical frontend ile **bire bir aynı** olacak; ayrı masaüstü tasarımı veya ayrı iş akışı yapılmayacak.

İK günlük ana ekranları:
- Günlük Giriş
- Günlük Personel Kartları
- Haftalık Özet
- Günlük Ödeme Fişleri

## Desktop ana kapsamı

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

PDKS kart cihazı `KYERP.PDKS.Agent` Windows servisiyle korunur. File Hub providerları `GOOGLE_DRIVE`, `ONEDRIVE`, `SHAREPOINT`, `LOCAL_FOLDER`, `NAS` modelindedir; provider/path modüllere sabit kodlanmaz.

## Kontrol-yayın kuralı

1. Feature branch değişikliği.
2. Test/lint/build.
3. Desktop paket/güncelleme.
4. Kullanıcı gerçek kullanım kontrolü.
5. Revizyon.
6. Açık kullanıcı onayı.
7. Production merge/deploy.
8. Canlı smoke/health/auth/modül kontrolü.

**Desktop'ta çalıştı = otomatik production onayı değildir.**

## Bu dosya ne zaman güncellenir?

- yeni kalıcı kullanıcı kararı,
- önemli mimari karar,
- doğrulanan Desktop sürümü,
- modül onayı,
- blocker,
- branch/PR yön değişikliği,
- production'a geçiş kararı.

Şifre, MFA secret, API key, token veya kişisel gizli bilgiler yazılmaz.

## Tarihsel yardımcı kaynaklar

- Canonical branch `AGENTS.md`
- `DOCS/AGENTS_RULES_BASE_PRE_STORAGE_20260902.md`
- `DOCS/KY_ERP_SOHBET_KAYNAK_KAYDI_2026-09-01.md`
- `CHANGELOG.md`

**Son güncelleme: 03.09.2026 — Desktop-first kontrol düzeni ve GitHub proje devam merkezi kesinleştirildi.**
