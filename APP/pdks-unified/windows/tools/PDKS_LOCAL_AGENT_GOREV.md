# KY PDKS — YEREL AJAN GERÇEK VERİ TEST / KOD GÖREVİ

Tarih: 09.10.2026. Repo: cetin60kaya-lgtm/ky-erp, PR #404.
Dal: feature/ky-pdks-unified-product-shell-20261008.
Amaç: 49 menüyü yerel test paketinden gerçek veriyle çalışan güvenli PDKS uygulamasına dönüştürmek.

## 1. Kesin çalışma sınırları
- SADECE izole checkout `D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02\web` içinde kod düzenle.
- Canlı `D:\Hedef500`, `C:\Hedef500`, `D:\GoogleDrive\KYERP-PDKS-MASAUSTU`, üretim FDB, yıllık TNF ve terminal RAW üzerinde hiçbir yazma/silme/rename yok.
- Cloudflare production D1, API, Pages, DNS, git main/başka branch deploy, merge, migrations uygulama, ücretli servis açma YOK.
- Kopya stage Firebird: `D:\KYERP\_TEMP\PDKS_COPY_STAGE_20261008_213329\KY_PDKS_STAGE.FDB`. Önce dosyanın varlığını doğrula, bu kopyada da önce salt-okunur. Gerçek kart/isim/veriyi public loga veya GitHub'a basma.
- Personel/kart eşlemesini kanıt olmadan tahmin etme; sahte saat veya okutma üretme; biyometrik şablon alma.
- Yeni npm/pip paketleri ve remote desktop harcaması yalnız gerekirse; önce mevcut bağımlılıkları kullan.

## 2. Uygulanacak sıra
1. Mevcut PDKS kodunu, 9 bölüm/49 sekme tablosunu ve salt-okunur live/kart event/terminal/Cloud endpointlerini tarayıp `gerçek`, `staging`, `önizleme`, `eksik` matrisi çıkar.
2. İZOLE kopya Firebird şemasını mevcut read-only `FirebirdSchemaProbe` ile doğrula. Gerçek kart numarası/tarih/saat, işe giriş/çıkış sınırları, yöndeki belirsizlik ve FDB/TNF anlaşmazlıklarını _yalnız anonim toplamlarla_ raporla.
3. Canlıya bağlanmadan çalışabilen `READ_ONLY_COPY` uygulama modu geliştir: yetkili dosya seçimi/kopya dosya bağlantısı, personel listesi, günlük giriş/çıkış, geç kaydı, izlenebilir veri kökeni; bilinmeyen durumu `bilinmiyor` göster.
4. Her gerçek menüde sahte buton / dummy tablo varsa listele; gerçek veriyle güvenli çalışan read-only işlemleri önce tamamla.
5. PDKS Windows host ve React yeni taşınabilir test sürümünde menülerin okunurluğunu/arama/filtre/QR-TNF raporunu doğrula. Sadece menü gezildi diye iş kuralını PASS ilan etme.
6. Her değişiklikten sonra birim, Cloud TypeScript, Windows Release, kopya FDB/Agent, 49 sekme Chrome kabulü çalıştır.
7. Günlüğe commit/test/engelleri yaz; branch push yapma. Hazır kod değişikliklerini review için bırak; üretim veya staging deploy yok.

## 3. Bitmiş sayılma koşulları
- `APP/pdks-unified/windows/tools/Test-UnifiedProductAcceptance.ps1` sonuç PASS, gerçek menü data/read gates PASS.
- Isolated process crash, duplicate event, malformed TNF, cross-tenant and missing FDB testleri var.
- Kopya FDB dışına erişim ve üretim mutation denenmemiş.
- Kapsam dışı özellikler açıkça `ONAY/ENTEGRASYON BEKLİYOR` diye kalıyor.

## 4. Rapor
`D:\GoogleDrive\Hakan Emp\OTOMASYON\KY-CONTROL\OUTBOX` içine
`PDKS_GERCEK_VERI_KABUL_RAPORU.md` yaz.
Başlıklar: commit HEAD, menü bazlı durum, okunan kaynaklar (yolun gizli kısımlarını ifşa etmeden), otomatik test sonucu, anonim hata sayıları, güvenlik kanıtı, kullanıcı onayı gereken blokajlar, sıradaki 3 iş.
Çalışırken hiçbir canlı dosyayı değiştirme.
