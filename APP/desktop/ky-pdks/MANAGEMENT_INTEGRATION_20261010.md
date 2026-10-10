# KY PDKS · Yönetim & Entegrasyon (ayrı geliştirme branch'i)

Kapsam: canlı FDB, TNF, terminal ve D1 kayıtlarına dokunmadan Windows PDKS'de mevcut oturum/rol ve Cloud bağlantısı görünürlüğü, yerel tanılama ekranı, doğrulanan tekil SQLite online yedekleri.

- Kullanıcı/rol: Server rollerini değiştirmez. Geçerli oturum rolü görüntülenir; yerel yedek butonu SUPER_ADMIN / ADMIN / COMPANY_ADMIN rolüyle sınırlıdır. Asıl sunucu yetki kontrolünün yerine geçmez.
- Cloud: Var olan D1 API okumasının başarılı / başarısız sonucunu gösterir, sahte sağlık kontrolü yoktur.
- Yedek: SQLite Backup API ile WAL güvenli çevrimiçi kopya + PRAGMA quick_check; hedefler GUID ile benzersiz; geçici dosya temizlenir; canlı DB değişmez. **D1/Cloud yedeği değildir.**
- Hata merkezi: Yerel ERROR kart sayacı ve sync_history kaynaklı özetler. Ham satır, kart, personel, erişim tokenı, sunucu hata mesajı kopyalanmaz.
- Windows EXE: Var olan BUILD_SETUP.ps1 / Inno Setup paketi korunmuştur. Gerçek paket kurulumu/servis başlangıç testi bu commit kapsamında yapılmamıştır.
- Testler: PdksManagementCenterTests eklendi (rol, backup bütünlüğü/benzersizliği, tanılama gizliliği). Gerçek Windows xUnit/EXE çalıştırılması ayrıca doğrulanmalıdır.

Yapılmayanlar: KY ERP Yönetim'deki kullanıcı CRUD yetki güncellemesi, D1 otomatik dış yedek, Cloud üretim deploy, Windows kurulum saha doğrulaması. Bunlar **tamamlanmış değildir**.
