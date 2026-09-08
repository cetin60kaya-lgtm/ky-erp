# KY PDKS Pro 1.9.0 — Kurulum Notu

Setup: `KY-PDKS-Pro-Setup-1.9.0.exe`

Kurulum:
- `Program Files\KY ERP\PDKS Pro`
- `KY PDKS Pro.exe`
- canonical `web\` frontend paketi
- `KYERP.PDKS.Agent` Windows hizmeti
- `C:\ProgramData\KY ERP\PDKS` yerel ham kart/offline/veri klasörleri

Agent **Automatic (Delayed Start)** çalışır; uygulama kapalı olsa bile kart toplamaya devam eder.

İlk açılışta Terminal & Sistem > Windows Terminal Ayarları üzerinden terminal bir kez tanımlanır. Ayar tamamlanana kadar PDKS Pro ilk-kurulum uyarısını gösterir.

Uygulamanın Windows ile otomatik açılması installer'da opsiyoneldir; Agent ise servis olarak sürekli çalışır.

Uninstall program dosyalarını kaldırır; güvenli kart geçmişi/yedek için ProgramData PDKS verisi bilerek korunur.
