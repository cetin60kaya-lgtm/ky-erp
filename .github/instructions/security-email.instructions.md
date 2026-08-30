---
applyTo: "APP/cloud/ky-erp-api/**,APP/app/ky-erp-frontend/src/pages/admin/**"
---

# KY ERP sistem e-posta standardı

- Canonical sistem göndericisi: `KY ERP <admin@kyerp.net>`.
- `admin@kyerp.net` için ayrı posta kutusu zorunlu değildir; bu adres Resend üzerinden yalnız sistem gönderen kimliği olarak kullanılabilir.
- Kullanıcı ekranından, rol/yetki ekranından veya normal ayarlardan sistem gönderici adresi değiştirilemez.
- Resend API anahtarı yalnız Cloudflare Worker secret olarak tutulur; repoya, loga veya frontend'e yazılmaz.
- `RECOVERY_EMAIL_FROM` Worker config değeri `KY ERP <admin@kyerp.net>` olarak sabit kalır.
- Kullanıcı e-posta doğrulamasını yalnız uygulama sahibi başlatabilir.
- Provider kabul kimliği alınmadan UI `kod gönderildi` veya `mail gönderildi` şeklinde kesin başarı mesajı göstermez.
- Başarılı provider kabulü, teslimat garantisi değildir; UI bunu açıkça belirtir.
- OTP 6 haneli, süreli ve tek kullanımlı kalır; OTP API cevabında veya logda açık edilmez.
- Yeni bir agent ikinci bir gönderen adresi, Gmail SMTP veya kullanıcıya açık SMTP ayarı eklemez. Kullanıcı açıkça değiştirmedikçe tek standart Resend + `admin@kyerp.net`'tir.
