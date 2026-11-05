# KY ERP DESEN / İMALAT — Kalıp, desen ebadı (cm) ve ürün bedeni ayrım sözleşmesi
**Tarih:** 05.11.2026 · **Durum:** PR #519 üzerinde; üretim kabulü ayrıca doğrulanacak.

## Kesin iş kuralı
- PSD/PSB **orijinal dosya adı, uzantısı, Drive ID ve yolu** birebir korunur. Yeni model veya yeniden adlandırma yapılmaz.
- Bir PSD içinde birden çok model; her modelde 1, 2, 3 veya daha çok **desen ebadı** olabilir. Her ebat en × boy **santimetre** olarak ayrı kaydedilir.
- S/M/L/XL, 1–3 ay, 3–6 ay, 3–4 yaş gibi değerler **ürünün bedeni**dir; desen ebadı değildir. Bir en × boy ölçüsü bir veya daha çok ürün bedenine uygulanır; hepsi için aynıysa "tüm ürün bedenleri" kaydı vardır.
- Bir modelin aynı beden grubunda **ana desen ve ayrı yardımcı parçaları** olabilir. Her parça kendi en×boyunu korur. Baskı yeri (ön/arka/kol/ense) ayrı alandır.
- İlk alınan ölçü referans olarak korunur. Müşteri sonradan küçültür veya büyütürse baskının gerçek cm ölçüleri karşılaştırılarak küçük/büyük sırası değişir; dosya adı veya orijinal kaynak değişmez.
- 10×12 cm -> 8,5×10,2 cm: iki yönde %15 küçük. İlk gelen 10×12 cm artık büyük ebat olur. 10×12 -> 12×14,4 cm: %20 büyük; ilk gelen küçük olur.
- En küçülürken boy büyürse kesin küçük/büyük sınıflaması yapılamaz. Ölçü ve yüzde eksen bazında gösterilir.
- Yerleşim notlarındaki çekme eni/boyu, baskı yeri, dikiş payı ve PDF sayfasının kendi fiziksel eni/boyu **desenin baskı ölçüsü değil**dir.

## Drive'dan gerçek yerleşim okuması, salt okunur (05.11)
- 2114748-FANTY-FT-ONYRLSM.PDF: "TÜM BEDENLERDE DESEN EN=26.6 CM / DESEN BOY=5.01 CM" yazıyor. "ÇEKME EN=2 CM / ÇEKME BOY=3.5 CM" ve "DİKİŞ PAYI=1 CM" ayrı yerleşim değerleridir.
- SIMSAH-7S-BASKI YERLEŞİM KALIPLARI.PDF: 1–3 / 3–6 ay grubunda ana baskı 17,93 × 23 cm; 6–9 / 9–12 / 12–18 ay grubunda ana baskı 20,61 × 26,45 cm. Ayrı kuyruk parçasının kendi en/boy ölçüleri bulunur.
- ASPEL-A MODELİNİN ÖN BEDEN BASKI YERLEŞİM KALIPLARI.PDF ve 26K EBAREL-B MODELI BASKI KALIBI.PDF: birden fazla çocuk yaş grubunda ayrı baskı en/boyları gösterir.
- Bu yerleşim PDF'leri görüntü olarak doğrulandı; düz metin çıkarmada metin yoktu. Otomatik PDF OCR henüz **canlı kabul edilmedi**. Boy bilgisi AI/OCR'dan önerilse bile onaysız "kesin" kaydedilmez. Kaynak PSD/PDF GitHub'a taşınmadı.

## API veri sözleşmesi
- PlateEntry içinde: modelId, sizeCode (desen varyant anahtarı), sizeLabel, widthCm, heightCm, garmentSizes[], allGarmentSizes, isReferenceSize, artworkPart, printArea.
- Desen eni ve boyu beraber pozitif cm girilir veya ikisi de ölçü bilinmiyorsa boş kalır; sadece eni veya boyu olan kayıt onaylanmaz.
- Boy adedi için 1/2/3 sabit sınırı yok; yalnız istek boyutu emniyet sınırı vardır.
- UI: model arama -> gerçek PSD adı -> ortak modeller -> desen ebatları (cm) -> bu ebadın geçerli olduğu ürün bedenleri -> raf/kalıp kodu -> Photoshop'suz tam önizleme.
- API durumu: ölçüleri eksik doğrulanmış model ilişkisi = MEASUREMENT_PENDING; tüm desen en ve boyları girildi = CONFIRMED; kaynak PSD değişmiş = REVISION_REVIEW. 
- Orijinal PDF ve PSD fiziksel dosyaları taşınmaz, silinmez; yeni model kimliği oluşturulmaz.

## Kabul ve sonraki adım
- PSD önizleme motoru önceki PR #518'den gelir; cihazda çalışan yeni agent ve gerçek tıklama kabulü ayrıca gereklidir.
- Otomatik testler: değişen baskı ebatları, birden çok model, 3+ desen boyu, aynı cm'nin çok ürün bedenine bağlanması ve yüzde küçültme/büyütme.
- Üretim Worker/Pages yayını, gerçek D1 veri kaydı ve PDF OCR saha doğrulaması kanıtı olmadan canlı veya eksiksiz kabul ilan edilmez.
