# KY ERP Desktop Windows

Bu Electron kabuğu KY ERP React frontend build çıktısını içerir. Uygulama kendi merkezi KY ERP HTTPS API kimlik doğrulamasını kullanır; ayrı SQLite veritabanı oluşturmaz.

- Windows EXE GitHub Actions'da manuel olarak üretilir.
- Önce frontend lint/build, sonra NSIS setup oluşturulur.
- Canlı Cloudflare yayını tetiklenmez; production D1'e build sırasında yazılmaz.
- Fiziksel Windows'da açılış, kullanıcı oturumu ve API bağlantısı kabul testi henüz gereklidir.
- HAKAN EMP OneDrive/SQLite kayıtlarının taşınması bu EXE'nin parçası değildir.
