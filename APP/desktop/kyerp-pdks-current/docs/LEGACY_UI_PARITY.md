# KYERP PDKS - İlk Etap Bire Bir Uyum Kuralı

İlk etap hedefi yeni bir arayüz tasarlamak değildir. Referans, çalışan Hedef PDKS uygulamasının mevcut ekran akışı ve yerleşimidir.

## Değişmez görünür sıra

Ana menü sırası:

`Ayarlar | Tanımlar | İşlemler | Raporlar | Araçlar | Transfer | Hakkında`

Ana araç çubuğu sırası:

`Bilgi Aktar | Gruplar | Dönemler | Bölümler | Giriş-Çıkışlar | Per. Bilgileri | Avanslar | Puantaj | Puantaj Son. | Bordro | Çalışma Tarihi | WC (gizli kaynak)`

Bu sıra ShellSmokeTest tarafından korunur.

## Doğrulanan modal geometriler

`Gruplar 543x448 | Çalışma Sistemleri 609x450 | Dönemler 738x422 | Personel 940x731 | Giriş-Çıkış 777x609 | Avans 764x508 | Puantaj 689x504 | Bordro 616x496 | Terminal Transfer 409x553`

Puantaj, Bordro ve Terminal form tab/komut/mnemonic düzenleri de ShellSmokeTest içinde invariant olarak doğrulanır.

## Personel istisnası

Eski uygulamada pasif olan `Per. Bilgileri` bölümü KYERP içinde aktif hale getirilir. Personel ekranı mevcut Hedef ekranının klasik düzenini temel alır; sol liste, üst personel bilgileri, alt sekmeler ve dönem/tarih akışı korunur.

## Diğer modüller

Gruplar, Dönemler, Bölümler, Giriş-Çıkışlar, Avanslar, Puantaj, Puantaj Sonuçları, Bordro, Çalışma Tarihi, Raporlar ve Transfer için ilk etapta yeni menü adı, yeni sekme hiyerarşisi veya yeni dashboard eklenmez. Referans uygulamadaki görev ayrımı korunur.

## Ek kolaylıklar

KYERP'e özel hızlı giriş, kullanıcı yönetimi, veri bağlantısı ve benzeri kolaylıklar mevcut akışı bozmayacak şekilde ikincil konumda tutulur. İlk etap bire bir uyum tamamlanmadan görünür ana navigasyon değiştirilmez.

## Veri kuralı

Canlı veri kaynağı Firebird `DATABASE.GDB` dosyasıdır. `Temp` ve `Terminal Bilgi Aktar` klasörleri sistemin çalışma parçalarıdır; 0 KB `timerecords.txt` geçerli olabilir ve silinmez.
