# KY PDKS — Terminal, FP_CLOCK ve Kart Yazıcı Entegrasyonu (10.10.2026)

**Referans:** `feature/ky-pdks-unified-product-shell-20261008`  
**Çalışma dalı:** `feature/ky-pdks-terminal-multidevice-fpclock-20261010`  
**Kapsam:** Mevcut KY PDKS monorepo modüllerine ekleme. Yeniden yazım, production merge veya deploy yok.

## Doğrulanmış kaynak gerçekleri

- Eski Hedef konfigürasyonu içinde **Cihaz1**: `192.168.1.224:5005`, `machineId=1`, `ETHERNET`, yön `IN`, `FP_CLOCK.ocx` (x86) ve `TMPCCOMM.dll` bağımlılıkları kod referanslarında mevcut.
- İkinci fiziksel cihaz Hedef'te bulunduğu söylenmiş olmakla birlikte **gerçek IP, port, model, makine numarası ve yönü doğrulanmadı.** Örnek test adresleri gerçek cihaz profili değildir. Sahte Cihaz2 üretim profili oluşturulmadı.
- FP_CLOCK'un COM ProgID, `Connect` / `Read` metot imzaları, gerekli OCX bitliği/bağımlılıkları ve gerçek RAW sonuç şekli önceki çalışan Windows uygulamasından fiziksel kanıtla okunamadı.
- Yerel Desktop Commander kota sınırına ulaştığından Hedef ve gerçek Windows kart yazıcısı yerelde denetlenemedi.

## Yeni eklenen işlevler

1. `terminal-fleet.mjs`: En fazla 32 doğrulanmış profili ayrı durumlarda izler; eşzamanlı TCP/QR bağlantı tanısı, bağımsız yeniden deneme (1 s → 60 s), açık SDK adapter allowlist'i, salt okunur ham olay alma sözleşmesi, firma+terminal kimliği kontrolü, kaynak SHA kimliğine göre bellekte mükerrer kayıt ayrıştırma ve sınırlı hafıza. Geçersiz batch atomik olarak reddedilir. Terminali silme/kaydırma/saat yazma, FDB/TNF/Cloud yazma yok.
2. `terminal-fleet-cli.mjs`: Operatörün açıkça verdiği iki profil JSON dosyasını yalnız okur; `--once` ile tanı, `--watch` ile 127.0.0.1:5206 üzerinde yerel ağ durum panosu. **Varsayılan CLI'da onaylı FP_CLOCK adapter bulunmadığından kart RAW okuması yapılmaz.** TCP erişimi kart geçiş kanıtı değildir.
3. `legacy-hedef-terminal-profile.mjs`: İçeri alınan eski profillerde özel ağ IP şartı, benzersiz makine numarası/IP:port ve doğrulanmış IN/OUT yönü koruma; eksik yön UNKNOWN'dır.
4. `card-printer.mjs`: 86 × 54 mm Windows yazıcı uyumlu HTML önizlemesi. Personel 360° > Kart sekmesinden seçili kaynak personel ve 5 haneli kart numarası için açık operatör onayı, ardından Windows yazdırma penceresi. Test kartı ayrıca Terminal Hub'a eklendi. **RFID çipine yazma veya otomatik fiziksel baskı yok.**
5. `Inspect-HedefFpClock-AndPrinters.ps1`: `C:\Hedef500` veya seçili Hedef klasöründe OCX/DLL varlığını, aday ayar dosyalarını ve yüklü Windows yazıcılarını yalnız okur. Şifre/ayar dosyası içeriği, personel ve ham kart kayıtlarını dökmez; COM register etmez.

## Güvenli yerel tanı

Yalnız cihazın bağlı olduğu yetkili Windows PC üzerinde, canonical repo kökünden:

```powershell
cd "D:\Googledrive\KYERP\00_CANONICAL\GITHUB\ky-erp"
powershell -NoProfile -File "APP\pdks-unified\windows\tools\Inspect-HedefFpClock-AndPrinters.ps1" -HedefRoot "C:\Hedef500"
```

Aşağıdaki komut çalıştırılmadan önce **yerel, gerçek Cihaz1/Cihaz2 profillerini içeren** JSON dosyası güvenli biçimde hazırlanmalıdır. Örnek test IP'sini gerçek saymayın. JSON dizisinde `profileName,machineId,ip,port,direction` alanları kullanılır ve kimlik bilgisi bulunmaz.

```powershell
cd "D:\Googledrive\KYERP\00_CANONICAL\GITHUB\ky-erp"
$env:KY_PDKS_COMPANY_ID="GERCEK-FIRMA-KIMLIGI"
node "APP\pdks-unified\device-gateway\terminal-fleet-cli.mjs" --profiles "C:\YOL\hedef-cihazlar.json" --once
node "APP\pdks-unified\device-gateway\terminal-fleet-cli.mjs" --profiles "C:\YOL\hedef-cihazlar.json" --watch
```

`--watch` açıkken yerel tarayıcıdan `http://127.0.0.1:5206/` adresi ziyaret edilir. Yalnız TCP bağlantı durumu gösterilir. FP_CLOCK gerçek adapter sertifikasyonu olmadan kart kaydı gösterilmez. Kapatmak için Ctrl+C.

## Test ve açık engeller

- Yeni test dosyaları: `terminal-fleet.test.mjs` ve `card-printer.test.mjs`.
- GitHub'a commit edilmiş gerçek modül kaynakları ile izole V8 çalıştırmasında **9/9 davranış senaryosu** geçti; komut satırı modülü sözdizimi kontrol edildi. Node test runner / Windows .NET Build / tarayıcı derlemesi / COM x86 cihaz kabulü **çalıştırılmadı**. Kriptografik özet testinde yerel mock kullanıldı.
- `npm`, `node --test` veya Windows CI çalıştırılmış gibi PASS gösterilmez.
- Eski FP_CLOCK x86 adapteri için doğrulanmış SDK metot sözleşmesi, ikinci profilin gerçek ayarları, gerçek terminal RAW ve canlı olayların FDB/yıllık TNF referans mutabakatı hâlâ **AÇIK**. FP_CLOCK fiziksel kart okumayı tamamlandı kabul etme.
- Kart yazıcısında cihaz sürücüsü, kağıt/kart ebat kalibrasyonu ve gerçek tek kart baskısı **sahada test bekler**.
- Bu dal üretim için kapalıdır. Gerçek FDB/TNF/terminal RAW/D1 üzerinde hiçbir değişiklik, silme, Cloudflare deploy ya da `main` merge yapılmadı.

## Saha kabul kapısı

Eski Hedef'in iki cihaz ayarını ve ilgili FP_CLOCK.ocx + TMPCCOMM.dll dosya konumlarını doğrula; onaylı x86 adapterin ham hareketleri **salt okunur** okuduğunu gerçek iki okutmayla kanıtla; zaman/saat farkı/yön/tekrar kodu ve 5 haneli kart eşlemesini karşılaştır; Firebird ve yıl TNF'sini salt okunur referans olarak kullan; bağlantı koparma/geri gelme ve kart yazıcısı gerçek baskı denemelerini yetkili operatörle test et. Bunlardan sonra production kabulü ayrıca değerlendirilir.
