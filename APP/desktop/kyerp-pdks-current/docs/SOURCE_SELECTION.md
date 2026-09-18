# Kaynak Secimi

Google Drive'a tasinan tum Hedef500/Personel calisma klasorleri incelendi. GitHub'a yalniz tekrar derlenebilir asil kaynak seti alindi.

## Alinanlar

- `HKN.Personel.Native` ana C# kaynaklari ve csproj
- `HKN.Personel.Bridge` guncel C# kaynaklari ve csproj
- `SmokeTest` ve `SchemaDump` kaynak/test araclari
- final durum notu
- temiz build scripti ve ortam degiskeni ornegi

## Bilerek alinmayanlar

- `bin`, `obj`
- tum `PUBLISH_*` klasorleri ve uretilmis EXE/DLL ciktilari
- `BACKUP`, gecici kopyalar ve `Program.cs.BAD_*` / `Program.cs.BEFORE_*`
- tek seferlik patch/capture/focus/test PowerShell scriptleri
- canli veritabani ve GBK yedekleri
- personel verisi, lisans, parola/anahtar
- ucuncu taraf Hedef/Delphi binary'leri

Bu secimle GitHub dali deneme kalabaligindan arindirildi; yeniden uretilmesi gereken kod korunuyor.
