# KY ERP — Tek Güncelleme, İş ve Canlı Yayın Kayıt Sözleşmesi

09.10.2026 · CANONICAL · Tüm KY ERP sohbetleri, Copilot ve AI ajanları için.

## Kesin çalışma kararı

Her işin başından sonuna durum kanıtı doğrudan GitHub'da tutulacak, canlı KY ERP > Platform Yönetimi > Sistem > Güncelleme Geçmişi ekranından salt okunur görünecek. Ayrı bir test sitesi, paralel KY ERP kökü veya ücretli izleme servisi oluşturulmayacak.

## Aşamalar: önce kanıt, sonra durum

1. Kodlandı / dalda: gerçek commit SHA ve GitHub bağlantısı.
2. Test edildi: ilgili son commit üzerindeki gerçek CI sonucu. Başarılı test canlı yayın değildir.
3. Açık / taslak PR: PR ve hedef branch, kalan test kararı.
4. Birleştirildi: gerçek PR merge tarihi, birleşim SHA, canonical production branch. Birleşme canlı yayın değildir.
5. Arayüz canlı: başarılı production Pages yayın doğrulaması ve birleşim commit SHA'sının yayınlanan SHA'nın atası olduğunun kontrolü.
6. API canlı: başarılı production Worker yayın doğrulaması ve aynı commit atası kontrolü.
7. Tam canlı: ilgili bütün parçalarda kanıt ve gerekli canlı smoke. Kanıt yoksa "canlı" yazma.
8. Başarısız / eksik: CI arızaları, fiziki test blokajları veya henüz yayınlanmamış iş açıkça görülür.

## Her sohbetin/ajansın GitHub kayıt yükümlülüğü

- Her gerçek değişiklikte açıklayıcı Türkçe commit veya PR başlığı: modül, sorun veya özellik, çözüm.
- PR açıklamasında işin amacı, değişen dosyalar, etkilenen alanlar, test/CI sonucu, canlıya alma ve eksik kalan doğrulamaları saklamadan belirt.
- Doğrudan commit edilen küçük işlerde de anlaşılır commit başlığı yaz.
- Gerçekten test edilmemiş ekran veya Android/PC sürecini tamamlandı olarak işaretleme.
- Kullanıcı kararı, açık iş, canlı geçiş ve mimari kural oluştuğunda ayrıca DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md ve DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md üzerinde kısa tarihli kayıt bırak.
- Yeni sohbet işe başlamadan önce bu kaynakları ve gerçek GitHub PR/workflow durumlarını karşılaştırmalı; eski sohbet iddiasını tek başına delil saymamalı.
- Sohbet konuşma dökümlerinin kendisi otomatik ve izinsiz GitHub'a gönderilmez; repo üzerindeki işlerin somut commit/PR/yayın kayıtları ortak delildir.

## Uygulamadaki otomatik okuma

- Kaynak public cetin60kaya-lgtm/ky-erp canonical GitHub repo.
- Salt okunur GitHub API: actions/runs, pulls, commits. Yönetimde sadece uygulama sahibi açabilir.
- Yan yana değişiklikler, yayınlar, doğrudan commitler; hata ve bekleyen işler, arama, modül filtreleri, tarih, dal, kısa SHA, kanıt bağlantıları gösterilir.
- Son 100 commit sınırı içinde gerçekten doğrulanamayan eski işler bilinmiyor kalır; birleştirilmiş PR canlı sayılmaz.
- GitHub erişim hatası kullanıcıya görünür, önbellek geçici ve kota tasarruflu; şifre, token veya D1 hassas kayıt paylaşımı yok.
- Kaydedilen iş ve gerçek yayın kanıtları birbirinden bağımsız ve değiştirilemez tarihçeden hesaplanır.

## Yarım kalan işler ve güvenlik

Açık/draft PR, başarısız yayın veya gerçek telefon kabul testi bekleyen işler bitmiş kabul edilmez. İlk fırsatta kanıtlı tamamlanma için ilerletilir. MFA/Turnstile veya onaylı cihaz bypass edilmez, sahte test kullanıcısı oluşturulmaz. Test hesabı sınırlı yetkilidir. Ücretli yeni hizmet veya ikinci otomatik deploy hattı eklenmez.
