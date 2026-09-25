# PDKS kalan teknik borç

Aktif masaüstü ürün tek `KYERP.PDKS.exe` mimarisine geçirilmiştir. Bridge/overlay/Hedef ana kabuğu artık teknik borç değildir; aktif build ve setup zincirinden kaldırılmıştır.

Kalan dış bağımlılıklar:

- Fiziksel terminal üretici protokolü kesin kaynak sağlandığında doğrudan cihaz adapterı eklenecek. File/TNF adapterı, profil sistemi, duplicate koruması ve transaction tabanlı import hazırdır.
- KYERP web hesabı ile ortak oturum istenirse Cloudflare tarafında canonical session doğrulayıcısı üzerinden masaüstü oturum entegrasyonu ayrıca bağlanacak. Yerel masaüstü kullanıcı/yetki sistemi bağımsız çalışmaktadır.
- `0003_pdks_sync.sql` additive migrationı yalnız hazırlandı; remote D1’e uygulanmadı. Masaüstü uygulamasının yerel çalışması için gerekli değildir.
- Puantaj yeniden hesaplama/dönem kapatma ve vardiya masterı için doğrulanmamış legacy davranış uydurulmayacak; kesin iş kuralı veya gerçek referans bulunduğunda genişletilecek.
- Canlı Firebird rollback smoke testi DB parolası sağlanmadan otomatik çalıştırılmaz. Contract testleri ve native shell smoke testi secretsiz build gate içinde çalışmaktadır.

Tamamlanan güvenlik maddeleri:

- Organizasyon tanımı güvenli silme referans kontrolleri whitelist üzerinden doğrulanmıştır.
- Dönem validation ve exact duplicate koruması vardır.
- Yerel kullanıcı şifreleri düz metin tutulmaz; PBKDF2-SHA256 salted hash kullanılır.
- ADMIN hesabı kullanıcı yönetiminde pasif veya yetkisiz yapılamaz.
