# KY ERP — Outlook tek canonical düzen revizyonu — 19.11.2026
## Karar
PR #597 sonrasındaki Outlook bağlantısı, Gelen/Gönderilen arşivi, Model 360, File Hub, HKN/DDM PDF, taslak ve gönderim ilişkileri mevcut mail tabloları ve tek Graph adapterında birleştirildi. Ayrı arşiv/provider, veri sıfırlama veya yeni OAuth bağlantısı yok.

## Uygulanan kod sözleşmesi
- HKN başına bir gönderim kimliği; bir HKN paketinde 1 HKN + en fazla 9 DDM PDF. Eski HKN:DDM gönderim kimlikleri çifte maili önlemek için sorgulanır.
- Bir HKN birçok canonical modele; her model HKN ve ilgili en az bir DDM File Hub ilişkisi üzerinden bağlanır. Başlık benzerliği veya dosya adı tek başına kesin model kanıtı değildir.
- Outlook geçmişinde önce REVIEW_REQUIRED aday; gönderilmiş mesajın gerçek PDF içeriği SHA-256 ile File Hub varlığına eşleşince VERIFIED. Doğrulama yalnız mevcut mail ekinin kanıt kimliğini değiştirir.
- Graph delta sayfa cursorları korunur; tamamlanmayan klasörler tam senkron sayılmaz. Bozuk OAuth hesabı en az 15 dakika diğer hesapları bloke etmez.
- Eski mail eklerinin bağlantıları sayfa tekrarında korunur. Taslak oluşturma uzaktan isteğe geçmeden DB'de rezerve edilir; belirsiz sonuçta otomatik ikinci taslak/gönderim yoktur.
- Model 360 tek kart, birden çok DDM seçimi ve Outlook geçmişi doğrulama işlemi aynı akıştır.
- Google Drive/File Hub ve İşNet ayrı kalır. Gerçek mail gönderimi yalnız açık kullanıcı eylemiyle; finans/İşNet gönderimi ayrı onayla.

## Kabul ve açık sınırlar
Bu kayıt kod değişikliği açıklamasıdır; CI ve Cloudflare deploy kanıtı PR sonuçlarına bağlıdır. Gerçek Hotmail OAuth onayı, Inbox/Sent tam tarama, Outlook'ta taslağı görme, gerçek fatura/model örnekleri ve canlı gönderim testi bu koddan otomatik PASS sayılmaz. Gerçek mail veya mali kayıt oluşturulmadı. SHA ile doğrulanamayan eski arşiv kayıtları REVIEW_REQUIRED kalır. XML model kalemi → canonical satır bağı için ayrı kullanıcı onaylı kayıt akışı gerekir.
