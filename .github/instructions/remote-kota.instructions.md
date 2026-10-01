---
applyTo: "**"
---

# KY ERP Remote Desktop / ajan kullanım standardı

- Remote Desktop Commander kullanılmaya devam edilir; aylık kota bütün aya yayılacak şekilde gereksiz ve tekrarlı çağrı yapılmaz.
- Öncelik: mevcut repo/servis bilgisi -> KY-CONTROL ve ilgili KY ajanları -> gerekirse tek/toplu Remote çağrısı -> en son kullanıcı müdahalesi.
- Remote yalnız yerel makineye özgü GUI doğrulaması, Windows/uygulama ayarı, cihaz, klasör/dosya sistemi, süreç, donanım, GitHub'da olmayan binary dosya veya ajanların yetmediği entegrasyon testi için kullanılır.
- Salt kod okuma/yazma, dokümantasyon, GitHub/Cloudflare kontrolü ve ajanla yapılabilen işler Remote'a taşınmaz.
- Remote gerektiğinde aynı oturumdaki kontroller mümkün olduğunca tek çağrıda gruplanır; aynı `list/read/status` sorguları tekrarlanmaz.
- Kota yüzdesi her işlemde değil, uzun/kritik yerel çalışma öncesinde veya ihtiyaç halinde bir kez kontrol edilir.
- Uygun saha bilgisayarlarına KY-CONTROL, System Sentinel, File Hub ve Build benzeri kendi ajanlarımız bir kez kurulup otomatik başlangıçla çalıştırılır; rutin health/log/dosya/süreç/komut işleri ajanlara kaydırılır.
- Tasarruf doğrulamayı kaldırmaz; kritik sonuç mümkün olan en ucuz bağımsız kaynak/ajan/ekran çıktısıyla doğrulanır.
- Ayrıntılı politika ve canonical proje adresleri: `DOCS/KY_ERP_REMOTE_KOTA_VE_AJAN_POLITIKASI_2026-10-01.md`.
