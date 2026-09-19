# KYERP PDKS — TAM FONKSİYONEL TEST / REGRESSION GATE

Tarih: 2026-09-19

Amaç: KYERP PDKS masaüstü uygulamasında kullanıcıya görünen **tüm sekme, menü, dialog, hesaplama, rapor ve tanım işlemlerini** login entegrasyonuna geçmeden önce baştan sona doğrulamak.

## Test kuralları

- Yeni ayrı uygulama yazılmayacak; mevcut `HKN.Personel.Native` / KYERP PDKS test edilecek.
- Hedef UI kopyalanmayacak; mevcut KYERP davranışı test edilecek.
- Canlı Firebird üzerinde kalıcı test verisi bırakılmayacak.
- Yazma testleri transaction + rollback ile veya doğrulanmış test DB kopyasında yapılacak.
- Her başarısızlık için: ekran/modül, adım, beklenen, gerçekleşen, hata/stack ve düzeltilen commit kaydedilecek.
- Bir test başarısızsa yalnız raporlanıp bırakılmayacak; güvenli şekilde düzeltilebiliyorsa aynı çalışma turunda düzeltilecek, build/test tekrar alınacak.
- Başarılı sayılması için yalnız build yetmez; kaynak wiring, servis/repository, hesaplama ve çıktı davranışı da doğrulanacak.

## A. Uygulama açılışı ve ana personel ekranı

1. Uygulama açılıyor; crash/boş form yok.
2. Personel listesi yükleniyor.
3. Personel seçimi sağ paneli yeniliyor.
4. Arama alanları çalışıyor: Kart No / Ad / Soyad / İşe Giriş / İşten Çıkış.
5. Sıralama çalışıyor.
6. Önceki/sonraki personel navigasyonu çalışıyor.
7. Alt sayaçlar doğru hesaplanıyor: aktif / ayrılan / toplam / listelenen.
8. Fotoğraf yükleme/gösterme davranışı bozuk değil.
9. Header alanları doğru bağlanıyor: Kart No, Grup, Ad, Bölüm, Soyad, Durum, Maaş, Servis, İşe Giriş, Görev, Çıkış, Firma.

## B. Personel Bilgileri sekmesi

### B1. Kimlik Bilgileri

- Ulusal Kimlik No
- Cinsiyet
- İl / İlçe
- Kan Grubu
- Cilt No
- Doğum Tarihi / Doğum Yeri
- Sayfa / Kayıt / Kütük Sıra No
- Baba / Ana Adı
- N.C. veriliş yeri / tarihi / nedeni
- Medeni Hal
- Uyruk

Doğrula: yükleme, düzenleme, kaydetme, yeniden açınca geri okuma.

### B2. Kişisel Bilgiler

- Vergi Kimlik No
- SSK No
- Askerlik Durumu
- Eğitim / yabancı dil / uzmanlık
- Elbise / ayakkabı
- Çocuk sayısı
- Ehliyet alanları
- Ev / cep telefonu
- Fazla Mesai Ücreti
- Günlük Yemek Ücreti
- Günlük Yol Ücreti
- Kullandığı Cihaz
- Eski Maaş
- İşten Çıkış Sebebi
- Adres

Doğrula: yükleme, düzenleme, kaydetme, yeniden okuma.

### B3. Personel işlemleri

- Yeni Ekle
- Değiştir
- Sil / işten çıkış işaretleme
- Per. Bilgisi yenileme
- Kart no validation
- İşe giriş / çıkış tarih validation
- zorunlu alanlar
- fotoğraf davranışı

Yazma testleri rollback/test DB ile yapılmalı.

## C. Giriş ve Çıkışları

- Dönem seçimi
- Tarih aralığı
- Seçili Tarihi Göster
- Listeleme
- Yeni Ekle
- Değiştir
- Sil
- Tümünü Sil güvenliği
- giriş/çıkış saat sırası validation
- gece yarısına taşan kayıt
- aynı kayıt duplicate davranışı
- personel + tarih filtresi

## D. İzinler

- Dönem/tarih filtresi
- listeleme
- Yeni Ekle
- Değiştir
- Sil
- Tümünü Sil güvenliği
- tam günlük / saatlik izin davranışı
- başlangıç/bitiş/süre validation
- mazeret/tip/bordro alanı bağlantısı
- tekli ve toplu CRUD varsa doğrula

## E. Ek Kazanç ve Kesintiler / Avans

- listeleme
- Yeni Ekle
- Değiştir
- Sil
- Tümünü Sil güvenliği
- Ek Kazanç
- Kesinti
- Avans semantiği mevcut kodun desteklediği kadarıyla
- işlem tarihi / veriliş tarihi
- miktar
- taksit sayısı
- açıklama
- negatif/bozuk tutar validation
- dönem toplamlarına doğru etkisi

## F. Bilgi / Puantaj

- Dönem seçimi
- Tümü
- Normal Çalışma
- Mesai
- Devamsızlık
- Geç Kalma
- Eksik Süre
- `PUANTAJ` satırlarının doğru okunması
- normal gün/saat
- %50 / %100 mesai
- ücretsiz izin / devamsızlık / geç / erken / eksik süre alanları
- mevcut `PayrollCalculator` / puantaj çekirdeği ile UI toplamlarının aynı olması
- dönem sınırları

Dönem kapatma iş kuralı doğrulanmamışsa tahmin edilerek test/özellik eklenmeyecek.

## G. Ödemeler / Ücret / Maaş / Mesai

- Dönem seçimi
- Normal Çalışma toplamı: saat / gün / ücret
- Ek Kesinti
- Ek Kazanç
- Yol Parası
- Yemek Parası
- Devir
- Ödenecek
- Ödenen Maaş
- Kalan Ödeme
- Mesai
- Ödenen Mesai
- Kalan Mesai
- Ödenecek Net Tutar
- `Hesapla`
- `Maaş ve Mesai Ödemesi`
- atomik `ODEME` kaydı
- aynı dönem tekrar kaydetme/upsert davranışı
- maaş/mesai ödeme tarihleri
- negatif/bozuk değer validation
- kaydet → yeniden oku eşitliği

## H. Maaş Geçmişi

- İşlemler > Maaş Geçmişi açılıyor.
- seçili personel doğru geliyor.
- dönem/tarih/tutar geçmişi doğru okunuyor.
- boş kayıt ve hatalı kayıt durumları kontrollü.

## I. Organizasyon Tanımları

Her biri ayrı test edilecek:

- Grup
- Bölüm
- Durum
- Servis
- Görev
- Firma

Her tür için:
- listele
- Yeni
- Düzenle
- Sil
- boş ad validation
- personelde kullanılan tanımı silme engeli
- gerçek diğer FK/kullanım referanslarında kullanılan tanımı silme engeli
- GRUP için `KIMLIK.GRUP` + `DONEM.GRUP` kullanım koruması
- silme mesajı hangi kullanımın kaç kayıt olduğunu açıklamalı

## J. Dönem Tanımları

- listeleme
- Yeni
- Düzenle
- grup seçimi zorunlu
- başlangıç/bitiş validation
- bitiş >= başlangıç
- aynı grup + aynı başlangıç/bitiş duplicate engeli
- mevcut dönemleri tekrar yükleme
- dönem combo'larının yenilenmesi
- dönem kapatma şeması doğrulanmadıysa kapatma özelliği uydurulmayacak

## K. Günlük Operasyon

- tarih seçimi
- Beklenen
- Gelen
- Gelmeyen
- Açık Kayıt
- Gündüz
- Gece
- Bugünkü Ekip
- Gelmeyenler
- Çıkış Bekleyenler
- aktif personel rosterı ile `GIRCIK` eşleşmesi
- boş gün / hiç kayıt yok durumu
- geceye taşan kayıt sınıflaması

## L. Terminal Aktarım Profilleri

- profil listesi
- Yeni Profil
- Profili Kopyala
- Düzenle
- Sil
- Varsayılan Yap
- Canonical profil koruması
- Örnek Satır Test Et / önizleme
- Dosyadan Aktar
- JSON Import
- JSON Export

Formatlar:
- FixedWidth
- Delimited
- Tnf

Alanlar:
- tenant/company/workplace/device
- separator
- encoding
- kart no konumu
- yıl/ay/gün
- saat/dakika
- olay kodu
- terminal kodu
- DateFormat / TimeFormat
- giriş/çıkış kod eşlemeleri
- terminal program yolu
- aktarım dosyası yolu

Canonical KYERP TNF v1:
`KartNo,HH:mm,ddMMyy,1,001`

Örnek:
`00003,08:28,250526,1,001`

TNF testleri:
- valid satır
- bozuk kart no
- bozuk saat
- bozuk tarih
- 4. alan != 1
- 5. alan != 001
- boş satır
- duplicate
- import
- export → re-import roundtrip

Fiziksel cihaz üretici protokolü kesin kaynak yoksa blocker olarak kalacak; tahmin edilmeyecek.

## M. Raporlar

Menüdeki her rapor tek tek açılacak:

1. Ayrıntılı Kişisel Bordro
2. Personel Bilgi Formu
3. Personel Bilgi Formu (Boş)
4. Kişisel Giriş Çıkış Raporu
5. Kişisel İzin Kartı
6. Kişisel Ek Kazanç ve Kesinti Kartı

Her biri için:
- seçili personel doğruluğu
- dönem/tarih doğruluğu
- boş veri davranışı
- print preview
- Türkçe karakter
- sayfa taşması / clipping
- toplamların UI ile tutarlılığı

## N. PDF / Excel

- Aktif Tabloyu PDF Aktar
- Aktif Tabloyu Excel Aktar
- gerçek dosya oluşuyor
- XLSX gerçekten açılabilir workbook
- PDF açılabilir
- Türkçe karakter
- sütun başlıkları
- veri satır sayısı
- toplamlar
- boş tablo davranışı

## O. İşlemler menüsü

Tek tek doğrula:

- Personel Listesi Filtreleme (F3)
- Süreli Personel Kaydırma (F4)
- Hesapla (F5)
- Maaş Geçmişi
- Günlük Operasyon
- Organizasyon Tanımları
- Dönem Tanımları
- Terminal Aktarım Profilleri

Kısayollar F2/F3/F4/F5 çakışma/crash üretmemeli.

## P. Raporlar menüsü / F2

- F2 Ayrıntılı Kişisel Bordro açıyor.
- Diğer raporlar mouse/menü ile açılıyor.
- PDF/Excel export aktif tabloyu doğru yakalıyor.

## Q. Veri güvenliği / DB katmanı

- Hard-coded DB password yok.
- Parametreli SQL kullanılan yerler doğrulanır.
- Dinamik tablo/kolon adları yalnız kod içi whitelist ise kabul edilir.
- transaction gerektiren çok adımlı ödeme/terminal aktarımı atomik.
- rollback-only test path çalışıyor.
- canlı DB üzerinde test izi bırakılmıyor.
- SchemaDump yalnız şema okuyor; personel veri örneği dökmüyor.

## R. Build / contract / static gate

- `KYERP.PDKS.sln` build: 0 hata / 0 uyarı
- ContractTests: tamamı başarılı
- Worker typecheck: başarılı
- Worker tests: başarılı
- Wrangler dry-run: başarılı
- worktree clean

## S. UI regression / görünürlük

Her ana ekran ve dialog için:
- 100% DPI
- mümkünse 125% DPI
- alt/sağ clipping yok
- butonlar görünür
- grid sütunları okunur
- dialog minimum size mantıklı
- tab geçişinde butonlar kaybolmuyor/üst üste binmiyor
- modal pencere arkada kalmıyor
- exception kullanıcıya anlaşılır mesajla gösteriliyor

## T. Kabul raporu

Test sonunda `docs/PDKS_FULL_FUNCTIONAL_TEST_RESULT_20260919.md` üret.

Her satır: `PASS / FAIL / BLOCKED`.

Final özette yalnız şunlar olsun:
- toplam PASS / FAIL / BLOCKED
- düzeltilen buglar ve commitler
- halen gerçek blocker olanlar
- canlı kullanıcı testi için açılmaya hazır mı

**Login / KYERP.NET kullanıcı adı-şifre entegrasyonuna bu regression gate tamamlanmadan geçilmez.**
