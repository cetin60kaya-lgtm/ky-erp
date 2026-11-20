# KY ERP — İşNet NetteFatura Tüm Belge Tipleri Okuma Testi

**20.11.2026 / izole test / üretim entegrasyonu değil.**

Bu araç, kullanıcı tarafından **gerçek İşNet NetteFatura hesabında** başarıyla test edilen ilk portal adaptörünün genişletilmiş sürümüdür. Mevcut XML testini değiştirmez; `server-pro.mjs` bağımsız sürümdür.

## Testi başlat

Windows bilgisayarındaki önceki testin PowerShell penceresinde `Ctrl+C` ile çalışan eski aracı durdur. Aynı test klasöründe:

```powershell
$ErrorActionPreference = "Stop"
$adres = "https://raw.githubusercontent.com/cetin60kaya-lgtm/ky-erp/test/isnet-portal-xml-pdf-tum-belgeler-20261120/TOOLS/isnet-portal-probe/server-pro.mjs"
Invoke-WebRequest -Uri $adres -OutFile .\server-pro.mjs
node --check .\server-pro.mjs
if ($LASTEXITCODE -eq 0) { node .\server-pro.mjs }
```

Chrome: `http://127.0.0.1:8787`. Node 22+ gerekir. Uygulama **yalnız 127.0.0.1** üzerinde çalışır; sunucuya, D1'e veya R2'ye belge/şifre yazmaz. Hesap şifresi yalnız test oturumunun process belleğindedir. Test sonunda *Oturumu temizle* ve `Ctrl+C`.

## Canlı kapsam ve kabul tablosu

| Modül | Beklenen tek tek kontrol | Gerçek kabul |
| --- | --- | --- |
| Giriş ve firma seçimi | Firma listeleme ve oturum | Önceki kullanıcı ekranında başarılı; pro sürüm yeniden kontrol edilecek |
| Gelen e-Fatura | Tarih/numara/tedarikçi/tutar/durum | Önceki testte başarılı |
| Gelen e-Fatura XML | Orijinal Invoice UBL dosyası | Önceki kullanıcı testinde başarılı |
| Gelen e-Fatura PDF | Gerçek PDF başlığı (%PDF-) ve eşleşen belge numarası | BEKLİYOR |
| Giden e-Fatura | Liste, XML, PDF, durum | BEKLİYOR |
| Gelen e-İrsaliye | Liste, XML, PDF, durum | BEKLİYOR |
| Giden e-İrsaliye | Liste, XML, PDF, durum | BEKLİYOR |
| Firma yetkisi | Yanlış firma/yeniden oturumda yetki ayrımı | BEKLİYOR |
| Filtre | Tarih, sıralama, eksik veri, 200 kayıt sınırı | BEKLİYOR |
| Oturum hata | Yanlış şifre, süresi biten oturum, portal değişimi | BEKLİYOR |
| e-Arşiv, e-SMM, e-MM, e-Dekont | Hesapta erişilebilir gerçek menü ve salt-okunur URL sözleşmesini ayrı doğrula | BELİRSİZ / uydurma endpoint eklenmedi |
| Raporlar | Gelen/giden özet, durum, firma ve tarih bazlı istatistik | Tasarım kapsamı; portal API'si henüz doğrulanmadı |

**Fatura oluşturma, gönderme, iptal, red/kabul yanıtı oluşturma ve resmî belge değiştirme kapsam dışıdır.**

## Tam KY ERP'ye taşıma kapısı

- Kayıtlar: Firma kimliği, belge türü, yön, kaynak kimliği, ETTN/UUID, belge numarası, tarih, tutar/döviz, firma/VKN, durum
- Arşiv: Orijinal XML ve PDF'yi **ayrı dosyalar** olarak, imzalı/orijinal içerikleri bozmadan sakla; SHA-256, sürüm ve indirme zamanını kaydet; PDF yoksa XML üzerinden görüntüleme çıktısı üret ama **orijinal PDF olarak etiketleme**.
- Havuz: D1 belge anahtarı (tenant+ETTN veya güvenli provider id), idempotent tekrar indirme, soft-failure, hiçbir mevcut havuz verisini silmeme
- Muhasebe: Cari eşleştirme, tedarikçi türü, gider sınıfı, kalem/KDV/iskonto, dönem raporu. **Yalnız kullanıcı onayından sonra** kesin işlem.
- Otomasyon: Süreli artımlı sorgu, yeniden deneme/oturum ömrü, firma bazlı health; Cloudflare ile portal oturumunun nerede yönetileceği performans/güvenlik testi sonrası belirlenir
- Gizlilik: Şifreler GitHub/sohbet/D1'e gönderilmez; gerekiyorsa Worker Secret ya da mevcut yerel şifre kasasıyla sınırlı yetki; portal cookie'leri loglanmaz.
- Güvenlik: Portal kullanım şartları, MFA, hız sınırı ve yetki gereksinimleri doğrulanır. Üretim API'ye salt-okunur işlem eklemek bu testin sonucu geçmeden yapılmaz.

## Bilinen sınırlar

- Pro sürüm `server-pro.mjs` geliştirildi; sözdizimi kontrolü yapıldı. **Gerçek NetteFatura pro XML/PDF testleri henüz yapılmadı.**
- Portalın eski NestJS kodundaki URL'leri kullanıldı; portal değiştiyse ilgili belge tipi hata verir. Sistem o alanı başarılı saymaz.
- Kullanıcının istediği *bütün hizmetler* için portalın izinleri/URL'leri gerçek hesapla keşfedildikten sonra yeni salt-okunur modüller eklenir; e-Fatura dışı formatlar uydurulmaz.
- Bu prototip tek oturumlu ve yalnız geliştirme testi içindir, üretim otomatik servisi değildir.
