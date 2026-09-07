# KY PDKS 1.8.0 — Release Checklist

## Build
- [ ] Frontend test/build başarılı (tam KY ERP Desktop için)
- [ ] Shared Release build başarılı
- [ ] Agent Release build başarılı
- [ ] PDKS-only WPF Release build başarılı
- [ ] xUnit testleri başarılı
- [ ] KY ERP Desktop win-x64 publish başarılı
- [ ] KY PDKS Desktop win-x64 publish başarılı
- [ ] PDKS-only pakette WebView/web/full ERP shell yok
- [ ] İki Inno Setup derlemesi başarılı
- [ ] İki Setup SHA256 + build-info.json üretildi

## Kurulum
- [ ] `KY-PDKS-Desktop-Setup-1.8.0.exe` kuruluyor
- [ ] `KYERP.PDKS.Agent` Automatic (Delayed Start)
- [ ] Windows service uygulama kapalıyken çalışıyor
- [ ] `C:\ProgramData\KY ERP\PDKS` data/import/archive/reject/backup/log/report klasörleri var
- [ ] Uninstall sonrası ProgramData DB/yedekleri korunuyor

## Hedef500 gerçek cihaz profili
- [ ] Cihaz adı `Cihaz1`
- [ ] Cihaz No `1`
- [ ] Makine No `1`
- [ ] Ethernet `192.168.1.224:5005`
- [ ] Yön `GIRIS`
- [ ] Baud `38400`
- [ ] `C:\Hedef500\Terminal Bilgi Aktar\timerecords.txt` okunuyor
- [ ] TCP probe payload göndermeden erişimi kontrol ediyor
- [ ] timerecords satır formatı `KartNo,Saat,GGAAYY,1,001` parse oluyor
- [ ] aynı kart + aynı zaman ikinci kez eklenmiyor
- [ ] dosya değişmediyse Agent tekrar tam tarama yapmıyor
- [ ] Hedef kaynak dosyası taşınmıyor/silinmiyor/değiştirilmiyor

## Terminal komut güvenliği
- [ ] `TerminalProtocol=HEDEF_UNKNOWN_BINARY` iken direct command kapalı
- [ ] cihaz saati yazma kapalı
- [ ] kapı testi kapalı
- [ ] restart kapalı
- [ ] yönetici silme kapalı
- [ ] cihaz kayıt silme kapalı
- [ ] üretici protokolü/SDK doğrulanmadan bu guard açılamıyor

## ERP / D1
- [ ] Kullanıcı/parola login
- [ ] Google/Microsoft MFA
- [ ] cihaz enroll credential LocalMachine DPAPI ile saklanıyor
- [ ] Agent heartbeat D1 cihaz kaydını güncelliyor
- [ ] normal kart importu aktif + kartlı personelde SGK durumundan bağımsız
- [ ] DENETIM salt-okunur
- [ ] pending kartlar `/api/auth/pdks-device/time-events/import` endpointine gidiyor
- [ ] duplicate D1 olayı ikinci kez yazılmıyor
- [ ] kilitli döneme kart yazılmıyor
- [ ] 401/bağlantı hatasında yerel veri korunuyor

## PDKS operasyon
- [ ] Canlı Kart
- [ ] Ham Kartlar
- [ ] Giriş / Çıkış
- [ ] Puantaj
- [ ] Eksik Kart / Tek Basım
- [ ] Gün düzeltme + audit
- [ ] İzin
- [ ] Vardiya / servis
- [ ] Dönem kapama
- [ ] Denetim TEMP
- [ ] log/yedek

## Offline / geri dönüş
- [ ] İnternet kapalıyken Agent kart toplamaya devam ediyor
- [ ] uygulama kapalıyken Agent kart toplamaya devam ediyor
- [ ] internet gelince pending kayıtlar D1'e gidiyor
- [ ] Agent restart recovery çalışıyor
- [ ] yerel DB backup oluşuyor

## Gerçek işyeri kabul testi
- [ ] Hedef PDKS açıkken dosya köprüsü en az 10 gerçek kartla doğrulandı
- [ ] giriş ve çıkış hareketleri doğru personele düştü
- [ ] çift basım/double row dedupe doğrulandı
- [ ] `192.168.1.224:5005` TCP probe sonucu görüldü
- [ ] Hedef PDKS kapat/aç sonrası Agent veri kaybetmedi
- [ ] cihaz/PC saat farkı manuel Hedef ekranı ile karşılaştırıldı
