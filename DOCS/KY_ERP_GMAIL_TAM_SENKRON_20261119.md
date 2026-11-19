# KY ERP — Gmail 15 klasör tam senkron düzeltmesi — 19.11.2026

## Kullanıcı canlı ekranı
- Kullanıcının `kyerp.net` arayüzü: **E-Posta Yönetim Merkezi**, firma **Hakan Emprime**, Gmail DESEN hesabı 1/1, OAuth bağlı, firma onayı var, sağlayıcı hazır, **tam senkron 0/15**, tam hazır 0.
- **Aşama 1 gerçek tarayıcı ekran kabulü:** menü, tasarım, firma ve 4 sekme göründü (PASS).
- **Aşama 2 canlı Gmail kabulü:** eski kod yalnız Gelen/Sent ilk 100 mesajını okuyordu. 15/15 tam senkron kanıtı yok; ne 0/15 ne de OAuth bağlı olmak geçmişin tam indirildiği anlamına gelir.

## Güncel kod mantığı
- Mevcut Mail Core ve Gmail OAuth korunur. Yeni Gmail hesabı, token, parola, ayrı depo veya D1 migration yok.
- `/api/mail/accounts/:id/sync/google` Gmail'den görünür etiketleri/klasörleri keşfeder; yalnız `sync_enabled=1` ve provider'da hâlen var olan etiketleri tarar.
- Her kullanıcı başlatmasında **en fazla 3 klasör x 40 mesaj** işlenir. `GMAIL_PAGE` cursor ile `PAGE:<nextPageToken>` korunur; son sayfanın bütün mesajları başarıyla işlendiğinde `DONE` olur. Hata varsa aynı sayfa tekrar denenebilir; provider historyId sayfa tokenı olarak kullanılmaz.
- Gmail etiketleri örtüşür: kanonik klasör kimliği mesajın gerçek etiketleriyle seçilir, aynı mesaj farklı etiketten tarandığında otomatik başka klasöre savrulmaz.
- Tekrarlanan mesajda mail ekleri topluca silinmez. Aynı provider attachment ID / dosya adı / MIME / boyut eşleşiyorsa önceki File Hub kanıt bağlantısı korunur, değiştiyse eski link doğrulanmış diye kullanılmaz.
- Mail Core sağlık durumu yalnız kendi provider türünün gerçek tamamlanmış cursorlarını sayar. Eski `GMAIL_HISTORY` girişleri ya da Microsoft `MICROSOFT_DELTA` Gmail'i yanlışlıkla sağlıklı göstermez.
- `partial` ve tamamlanan/toplam klasör sayısı gösterilir. Kullanıcı gerektiğinde aynı **Senkronize Et** ile ilerleyebilir. Yeni cron, otomatik müşteri maili, D1 üretim kayıt düzeltmesi veya finans kaydı yapılmaz.

## Sınırlamalar ve canlı kabul
- 15 klasörün tamamlanması **birden çok kullanıcı başlatması** gerektirebilir; çok büyük arşivler kısa süreli istek sınırı nedeniyle tek tıkla bitmez.
- Bu aşama **ilk arşiv taraması** içindir. Tamamen bitmiş arşivden sonraki güncel değişikliklerin otomatik Gmail history/delta takibi ayrıca canlı kabul gerektirir. Desteklenmeyen 'her gün kendiliğinden tam senkron' sözü verilmez.
- Tamamlandı denmesi için eşleşen gerçek Gmail OAuth, 15/15 cursor başarı, gelen-giden mail örnekleri, ek PDF kanıtı ve gerçek kullanıcının ekranı kontrol edilmeli. Test/Cloudflare başarıları bu gerçek Gmail kabulünün yerine geçmez.
