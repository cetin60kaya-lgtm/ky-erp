# KYERP PDKS - hedef mimari

Amaç: PDKS çalışmasını tek GitHub çalışma alanından yönetmek, DESEN bilgisayarındaki dağınık deneme klasörlerine tekrar bağımlı kalmamak.

## Katmanlar

- `src/HKN.Personel.Native`: aktif .NET 8 WinForms personel modülü.
- `src/HKN.Personel.Bridge`: legacy Hedef penceresi ile entegrasyon köprüsü.
- `legacy/HKNHedefShell`: daha önce geliştirilen .NET shell denemesi; Codex için referans/yeniden kullanım kaynağı.
- `legacy/HKN_PERSONEL_WEB`: daha önce geliştirilen Node/HTML personel katmanı; Codex için referans/yeniden kullanım kaynağı.
- `tools/SmokeTest`: canlı veriye kalıcı yazmadan transaction/rollback doğrulaması.
- `tools/SchemaDump`: Firebird şema inceleme aracı.
- `legacy-runtime`: üçüncü taraf Hedef runtime dosyalarının Git dışı manifesti ve yerel kurulum düzeni.
- `docs`: mimari, geçiş ve Codex görev tanımı.

## Kaynak kontrol ilkesi

GitHub kaynak kodunun tek doğruluk kaynağıdır. `bin`, `obj`, `publish`, EXE/DLL çıktıları, canlı DB, GBK, lisans ve kullanıcı verileri kaynak kabul edilmez.

## Legacy runtime

Orijinal Hedef kaynak kodu elimizde değildir; `Hedef.exe` yalnız çalışan legacy host/runtime olarak ele alınır. Codex bu binary'yi refactor etmeyecek. Yapılacak geliştirme bizim .NET/Node kaynaklarında olacaktır.

## Uzun vadeli hedef

1. Shell/menü/navigation işlevlerini bizim .NET katmanına taşımak.
2. Personel, giriş-çıkış, izin, ek kazanç/kesinti ve ödeme akışlarını modüler servis/UI katmanlarına ayırmak.
3. Firebird erişimini tek veri katmanına almak.
4. Legacy Hedef host bağımlılığını kademeli azaltmak.
5. Son durumda tek `KYERP PDKS` executable/installer üretmek.
