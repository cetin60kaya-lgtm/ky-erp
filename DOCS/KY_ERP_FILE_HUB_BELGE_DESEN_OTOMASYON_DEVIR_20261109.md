# KY ERP — Desen / İmalat / e-Belge / Muhasebe / File Hub ortak otomasyon devri
Tarih: 09.11.2026

## Karar
- Google Drive işletme belgelerinin ve orijinal PSD, AI, PDF ve görsellerin fiziksel arşividir; D1 canonical model, belge, cari, ilişki ve adet hareketi kimliklerini tutar. R2 yalnız önizleme/cache/geçici işleme içindir.
- Ortak model kimliği UUID ve firma kapsamıyla korunur. Desen/İmalat/Muhasebe aynı ana modele işaret eder; ikinci dosya arşivi kurulmaz.
- Muhasebeci: İşNet fatura/irsaliye XML+PDF alır veya File Hub'a sürükler; belge numarası değişmez. XML veri öncelikli, PDF arşiv/kontrol kopyası. SON ONAY olmadan cari/KDV/LOT/stok kesinleşmez. Gayriresmî kayıt resmî belgeye dönüşmez.
- HKN fatura ile DDM irsaliye eşleştirmesi belge referansı, model UUID, firma, kalem ve miktarla gerçekleşir. Faturalanacak kalan = irsaliye adedi - eşlenmiş faturalanan adet. İmalat adedi kontrol kanıtıdır, fatura kalanının kaynağı değildir.
- Tedarikçi XML: VKN ile firma, malzeme, birim/ambalaj ve LOT incelemeye alınır. Fiziksel mal teslim teyidinden sonra bir kez stok girişi; PDF+XML ikinci stok üretmez.
- Desenci: Görsel, kaynak model klasörü (AI/PDF/TIFF/teknik), yerleşim PDF, giden PSD/PSB. Tek PSD çoklu MODEL + BOY + BASKI BÖLGESİ ilişkileri taşır; BEDEN değil BOY. Aynı model küçük ve büyük boyda bir dosyaya bağlanabilir.
- Bir dosya bir File Hub FileAsset'tir; model kartları FileRelation ile bağlanır. Orijinal dosya kopyalanmaz veya taşınmaz. Belirsiz isim farklı firmadaki modelle otomatik birleşmez.

## GitHub gerçek durum
- PR #548 e-Belge/Muhasebe Drive içe alımı, UBL/XML, firma ve irsaliye esaslı miktar çekirdeği: TASLAK. Canonical CI PASS; gerçek muhasebe/Drive canlı kabulü yok.
- PR #549 Desen PSD çoklu model BOY/baskı bölgesi ilişki API'si ve model Dosyalar sekmesi: TASLAK. Canonical Worker typecheck+unit+build ile frontend lint+test+build PASS (run 42684421896). Gerçek Windows/Drive saha kabulü yok.
- PR #542 Giden PSD Drive kaynağı bağlama seçeneği: TASLAK ve mergeable=false; önce çakışma çözülmeli.

## Kalan işler
1. PR #548, #549, #542 değişikliklerini production tabanına güvenli biçimde sırala; orijinal dosya ve D1 kaydını silme.
2. Desen model kartında gelen görsel/kaynak klasör/PSD/yerleşim için direkt sürükle-bırak; File Hub module+purpose binding ile sadece yetkili hedefe Drive upload. Hash, relation, revision ve location doğrula. Büyük PSD için akışlı yükleme tasarla.
3. Model kartında tek dosya panelini Desen/İmalat/Muhasebe ve Android'de ortak göster; PSD yükleme desencide, e-belge muhasebecide, üretim girişi imalatçıda. Okuma yetkileri ayrı.
4. Gerçek İşNet XML/PDF tek belge eşleştirme, firma/ürün/LOT, irsaliye-fatura kalem/kısmi tutar, cari/KDV ve ek irsaliye kontrolünü test et.
5. 3500 irsaliye → 2000 fatura → 1500 kalan, farklı parti ve çoklu irsaliye, aynı isimde farklı firma, iade/iptal, model kapanışı senaryolarını izole test et.
6. D1 yedeği, gereken migration, yetki/endpoint/CI, gerçek oturum/Drive/telefon testi ve Pages/Worker yayın SHA zincirini doğrula. Yayın yoksa CANLI deme.

## Güvenlik
- İşNet resmî gönderimi ve gerçek stok/cari hareketleri son kullanıcı onayı olmadan yapılmaz.
- UBL/XML, PDF, PSD, oturum/token, banka, personel ve müşteri özel verisi GitHub'a gönderilmez.
- Yerel DESEN kontrolünde önce mevcut KY Control/Chat Bridge ve gerçek Windows yanıtı, yeni ZIP/token kurulumu yok.