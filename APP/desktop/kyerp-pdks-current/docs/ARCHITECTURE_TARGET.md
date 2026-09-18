# KYERP PDKS - hedef mimari

Amaç: PDKS çalışmasını tek GitHub çalışma alanından yönetmek, DESEN bilgisayarındaki dağınık deneme klasörlerine tekrar bağımlı kalmamak.

## Ürün kararı: görünür masaüstü yeniden yapılmayacak

Mevcut KY PDKS/Hedef tabanlı masaüstü görünümü ve kullanıcı akışı kalıcı referanstır. Hedef mimari, **arka plan mimarisini** temizler; kullanıcıya görünen masaüstünü yeniden tasarlamaz.

- Ana pencere yapısı aynı kalır.
- Üst menü ve toolbar sırası aynı kalır.
- İkonlu klasik masaüstü görünümü aynı kalır.
- Personel Bilgileri ve diğer bütün modül pencereleri aynı klasik düzeni korur.
- Sekmeler, butonlar, açılırlar, modal/child pencereler ve işlem sıraları korunur.
- Kod katmanları değişse bile kullanıcı mevcut ekranı aynı yerleşim ve aynı akışla görür.

Bu kuralın ayrıntısı `docs/UI_PARITY_LOCK.md` dosyasındadır ve mimari refactor sırasında bağlayıcıdır.

## Katmanlar

- `src/HKN.Personel.Native`: aktif .NET 8 WinForms personel modülü ve mevcut masaüstü görünüm referansının aktif uygulaması.
- `src/HKN.Personel.Bridge`: legacy Hedef penceresi ile entegrasyon köprüsü.
- `legacy/HKNHedefShell`: daha önce geliştirilen .NET shell denemesi; yalnız referans/yeniden kullanım kaynağı, yeni UI üretme gerekçesi değildir.
- `legacy/HKN_PERSONEL_WEB`: daha önce geliştirilen Node/HTML personel katmanı; yalnız davranış/veri/işlem referansı, masaüstü tasarım referansı değildir.
- `tools/SmokeTest`: canlı veriye kalıcı yazmadan transaction/rollback doğrulaması.
- `tools/SchemaDump`: Firebird şema inceleme aracı.
- `legacy-runtime`: üçüncü taraf Hedef runtime dosyalarının Git dışı/yerel runtime düzeni ve manifesti.
- `docs`: mimari, geçiş, parity ve Codex görev tanımı.

## Kaynak kontrol ilkesi

GitHub bizim kaynak kodumuzun ve uygulama haritasının tek doğruluk kaynağıdır. Build çıktıları kaynak kabul edilmez. Canlı DB/personel verisi ayrı güvenli runtime/backup katmanında tutulur.

## Legacy runtime

Orijinal Hedef kaynak kodu elimizde değildir; `Hedef.exe` çalışan legacy host/runtime ve davranış referansıdır. Codex bu binary'yi refactor etmeyecek veya patchlemeyecek. Görünür masaüstü davranışı Hedef/KY PDKS referansına göre korunurken geliştirme bizim .NET/Node/API kaynaklarında yapılacaktır.

## Uzun vadeli hedef

1. Mevcut shell/menü/navigation görünümünü ve davranışını **bire bir koruyarak** bizim yönetilebilir .NET katmanına almak.
2. Personel, giriş-çıkış, izin, ek kazanç/kesinti, puantaj, bordro ve ödeme akışlarını kullanıcıya görünmeden modüler servis/data katmanlarına ayırmak.
3. Firebird erişimini tek veri katmanına almak.
4. Multi-company/tenant context eklemek; görünür ekran düzenini değiştirmemek.
5. KYERP.NET ile ortak domain/API/sync modeli kurmak; masaüstünü web arayüzüne dönüştürmemek.
6. Legacy Hedef host bağımlılığını ancak bütün menü/ekran/işlev paritesi doğrulandıktan sonra azaltmak.
7. Son durumda tek `KYERP PDKS` executable/installer üretmek; fakat kullanıcıya görünen masaüstü mevcut referansla aynı kalmak zorundadır.
