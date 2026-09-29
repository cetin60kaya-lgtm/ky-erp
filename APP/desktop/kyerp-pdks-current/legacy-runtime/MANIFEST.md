# Legacy runtime manifest

Bu klasör, eski Hedef runtime'ın tam kopyasını public GitHub deposuna koymaz. Amaç; çalışan referans paketin nerede tutulduğunu, hangi parçaların kritik olduğunu ve KYERP PDKS geliştirmesinde neyin korunacağını açıkça sabitlemektir.

## Private tam referans

Aktif çalışma klasörü: `D:\Hedef500\Hedef500`

Google Drive private kopyası: `D:\GoogleDrive\Hakan Emp\KYERP-PDKS\PRIVATE_RUNTIME\Hedef500_2026-09-20`

20.09.2026 kontrolü: 118 dosya, yaklaşık 142.88 MB. Bu private kopya canlı referans olarak korunacaktır.

## Kritik runtime yapısı

- `Hedef.exe`: eski uygulama işlev/davranış referansı.
- `Data\`: canlı Firebird verisi ve bağlantı ayarları. Public Git'e alınmaz.
- `Library\`: Hedef runtime bağımlılıkları.
- `Report\`: FR3 rapor şablonları; puantaj, bordro, giriş-çıkış vb. parity için referanstır.
- `Temp\`: SİLİNMEYECEK. Denetim/backup/ara çalışma akışları bu klasöre bakar.
- `Terminal Bilgi Aktar\`: terminal/kart okuyucu aktarım dosyaları ve yardımcı runtime.
- `Terminal Bilgi Aktar\timerecords.txt`: 0 KB olması normaldir. Kart okuyucu bu dosyaya veri bırakır; uygulama okuduktan sonra içeriği tüketip temizleyebilir. Dosya/yol korunacaktır.
- `Yedek\Yedekle.exe` ve `Yedek\Yukle.exe`: legacy yedekleme/geri yükleme referansı.
- `donemolustur.exe`: dönem işlemleri referansı.
- `Hedef.Lic`: lisans dosyası; yalnız private/local runtime'da tutulur.

## Public GitHub'a alınmayacaklar

`ky-erp` deposu PUBLIC durumdadır. Bu nedenle aşağıdakiler public Git'e kesinlikle yüklenmez:

- `Data\DATABASE.GDB` ve diğer canlı/veri dosyaları
- `Temp\` altındaki GBK/GDB/backup dosyaları
- lisans/anahtar dosyaları
- kullanıcı/personel verisi içeren exportlar
- üçüncü taraf Hedef binary/setup paketleri

## Ürün kararı

Final ürün `KYERP PDKS` olacaktır. `Hedef.exe` kullanıcıya gösterilen ana uygulama olmayacaktır. Bridge/overlay/yama yaklaşımı kalıcı mimari değildir.

Final hedef: tek solution -> tek KYERP PDKS uygulaması -> tek setup -> tek kısayol. Hedef runtime yalnız işlev, veri davranışı, rapor ve terminal akışı referansıdır.

Yerel geliştirmede tam private runtime gerektiğinde `SYNC_PRIVATE_RUNTIME.ps1` kullanılır. Böylece VS Code/Codex kaynak kodu GitHub'dan, özel runtime/veriyi ise private Drive kopyasından birlikte kullanabilir.
