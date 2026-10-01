# KY PDKS Gerçek Terminal Kanıtı

Tarih: 01.10.2026

## Canonical cihaz profili
- Hedef PC: `DESKTOP-7UKGJF8`
- Hedef PDKS: `C:\Hedef500\Hedef.exe` (5.0.29)
- Cihaz No: `1`
- Cihaz Adı: `cihaz1`
- Makine No: `1`
- Bağlantı: `Ethernet`
- COM: `COM1`
- Baudrate: `38400`
- IP: `192.168.1.224`
- Port: `5005`
- Yön: `GİRİŞ`
- Cihaz MAC: `00-01-A9-12-2D-00`
## Doğrulanan kanıtlar
- Hedef PC kaynak IP: `192.168.1.120/24` (Wi-Fi).
- `192.168.1.224:5005` TCP bağlantısı Hedef PC'de PASS.
- Aynı cihaz Desen PC'den de `192.168.1.224:5005` üzerinden erişilebilir.
- `FP_CLOCK.ocx` iki PC'de aynı SHA-256: `D64F952B075FE74F97E1FFB0787ADCC00A7261869FF7466A4C4B7ABCFB500B4B`.
- `TMPCCOMM.dll` iki PC'de aynı SHA-256: `016D5159623AABA750EB749D4779E7DA9F9FF54C81BCA7C64ECC9E5C1CA46ACF`.
- KYERP.TerminalBridge status testi PASS: cihaz saati + 39 kullanıcı + 39 kart okundu.
- KYERP.TerminalBridge read testi PASS; test anında cihazda bekleyen yeni log sayısı `0`.
- Hedef V1.0, `backup\1&10&2026.txt` dosyasına 84 TNF satırı yedeklemiş; aynı profil gerçek aktarımda kullanılmış.

## Güvenlik kuralı
KY PDKS cihazdan otomatik kayıt silmez. Terminal testleri yalnız `status` ve `read` çalıştırır. Saat yazma, kayıt silme, yeniden başlatma ve diğer cihaz komutları otomatik testte kullanılmaz.
