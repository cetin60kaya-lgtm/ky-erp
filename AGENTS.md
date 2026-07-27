# KY ERP geliştirme kuralları

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

