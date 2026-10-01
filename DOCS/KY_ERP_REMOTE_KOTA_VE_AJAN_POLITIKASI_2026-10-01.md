# KY ERP — Remote Kota ve Ajan Kullanım Politikası

Tarih: 01.10.2026

## Kalıcı kural

Remote Desktop Commander kullanılmaya devam edilir; amaç Remote'u kapatmak değil, aylık kotayı bütün aya yaymaktır. Gereksiz ve tekrarlı Remote çağrısı yapılmaz.

Öncelik sırası:

1. Mevcut sohbet/proje çıktısı ve repo/servis kaynağı.
2. KY-CONTROL ve ilgili KY ajanları.
3. Gerekliyse tek/toplu Remote Desktop çağrısı.
4. En son kullanıcı müdahalesi.

## Remote ne zaman kullanılır

- GUI doğrulaması veya ekranda görülen cihaz-özel durum.
- Yerel kurulum, Windows/uygulama ayarı, dosya sistemi ve süreç işlemi.
- Yalnız cihaz üzerinden erişilebilen log/hata/durum.
- KY-CONTROL veya diğer ajanların yetmediği yerel işlem.

Salt kod okuma/yazma, dokümantasyon, GitHub/Cloudflare kontrolü veya mevcut ajanla yapılabilen iş için Remote açılmaz.

## Kota tasarruf standardı

- Aynı oturumda mümkün olan kontroller tek çağrıda gruplanır.
- Aynı durumu tekrar tekrar `list/read/status` ile sorgulama yapılmaz.
- Önce mevcut çıktı kullanılır; yalnız yeni bilgi gerektiğinde ek Remote çağrısı yapılır.
- Kota yüzdesi her işlemde değil, uzun/kritik yerel çalışma öncesinde veya ihtiyaç halinde bir kez kontrol edilir.
- Tasarruf doğrulamayı kaldırmaz; sonuç mümkün olan en ucuz bağımsız kanal üzerinden doğrulanır.

## Kendi ajanlarımız

Uygun saha bilgisayarlarına KY-CONTROL / System Sentinel / File Hub / Build benzeri ajanlar bir kez kurulur ve otomatik başlangıçla çalışır. Health, log, dosya, süreç, komut ve basit GUI işleri mümkün olduğunca bu ajanlara kaydırılır.

## Canonical proje adresleri

- GitHub repo: `cetin60kaya-lgtm/ky-erp`
- Public: `https://kyerp.net`
- Uygulama: `https://kyerp.net`
- API: `https://api.kyerp.net`
- Security: `https://security.kyerp.net/ky-guvenlik/`
- Frontend: `APP/app/ky-erp-frontend`
- Backend/API Worker: `APP/cloud/ky-erp-api`
- PDKS Desktop: `APP/desktop/kyerp-pdks-current`
- File Hub Agent: `tools/file-hub-agent`
- Build Agent: `tools/ky-build-agent`
- System Sentinel Agent: `tools/system-sentinel-agent`
- Desen Bridge: `TOOLS/DESEN_BRIDGE`
- KY-CONTROL saha otomasyonu: `D:\GoogleDrive\Hakan Emp\OTOMASYON\KY-CONTROL`

Bu politika tüm KY ERP geliştirme ve saha bilgisayarı işlerinde geçerlidir.
