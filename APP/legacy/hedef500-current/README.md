# Hedef500 Current App

Bu klasor, DESEN bilgisayarinda halen calisan Hedef500 tabanli uygulamanin **bizim tarafimizdan eklenen/degistirilen kaynaklarini** GitHub uzerinden yonetmek icindir.

## Canli yollar

- Hedef ana uygulama: `D:\Hedef500\Hedef500\Hedef.exe`
- HKN Personel Native: `D:\Hedef500\Hedef500\HKN.Personel.Native.exe`
- HKN Personel Bridge: `D:\Hedef500\Hedef500\HKN.Personel.Bridge.exe`
- HKN kaynak kok: `D:\Hedef500\HKN_NATIVE_PERSONEL`
- Hedef veritabani: `D:\Hedef500\Hedef500\Data\DATABASE.GDB`

## GitHub'a alinacaklar

- `HKN.Personel.Native` kaynaklari
- `HKN.Personel.Bridge` kaynaklari
- build/publish scriptleri
- entegrasyon ve test scriptleri
- rapor/arayuz referanslari (lisans ve kisisel veri icermeyenler)

## GitHub'a alinmayacaklar

- `DATABASE.GDB`, `*.gbk`, canli personel verileri
- lisans/anahtar/parola dosyalari
- ucuncu taraf Hedef/Delphi binary'leri ve Firebird kurulum paketleri
- `bin/`, `obj/`, publish ciktisi, gecici yedekler

## Calisma dali

`codex/hedef500-current-app`

Bu dal, mevcut canli uygulamayi kaynak kontrolune almak icin acilmistir. Canli veritabanina dokunmadan kaynaklar GitHub'a aktarilir.
