# KY ERP UI P0 Final — 2026-09-13

Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`

Bu release kaydı, kullanıcı onayıyla öncelikli arayüz/viewport düzenlemelerinin production kaynakta tamamlandığını ve canonical Cloudflare Git Integration yayınının yeniden tetiklenmesini kaydeder.

## Kapanan P0 maddeleri

- AppShell workspace tek sayfa-seviyesi dikey scroll sahibi.
- Desen ve Boyahane `100vh` / alt aksiyon kesilmesi giderildi.
- İK iç içe viewport/double-scroll davranışı giderildi.
- İmalat ilk kart viewport kilidi kaldırıldı.
- Ana menüde gereksiz grup sınıflandırması yerine doğrudan sekmeler gösteriliyor.
- Günlük Operasyon bağımsız Haftalık Rapor sekmesi kaldırıldı; haftalık görünüm Ana Ekran içinde tutuluyor.
- Aktif sekmeler farklı renk/ikon ailesiyle ayrışıyor.
- Aktif modüle tekrar basıldığında modül menüsü kapanabiliyor.

## Doğrulama

Temiz detached production worktree üzerinde:

- `npm ci`: başarılı, 0 vulnerability
- Frontend test: 134/134 başarılı
- Frontend lint: başarılı
- Frontend production build: başarılı
- API canlı health: `ok=true`, `service=ky-erp-api`, `database=d1`
- Canlı uygulama ana sayfa HTTP: 200

Not: GitHub AppVeyor production deploy otoritesi değildir. Canonical yayın Cloudflare Git Integration ile production branch üzerinden yürür.
