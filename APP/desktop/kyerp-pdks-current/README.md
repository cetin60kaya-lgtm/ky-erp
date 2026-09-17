# KYERP PDKS

Bu alan, DESEN bilgisayarinda halen calisan mevcut PDKS uygulamasinin **bizim tarafimizdan gelistirilen kaynaklarini ve entegrasyon katmanini** GitHub uzerinden yonetmek icindir.

## Canli sistem kaynaklari

- Hedef ana uygulama: `D:\Hedef500\Hedef500\Hedef.exe`
- HKN Personel Native: `D:\Hedef500\Hedef500\HKN.Personel.Native.exe`
- HKN Personel Bridge: `D:\Hedef500\Hedef500\HKN.Personel.Bridge.exe`
- Bizim kaynak kokumuz: `D:\Hedef500\HKN_NATIVE_PERSONEL`

## Bu projeye alinacaklar

- HKN.Personel.Native kaynaklari
- HKN.Personel.Bridge kaynaklari
- build/publish scriptleri
- entegrasyon ve test scriptleri
- lisans/kisisel veri icermeyen referans ve notlar

## Bu projeye alinmayacaklar

- canli `DATABASE.GDB`, `*.gbk`, personel verileri
- lisans/anahtar/parola dosyalari
- ucuncu taraf Hedef/Delphi binary'leri
- Firebird kurulum paketleri
- bin/obj/publish/yedek/gecici dosyalar

## Calisma dali

`codex/kyerp-pdks-current-app`

Canli veriye dokunmadan mevcut uygulamanin bizim kaynaklari bu alana snapshot olarak aktarilir.
