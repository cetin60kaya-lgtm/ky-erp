# KY ERP geliştirme kuralları

## Sabit çalışma kaynağı

- GitHub deposu: `cetin60kaya-lgtm/ky-erp`.
- Windows ana yerel çalışma klasörü: `D:\KYERP-GITHUB\KY-ERP-AKTIF`.
- Kullanıcı yeni bir karar vermedikçe geliştirme, GitHub eşitleme, derleme ve yerel uygulama kontrolü yalnız bu klasörden yapılır.
- Aktif çalışma dalı: `tasarim-final-v1`. Dal değiştirmeden önce kullanıcı onayı alınır.
- Her Git işleminden önce aşağıdakiler doğrulanır:
  - `git rev-parse --show-toplevel`
  - `git remote get-url origin`
  - `git branch --show-current`
  - `git status -sb`
- Beklenen remote: `https://github.com/cetin60kaya-lgtm/ky-erp.git`.
- Yerel çalışma ağacı temiz değilse veya dal GitHub'dan ilerideyse `pull`, `merge`, `reset`, `clean`, `checkout` ya da `switch` uygulanmaz; önce değişiklikler raporlanır ve korunur.

## Eski ve referans klasörler

Aşağıdaki klasörler ana çalışma kaynağı değildir; otomatik eşitlenmez, silinmez veya sıfırlanmaz:

- `D:\Onedrive-Hkn\OneDrive\KY-ERP-MERKEZ` — eski `arayuz-kabuk-v3` çalışma kopyası.
- `D:\Onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\TEMP\ky-erp-git-sync` — eski `main` çalışma kopyası.
- `D:\Onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\TEMP\ky-erp-git-sync-yeni` — `work/ik-muhasebe-final` dalında GitHub'a gönderilmemiş yerel commitler içerebilir; özellikle korunur.
- `D:\KY-ERP` — Git deposu değildir.

## Yerel uygulama kontrolü

- Backend klasörü: `APP\app\ky-erp-backend`.
- Frontend klasörü: `APP\app\ky-erp-frontend`.
- Backend geliştirme portu: `3101`.
- Frontend geliştirme portu: `5173`.
- Repo içindeki güvenli yaşam döngüsü komutu kullanılır:
  - Başlat: `powershell -ExecutionPolicy Bypass -File .\SCRIPTS\KYERP_LIFECYCLE.ps1 start`
  - Durum: `powershell -ExecutionPolicy Bypass -File .\SCRIPTS\KYERP_LIFECYCLE.ps1 status`
  - Durdur: `powershell -ExecutionPolicy Bypass -File .\SCRIPTS\KYERP_LIFECYCLE.ps1 stop`
- Başlatma öncesinde `DATA\KYERP.db`, gerekli `.env` ayarları, Node/npm bağımlılıkları ve `sqlite3` komutu kontrol edilir.
- Gerçek İşNet giden irsaliye veya resmî fatura gönderimi son kullanıcı onayı olmadan çalıştırılmaz.

## Genel mühendislik kuralları

- Bu proje KY ERP üretim sistemidir.
- Öncelik sırası: sıfır veri kaybı, sıfır hata, hızlı işlem, sade arayüz.
- Mevcut özellikleri kaldırma ve demo veri üretme.
- API anahtarlarını açığa çıkarma; frontend'e gizli anahtar koyma.
- Migration öncesi yedek ve geri dönüş planı hazırla.
- Her değişiklikten sonra ilgili testleri çalıştır.
- TypeScript ve lint hatası bırakma.
- Kullanılmayan veya gereksiz paket ekleme.
- Büyük değişiklikleri küçük ve denetlenebilir parçalara ayır.
- Kullanıcı istemedikçe tasarımı baştan değiştirme.
- Kod içinde Türkçe karakter kaynaklı bozulma oluşturma.
- Cloudflare D1, R2, Workers ve Pages uyumluluğunu koru.
- Production API adresi `https://api.kyerp.net` olarak kalmalıdır.
- İş tamamlandığında değiştirilen dosyaları ve test sonuçlarını raporla.
