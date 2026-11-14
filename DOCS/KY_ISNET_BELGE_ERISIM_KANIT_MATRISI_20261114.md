# İşNet belge indirme: kaynak/kod/gerçek portal kanıt matrisi

**Tarih:** 14.11.2026 · **Güvenlik kapsamı:** salt okunur doğrulama / gerçek belgesiz entegrasyon analizi.
**Uygulama dalı:** `codex/model-uretim-kontrol-merkezi-final` · **PR #564** · `8f77968e08cee681f7d83917ddae51dad7ae5ab5`.
**ÖNEMLİ:** Aşağıdaki NetteFatura *portal* adresleri uygulamanın mevcut kodundaki varsayımlardır; giriş yapılıp üç nokta menüsünden alınmış resmî trafik kanıtı **değildir**. Bunları yeni bir sözleşme gibi sunma, yetkisiz otomatik indirme başlatma.

## 1. Dört kaynak / dosya işlemi

| Belge türü | Kodda portal liste sayfası | Kodda liste isteği | Kodun indirme adresi varsayımı |
| --- | --- | --- | --- |
| Gelen fatura | `/IncomingInvoice/IncomingInvoiceList?minDate={YYYY-MM-DD}` | POST `/IncomingInvoice/AllIncomingInvoiceByFilter` | GET `/Invoice/GetInvoicePdf\|Xml?InOrOut=true&InvoiceId={IdFaturaGelen}` |
| Giden fatura | `/OutgoingInvoice/OutgoingInvoiceList?minDate={YYYY-MM-DD}` | POST `/OutgoingInvoice/AllOutgoingInvoiceByFilter` | GET `/Invoice/GetInvoicePdf\|Xml?InOrOut=false&InvoiceId={IdFatura}` |
| Gelen irsaliye | `/IncomingDespatchAdvice/IncomingDespatchAdviceList?minDate={YYYY-MM-DD}` | POST `/IncomingDespatchAdvice/AllIncomingDespatchAdviceByFilter` | GET `/Despatch/GetDespatchPdf\|Xml?InOrOut=true&DespatchId={IdIrsaliyeGelen}` |
| Giden irsaliye | `/OutgoingDespatch/OutgoingDespatchList` | POST `/OutgoingDespatch/AllOutgoingDespatchByFilter` | GET `/Despatch/GetDespatchPdf\|Xml?InOrOut=false&DespatchId={IdIrsaliye}` |

İzlenen dosya: `APP/cloud/ky-erp-api/src/isnet-live-sync.ts`, `SOURCES`, `normalizePortal`, `downloadFile`.
Parametre ve cevap modelleri **kod kaynağından** derlenmiştir; portalın gerçek oturumuna giriş yapılamadığı için sağlayıcı onayı yok.

## 2. Resmî API dokümanı — portal ile karıştırma

İşNet'in yayınladığı `https://einvoiceapi.isnet.net.tr/Help` içinde:
- **GET `api/Invoice/GetInvoicePdf`** — resmî API yardımında mevcut
- **GET `api/Invoice/GetInvoiceXml`** — resmî API yardımında mevcut
- **POST `api/Invoice/GetIncomingEInvoiceList`** ve **POST `api/Invoice/GetIncomingDespatchList`** — resmî API yardımında mevcut

Kaynaklar: `https://einvoiceapi.isnet.net.tr/Help/Api/GET-api-Invoice-GetInvoicePdf` ve `https://einvoiceapi.isnet.net.tr/Help/Api/GET-api-Invoice-GetInvoiceXml`.
Yardım sayfalarında indirme çağrısının yetkili firma, belge ID'si ve cookie/token sözleşmesi açıklanmıyor. **API adresini doğrudan portal menüsündeki üç nokta isteği sayma**. API tokenı ile portal çerezi farklı kimlik mekanizmalarıdır.

## 3. Kodda doğrulanmış korumalar

- PR #564: `main.ts` üzerinde **V2 tek test/şifresiz firma kaydetme** rotası, eski `isnet-live-sync` rotasından önce kaydedilir. Önceden iki modül aynı `GET/POST/PUT /api/isnet/settings` adreslerini çakıştırıyordu.
- API tokenı şifresiz doğrulanırsa yeni `testedAt` kaydı oluşur; firma kaydında ilk testin on dakikalık güncelliği denetlenir.
- Eski hesaba ait `portalCookie`, `portalCompanySelected`, `portalBase` yeni oturum kanıtı sayılmaz.
- `isnet-file-validation.ts`: HTTP 200 olsa bile HTML giriş, JSON hata, ZIP, boş, aşırı büyük ya da yanlış biçimli yanıt PDF/UBL olarak arşivlenmez. PDF `%PDF-` başlığı, XML `Invoice/DespatchAdvice` kökü zorunlu.
- UBL içerik biçiminin tanınması, belgenin GİB doğruluğu / firma VKN / PDF eşleşmesi için tek başına PASS değildir.

## 4. Canlı kabulde yalnız okunacak adımlar

1. Yetkili kullanıcı **kendi İşNet ekranında** giriş ve ek doğrulamayı tamamlar. Şifre/OTP/çerez asla ChatGPT veya GitHub'a girilmez.
2. Hangi firmanın etkin olduğu yalnız oturum içinden doğrulanır; ana firma/tenant başka hesapla çapraz kullanılmaz.
3. Gelen İrsaliye, Gelen Fatura, Giden Fatura, Giden İrsaliye ekranlarında **bir örnek belgenin** üç nokta menüsünden PDF ve XML indir düğmeleri gözlemlenir.
4. Browser Network kaydında **yalnız HTTP yöntemi, URL yolu, parametre isimleri, durum kodu ve genel content-type** karşılaştırılır. Cookie, Authorization, gerçek query ID, gövde, isim veya ticari belge GitHub'a yazılmaz.
5. Gerçek dosya için PDF imzası, UBL-TR kök/ID/UUID, işlem yönü ve firma VKN/TCKN kontrollü uygulama içi incelemede eşleştirilir.
6. Yinelenen belge; yeni fatura oluşturma, gönderme, onaylama, silme veya cari kaydı açma için tetikleyici olmaz. İndirme kaynak arşiv ve File Hub ilişki kaydını bozmamalı.

## 5. Durum

- GitHub Actions CI `43630029134`: frontend ve Worker SUCCESS.
- Cloudflare `ky-erp-api` Workers Builds: `e8cae184-e7a2-4d50-b1fa-8aec59b88f74`: SUCCESS (14.11.2026 19:07:25Z).
- `api.kyerp.net/api/health` ve `kyerp.net/e-belge/entegrasyonlar`: yetkili X Windows salt okunur HTTP kontrolünde **200 / 200**. Bu **giriş yapmış kullanıcı senkronizasyon testi değildir**.
- **Açık kabul:** İşNet'in yetkili gerçek portal oturumu ve üç nokta menüsü; TinyFish profile setup iki kez `Failed to start setup session`; Browser Chat yalnız okuma, DESEN erişimi çevrimdışı. Dolayısıyla PDF/XML portal adresleri *kanıtlanmadı*. Bu durumda arşive sahte veya yanlış dosya kaydetme, kaynağı PASS olarak işaretleme.
- E-posta, fatura, irsaliye gönderimi veya kesin mali yazım yapılmadı.
