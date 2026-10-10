# PC PDKS — Beş Sohbet Merkez Koordinasyonu
Güncelleme: 10.10.2026. Kaynak: GitHub gerçek branch karşılaştırmaları. Bu dosya plan ve kanıt defteridir; otomatik test sonucu değildir.

## Kaynak ve bitiş hedefi
- Repo: `cetin60kaya-lgtm/ky-erp`
- Ortak referans: `feature/ky-pdks-unified-product-shell-20261008` (PR #404 DRAFT; üretime merge edilmeyecek).
- Tek mevcut KY PDKS 9 ana bölüm / 49 alt sekme, Windows .NET 8 WebView2 ve önceki Hedef/FP_CLOCK terminal altyapısı geliştirilecek. Ayrı uygulama yazılmayacak.
- Bitiş tanımı: Her sekmenin gerçek veri kaynağı + eylemi + güvenlik ve hata kontrolü + test kanıtı + tek Windows EXE/kurulum + fiziksel cihaz saha kabulü; yalnız menü/lint/build PASS yeterli değildir.

## 10.10.2026 ilk durum kontrolü
Aşağıdaki **kod farkları koordinasyon kuralları commitlenmeden önce** ortak referansla karşılaştırılmıştır:

| Sohbet | Branch | Kanıtlanmış iş | Durum |
|---|---|---|---|
| 1 Terminal & Cihaz | `feature/ky-pdks-terminal-multidevice-fpclock-20261010` | 1 commit, `device-gateway/terminal-fleet.mjs` eklendi: salt okunur çoklu terminal yoklaması, izinli adaptör kabulü, backoff, olay tekilleştirme | Kod başladı; fiziksel terminal okuma ve x86 köprüsü/iki profil saha kabulü YOK |
| 2 Personel & Kart | `feature/ky-pdks-personnel-card-20261010` | Ortak referansa göre yeni kod farkı yok | Başlandı/branch hazır; gerçek teslim kanıtı yok |
| 3 Devam & Puantaj | `feature/ky-pdks-attendance-puantaj-evidence-20261010` | Ortak referansa göre yeni kod farkı yok | Başlandı/branch hazır; gerçek teslim kanıtı yok |
| 4 Bordro & Rapor | `feature/ky-pdks-bordro-rapor-20261010` | Ortak referansa göre yeni kod farkı yok | Başlandı/branch hazır; gerçek teslim kanıtı yok |
| 5 Yönetim & Entegrasyon | `feature/ky-pdks-management-integration-20261010` | Ortak referansa göre yeni kod farkı yok | Başlandı/branch hazır; gerçek teslim kanıtı yok |

**Not:** Aynı `APP/pdks-unified/AGENTS.md` ortak çalışma kuralı altı dala ayrıca eklendi. Bu dokümantasyon commitleri işlev tamamlandı sayılmaz. Bu tablonun statüsü branch'ler geliştikçe tekrar güncellenmelidir.

## İlk teknik blokajlar
1. Son test EXE `KY-PDKS-MENU-TEST.exe` canlı bağlantıyı kasıtlı kapatıyor. Fotoğraftaki `Failed to fetch` otomatik JSON kopya erişim hatası; canlı cihaz entegrasyonu değildir.
2. Eski çalışan Hedef cihazın Cihaz1 profili: `192.168.1.224:5005`, makine 1, `FP_CLOCK.ocx` + `TMPCCOMM.dll` x86. İkinci eski profil ve fiziksel cihaz açık/kapalı durumu yerel eski uygulamadan kanıtla okunmalı.
3. Cihaz network port testi fiziksel RAW okunması veya kart yazılması kanıtı değildir; adaptör SDK ve kart yazıcı driver testi ayrı.
4. RAW–Firebird–TNF–E/gündüz/gece/çift vardiya/izin/tatil uzlaştırması tamamlanmadan bordro onaylanamaz.
5. Canlı Cloudflare staging/migration/tenant kimlik/ACK, üretim yetki ve rol sınırları ayrı kabul ister.
6. Canlı FDB/GDB, yıllık TNF, terminal hafızası ve D1 kaydı yedeksiz veya onaysız değiştirilmeyecek.

## Her sohbetin teslim formatı
- Kullanılan branch, commit SHA, değişen dosyalar/gerçek özellik.
- Çalışan arayüz eylemi ve gerçek okuma/yazma kapsamı.
- Çalıştırılan birim/entegrasyon/Windows/saha testleri: PASS, FAIL, NOT RUN açık.
- Açık hatalar, hangi fiziksel erişim veya iş kuralı gerektiği.
- Draft PR bağlantısı; diğer alanlarla çakışma ve gereken sözleşme değişiklikleri.

## Entegrasyon merkezi uygulaması
1. Beş branchtaki commitleri, testleri ve PR'ları ayrı ayrı kontrol et.
2. Dosya çakışmalarını kaydet; eksik kaynak/işlemleri ilgili sohbetin branch'inde tamamlat.
3. Yalnız test edilen değişiklikleri tek entegrasyon dalına sırayla al.
4. Full frontend / .NET / Agent / Cloud / kopya Firebird / TNF, ardından x86 FP_CLOCK ve iki gerçek cihazla salt okunur saha testi; sonra kart yazıcı donanım testi.
5. Tek güncel Windows kurulum dosyası ve SHA256 üret; eski menü test paketini final diye dağıtma. Üretim dağıtımı/merge ayrıca yetkili onayı ister.

Proje kuralı: `APP/pdks-unified/AGENTS.md`.
