# KY ERP — İşNet gerçek hesapla Cloudflare kabul testi
Tarih: 23.11.2026

## Kesin karar
Bu işin test ortamı GitHub Actions, X bilgisayarı veya eski 8791 localhost değildir.
Hedef, üretimden ayrı **Cloudflare QA Worker + QA D1/R2 + korumalı test arayüzü**.
GitHub sadece kaynak kodu / değişiklik kaydıdır; gerçek belge testleri Cloudflare'dan yapılır.

## Gerçek kullanıcı akışı (kullanıcı şifreyi sohbete/GitHub'a vermez)
1. Yetkili KY ERP test oturumu açılır; İşNet resmî API yöntemi seçilir.
2. Kullanıcı kendi İşNet kullanıcı adını ve şifresini QA tarayıcı formuna kendisi girer.
3. Sunucu sadece İşNet'in sabit `https://einvoiceapi.isnet.net.tr` adresindeki resmî giriş yöntemini çağırır; portal `nettefatura` oturumu denenmez.
4. İşNet'ten gelen gerçek yetkili firma listesi gösterilir; kullanıcı ilgili firmayı seçer.
5. Yetkili firma sunucuda kontrol edilerek kaydedilir. API oturumu canlı salt-okunur sorguyla yeniden doğrulanır.
6. Son 7 gün gelen e-İrsaliye listesi alınır; belge numarası/tarih/firma adı/ETTN ile ilk sayfadaki en çok 25 satır gösterilir.
7. Kullanıcı en fazla 2 belge seçer; her belge için **XML İndir** ve **PDF İndir** ayrı ayrı kullanılır.
8. XML için asıl UBL-TR belge imzası, beklenen Invoice/DespatchAdvice türü, içerik ve boyut; PDF için gerçek `%PDF-` bayt imzası, boyut ve İşNet kaynak alan adı doğrulanır.
9. Gerçek API'den PDF yerine HTML veya yetkisiz harici URL gelirse test FAIL; sahte PDF oluşturulmaz.
10. Aynı kabul diğer üç yönde uygulanabilir; önden yalnız gelen irsaliye ile başla.
11. Ancak sonra Google Drive File Hub, D1 belge kabulü, dedup/hash ve fatura–irsaliye eşleştirmesi kullanıcı onaylı ayrı zincirde test edilir.

## Güvenlik
- İşNet şifresi kullanıcıdan sohbette istenmez; CLI, GitHub, dosya veya test raporuna yazılmaz.
- Var olan `ISNET_SETTINGS` akışı şifreyi saklamaz; API oturum anahtarını yetkili sunucuda tutar. QA için yalnız izole D1 kullanılmalı.
- QA kodundaki `/api/isnet/qa/documents` ve `/api/isnet/qa/download` GET rotaları sunucu kimlik/firma/Muhasebe yetkisi denetimine tabidir.
- ETTN seçimi liste cevabında doğrulanır; rastgele dosya URL'si kabul edilmez.
- QA kodu salt okunurdur: resmî fatura kesme/gönderme, belge onayı, D1 muhasebeleştirme, gerçek Drive'a yükleme ve R2 kaydı **YOK**.
- Gerçek belge XML/PDF çıktıları kişisel/finansal bilgi içerebilir. Kullanıcının kendi tarayıcı indirme klasöründe kalır; GitHub ve sohbet eklerine otomatik gönderilmez.

## Gerçek kanıt kapısı
| Kontrol | Durum |
|---|---|
| Cloudflare Worker→ İşNet resmî API açık egress | Önceki canlı tanıda READY; bu yalnız ağ erişimidir |
| Kodda kullanıcı giriş / firma seç / liste / XML-PDF butonları | Feature branch üzerinde yazıldı |
| Ayrı QA Worker / QA D1 / QA R2 deploy | **BEKLİYOR**; Cloudflare OAuth/yayın yetkisi |
| Gerçek kullanıcı İşNet API login | **BEKLİYOR** |
| İşNet'ten gerçek yetkili şirket listesi | **BEKLİYOR** |
| 1–2 gerçek e-İrsaliye satırının listelenmesi | **BEKLİYOR** |
| Aynı ETTN için gerçek UBL XML | **BEKLİYOR** |
| Aynı ETTN için gerçek PDF dosyası | **BEKLİYOR** |
| File Hub → D1 tek belge kabulü | **BEKLİYOR** |
| Production yayını | **YAPILMADI** |

## Kod kaynakları
- `APP/cloud/ky-erp-api/src/isnet-api-live-acceptance.ts`
- `APP/cloud/ky-erp-api/src/main.ts`
- `APP/app/ky-erp-frontend/src/pages/modules/muhasebe/IsnetLiveAcceptanceQA.jsx`
- `APP/app/ky-erp-frontend/src/pages/modules/muhasebe/EBelgeIsnetPortalSync.jsx`
- `APP/cloud/ky-erp-api/src/isnet-api-live-acceptance.test.ts`

Not: Branch kodu ve sentetik unit test kodu **gerçek Cloudflare/İşNet kullanıcı kabulü** değildir.
