# KYERP — Kısmi müşteri irsaliyesi → sevk → ticari satış faturası
24.11.2026 · Resmî İşNet hazırlık dalı, production değil.

Kullanıcı akışı: müşteri gelen irsaliye (ör. 5.500 adet) → Gelenden irsaliye oluştur → şoför/plaka/sevk tarihi ve saati, not ve bu sevk miktarı (5.000) → 500 bakiye → kendi giden irsaliyesi → Faturaya çevir → Ticari / Satış → miktarlar giden irsaliyeden kilitli, birim fiyat, KDV varsayılan %20 değiştirilebilir, not → ileri → irsaliye referansı → taslak → kontrol → açık gönderim onayı. Kalan miktar sonraki sevkte tek tuş. Orijinal kaynak değişmez. Tedarikçi alış irsaliyesi ile karışmaz. Para TRY varsayımı önizleme içindir.

Bu commit: mevcut gelen irsaliye kontrol ekranında üç adımlı önizleme, tenant/MUHASEBE yetkili salt okunur kaynak-kalem ve açık ilişki bazlı giden sevk hesabı. Belirsiz/çok kaynaklı bağlantı, eksik/çakışan kalem, fazla sevk veya doğrudan fatura bağlantısı halinde ilerleme kapalı. Sayım yalnız canonical ilişkileri içerir, sağlayıcı mutabakatı değildir. Önizleme kaydetmez, ayırmaz, göndermez. Mevcut eski auto-flow ve invoice-runtime yollarına yeni çağrı yapılmaz.

Kalan P0: İşNet resmî test sözleşmesi ve tenant yetkisi; geçmiş belgelerin ETTN ve kaynak satır bazında mutabakatı; canonical kaynak satır → giden sevk satırı → fatura satırı atomik miktar tahsisleri (fiziksel kalan, taslak rezervi, resmi sevk, faturalanan ve iptal/iade ayrı); taslak kaydı ve sürüm, idempotency, eşzamanlı rezervasyon, iptal/timeout kurtarma; resmi giden irsaliye kabulü ve gerçek numara/ETTN ile fatura referansı; sadece sağlayıcı uygunluğunda Ticari/Satış; UBL doğrulama, çoklu KDV/yuvarlama, PDF/XML ve File Hub, nihai kullanıcı onayı ve atomik gönderim. Fatura kabulü olmadan bakiye faturalanmış sayılmaz. Taslak/gönder düğmeleri bu sebeple kapalı. CI, Worker typecheck, tarayıcı, canlı kabul ve provider gönderim testi yapılmadı.

Sentetik miktar/fiyat helper V8 kontrolleri: 9/9 PASS; bu tam build veya gerçek sağlayıcı kabulü değildir.
