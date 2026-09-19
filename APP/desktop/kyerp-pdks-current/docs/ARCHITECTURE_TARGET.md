# KYERP PDKS - hedef mimari

Amaç: PDKS çalışmasını tek GitHub çalışma alanından yönetmek ve dağınık deneme klasörlerine tekrar bağımlı kalmamak.

## Ürün kararı: KYERP ana referanstır

**Kalıcı ürün referansı mevcut KYERP masaüstü ve KYERP.NET düzenidir. Hedef değildir.**

Hedef uygulaması yalnızca legacy fonksiyon, iş akışı, rapor, terminal ve veri davranışı referansıdır. Hedef'teki bir özellik KYERP'de eksikse özellik envanterlenir ve mevcut KYERP düzenine uyarlanır; Hedef ekranı veya Hedef UX'i ürün olarak kopyalanmaz.

- Mevcut KYERP ana pencere yapısı korunur.
- Mevcut KYERP menü/toolbar düzeni korunur.
- Mevcut KYERP Personel ve diğer aktif modül ekranları korunur.
- Sekmeler, butonlar, açılırlar ve işlem sıraları yalnız gerekli fonksiyon eklemeleri kadar genişletilir; mevcut KYERP akışı sebepsiz değiştirilmez.
- Hedef'teki eksik işlevler KYERP tasarım ve navigasyon mantığına göre eklenir.

Bu kuralın ayrıntısı `docs/UI_PARITY_LOCK.md` dosyasındadır ve mimari refactor sırasında bağlayıcıdır.

## Katmanlar

- `src/HKN.Personel.Native`: aktif .NET 8 WinForms personel modülü ve mevcut KYERP masaüstü uygulama tabanı.
- `src/HKN.Personel.Bridge`: legacy Hedef penceresi ile entegrasyon köprüsü; geçiş/reference katmanıdır.
- `legacy/HKNHedefShell`: daha önce geliştirilen .NET shell denemesi; yalnız legacy davranış/yeniden kullanım referansıdır.
- `legacy/HKN_PERSONEL_WEB`: daha önce geliştirilen Node/HTML personel katmanı; yalnız davranış/veri/işlem referansıdır.
- `tools/SmokeTest`: canlı veriye kalıcı yazmadan transaction/rollback doğrulaması.
- `tools/SchemaDump`: Firebird şema inceleme aracı.
- `legacy-runtime`: üçüncü taraf Hedef runtime dosyalarının Git dışı/yerel runtime düzeni ve manifesti.
- `docs`: mimari, geçiş, parity ve Codex görev tanımı.

## Kaynak kontrol ilkesi

GitHub bizim kaynak kodumuzun ve uygulama haritasının tek doğruluk kaynağıdır. Build çıktıları kaynak kabul edilmez. Canlı DB/personel verisi ayrı güvenli runtime/backup katmanında tutulur.

## Legacy runtime

Orijinal Hedef kaynak kodu elimizde değildir; `Hedef.exe` çalışan legacy host/runtime ve fonksiyonel davranış referansıdır. Codex bu binary'yi refactor etmeyecek veya patchlemeyecek. Hedef'in amacı KYERP'yi şekillendirmek değil, KYERP'de eksik kalmış fonksiyonların unutulmamasını sağlamaktır.

## Uzun vadeli hedef

1. Mevcut KYERP masaüstü görünümünü ve kullanıcı akışını korumak.
2. Hedef'teki bütün menü, işlem, rapor, terminal ve veri fonksiyonlarını envanterleyip KYERP karşılıklarını tamamlamak.
3. Personel, giriş-çıkış, izin, ek kazanç/kesinti, puantaj, bordro ve ödeme akışlarını kullanıcıya görünmeden modüler servis/data katmanlarına ayırmak.
4. Firebird erişimini tek veri katmanına almak.
5. Multi-company/tenant context eklemek; görünür KYERP ekran düzenini değiştirmemek.
6. KYERP.NET ile ortak domain/API/sync modeli kurmak; Desktop ve Web aynı işlev haritasını paylaşırken kendi mevcut KYERP tasarım dillerini korumak.
7. Legacy Hedef host bağımlılığını ancak bütün işlev paritesi doğrulandıktan sonra azaltmak.
8. Son durumda tek `KYERP PDKS` executable/installer üretmek; bu ürün Hedef'e değil KYERP düzenine ait olacaktır.
