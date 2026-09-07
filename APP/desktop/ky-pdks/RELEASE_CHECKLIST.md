# KY PDKS Pro 1.9.0 — Release Checklist

## Kaynak / Tek Ürün
- [ ] PDKS Desktop aynı canonical frontend build'ini içeriyor
- [ ] standalone product işareti React başlamadan enjekte ediliyor
- [ ] PDKS Desktop'ta yalnız PDKS modülü görünür
- [ ] Muhasebe / e-Belge / Depolama / Yönetim route'u görünür değil
- [ ] Personel masterı İK'da; PDKS ikinci personel kartı oluşturmuyor
- [ ] Maaş / avans / bordro PDKS'de yok

## Frontend / API
- [ ] Frontend test
- [ ] Frontend lint
- [ ] Frontend production build
- [ ] Worker unit test
- [ ] Worker auth integration
- [ ] Worker typecheck
- [ ] Worker dry-run build
- [ ] PDKS live dashboard WAITING / NO_SHOW ayrımı doğru
- [ ] Eksik çıkış vardiya bitmeden üretilmiyor
- [ ] AI live snapshot ephemeral
- [ ] PDKS AI write preview-first
- [ ] DENETIM write disabled

## Windows Build
- [ ] Shared/Agent/Desktop restore başarılı
- [ ] xUnit başarılı
- [ ] KY ERP Desktop publish
- [ ] KY PDKS Pro publish
- [ ] PDKS Agent publish
- [ ] canonical web/index.html PDKS paketinde
- [ ] Inno Setup başarılı
- [ ] `KY-PDKS-Pro-Setup-1.9.0.exe`
- [ ] SHA256
- [ ] `build-info.json`

## Kurulum
- [ ] Program Files altında `KY ERP\PDKS Pro`
- [ ] `KY PDKS Pro.exe` açılıyor
- [ ] login / MFA
- [ ] yalnız PDKS menüsü
- [ ] `KYERP.PDKS.Agent` Automatic (Delayed Start)
- [ ] first-run terminal uyarısı
- [ ] Kurulum Sihirbazı açılıyor
- [ ] kaydet sonrası first-run kapanıyor
- [ ] autostart opsiyonu
- [ ] uninstall sonrası ProgramData DB/yedek korunuyor

## Terminal / Agent
- [ ] İşyeri Hedef500 profili yükleniyor
- [ ] 192.168.1.224:5005 read-only TCP probe
- [ ] timerecords.txt read-only parser
- [ ] son kart gösteriliyor
- [ ] HEDEF_TR500
- [ ] FILE
- [ ] TCP_SERVER
- [ ] TCP_CLIENT
- [ ] SERIAL/COM
- [ ] hatalı satır Reject
- [ ] duplicate fingerprint
- [ ] Agent heartbeat
- [ ] offline queue
- [ ] bağlantı geri gelince HTTPS D1 sync
- [ ] terminal TCP portu WAN'a açılmıyor

## Canlı Operasyon
- [ ] Bugün Gelen
- [ ] İçeride
- [ ] Çıkan
- [ ] Gelmeyen
- [ ] Vardiya Beklenen
- [ ] Yıllık İzin
- [ ] Raporlu
- [ ] Diğer İzin
- [ ] Geç Gelen
- [ ] Eksik Çıkış
- [ ] bölüm filtreleri
- [ ] vardiya saatleri
- [ ] cihaz online/offline
- [ ] giriş/çıkış kartı gerçek personelle doğru eşleşiyor
- [ ] izin puantaja doğru yansıyor
- [ ] resmî tatil/hafta tatili doğru

## AI Kontrol
- [ ] “Bugün kim gelmedi?” doğru
- [ ] WAITING personeli gelmeyen saymıyor
- [ ] “Şu an kim içeride?” doğru
- [ ] “Çıkış basmayı unutan?” doğru
- [ ] cihaz çevrimdışı analizi doğru
- [ ] live snapshot konuşma geçmişine yazılmıyor
- [ ] giriş/çıkış/devamsızlık işlemi önce önizleniyor
- [ ] açık onaydan sonra yazılıyor
- [ ] finans komutu reddediliyor
- [ ] DENETIM yalnız analiz yapıyor

## Üretici Komutları
Aşağıdakiler gerçek cihaz marka/model/protokolü doğrulanmadan **release blocker değil, bilinçli kilitli yetenektir**:
- [ ] cihaz saatini oku
- [ ] PC saatine ayarla
- [ ] zil tablosunu oku/yaz
- [ ] kapı testi
- [ ] cihaz kodu
- [ ] restart
- [ ] yönetici sil

Bu işlemler tahmini TCP paketiyle uygulanmaz. Üretici adapterı + ikinci onay + gerçek cihaz testi gerektirir.

## Production kapısı
- [ ] Windows artifact gerçek
- [ ] gerçek Windows pre-flight geçti
- [ ] gerçek cihaz pre-flight geçti
- [ ] kullanıcı açıkça “canlıya al” dedi
- [ ] production branch güncelliği kontrol edildi
- [ ] diff review
- [ ] production merge
- [ ] Cloudflare Git Integration başarı
- [ ] app + API smoke

**Bu checklist tamamlanmadan feature branch “canlı final” sayılmaz.**
