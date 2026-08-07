# KY ERP Kod Sağlığı Raporu

Son güncelleme: 2026-08-07

Dal: `agent/uretim-tek-merkez`

Canlı API: `https://api.kyerp.net`

## Yönetici özeti

- Canlı Worker kimliği gerçek çok-firmalı modele geçirildi: global kullanıcı, firma üyeliği, firma-bazlı izin, sunucu oturumu ve doğrulanmış aktif tenant birbirinden ayrıldı.
- `admin` platform yöneticisidir; firma üyeliği gerekmez. Firma operasyonuna geçiş yeni tenant tokenı üretir.
- Firma kullanıcısının query/body içine farklı slug yazması veri kapsamını değiştiremez. Worker yalnız doğrulanmış `X-KYERP-Tenant-Slug` bağlamını kullanır.
- Frontend’teki imzasız `alg:none` admin tokenı ve `admin/2582` kısa yolu kaldırıldı. Nest backend veritabanı yokken fail-closed davranır.
- D1 Time Travel geri dönüş bookmark’ı migration öncesinde alındı. Muhasebe, İşNet, Desen, Boyahane ve İmalat canlı satırlarına yazılmadı.
- İK sayıları migration öncesi ve sonrası değişmedi: 18 aylık personel, 155 günlük personel, 1360 devam, 37 bordro.

## Build ve test

| Kontrol | Sonuç |
| --- | --- |
| Worker TypeScript | Geçti |
| Worker birim testleri | 8/8 geçti |
| Tenant auth yerel entegrasyon | 14/14 geçti |
| Worker dry-run build | Geçti |
| Worker production deploy | Geçti |
| Nest Prisma üretimi | Geçti |
| Nest production build | Geçti |
| Frontend ESLint | Geçti, 0 warning |
| Frontend production build | Geçti |
| Worker production bağımlılık audit’i | 0 bulgu |
| Frontend production bağımlılık audit’i | 0 bulgu |

Yerel entegrasyon senaryoları admin/firma login, yanlış parola, eski parola reddi, pasif kullanıcı, pasif firma, admin firma listesi ve firma geçişi, normal kullanıcının admin rotasına erişememesi, forged tenant header ve doğrudan cross-tenant kayıt ID erişimini kapsar.

## D1 ve tenant kapsamı

Yeni tablolar:

- `user_company_memberships`
- `user_company_permissions`
- `auth_sessions`
- `auth_mfa_methods`
- `auth_activity_logs`

Geliştirilen tablolar:

- `auth_users`: e-posta, yedek e-posta, platform rolü
- `main_companies`: kod, yasal ad, vergi, iletişim, adres ve logo alanları

204 tenant kapsamı salt-okunur tarandı. Canonical değerler dışında kalan mevcut kayıtlar:

- `hr_daily_work_entries`: `hakan-mecit`, 4 satır
- `shared_models`: `hakan-mecit`, 1 satır
- `json_store`: boş 7, `hakan-mecit` 9, `mecit-hakan-gursu` 40 satır
- `document_folder_settings` ve `document_intakes`: toplam 4 null `main_company_id`

Bu satırlar tahmine dayalı toplu UPDATE ile değiştirilmedi. Ayrı veri sahipliği incelemesi yapılmadan operasyon tablolarında normalizasyon uygulanmamalıdır.

## Güvenlik

- JWT yalnız HS256 kabul eder; `alg:none`, bozuk imza ve süresi geçmiş token reddedilir.
- Oturum D1’de tutulur; kullanıcı pasife alındığında veya parola sıfırlandığında açık oturumlar iptal edilir.
- Firma değişimi eski oturumu iptal edip yeni session/token üretir.
- Platform rolü ile firma rolü ayrıdır. Firma kullanıcısı platform admin rotalarına erişemez.
- CORS allowlist’i canlı, local ve kontrollü Pages preview originleriyle sınırlıdır.
- Worker JWT anahtarı yalnız Cloudflare secret olarak bulunur. Cloudflare tokenı yalnız ortam değişkeninden kullanılır.
- Admin panelinde firma silme fiziksel DELETE yerine pasife alma olarak uygulanır.
- MFA şeması `AUTHENTICATOR/TOTP` ve e-posta kodu modeline hazırdır; MFA henüz etkin değildir.

## Şema ve bakım riskleri

- Yerel gerçek SQLite ile D1’in kimlik şeması migration uygulanana kadar farklıdır. D1 canonical canlı kaynak olarak güncellendi; yerel SQLite’a otomatik yazılmadı.
- Worker’da eski uyumluluk nedeniyle aynı method/path için birden çok route kaydı bulunan Boyahane ve İşNet alanları vardır. Davranış bu çalışmada değiştirilmedi.
- Bazı büyük frontend chunkları sürüyor: İK, ana CSS, React vendor ve ana uygulama bundle’ı. Lazy loading mevcut olsa da alt ekran bazlı bölme performansı iyileştirebilir.
- Nest backend Prisma modeli tenant tablolarına hazırlandı; canlı güvenlik sınırı Worker’dadır. Yerel Nest çalışma zamanı için aynı session/tenant middleware’inin ayrı regresyon işiyle tamamlanması önerilir.
- Wrangler’ın geliştirme bağımlılık zincirindeki güncel `undici` uyarısı override ile giderildi; production audit temizdir.

## Kalan işler

1. Cloudflare Pages production deployu için tokena `Account → Cloudflare Pages → Edit` izni verilmelidir.
2. Admin ve HKN parolaları güvenli terminal scriptiyle girilip canlı login/tenant/İK doğrulaması tamamlanmalıdır.
3. MFA yalnız veri modeli düzeyindedir; authenticator ve e-posta doğrulama akışları ayrı güvenlik çalışmasıdır.
4. Eski tenant slug satırları, veri sahipliği kanıtlandıktan sonra tablo bazlı ve geri dönüşlü migration ile ele alınmalıdır.
5. Boyahane/İşNet duplicate route sahipliği ve Nest yerel tenant middleware’i ayrı küçük PR’larda tamamlanmalıdır.
