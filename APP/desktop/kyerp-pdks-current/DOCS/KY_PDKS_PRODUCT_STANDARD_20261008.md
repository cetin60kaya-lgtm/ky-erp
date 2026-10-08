# KY PDKS — Ürün Standardı ve Rakip Analizi (08.10.2026)

**Ürün:** KY PDKS. **Rakipler:** Türkiye'deki bağımsız PDKS sistemleri, Logo j-HR gibi bordro/İK çözümleri ve uluslararası UKG, Deputy, Jibble, Connecteam.

## Kanıtlanmış rakip özellikleri ve KY PDKS karşılığı

| Rakip ve belge | Rakibin güçlü özelliği | KY PDKS yaklaşımı | Durum |
|---|---|---|---|
| UKG Ready — https://www.ukg.com/products/ukg-ready | Tek personel kaydı, vardiya planlaması, devam, izin, bordro ve analitik | Aynı ana personel kartı etrafında PDKS/puantaj/bordro; onay ve kaynak izleme | Kısmen mevcut, tam entegrasyon AÇIK |
| Deputy — https://www.deputy.com/features | Vardiya değişimi, çalışan uygunluğu, maliyet ve çalışma kuralı kontrolleri | Grup ve vardiya planları; çalışan-ücret-yeterlilik temelli öneriler | Vardiya grupları mevcut, akıllı öneri PLAN |
| Jibble — https://www.jibble.io/features | QR/NFC, offline, konum ve biyometrik doğrulama, kiosk, timesheet | Kurumsal terminal SDK ve gerçek ham kanıt; mobil doğrulama sonradan, yazma onaylı | Terminal var, mobil doğrulama PLAN |
| Connecteam — https://help.connecteam.com/en/articles/5949142-the-operations-hub | Time clock + takvim + formlar + hızlı görevler | Günlük Operasyon, İstisna Merkezi, İzin Onayı, puantaj görev kuyruğu | Temel menüler mevcut, görev kuyruğu PLAN |
| Logo PDKS açıklaması — https://www.logo.com.tr/lp/pdks-sistemi | Devam/izin/mesai üzerinden puantaj ve bordro | Türkiye özel süreçleri, SGK ve çalışma grubu ayrımı, imza ve TNF kanıtı | Mevcut modüller kısmen, canlı kabul AÇIK |

**Rakipsizlik iddiası test edilmeden kullanılmaz.** Hedef farklılaşma: gerçek terminal kanıtını bozmayan güvenli kayıt modeli + Firebird/FDB ve yıllık TNF tutarlılığı + web/D1 senkronu + Türkiye bordro/izin iş kuralları + hızlı tek pencereli kullanım.

## Yapılan ürün-mimari çalışması — masaüstü

Birincil sol menü, iş akışı temelinde doğrudan **gerçek komutlara** yönlenir. Erişim rollerle filtrelenir:

1. **Günlük Operasyon:** Genel Bakış, Canlı Denetim, Giriş / Çıkış, İstisna Merkezi, Devam Geçmişi, ADMIN Aylık Kart Düzeltme.
2. **Personel & Planlama:** Personel, İzin İşlemleri, Vardiya / Çalışma, Servis Hatları, Yıllık Çalışma Takvimi.
3. **Puantaj & Ödemeler:** Puantaj, Bordro, Personel Ödemeleri, Dönem Kontrol Merkezi.
4. **Cihaz & Analiz:** Terminal Merkezi, Raporlar, Bölüm Devam Analizi, İşlem Geçmişi.

Yönetim ve görünüm ayarları altta yer alır. Ctrl+K komut arama korunur. Her menü öğesi tek `PdksCommandId` anahtarıyla gerçek ekranına bağlanır; ekranda henüz geliştirilmemiş bir özelliği aktifmiş gibi gösterme.

**Görsel önizleme özel:** `--visual-preview` hiçbir canlı DB/terminal/Cloud işini açmaz. Önizlemedeki boş Personel, Giriş/Çıkış, Puantaj, Bordro, Rapor tabloları **sadece yerleşim kontrolüdür**. Canlı ürün menüleri mevcut gerçek modüllere açılır, yeni sade ekranların aynı canlı davranışla bağlanması ayrıca kabul gerektirir.

## Güvenilirlik ve performans

- Menü tıklama sırasında kontrolsüz `async void` exception yayılması yerine senkron ve korumalı navigasyon.
- Görsel önizleme hata/giriş/çıkış ve periyodik handle/memory metriklerini `%TEMP%/KYERP-PDKS-VISUAL-PREVIEW/logs/navigation.log` dosyasına kaydeder. Personel/veri kaydını loglamaz.
- `tools/PreviewNavigationStress` aynı uygulamada **95 gerçek sol menü tıklaması** yapar; her sayfa başlığını, Personel ve Giriş/Çıkış veri tablolarını, handle farkını ve bellek sınırını kontrol eder.
- DESEN izolasyonundaki ilk R3 kaynak testinde Release build=0, ContractTests=0, ShellSmokeTest=0, PreviewNavigationStress=0; stress ölçümü 95 rota / yaklaşık 8.3 saniye / +28 handle / 89 MB çalışma belleği.
- Uygulamanın önceki kasılma/kapanmasının tek kesin kök nedeni Windows olay günlüğünde belirlenemedi; bu nedenle üretim kararlılığı **henüz doğrulanmış sayılmaz**.

## Sıradaki teslim sınırları

- Masaüstü canlı gerçek komutları aynı yeni görünümle tam bütünleştir; boş önizleme sayfalarını canlı sanma.
- Yazmalar tek düzeltme/önizleme/onay/kanıt akışından geçmeli, fiziksel terminal RAW hiç değiştirilmemeli.
- Zorunlu gerçek Firebird↔TNF↔D1 mutabakat, ay kilidi, E ayrı statü, gece vardiyası, rapor, bordro ve rol testleri.
- Onaylı kopya DB üzerinde hata enjeksiyonlu senkron ve geri alma testleri.
- Mobil GPS/biyometrik doğrulama eklemeden KVKK, veri minimizasyonu, yerel mevzuat ve erişim denetimleri bağımsız değerlendirilir.
- Android/iOS native uygulamalar ayrıca geliştirilip test edilmeden 'hazır' denilmez.
- Üretim EXE/DB/terminal/Cloud uygulama dağıtımı ayrıca doğrulama ve onaya tabidir.
