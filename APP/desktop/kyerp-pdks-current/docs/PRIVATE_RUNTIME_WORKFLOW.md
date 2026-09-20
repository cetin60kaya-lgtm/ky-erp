# KYERP PDKS private runtime çalışma düzeni

## Amaç

Kaynak kod GitHub'da, eski Hedef500 tam runtime/veri referansı private Google Drive'da tutulur. Böylece VS Code/Codex aynı repo üzerinden çalışırken canlı personel verisi ve üçüncü taraf binary'ler public GitHub'a sızmaz.

## Private referans

`D:\GoogleDrive\Hakan Emp\KYERP-PDKS\PRIVATE_RUNTIME\Hedef500_2026-09-20`

Bu kopya 20.09.2026 tarihinde `D:\Hedef500\Hedef500` üzerinden birebir alınmıştır.

## Yerel geliştirme

Repo kökünde:

```powershell
cd APP\desktop\kyerp-pdks-current
powershell -ExecutionPolicy Bypass -File .\SYNC_PRIVATE_RUNTIME.ps1
```

Komut private referansı `private-runtime\Hedef500` altına senkronlar. Bu klasör `.gitignore` ile Git dışında tutulur.

## Silinmeyecek/bozulmayacak legacy davranışlar

- `Temp\` klasörü korunur; denetim/yedek/ara işlem referansıdır.
- `Terminal Bilgi Aktar\timerecords.txt` 0 KB olabilir ve bu normaldir.
- Kart okuyucu bu dosyaya veri bırakabilir; uygulama veriyi işledikten sonra içeriği temizleyebilir.
- `Data\DATABASE.GDB` canlı referanstır; test yazmaları transaction + rollback ile yapılır.
- `Report\*.fr3` rapor parity kaynağıdır.
- `Yedek\Yedekle.exe` ve `Yedek\Yukle.exe` legacy yedek/geri yükleme davranış referansıdır.

## Final mimari kararı

Bridge/overlay kalıcı çözüm değildir. Final uygulama tek `KYERP PDKS` masaüstü uygulaması, tek setup ve tek kısayol olacaktır. `Hedef.exe` yalnız işlev/veri/rapor/terminal referansı olarak kalır; son kullanıcı final üründe Hedef kabuğunu görmez.

## Sonraki VS Code görevi

1. `SYNC_PRIVATE_RUNTIME.ps1` çalıştır.
2. Legacy runtime'dan işlev/parity kontrolü yap.
3. `HKN.Personel.Native` ve `KYERP.PDKS.Core` içindeki çalışan işlevleri tek ana KYERP PDKS shell altında birleştir.
4. `HKN.Personel.Bridge` bağımlılığını kaldır.
5. Personel, giriş-çıkış, puantaj, bordro, terminal, raporlar ve kullanıcı yönetimini aynı executable içinde aç.
6. Temp/timerecords/Data kurallarını contract testlere ekle.
7. Tek setup üret ve temiz makine smoke testi yap.
