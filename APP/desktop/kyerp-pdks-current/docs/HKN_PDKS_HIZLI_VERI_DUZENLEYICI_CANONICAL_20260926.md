# HKN PDKS Hızlı Veri Düzenleyici
## Canonical çalışma kaynağı - 2026-09-26

Amaç: Hedef 5.0.29 Firebird verisini ve TRYYYY.Tnf terminal datasını aynı arayüzde hızlı, kontrollü ve toplu düzenlemek.

### Ana modüller
- Personel: aktif/pasif/tümü, kart no, işe giriş/çıkış, maaş ve ilişkili PDKS verileri.
- Giriş-Çıkış: kişi/yıl/ay/gün görünümü, tekil ekle-düzelt-sil.
- Toplu İşlem: tek/seçili/tüm personel + kullanıcı seçtiği tarih aralığı ve günler.
- E Düzeltmeleri: giriş için GTUR='E', çıkış için CTUR='E'.
- Bordro: seçilen ayın UCRETLER kayıtlarını listele, tekil/toplu düzenle ve doğrula.
- TNF/Data Kontrol: DATABASE.GDB ile TRYYYY.Tnf karşılaştırması.
- İşlem Geçmişi: önizleme, yedek, doğrulama ve geri alma.

### Toplu işlem kesin kuralı
Program hafta sonu veya resmi tatil hakkında otomatik karar vermez. Ayın/tarih aralığının bütün günleri kullanıcıya seçili gösterilir; istemediği günlerin işaretini kullanıcı kaldırır.

Giriş ve çıkış saatleri kullanıcı tarafından referans aralıklarıyla verilir. Toplu üretimde aynı dakika kalıbı tekrar edilmez; kişi ve güne göre aralık içinde doğal farklı saatler hazırlanır. Yazmadan önce tüm kayıtlar önizlenir.
### E + ham data kesin kuralı
Bir normal taraf sonradan manuel E olarak işaretlenecekse işlem kişi+tarih+taraf bazındadır. Hedef GIRCIK tarafı E yapılır; aynı tarafın normal/terminal karşılığı TRYYYY.Tnf içinde varsa kaldırılır. Aynı günün diğer gerçek kart basımına dokunulmaz. İşlem sonrası hem DB hem TNF yeniden okunup doğrulanır.

### Veri kaynakları ve elle dosya seçimi
Canlı kullanımda DATABASE.GDB ve aynı runtime altındaki Temp/TRYYYY.Tnf otomatik tanınır. Bunun yanında kullanıcı iki kaynağı da elle seçebilmelidir: (1) Hedef uygulama veritabanı `.GDB`, (2) terminal/denetim datası `.Tnf/.txt`. Böylece kopya/yedek/başka bilgisayardan gelen iki dosya da açılıp karşılaştırılabilir ve düzenlenebilir.

Dosya modu canlı DB'ye bağlı olmak zorunda değildir. Seçilen GDB salt okunur taranabilir; düzenleme açıldığında yedek alınır. TNF dosyası doğrudan satır bazında önizlenir ve değişiklik öncesi yedeklenir.

### Hedef 5.0.29 doğrulanmış runtime haritası
Canlı kök: C:\Hedef500. DB: C:\Hedef500\Data\DATABASE.GDB. Ayarlar: Data\Options.ini ve Data\Settings.ini. Ham terminal yılları: Temp\TR2023.Tnf, TR2024.Tnf, TR2025.Tnf, TR2026.Tnf. Rapor şablonları Report altında; terminal aktarım yardımcıları `Terminal Bilgi Aktar` altında.

Settings.ini içindeki `[ManuelIO] MenulCharecter=E` Hedef'in manuel kayıt işaretini doğrular. `[Database]` bölümü canlı GDB yolunu taşır. `[Transfer]` son aktarım zamanını ve toleransı taşır.