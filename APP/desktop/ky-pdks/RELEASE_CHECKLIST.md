# KY PDKS 1.0 — Release Checklist

## Build
- [ ] Shared Release build başarılı
- [ ] Agent Release build başarılı
- [ ] Desktop WPF Release build başarılı
- [ ] xUnit testleri başarılı
- [ ] win-x64 self-contained publish başarılı
- [ ] Inno Setup derlemesi başarılı
- [ ] Setup SHA256 üretildi

## Kurulum
- [ ] Program Files altında `KY ERP\KY PDKS` oluştu
- [ ] Başlat menüsü kısayolu oluştu
- [ ] Masaüstü kısayolu oluştu
- [ ] `KYERP.PDKS.Agent` Automatic (Delayed Start)
- [ ] KY PDKS uygulaması Windows başlangıcına eklenmedi
- [ ] ProgramData PDKS klasörleri oluştu
- [ ] Uninstall sonrası ProgramData DB/yedekleri korundu

## Yerel kart
- [ ] FILE import kartı yerel DB'ye yazıyor
- [ ] Aynı kayıt ikinci kez yazılmıyor
- [ ] TCP_SERVER satırı alınabiliyor
- [ ] TCP_CLIENT bağlantısı tekrar kurulabiliyor
- [ ] SERIAL/COM satırı alınabiliyor
- [ ] Hatalı satır Reject klasörüne düşüyor
- [ ] Agent kapalı/açık heartbeat ekranda doğru

## ERP
- [ ] Kullanıcı/parola login
- [ ] Google/Microsoft MFA doğrulama
- [ ] Onay bekleyen giriş otomatik polling
- [ ] Token Windows kullanıcısına özel şifreli saklanıyor
- [ ] Parola diske yazılmıyor
- [ ] SGK=VAR + kartlı personel cache
- [ ] Bekleyen kartlar ERP import endpointine gidiyor
- [ ] 401 sonrası yerel veri korunuyor ve yeniden giriş isteniyor
- [ ] DENETIM hesabı write yapamıyor

## Offline
- [ ] İnternet kapalıyken Agent kart toplamaya devam ediyor
- [ ] Uygulama kapalıyken Agent kart toplamaya devam ediyor
- [ ] ERP geri geldiğinde bekleyen kayıt senkron oluyor
- [ ] Yerel manuel/otomatik DB yedeği açılabiliyor

## Gerçek cihaz kabul testi
- [ ] Terminal marka/model/protokolü kaydedildi
- [ ] Cihazın gerçek çıkışı örnek satır/paketle doğrulandı
- [ ] Giriş ve çıkış en az 10 gerçek kartla kontrol edildi
- [ ] Cihaz bağlantısı kes/aç testi yapıldı
- [ ] Çift gönderim dedup kontrol edildi
