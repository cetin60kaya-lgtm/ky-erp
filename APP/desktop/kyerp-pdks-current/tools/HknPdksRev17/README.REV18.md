# HKN PDKS REV18 — kolay personel düzeltme

REV17 kaynak projesinin yerinde devamıdır; yeni ürün sürümü 18.0.0. Native KYERP kabuğu ve diğer çalışan hızlı veri modülleri değiştirilmez. REV17 EXE korunur. Açılış şifresi aynı özel embed doğrulayıcısını kullanır.

## İş mantığı

- DB ham durumu DURUM.AD üzerinden aynen gösterilir; efektif durum, işe giriş/çıkış tarihleri ve seçili kontrol döneminin son gününe göre ayrıca hesaplanır. Özette dönem sonu referansı belirtilir.
- Hire dolu / Exit boş: işe girişten itibaren aktif. Exit >= Hire: giriş ve çıkış günü dahil geçerli; sonraki hareket kesin geçersizdir. Eski aktif DB etiketi bu tarihi belirsiz yapmaz; durum/tarih çelişkisi ayrı nottur.
- Son Hire eski Exit sonrasındaysa eski çıkışa kadar geçmiş korunur, ara boşluk geçersiz, yeni girişten sonrası geçerlidir. Pasif etiketli ters tarih veya çoklu KIMLIK kaydında dönem açıklığı yoksa İNCELE korunur.
- TNF bir kez okunup parse edilir; tek read-only DB sorgusu seçili GIRCIK hareketlerini ve GIRCIK/TNF birleşimindeki ilgili kartların personel bilgilerini getirir. TNF-only kartlar listeden düşmez; tüm KIMLIK geçmişi taranmaz.
- DB satırı tekil, TNF'de tam saat karşılığı da tekil ve diğer TNF saatleri farklıysa: doğru karşılık korunur, açıkça fazla kalan TNF satırları güvenli silmedir. Aynı saatin tekrarı, çoklu DB, eşleşmeyen çoklu saat adayı veya belirsiz taraf İNCELE olarak kalır.
- TNF taraf alanı içermez. DB tekil saat eşleşmesi / DB saat bandı üzerinden taraf hizalaması korunur. TNF-only satırlardaki giriş/çıkış etiketi öğle öncesi/sonrası gösterim kuralıdır; DB kaydı uydurulmaz.
- Kesin geçersiz tarihli, tekil/standart TNF satırı normal TNF düzeltmesinde silinebilir; eşlik eden geçersiz DB hareketi değiştirilmez. TNF kalmamış kesin geçersiz DB satırı GEÇERSİZ DB olarak ayrı gösterilir, gereksiz İNCELE sayılmaz.
- E kaydının tekil, belirlenmiş taraf karşılığı TNF'de olmamalıdır; güvenli TNF SİL E önerilir. Bozuk TNF alan ayırıcıları/type/code ve saatleri otomatik değiştirilmez.

## Kullanıcı akışı

1. KONTROL ET veya SON TAM KONTROL ile sonuç al.
2. Soldan personel seç; ham DB durumu, efektif durum, tarihler, DB/TNF hareket ve Eksik/Fazla/Saat Farkı/İncele sütunlarını karşılaştır.
3. BU PERSONELİ DB'YE GÖRE DÜZELT checkbox gerektirmeden o kişinin görünür güvenli EKLE/SİL FAZLA/SİL E/DÜZELT işlemlerini toplar. Eksik, Fazla, Saat farkı ve E kaydı adetli onay gösterir.
4. Onayla: önce _YEDEK; normal işlem yalnız TNF üzerinde. Kaynak fingerprint kontrolü ve atomik dosya değiştirme korunur. Başka personelin veya İNCELE satırlarının kaydı değişmez.
5. Yalnız bu personel aynı tarih kapsamıyla otomatik tekrar kontrol edilir. Bütün hataları düzelse ve hareketi sıfırlansa da personel özeti görünür tutulur. SON TAM KONTROL isteğe bağlıdır.
6. SEÇİLENLERİ UYGULA yalnız checkbox işaretli güvenli satırları uygular. GÜVENLİ HATALARI SEÇ / SEÇİMİ KALDIR korunur.
7. GEÇERSİZ DB KAYDINI TEMİZLE ayrı onaylı işlem olarak kalır; yalnız seçili kesin DB tarafı transaction/tam satır dump/TNF yedeğiyle temizlenir.

## Doğrulama — 01.10.2026

- 103 assertion geçti: eski hizalama, tarih kuralları, ham/efektif durum ayrımı, eksik/fazla/E/saat farkı, tam saat ankrajıyla güvenli fazla ayrımı, mükerrer/belirsiz koruma, 100k sentetik grup, checkbox'sız personel planı, kaynak değişimi, iptal, mevcut modüller ve parola.
- Yazma testleri yalnız 08_TEST altındaki yeni sentetik SYNTHETIC.GDB/TR2026.Tnf fixture dosyalarında yapıldı. Canlı DB/TNF yalnız okundu. Canlı TNF test başlangıç/son hash eşitliği doğrulandı.
- Gerçek kontrol ölçümü: DB 68 ms, TNF 8 ms, compare 40 ms, grid bind 20 ms, toplam 196 ms. En büyük UI heartbeat aralığı 259 ms.
- Release .NET 8 / win-x64 / self-contained / single-file build başarılı. Eski recovered kaynak nullable uyarıları korunur; sıfır uyarı iddiası yoktur.
- Şirket personel verileri, ekran görüntüsü, canlı sonuç logları, binary çıktılar ve özel parola doğrulayıcısı Git'e eklenmez. Yerel kanıtlar 08_TEST/REV18_* altında; uygulama süreleri LocalAppData/HKN-PDKS/PERF.log içinde.

## Build

```powershell
dotnet build tools/HknRev17Tests/SyncTests.csproj -c Release
dotnet publish tools/HknPdksRev17/QuickDataTool.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -o <06_BUILD>/HKN_REV18_FINAL
```

HknPasswordGateFile özel doğrulayıcı konumunu seçer. Varsayılan LocalAppData/HKN-PDKS/REV15_PASSWORD_GATE.json; bulunmazsa build durur, şifre kaldırılmaz. Eski [REV17 notları](README.REV17.md) tarihsel kayıttır; REV18 işlem kuralları için bu dosya üstündür.
