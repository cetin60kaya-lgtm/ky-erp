# KY ERP — DESEN son 3 ay görsel arşivi ve File Hub eşleştirmesi

**Tarih:** 08.11.2026  
**Kapsam:** 08.08–08.11.2026 imalat modelleri; mevcut `Hakan Emp/görsel/2026` ve `Hakan Emp/modeller` klasörleri.

## Kaynak ve sahada doğrulanan dosyalar

- X bilgisayarındaki 2026 imalat Excel'inden 147 farklı son üç ay modeli karşılaştırıldı.
- 121 modelin `görsel/2026` içinde aynı adlı JPEG'i yoktu.
- Önceden ayrı eksik-görsel klasöründe bulunan NEWSO, NUMLOCK, MERVOD, DIANDRA görselleri Drive `görsel/2026` içine kopyalandı; kaynaklar korundu.
- Diğer 82 yeni JPEG, mevcut PDF/AI/PSD ve gönderilen gerçek desen dosyaları üzerinden üretildi. X üzerinde her kopyanın SHA-256'sı kaynakla eşleşti; Google Drive connector'unda **82/82 dosya adı + boyut** doğrulandı.
- Görsel klasörü canlı Google Drive listesinde 433 dosya içeriyordu. Bu sayılar Drive dosyası kabulüdür, ERP D1 ilişki kabulü değildir.
- Toplam 39 model otomatik üretim/eşleşme için açık kaldı; HOTWHEELS, MINECRAFT ve benzeri çok varyantlı kök adlarda yanlış eşleşme yapılmaz.
- Kaynak dosyaların Pantone/spot renkleri ayrılmadı, sahte renk oluşturulmadı. Üretilen JPEG'ler görsel referanstır; üretim kalıbı değildir.

## Bu PR'ın iş akışı

1. Var olan `DESEN/MODEL_IMAGE` Drive File Hub bağını kullan; yeni kök, hesap, token veya alternatif depolama oluşturma.
2. Cron ve mevcut owner/admin senkron işlemi, tüm Google Drive kökünü dolaşmadan önce mevcut `görsel/2026` klasöründeki son 100 JPEG/PNG/WEBP öğesini okur.
3. **Sadece image_url boş ve aktif tekil canonical UUID** eşleşirse var olan File Hub asset ve relation idempotent upsert edilir. Önceden ilişkisi olup canonical görseli boş kalan kart tekrar bağlanabilir.
4. Aynı isimli farklı modeller, eksik/yanlış klasör, eşleşmeyen ad, Photoshop/PSD dönüşümü, model oluşturma ve mevcut görselin üzerine yazma hızlı akışta kesinlikle yapılmaz.
5. D1'daki lease/CAS koruması ve 30 dakika tarama aralığı normal tam taramayı korur; mevcut cron dışında yeni zamanlayıcı yoktur.
6. Web uygulamasındaki görsel, içeriği bearer/tenant ile alan mevcut `DesenImage` üzerinden görüntülenir; secret URL içine koyulmaz.

## Kabul sınırı

- PR testleri, merge SHA, Cloudflare Pages/Worker yayımlanma kanıtı birbirinden ayrıdır.
- Canlı `file_hub_relations` / `model_records.image_url` sayımı, File Hub senkron ilerlemesi ve yetkili kullanıcı ekranından en az birkaç modelin açılması **ayrı gerçek D1 kabulü**dür.
- Bu sohbet oturumunda X cihazında Wrangler Cloudflare oturumu yoktu; `whoami` auth reddetti. D1'ye ChatGPT üzerinden canlı yazma yapılmadı. Kaydedilen görsellerin model kartlarına bağlanmış olduğu varsayılmayacak.
- Önceden var olan 723 model, 1.551 imalat ve diğer firma verileri korunur. D1 migration yoktur; dosya silinmez, orijinal dosya adı değiştirilmez.
