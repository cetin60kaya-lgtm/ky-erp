# KYERP Security PRO — 25.11.2026

Durum: PR #658 production dalına birleştirildi; CI #45558145529 başarılı; yayın tetikleniyor, canlı kabul henüz YOK. Tek canonical AppV3, AuthContext, modül registry ve mevcut auth API korunur. Yeni paralel backend/PWA yok.

Bu değişiklik: PRO firma merkezi üzerinden mevcut hesap etkinleştirme/devre dışı bırakma ve oturum iptali; işlemi sunucudan tekrar okuma ve aktör/hedef audit kontrolü; izinli mobil muhasebe, günlük operasyon, İK aylık ve üretim modüllerine hızlı erişim; KY Firma aynı origin PRO çalışma alanı bağlantısı; normal MFA kullanıcısının kendi telefon onayını yönetici onayından ayırma; mevcut BOTH_MFA ve yönetici politikasını koruma; pasife alınan hesabın bekleyen giriş kayıtlarını geçersizleştirme.

Açık final kapılar: gerçek rol/tenant testleri, bütün modüllerde kayıt seviyesinde yetki ve iş logları, atomik zorunlu audit, güvenli kalıcı oturum/cookie ve owner step-up, mobil gerçek telefon kullanılabilirliği, Cloudflare WAF ve header kontrolü. Mevcut kullanıcılar, üretim D1 ve güvenilir telefon kayıtları değiştirilmemiştir. Gerçek CI ve üç yayın bileşeni (Pages/Worker/Security Host) kanıtı olmadan canlı denmez.

İkinci commit: hesap durumunun oturum/önceki onay iptali ve aktör loguyla atomik D1 batch üzerinden kaydı; tam audit ID ile doğrulama; modül izinlerinin batch ile yazımı ve önce/sonra logu; rol/firma değişikliğinde eski girişlerin iptali; telefon onayını yapan gerçek aktörün oturum loguna aktarılması; masaüstünde de görünürlük dönüşü oturum kontrolü. Kalıcı HttpOnly refresh/owner güvenli yeniden giriş ayrı kabul gerektirir; mevcut MFA/owner sınırları kaldırılmadı.
