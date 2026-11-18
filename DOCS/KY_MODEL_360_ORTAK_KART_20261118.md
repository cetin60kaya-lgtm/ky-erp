# KY ERP — Model 360 Ortak Kart ve Departman İşlemleri
**Karar tarihi:** 18.11.2026 · **Modüller:** DESEN / İmalat / Boyahane / Muhasebe / e-Belge / Fatura Mail

## Kesinleşen çalışma mantığı
1. Tek canonical model kimliği (model_records) bütün bölümlerin çalışma kartıdır. Bölümler aynı kayda kendi yetkili verisini girer; yeni paralel model kartı açılmaz.
2. Tek ortak Model 360 penceresi gerçek model görseli, baskı bölgeleri, dosyalar, üretim, belgeler, boyahane, mail ve işlem geçmişini gösterir. Görsel eksikse uydurma görsel kullanılmaz; eksik işaretlenir ve yetkili DESEN kullanıcısı File Hub üzerinden tamamlar.
3. Bir HKN faturasında birçok model, bir DDM irsaliyesinde birçok model, bir modelde çok sayıda belge olabilir. Eşleştirme belge kalemi + canonical model ID + firma + adet üzerinden doğrulanır. Tekrarlı belgeler çoğaltılmaz; isim benzerliği kesin bağlantı değildir.
4. Gelen müşteri irsaliyesi, brüt üretim, hata/test, net sağlam, giden irsaliye, faturalanan miktar ayrı kaynak ve ayrı ölçüdür. Çoklu baskı bölgeleri fiziksel üretim adedi gibi tekrar toplanmaz.
5. Fatura Mail ayrı muhasebe alanıdır: Toplu seçimde her HKN için ayrı e-posta, alıcı listesi, PDF çifti, onay ve gönderim sonucu. Microsoft sağlayıcı kabulü teslim/okundu anlamına gelmez.
6. Haftalık müşteri Excel'inde listede bulunmak ödeme listesine alındı demektir; bankada tahsil edildi demek değildir.
7. Her departman yalnız kendi mevcut yetkisi ve sunucu denetimiyle kayıt yapar; yetkiler ortak modal gerekçesiyle genişletilmez.

## 18.11.2026 Model 360 — P1 kod kapsamı
- Paylaşılan tek model ID açma köprüsü ve global ortak modal host.
- DESEN, İmalat, Boyahane, Muhasebe, Fatura Mail'e ortak model düğmesi.
- Görselli özet, brüt/net üretim, hata/test, gerçek DESEN dosyaları, model-belge merkezi, ilgili HKN mail hazırlığı ve gönderim geçmişi.
- İmalat yetkisiyle modal içinde fiş girme; mevcut Production Center endpoint'i kullanılır, yeni bağımsız veri kaydı yok.
- Boyahane verisi yalnız kesin model ID ile gösterilir; isim benzerliğine dayanarak bağlanmaz.
- Çoklu DDM adayı varsa otomatik birini seçmez. Outlook gerçek gönderim yalnız kullanıcının açık onayıyla yapılır.

## Açık P2 kabul ve entegrasyon işleri
- Birden çok model içeren XML'in kalem–model–imalat miktar tahsisini bütün ilgili API'lerde doğrulama.
- Boyahane reçete ve gramaj iş formunu, DESEN kanal/renk ayrıntılı yazımını ve diğer üretim editörlerini ortak modal içine güvenle taşıma.
- Outlook'tan manuel gönderilmiş eski HKN/DDM maillerini gerçek belgeye kanıtlı bağlama.
- Rol, tenant, model görseli, çoklu irsaliye, farklı üretim bölgeleri ve gerçek işlemlerle uçtan uca kullanıcı kabulü.

P1 commit/test/PR/merge/deploy durumları ayrı izlenir. Kod kaydı gerçek kullanıcı kabulü anlamına gelmez.
