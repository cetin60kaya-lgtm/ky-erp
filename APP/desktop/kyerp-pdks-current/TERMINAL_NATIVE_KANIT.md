# KY PDKS Gerçek Terminal Kanıtı

Son kesin doğrulama: 01.10.2026 10:31

## Canonical terminal ayarı
- IP: `192.168.1.224`
- Port: `5005`
- MAC: `00-01-A9-12-2D-00`
- Cihaz No: `1`
- Cihaz Adı: `Cihaz1`
- Makine No: `1`
- Bağlantı: `Ethernet`
- COM: `COM1`
- Baudrate: `38400`
- Yön: `GİRİŞ`
- FP_CLOCK parola: `0`
- Aktarım dosyası: `D:\Hedef500\Hedef500\Terminal Bilgi Aktar\timerecords.txt`

## Doğrulanan testler
- `192.168.1.224:5005` TCP açıktır.
- FP_CLOCK bridge `STATUS|OK` döndürür.
- Cihaz saati gerçek cihazdan okunur.
- Cihazda `39 kullanıcı / 39 kart` görülür.
- KY PDKS `TerminalDeviceClient` `Connected=True` döndürür.
- KY PDKS gerçek `read` çağrısı `Connected=True` döndürür.
- Son testte yeni bekleyen kart hareketi `0` olduğu için log sayısı `0` dönmüştür.

## Native fallback / teşhis
- Aynı cihazda `192.168.1.224:5001` de açıktır.
- 5001 hattı teşhis/fallback içindir; ana PDKS haberleşme yolu değildir.
- 5001 paket başlığı `5D-55-FE-FE` olarak doğrulanmıştır.

## Güvenlik
- Otomatik cihaz silme kapalıdır.
- Cihaza otomatik yazma kapalıdır.
- Kart kayıtları okunmadan TNF/FDB yazılmaz.
- Canlı veri aktarımında duplicate/tolerance kontrolleri korunur.

## Tek komut tekrar testi
```powershell
cd "D:\Googledrive\KYERP-PDKS-MASAUSTU\01_KAYNAK\ky-erp\APP\desktop\kyerp-pdks-current"
powershell -ExecutionPolicy Bypass -File .\PDKS_TERMINAL_TEST.ps1
```

Son kesin kanıt:
`D:\Googledrive\KYERP-PDKS-MASAUSTU\08_TEST\TERMINAL_NATIVE\20261001-103130`

Beklenen temel sonuçlar: `MAC_MATCH=True`, `PRIMARY_5005_OPEN=True`, `APP_STATUS_CONNECTED=True`, `APP_READ_CONNECTED=True`, `STATUS_RESULT=PASS`.
