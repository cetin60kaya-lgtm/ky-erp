# KY ERP — ANA YÖNLENDİRME

> **Önemli:** GitHub default branch'i `main` tarihsel/yardımcı branch'tir. Güncel KY ERP production kaynak kodu ve çalışma kuralları için `main` canonical kabul edilmez.

## Yeni sohbet / yeni ajan zorunlu başlangıç

1. Önce `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md` dosyasını oku.
2. Gerçek production kaynak branch'e geç veya onu GitHub'dan oku: `codex/model-uretim-kontrol-merkezi-final`.
3. O branch'teki `AGENTS.md` dosyasını teknik ve güvenlik açısından üstün çalışma sözleşmesi kabul et.
4. Aktif feature branch varsa (ör. Desktop çalışması) aynı `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md` dosyasının o branch'teki daha yeni kopyasını kontrol et.
5. Kullanıcı açıkça `onay / canlıya al / deploy / merge` demeden production deploy veya merge yapma.

## Güncel proje kimliği

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
- Public site: `https://kyerp.net`
- ERP uygulaması: `https://app.kyerp.net`
- API: `https://api.kyerp.net`

## Güncel çalışma yönü — 03.09.2026

- KY ERP Desktop geliştirme sonrası ilk gerçek kontrol ortamıdır.
- GitHub ana kaynak kodu ve geçmiş/yedek merkezidir.
- kyerp.net yalnız Desktop üzerinde kullanıcı kontrolünden geçen ve açıkça onaylanan değişiklikleri alır.
- Kullanıcı GitHub/VS Code ile manuel uğraştırılmaz; mümkün olduğunca otomatik build/güncelleme akışı kullanılır.
- Aktif Desktop branch'i: `codex/ky-erp-desktop-final-20260903`.
- Draft PR: `#56 — KY ERP Desktop 1.7.2 — tam Windows ERP uygulaması`.
- Kullanıcı Desktop 1.7.2'nin açıldığını ve oturumun çalıştığını gerçek Windows cihazda doğrulamıştır.
- İlk ayrıntılı modül kontrolü: `İK > Günlük Giriş`.

## Eski main kuralları

Bu dosyada daha önce bulunan OneDrive/SQLite/yerel DATA ve `tasarim-final-v1` merkezli kurallar güncel canonical mimari değildir. Gerekirse Git geçmişinden tarihsel referans olarak incelenebilir; yeni geliştirme kararlarında kullanılmamalıdır.

## Güvenlik

- Production verisini test için silme/sıfırlama.
- Şifre, MFA secret, API key veya tokenı GitHub'a yazma.
- Kullanıcı onayı olmadan resmî İşNet belge gönderimi, production migration veya deploy yapma.
- Değişiklikten önce ilgili feature branch ve güncel Proje Kontrol Merkezi okunmalıdır.
