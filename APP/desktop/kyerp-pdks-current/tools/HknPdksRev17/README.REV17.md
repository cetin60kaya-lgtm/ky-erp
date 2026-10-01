# HKN PDKS REV17 — DB/TNF görsel eşitleme

## Kaynak ve kapsam

Bu bağımsız hızlı veri uygulaması REV15/REV16 modüllerini korur. Native KYERP 6.4 kabuğunun kaynaklarına yama uygulanmaz. Giriş şifresi, Personel, Giriş-Çıkış, Toplu İşlem, E İşlemleri, Bordro, Ödeme/Avans ve TNF Hazırla korunur.

DB-TNF ekranı personel/hata listesi, personel özeti ve aynı anahtara hizalanmış ayrı DB/TNF tablolarından oluşur. Anahtar kart+tarih+taraf; yok taraf BOŞ görünür. Kaydırma ve seçim iki tabloda ortak çalışır. Aktif/pasif, hatalı, dönem hareketi ve kart/ad filtreleri vardır.

## Donmanın giderilmesi

Eski eşitleme akışı UI thread üzerinde DB okuma, TNF parse ve karşılaştırma yapıyordu. Binding sırasında personel sorgulama ve bütün grid hücrelerini tekrar değiştirme de arayüzü bloke ediyordu. REV17 sorgu/parse/lookup/karşılaştırma ve liste hazırlığını Task.Run altında yapar; UI yalnız hazır listeleri bir defada bağlar. CancellationToken, tek işlem kilidi, progress ve iptal vardır. Satır görünümü CellFormatting üzerinden sağlanır.

DB tek ExecuteReader sorgusunda dönem GIRCIK hareketlerini ve yalnız ilgili kartların KIMLIK/DURUM bilgilerini döndürür. Tüm personel geçmişi taranmaz. TNF tek byte okumasıyla parse edilir. Kart/tarih/taraf lookupları tekrar eden liste taramalarını önler. Tam kontrol dosya yılının tamamını kapsar; TNF son tarihi kapsamı daraltmaz.

## Güvenli eşleştirme ve düzeltme

- DB ana kaynaktır; normal eşitleme hiçbir DB kaydını değiştirmez.
- TNF biçiminde taraf alanı yoktur. Tekil DB saat eşleşmesi tarafı belirler; kalan tekil adaylarda DB saat bandı kullanılır. Belirsiz/çoklu aday ve mükerrer TNF otomatik düzeltilmez; İNCELE gösterilir. TNF-only satırlarda giriş/çıkış gösterimi öğle öncesi/sonrası kuralıyla yapılır.
- DB TUR=E kaydı TNF'de bulunmamalıdır. Kesin eşleşme güvenli silme olarak önerilir; belirsiz E eşleşmesi İNCELE'dir.
- Personel durumu gerçek KIMLIK/DURUM değerinden normalize edilir. DB'de boş durumdan AKTİF uydurulmaz. Boş durum fakat çelişkisiz işe giriş/çıkış sınırı olan kayıtların bu aralıktaki hareketleri geçerlidir; aralık dışı durum belirsizse otomatik silinmez.
- Aktif yeniden işe girişte eski çıkışa kadar geçmiş korunur, ara boşluk geçersizdir, yeni girişten itibaren geçerlidir. Çoklu/çelişkili personel tanımı İNCELE'dir.
- Düzeltme yalnız seçili personelin işaretlenmiş güvenli satırları üzerinde, kullanıcı onayıyla uygulanır. Öncesinde DB/personel/TNF fingerprint tekrar okunarak eski sonuçla yazma engellenir.
- TNF değişiminden önce _YEDEK altında tam dosya yedeği alınır; atomik değiştirme uygulanır. Sonrasında yıllık SON TAM KONTROL otomatik çalışır.
- GEÇERSİZ DB KAYDINI TEMİZLE ayrı bir işlemdir. Yalnız seçili kesin-geçersiz taraf üzerinde onay, transaction, tam GIRCIK satır JSON dump ve yeniden doğrulamayla çalışır. İNCELE ve seçilmemiş satırlar korunur.

## Build ve test

Windows .NET 8 SDK gerekir. Açılış parolasının mevcut özel doğrulayıcısı varsayılan olarak LocalAppData/HKN-PDKS/REV15_PASSWORD_GATE.json konumundan embed edilir. Alternatif konum HknPasswordGateFile MSBuild özelliğiyle verilir. Bu dosya, şirket verileri, binary çıktılar ve canlı test kanıtları Git'e eklenmez. Doğrulayıcı bulunmazsa build bilerek durur; açılış şifresi kaldırılmaz.

```powershell
dotnet build tools/HknRev17Tests/SyncTests.csproj -c Release
dotnet publish tools/HknPdksRev17/QuickDataTool.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -o <06_BUILD>/HKN_REV17_FINAL
```

Test çalıştırma seçenekleri Program.cs içindedir. Yazma testleri yalnız geçici/sentetik fixture dosyalarıyla yapılır. Canlı DB/TNF üzerinde yalnız okuma ve karşılaştırma testi yürütülür. Build çıktılarını 06_BUILD, yerel kanıtları 08_TEST altında tutun. PERF.log LocalAppData/HKN-PDKS altındadır.

## 01.10.2026 doğrulaması

- 73 assertion geçti: karşılaştırma, istihdam tarihleri, mükerrer/belirsiz taraflar, 100k sentetik grup, fixture-only düzeltme/yedek/DB dump, canlı readonly, gerçek kontrol üzerinde hizalama/kaydırma/seçim/iptal/UI heartbeat, mevcut modüller ve parola doğrulayıcısı.
- Canlı tam yıllık UI kontrolü: DB 132 ms, TNF 6 ms, karşılaştırma 36 ms, grid bind 20 ms, toplam 252 ms. UI heartbeat en büyük aralığı 251 ms. Toplam; hazırlık ve UI zamanlamasını da içerir, alt sürelerin aritmetik toplamı değildir.
- Standart PDKS_DENETIM_PASS: 39 fonksiyon, 0 hata; 24 form UI audit, 0 hata; shell ve V4 smoke geçti.
- Release win-x64 self-contained single-file yayın başarılı. Eski recovered kaynakta nullable uyarıları vardır; sıfır uyarı iddiası yoktur.
- Final EXE'nin gerçek parola penceresi ve Responding=True doğrulandı. Şifre girilmedi; açılış kapısı bypass edilmedi. Gizli başlatılan pencere Win32 üzerinden denetlendi ve yalnız test süreci kapatıldı.
- Canlı hatalar raporlanmıştır, otomatik düzeltilmemiştir. Eksik/Fazla/Saat farkının sıfırlanması ancak kullanıcının seçtiği güvenli düzeltmeler uygulandıktan sonra yeniden kontrolle doğrulanabilir.
