# HKN PDKS REV25 — Final Architecture

## Tek üretim kuralı
- DATABASE.GDB ana kaynaktır.
- TNF, seçilen kapsam içindeki normal GIRCIK hareketlerinin bire bir çoklu-küme aynasıdır.
- E hareketleri yalnız DB'de kalır; TNF'ye yazılmaz.
- TNF eksikse oluşturulur. Eksik satır eklenir; fazla, mükerrer, bozuk ve E karşılığı silinir.
- TNF formatı sabittir: KartNo,Saat,GGAAYY,1,001.
- Eşitleme öncesi TNF yedeği alınır; atomik yazılır; son kontrol başarısızsa eski TNF geri yüklenir.

## Tek menü
1. Personel
2. Giriş-Çıkış
3. Kayıt Düzeltme
4. E İşlemleri
5. Bordro
6. Ödeme / Avans
7. DB - TNF Eşitle

Eski Toplu İşlem, Aylık Kontrol, ayrı TNF Düzenle ve TNF-only üretim yolları kaldırılmıştır.

## Kayıt Düzeltme
- DB'ye yazan tek normal kart düzeltme motorudur.
- Giriş ekle, çıkış ekle, ikisini ekle, saat düzelt, mükerrer temizle, fazla kayıt temizle.
- Saatler sabit değildir. Hedef DB çalışma politikası kullanılır.
- Yeni saatler tanımlı giriş/çıkış aralıklarında doğal dağıtılır ve ardışık aynı dakika tekrarı engellenir.
- Uygulama öncesi DB gbak yedeği; transaction/rollback; aynı kişi/gün TNF'si DB'den yeniden kurulur.

## E İşlemleri
- Seçilen DB tarafını E yapar.
- Önce gbak alır, DB transaction kullanır.
- İlgili kişi/gün TNF'sini DB'den tekrar kurar; E TNF'de kalmaz.
- TNF yayınlama/DB commit hatasında geri alma uygulanır.

## Bordro
- Kaynak: UCRETLER; tarihi maaş alanı DMAAS.
- Bordro düzenleme ve toplu düzenleme.
- Alan bazlı kalıcı override.
- Personel kilidi ve ay kilidi.
- Çakışan UCRETLER dönem tespiti ve güvenli temizleme.
- Trigger koruması; manuel kullanıcı düzenlemesi connection-scoped bypass ile yapılır.
- Global bypass yoktur.

## Güvenlik / doğrulama
- Açılış şifre doğrulayıcısı özel embedded verifier kullanır.
- DB bağlantı ve gerekli tablo kontrolü açılışta yapılır.
- Sayı/tarih hataları sessizce 0/NULL'a çevrilmez.
- Tekil kayıt beklenen update işlemleri etkilenen satır sayısını doğrular.
- DB/TNF kaynak değişiklikleri eski önizlemeyi geçersiz kılar.
- Paket testten geçmeden üretilmez.

## Paket
- .NET 8 / win-x64
- self-contained
- single-file
- single-file compression aktif
- hedef boyut yaklaşık 71 MB
- BUILD_INFO + SHA256 + ZIP SHA256 üretilir.