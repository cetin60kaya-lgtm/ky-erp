# KYERP ortak e-Belge çalışma merkezi — ilk kod paketi
26.11.2026. Kaynak 0d296dc2564bcc1d09afca89630f402af9845e7a. #671 açık ve kendi CI sonucu başarılı; bu pakette birleştirilmedi.
- Ortak menüye belge alma ve iki taslak listesi; tenant değişince çalışma alanı yeniden başlatılır. Mevcut dört liste ve orijinal dosya akışı korunur.
- Yeni additive 0063 migration yalnız çalışma taslaklarını saklar; muhasebe havuzu veya TEST veri deposu değildir. Production migration onayı/yedek/readiness yok; uygulanmadı.
- Taslak create/edit ve iç alan kontrolü tenant + rol + version ile sınırlı. Resmî gönderim, vergi istisna, UBL XSD/şematron, gerçek mükellef sorgusu ve arşivle bağlantı tamamlanmadı. CHECKED resmî onay değildir.
- İşNet yerel paneli yeni ortak belge alma ekranından da açılır; local portal hesabı tenant ile otomatik eşleşmiş sayılmaz. Entegrasyon içindeki eski erişim ve #671 teknik kataloğu koordineli refactor bekler.
- Kalan kapsam: model/ürün lookup, kaynak irsaliye miktar ve çoklu dönüşüm, okunmamış kalıcı durum, diğer belge tipleri, gerçek UBL/PDF, sağlayıcı adapter bağlantı ID ve yetenekleri, gönderim claim/settle, resmî durum ve arşiv, test/build ve mobil gerçek kabul. D1 ve üretim servislerine işlem yapılmadı.
