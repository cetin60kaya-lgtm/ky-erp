# KY ERP · Firma Bazlı Tek Ana Klasör + Posta + File Hub Sözleşmesi

Tarih: 21.11.2026  
Durum: **Kod/QA geliştirme sözleşmesi — üretim OAuth/Drive/D1/kurulum kabulü ayrı yapılır.**  
Kapsam: KYERP.NET'e kayıtlı **her ana firma**, tek bir özel şirkete sabitlenmeden.

## 1. Canonical kimlik ve bağlantılar

Her şirket/tenant kendi `main_company_slug` kimliğini yalnız **sunucu tarafından doğrulanmış kullanıcı oturumundan** alır. İstek gövdesi, URL veya `X-KYERP-Tenant-Slug` alanındaki firma parametresi tek başına erişim yetkisi değildir.

Şirket başına değiştirilebilir bağlantılar:

- **Ana dosya kaynağı:** o şirkete ait Google Drive, OneDrive veya SharePoint hesabı + onaylanmış **tek ana klasör ID'si** (`remote_root_id`). İstenirse aynı şirkette ayrı bir alternatif servis vardır; varsayılan ana klasör yalnız açıkça işaretlenen servistir. Sabit kullanıcı/şirket adı veya sabit Drive ID'si kaynak kodunda bulunmaz.
- **E-posta:** şirketin kendi Gmail/Google Workspace, Outlook/Microsoft 365 ya da desteklenen IMAP hesabı; birden çok posta kutusu olabilir. Posta kutusu ekleme, varsayılan alım/gönderim ve üye erişimi firma kapsamında yönetilir.
- **İzin:** e-posta OAuth ve Drive/OneDrive dosya OAuth ayrı kapsam ve onaylardır. Aynı e-posta adresi ile giriş yapmak Drive yetkisi sağlamaz. OAuth bağlantı kimliği, ilgili firmaya ve bağlantı ID'sine kaydedilir. Refresh/access token sırları şifreli sunucu kaydında kalır.
- **Windows klasörü:** masaüstü uygulaması yalnız Windows kullanıcısının açıkça onayladığı firma köküne erişir. Yol her makinede farklı olabilir; `KYERP_MAIN_COMPANY_SLUG`, klasör grant kayıtları ve cihaz yetkisi aynı firmayı göstermelidir. Başka şirketin grant'i ile tarama yasaktır.

## 2. Tek fiziksel arşiv, iki erişim yolu

```text
[Şirket-A | sunucu oturumundaki main_company_slug]
 ├─ Kurumsal e-posta hesabı/hesapları (Gmail veya Outlook, ayrı OAuth)
 ├─ Seçili Google Drive / OneDrive ana klasörü (provider folder ID)
 │   ├─ DESEN görselleri / PSD kaynak / yerleşim / giden desen
 │   ├─ DTF
 │   ├─ e-Belge dört yön XML+PDF
 │   ├─ İmalat / Boyahane / Stok
 │   ├─ Muhasebe / Kasa / Cari
 │   ├─ İK / PDKS (ayrı ACL)
 │   └─ Denetim / Firma / Genel belgeler
 ├─ Windows üzerindeki şirket-izinli aynı Drive klasörü
 │   └─ Google Drive Desktop / OneDrive senkronize eder
 └─ KYERP.NET: aynı sağlayıcı kökünden indekslenen File Hub
     ├─ D1: dosya konumu, şirket, hash, modül bağlantısı ve muhasebe taslağı
     └─ R2: yalnız yetkili web önizlemesi/cache
```

- **Fiziksel dosya tek:** Google Drive Desktop'ın eşitlediği yerel yol ile bulut Google Drive aynı dosyanın iki görünümüdür. Desktop hızlı yerel erişir; buluttaki File Hub **yetkili provider API üzerinden** indeksler. Senkronizasyon bir yedek veya ERP muhasebe importu değildir.
- **Mükerrer önleme:** Aynı senkronize Google Drive kökü hem `GOOGLE_DRIVE/CLOUD_API` hem `LOCAL_FOLDER/AGENT` olarak ayrı dosya varlıklarına otomatik eklenmemeli. Bu dosyalar için cloud provider ID/konum canonical kaynaktır; yerel yollar yalnız onaylı erişim/cache içindir. Ayrı yerel-only dosya kaynaklarına AGENT kullanılabilir.
- **Klasör seçimi:** kullanıcı önce firmanın kendi Drive/OneDrive hesabını bağlar, ardından bu hesaptaki ana klasörü seçer. Bu seçim mevcut klasörü silmez, taşımaz, yeniden adlandırmaz ve bütün şirketler için ortak yol oluşturmaz.
- **Yapılandırma değişimi:** firma yönetimi üzerinden ana servis/alt klasör atamaları düzenlenebilir; fiziksel taşıma veya gerçek klasör silme yalnız açık ayrıca onayla olur.

## 3. Modül klasör atama sözleşmesi

Var olan klasörler şirketin seçtiği ana köke göre **göreli** atanır. Bu tablo bir öneridir; fiziksel klasör oluşturma komutu değildir.

| KY ERP modül | purposeCode | Önerilen göreli kaynak |
|---|---|---|
| `DESEN` | `MODEL_IMAGE` | Görsel arşivi; model adı `.jpg/.jpeg` modeli bulur/oluşturur |
| `DESEN` | `MODEL_SOURCE` | Orijinal PSD/AI/TIFF; diğer modüller yalnız yetkili PSD önizlemesini görür |
| `DESEN` | `PLACEMENT` | Yerleşim PDF dosyaları |
| `DESEN` | `OUTGOING_DESIGN` | Giden desen/atölye kaynakları |
| `DTF` | `RIP_PDF` | DTF RIP PDF arşivi |
| `E_BELGE` | `E_DOCUMENT` | Gelen/giden fatura ve irsaliye XML+PDF'nin tek arşiv kökü |
| `MUHASEBE` | `SALES_INVOICE`, `PURCHASE_INVOICE`, `DELIVERY_NOTE`, `CHEQUE`, `BANK_RECEIPT` | Firmanın ilgili klasörleri |
| `IMALAT` | `TECHNICAL_SHEET`, `PRODUCTION_PHOTO` | Teknik föy ve üretim görselleri |
| `BOYAHANE` | `RECIPE`, `QUALITY` | Reçete ve kalite |
| `IK` | `PERSONNEL_DOCUMENT`, `EMPLOYEE_MEDICAL`, `EMPLOYEE_PAYROLL` | Hassas izinle ayrılmış personel klasörleri |
| `PDKS` | `ATTENDANCE_REPORT` | PDKS/puantaj |
| `DENETIM` | `AUDIT_EVIDENCE`, `OHS_DOCUMENT`, `CERTIFICATE` | Denetim/İSG/sertifika |
| `STOK` | `TECHNICAL_SHEET`, `STOCK_DOCUMENT` | MSDS/SDS/TDS ve stok belgeleri |
| `FIRMA`, `GENEL` | `COMPANY_LICENSE`, `GENERIC` | Resmî ve genel belgeler |

`İK`/sağlık/bordro/çek vb. hassas dosyalar ayrıca özel rol ACL'si ve ayrı klasör yetkisi ister; sadece modül yolu seçmek belgeyi bütün kullanıcılar için açmaz. Model kartında ortak gösterim: görsel, yerleşim PDF, **PSD önizleme**, gerektiğinde modele bağlanmış sevk irsaliyesi. İmalat'a bütün Muhasebe arşivi açılmaz.

Bir `(main_company_slug,module_code,purpose_code)` altında çoklu bağımsız klasör atamaları için ayrıca çoklu kural/slot veri sözleşmesi gerekir; mevcut tek-binding yapısı birden fazla aynı purpose kaynağını kendiliğinden kapsamaz.

## 4. İşNet özel kuralı

- Firmanın İşNet adaptörü bu şirketin seçtiği *yerel senkronize e-Belge klasörüne* XML+PDF yazar. Google Drive/OneDrive kendi eşitlemesini yapar.
- Bulut File Hub aynı firmanın onaylı servis ana kökü içinde `E_BELGE/E_DOCUMENT` göreli yolunu okur.
- D1/XML belge kimliği ETTN/UBL + yön + firma eşleştirmesidir; PDF aynı kayda bağlanır. `_INCELEME`, `_DURUM`, `_UYGULAMA` dosyaları belge değildir. Cari/fatura/irsaliye eşleştirme **taslak** olur; kesin mali onay yetkili işlemidir.
- Şirketler arası XML, cari, model ve e-posta aktarma yasaktır. Her firmanın kendi OAuth tokeni, kimliği ve kök ID'si kullanılır.

## 5. Kurulum ve canlı kabul

1. Yetkili firma oturumunu doğrula (firma A ve firma B, sahte URL/header ile birbirinin dosyalarını okuyamamalı).
2. Firma A'ya OAuth, ana Drive/OneDrive klasörü, posta hesapları ve modül eşleştirmeleri tanımla; dosyayı elle kopyalama veya kök taşıma yapma.
3. Windows'ta aynı hesabın Drive Desktop senkron klasörünün varlığını doğrula; şirket yetkili yerel klasörü Windows üzerinden onaylat.
4. Aynı dosyanın yerel ve bulut provider görünümünü karşılaştır; bulut dosya indeksi gerçekten var mı diye kontrol et; D1 belge kabulünü ayrıca denetle.
5. Firma B'ye başka hesap/kök ver; A'nın kullanıcıları ve agent anahtarıyla B'nin dosya/mail klasörlerine erişim mümkün olmamalı.
6. D1 gerçek belge taslağı/muhasebe ilişkisi, hassas roller, çoklu cihaz ve paket dağıtımı kanıtlanmadan `CANLI_TAMAMLANDI` bildirme.

İlgili geliştirmenin izleme kaydı: PR #634 (İşNet/Dosya Merkezi tek firma kapsamı), çoklu klasör-slot gereksinimi #630/#632. Cloudflare production veya imzalı masaüstü paket yayın kabulü bu belgeyle otomatik oluşmaz.
