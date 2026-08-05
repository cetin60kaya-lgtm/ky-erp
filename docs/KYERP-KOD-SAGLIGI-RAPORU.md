# KY ERP Kod Sağlığı Raporu

Son güncelleme: 2026-08-05
İncelenen dal: `agent/uretim-tek-merkez`
Canlı Worker: `ky-erp-api` / `api.kyerp.net`

## Sonuç özeti

- İK'nın kalıcı kaynağı ilişkisel D1 tabloları olarak doğrulandı. `json_store` yalnız değiştirilmemiş eski/diğer modül route'larında kalıyor.
- Canlı İK sayımları deploy öncesi ve sonrası aynı: aylık personel 18, günlük personel 155, günlük devam 1360, bordro 37.
- Canlı Worker sürümü: `5956b907-effe-42d3-baad-68101c30036e`; deployment ID: `e292067c-70b6-4d52-a09d-8c183a099645`.
- `api.kyerp.net` custom domain, HTTPS, sağlık endpointi ve `app.kyerp.net` CORS/preflight yanıtları başarılı.
- Frontend production build'i ile canlı Pages giriş asset hash'leri birebir aynı. Production API tabanı `https://api.kyerp.net/api`; firma parametresi `mainCompanySlug=mecit-hakan` olarak otomatik ekleniyor.
- Muhasebe, İşNet, Desen, Boyahane ve İmalat canlı verilerine yazılmadı. Resmî belge gönderimi yapılmadı.

## Build ve test durumu

| Bileşen | Sonuç |
| --- | --- |
| Worker test | 3/3 geçti |
| Worker TypeScript | `tsc --noEmit` geçti |
| Wrangler binding types | `wrangler types --check` geçti |
| Worker dry-run build | geçti; 549.49 KiB, gzip 107.47 KiB, startup 9 ms |
| Yerel D1 migration/audit | geçti; eksik tablo/kolon yok |
| Uzak D1 audit | geçti; eksik tablo/kolon ve duplicate `json_store` anahtarı yok |
| Frontend lint | geçti, sıfır warning |
| Frontend production build | geçti |
| Mevcut frontend birim testi | 10/10 geçti |
| Backend build ve İK testi | build geçti, İK testi 7/7 geçti |

## D1 ve SQLite şema/veri farkı

- Uzak D1 audit'i 189 tablo gördü; gerekli İK tabloları ve kolonlarının tamamı mevcut.
- D1: aylık 18, günlük 155, devam 1360, bordro 37, ayarlama 25, izin 1, kart ayarı 1.
- Yerel gerçek SQLite toplamı: aylık 23, günlük 160, devam 1360, bordro 37.
- Yerel SQLite içindeki `mecit-hakan` kanonik alt kümesi aylık 18 ve günlük 155. Toplamdaki +5/+5 fark eski test tenant kayıtlarından kaynaklanıyor; bu kayıtlar silinmedi veya canlıya taşınmadı.
- `0004_hr_daily_entry_compat.sql` yalnız Günlük Giriş roster ve vardiya notu tablolarını/indexlerini idempotent oluşturur. Canlıda tablolar zaten veriliydi: roster 1357, not 1320; migration bu satırları değiştirmedi.
- Repo tarafından izlenen `.db`, `.sqlite` veya `.sqlite3` dosyası yok.

## Canlı İK route doğrulaması

| Ekran/işlev | Gerçek canlı kaynak | Sonuç |
| --- | --- | --- |
| İK Özet | `/api/ik/advanced/month` | 18 çalışan |
| Personel Kartı | `/api/ik/advanced/month` | 18 çalışan, kart alanlarıyla birleştirilmiş veri |
| Günlük Giriş | `/api/ik/gunluk-personel/liste`, `/gun-kayitlari` | varsayılan aralıkta roster 2; seçilen günde 6 kayıt; 0-listesi hatası giderildi |
| Günlük Personel Kartları | `/api/ik/daily-employees` | 155 çalışan |
| Bordro & Ödeme | `/api/ik/advanced/payroll`, `/api/ik/payroll` | 18 hesap satırı; 37 kayıtlı bordro |

Tarayıcı bağlantısı bulunmadığı için görsel DOM/ekran görüntüsü kontrolü yapılamadı. Bunun yerine canlı Pages bundle'ı, frontend servis path/parametreleri, CORS ve aynı origin başlığıyla yapılan gerçek API istekleri doğrulandı.

## Güvenlik ve secret denetimi

- Token yalnız süreç ortam değişkeninden kullanıldı; kaynak, dosya veya commit'e yazılmadı.
- İzlenen dosyalarda private key, `sk-...` veya JWT-benzeri literal secret taraması: 0 aday.
- Secret isimlerini/ortam değişkenlerini kullanan 7 izlenen dosya var; bunlar değer değil yapılandırma referansları.
- CORS yalnız production/local/Pages allowlist originlerini kabul ediyor; `app.kyerp.net` için credentials ve preflight başarılı.
- Canlı D1 değişikliklerinden önce Time Travel bookmark ve ilk migration öncesinde tam SQL yedeği alındı.

## Bağımlılık riskleri

`npm audit` otomatik düzeltme uygulanmadan yalnız raporlandı:

- Worker: 5 bulgu — 4 high, 1 moderate. Doğrudan: `wrangler` high, `hono` moderate.
- Frontend: 2 bulgu — 1 high, 1 moderate; doğrudan bağımlılık değil.
- Backend: 10 bulgu — 8 high, 2 moderate. Doğrudan high: `@nestjs/platform-express`, `adm-zip`, `sharp`, `xlsx`; moderate: `exceljs`.
- `xlsx` için otomatik güvenli düzeltme bulunmayabilir. Paket yükseltmeleri ayrı PR, regresyon testi ve dosya import/export doğrulamasıyla ele alınmalı.

## Route, dead code ve bakım riskleri

- Worker içinde aynı method/path ile birden çok kayıt bulunan mevcut route'lar:
  - Boyahane: jobs, job detail, manual job, registered colors ve color ekleme route'ları.
  - İşNet: incoming dispatch import route'u.
- Kayıt sırası bazı durumlarda bilinçli uyumluluk önceliği olabilir; yine de gölgelenme riski için route sahipliği ayrı çalışmada tekilleştirilmeli. Bu rapor kapsamında davranış değiştirilmedi.
- Bakım göstergeleri: 10 dosyada `@ts-nocheck`, 18 dosyada `eslint-disable`, 12 `TODO/FIXME/HACK` satırı.
- Büyük frontend parçaları: `IkPage` yaklaşık 241 KiB, ana JS yaklaşık 223 KiB, React vendor yaklaşık 182 KiB, ana CSS yaklaşık 289 KiB. İK ekranı kendi lazy chunk'ında; daha ileri bölme performans işi olarak planlanabilir.
- İK sorguları için firma/durum, employee/date, payroll period ve roster/note lookup indexleri mevcut.

## Önerilen sonraki işler

1. High bağımlılık açıklarını bileşen bazlı küçük PR'larla yükseltip import/export ve Worker regresyon testlerini çalıştırın.
2. Boyahane ve İşNet duplicate route kayıtlarını davranışı koruyan route-ownership testleriyle tekilleştirin.
3. `@ts-nocheck` dosyalarını risk ve değişim sıklığına göre aşamalı olarak strict TypeScript kapsamına alın.
4. Bağlı gerçek tarayıcıyla beş İK ekranında görsel smoke testi çalıştırın; bu rapordaki API kanıtı görsel yerleşim doğrulamasının yerine geçmez.
