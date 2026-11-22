# KY ERP Masaüstü 1.5.8 — Firma ana arşivi canlı ekran keşif onarımı

22.11.2026 · PR #640 devamı · 1.5.7 düzeltmesinin kullanıcı ekranında başarısız olması üzerine açılan gerçek regresyon düzeltmesi.

## 1.5.7 canlı problem
- 1.5.7 kullanıcı ekranında Windows klasör seçicisi artık açılmadı, ancak otomatik keşif **"Bu cihazda mevcut firma arşivi otomatik bulunamadı"** sonucunu verdi.
- Aynı X kullanıcısı ve Windows oturumunda disk, bulut bağlama klasörü, firma kökü ve en az dört arşiv bölümünün **varlığı** salt okunur doğrulandı.
- Hatanın kesin kökü bağlantı eksikliği değildi; uygulamanın arşiv aday keşfi gerçek ekran ortamında güvenilir biçimde sonuç üretmiyordu.

## Kalıcı güvenli düzeltme
- Disk sürücüsü etiketine/shell enumeration sonuçlarına bağımlı kalmadan yaygın Google Drive/OneDrive klasör adlarını mevcut her uygun sürücü kökünde **doğrudan kontrol et**.
- Bulut bağlama noktası geçici erişilemezse bir kez kısa gecikmeli tekrar dene. Arama derinliği sınırlı; disk ağacını tam tarama yok.
- Gerçek mevcut klasör için ayrıca makinenin Windows kullanıcı ayarındaki `KYERP_COMPANY_ARCHIVE_HINT` salt-okunur aday ipucu kullanılabilir; bu bir **erişim yetkisi değildir**. Yalnız gerçek, en az iki arşiv bölümüne sahip, bulut klasörü altında bulunan ve standart güvenlik kapısından geçen dizin kullanıcı onayına teklif edilir.
- Kullanıcı firma kökünü onaylarsa bu ayar ileride aynı klasör için güvenli öneri olarak hatırlanabilir; hiçbir şifre/oturum bilgisi bulunmaz.
- Adaylar birden fazlaysa kullanıcı seçer; disk kökü/junction/olmayan klasör reddi ve firma izolasyonu korunur. `FILE_HUB` salt-okunur onay, eksik standart klasör oluşturma ve İşNet indirme ayarı farklı ve açık işlemlerdir.
- 0 aday halinde ekranda kontrol edilen bulut kökü sayısı gösterilir; klasör seçicisine dönülmez.

## Doğrulama
- X'teki gerçek, salt-okunur arşiv kökü ve kullanıcı bazlı aday ipucu ayrı ayrı doğrulandı. İpucu yazılması hiçbir `FILE_HUB` grant oluşturmadı.
- X .NET Test: **29/29 PASS**, içinde gerçek bağlama noktası ve gerçek Windows kullanıcı ipucu kabulü var; masaüstü WPF kaynak derlemesi **0 hata**.
- **Henüz açık:** 1.5.8 final Setup Inno hash/kurulum/sürüm + gerçek WPF buton ve önizleme kabulü; D1 ortak indeks ve İşNet XML/PDF uçtan uca canlı kabulü.
- 1.5.7 kurulum paketi/yedekleri korunacak; PDKS servisi kurulumda isteğe bağlı ve varsayılan kapalıdır. İşNet oturumu ve arşiv dosyalarına dokunulmaz.

## Tek kullanıcı kabul sırası
1. X üzerinde Setup 1.5.8 hash ve Windows kurulu EXE sürümü.
2. Firma ana arşivi otomatik bulma: gerçek firma ve yol onayı, `Yeni klasör oluşturulacak: 0` (eksik klasör kutusu kapalı).
3. Onay sonrası yalnız bir `FILE_HUB` salt-okunur yetkisi; tekrarlı işlemde ikinci yetki yok.
4. 8791 İşNet, PDKS/Firebird, OAuth, D1 ortak indeks ve gerçek XML/PDF havuz bağlantıları ayrı kabul.

Sırf xUnit PASS Windows ekranı PASS sayılmaz; sonuçlar ayrılacak.
