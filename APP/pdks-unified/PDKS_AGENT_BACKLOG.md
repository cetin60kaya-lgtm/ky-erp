# KY PDKS — AJAN İŞ SIRASI

Bu listedeki görevler kontrollü geliştirmede tek tek işlenir. Codex CLI hesabı yetkilendirilmeden **otomatik kod yazımı çalışmaz**. Windows görev zamanlayıcısı yalnızca GitHub HEAD değişmişse izole kabul testini çalıştırır; güvenlik dışı iş yapmaz.

| Sıra | Hedef | Kabul kanıtı | Durum |
|---|---|---|---|
| 1 | GERÇEK kart kayıtlarının salt okunur Firebird kopyasından personel/gün düzeyinde, kaynak yönü ve tarih ile gösterilmesi | kopya FDB; 08:30/19:00, gece, E kodu, tekil/çift kaynak kanıtı; hassas veri Drive/GitHub'a çıkmaz | AÇIK |
| 2 | KY-CONTROL gerçek fiziksel terminal read-only sonuçlarının HMAC ham günlükle bağlantısı | gerçek terminal model/firmware, bağlantı, yön, imza, saat, tekrar test; cihaz hafızası değişmez | AÇIK |
| 3 | Canlı/Geç/Gelmedi menülerini **doğrulanmış** Firebird+terminal+TNF kaynağıyla güncelleme | personel testleri, kart/izin/SGK/çıkış ve resmi tatil eşleşmeleri | AÇIK |
| 4 | Personel 360, Vardiya/İzin, Puantaj ve Bordro menülerindeki pasif butonları yetkili işlemlerle bağlama | her işleme rol, validasyon, kopya-FDB test, idempotency, rollback | AÇIK |
| 5 | Diğer marka/model terminallerde sürücü/adaptör sertifikasyonu | gerçek marka-model SDK lisansı ve ham kayıt testi, fail-closed | AÇIK |
| 6 | Cloudflare *ayrı* staging D1 ve Windows Agent gerçek saha denemesi | migration 0060 yedeği + dry-run + tenant kontrat + cihaz kaynak denetimi | AÇIK |
| 7 | Kullanıcıya kurumsal Windows test sürümünün tek tık güncellemesi | 9/49 menü, local sürüm SHA, gerçek dosya dönüştürme/rol testleri | AÇIK |

### Sıkı iş kuralları

- Cihaz bağlantı testi fiziksel kart doğrulaması değildir; D1 ACK, Firebird/TNF kanıtı değildir.
- Üretim, resmî tatil, 5 haneli kart no ve yıllık TNF iş kuralları korunur.
- Gerçek ad/kart/bordro listesi, şifre veya ham kart logu GitHub'a ve genel Google Drive'a aktarılmaz. Anonim metrik mümkündür.
- Canlı FDB/TNF/terminal yazma veya Cloudflare deploy **yalnız testler ve ayrıca güvenlik kabulü tamamlanınca** planlanır; ajan bunları kendiliğinden açmaz.
- Son kabul kapısı `Test-UnifiedProductAcceptance.ps1`, Windows Release, Firebird kopya rollback ve gerçek cihaz okuma kanıtıdır.
