# KY ERP — Firma Bazlı File Hub / Hakan Emp Drive Envanteri ve Kabul Sözleşmesi
Tarih: 01.11.2026 · Kapsam: mevcut `cetin60kaya-lgtm/ky-erp` monorepo, D1 `ky-erp-db` ve Cloudflare Worker.

## Değişmeyen mimari
- **Ana firma = tenant:** aktif `mainCompanySlug` her dosya, hesap, bağlantı ve kayıt ilişkisinin kapsamıdır. Süper Yönetici, işlem yaptığı firmayı ekranda görür. Başka firmaya geçilince önceki firmanın liste/hesap verisi görüntüden temizlenir; eski API yanıtı yeni firmaya yazılmaz.
- **Bir firma / çok sağlayıcı:** aynı firmada Google Drive ve OneDrive birlikte olabilir; diğer firmada başka Google/Microsoft hesabı bağlanabilir. Hesap kaydı sadece o firmanın `file_hub_oauth_accounts` satırında tutulur. Sağlayıcı/hesap değiştirmek cari veya alt firma değiştirmez.
- D1: `file_hub_assets`, `file_hub_locations`, `file_hub_relations`, `file_hub_bindings`; gerçek dosyanın otoritesi sağlayıcıdır. R2 önizleme önbelleğidir. Orijinal PSD/AI/evraklar otomatik taşınmaz, çoğaltılmaz veya silinmez.
- Bilinmeyen dosya türü, sırf PDF/JPEG/XML uzantısından dolayı fatura, çek, bordro veya model kabul edilmez. Modül ve kayıt ilişkisi doğrulanmadan finans/İK işlemi üretilmez.
- **Hesap kaldırma:** kullanıcı firma sahibi/uygulama sahibi olmalı, etkin servis kalmamalı; yalnız firma içindeki OAuth şifreli token/hesap bağlantısı kaldırılır. Geçmiş File Hub indeksleri ve gerçek bulut dosyaları korunur.
- **Tarama:** Google Drive, OneDrive ve SharePoint, sayfa + cursor + checkpoint + tenant lease + 5 dk cron ile aşamalı sürdürülür. Hata sonrası son tamamlanan sayfadan tekrar edilir; kısmi tarama tam başarılı sayılmaz. OneDrive OAuth ayarı tamamlanmadan OneDrive canlı senkron PASS değildir.

## 01.11.2026 Google Drive — Hakan Emp gerçek salt-okunur klasör envanteri
Aşağıdaki sayım Google Drive üzerinden gerçek klasör listeleme ve örnek alt klasör okumalarına dayanır; D1 tam indeks kanıtı değildir.

| Yol | Doğrulanan kapsam | Modül önerisi |
| --- | --- | --- |
| `görsel/2026` | 347 dosya: 341 JPG + 1 JPEG + 4 PNG + 1 TIF | DESEN / MODEL_IMAGE (346 aday), 1 TIF kaynak belgesi |
| `görsel/2017…2025` | Diğer yıllara ait 9 klasör, dosya sayısı henüz toplanmadı | Tarihsel model görselleri; 2026'nın otomatik yeni kart kaydına karışmasın |
| `yerleşim dosyaları` | 684 dosya: 664 PDF, 3 PLT, 1 PSD, 4 JPEG, 4 JPG, 5 PNG, 2 XLSX, 1 RAR | DESEN / PLACEMENT — kaynağa göre ayrım; XLSX/RAR önizleme değil indirme |
| `giden desenler` | Listeleme sınırı nedeniyle **en az 1000** dosya; örnek listede çok sayıda PSD | DESEN / OUTGOING_DESIGN — gönderim/kayıt bağımsız; içerik göndermeyi tetikleme |
| `modeller` | Doğrudan altında **en az 1600 model klasörü** sayfalı listede okundu; sayfalama devam ediyor. Örneklerde PDF, AI ve TIF. | DESEN / MODEL_SOURCE veya CUSTOMER_REFERENCE; PDF kendi başına kalıp kabul edilmez |
| `DTF` | Doğrudan boş | DTF/RIP için mevcut klasör, yeni dosya geldiğinde ilişkilendir |
| `gelen dosyalar` | Doğrudan boş | Gelen desen havuzu; gerçek dosya gelmeden model açma |
| `OTOMASYON` | 3 alt klasör; örneklerde .ps1, .cmd, .log | Yalnız sistem otomasyonu; belge ve model diye yorumlama, çalıştırma yok |
| `sistem` | 4 alt klasör | Yalnız sistem arşivi/kurulum/log/önizleme |
| `index` | 3 dosya | İndeks/kılavuz, model veya finans belgesi değil |

**Ölçek notu:** `modeller` ve `giden desenler` listeleme sınırına takıldığı için yukarıdaki sayılar alt sınırdır; tam kaynak sayımı ancak sağlayıcının tüm sayfaları ve model alt klasörleri tamamlanınca kesinleşir. 347 Drive görselinin D1'e ve ayrı model kartlarına işlendiği henüz kanıtlanmadı.

## Bütün KY ERP modülleri için depolama yönlendirmesi
- DESEN: görsel, PSD/PSB/AI/TIF kaynak, yerleşim PDF/PLT, gelen/giden desen; modelin UUID kaydıyla ilişki.
- DTF/RIP: ayrı RIP PDF, vektör ve çıktı dosyaları; desen/DTF ayrımı, EMP için otomatik beyaz altlık gibi içerik mutasyonu yok.
- İMALAT: model teknik föy, sipariş, üretim görseli, kalite belgesi.
- BOYAHANE: reçete, lot/ürün, renk ve kalite fotoğrafı.
- MUHASEBE/e-BELGE: alış/satış faturası PDF/XML, irsaliye, e-İrsaliye, makbuz/KDV, ödeme arşivi; mevcut accounting archive iş akışı korunur.
- KASA/CARİ: çek/senet/dekont/kredi kartı/mutabakat; hassas klasör ataması ve ilgili gerçek işlem ID'si.
- İK/PDKS: personel özlük, kimlik/sağlık, sözleşme, izin, mesai, puantaj, bordro; kişiye/role özel erişim.
- DENETİM/İSG/KALİTE, STOK/FİRMA/GENEL: denetim kanıtı, ruhsat, firma vergi, sipariş, stok kabul ve diğer dosyalar; özel erişim ve kayıt ilişkisi.

Bu modüllerdeki her özel işlem ekranının yükleme/görüntüleme zinciri ayrı ayrı canlı kabul edilecek. File Hub dosya türü sözlüğü, özel ekranların tümünün bağlandığına tek başına kanıt sayılmaz.

## Kabul kapısı
1. Dosya Servisleri ekranı, seçili **ana firma** + gerçek bağlı hesap + orijinal kökü ayrımını gösterir. Bir firmadan diğerine geçince eski veriler görünmez.
2. Senkronizasyon bağlantısında 0 dosya / 9 klasör gösterimi **tamamlandı değildir**. Son başarılı tamamlanma ayrı, bekleyen sayfa ayrı; bekleme ve aktif çalışıyor ayırt edilir.
3. Hakan Emp görsel/2026 açık DESEN/MODEL_IMAGE binding; 347 dosyanın 346 uygun görseli için D1 indexed, linkedImages, linkedModels ve eşleşmeyenler gerçek API'den ölçülür. **347 dosya = 347 model değildir.**
4. Cron kuyruğu `görsel/2026` ve yerleşim/giden desene öncelik verir; modellerin binlerce klasörü başka alanları engellemez, hiçbiri kalıcı atlanmaz.
5. Her firmada Google/OneDrive bağlantısı, hesap kaldırma engeli, indir/önizleme yetkisi ve mobil ekran kabul edilir.
6. Test/CI, merge, Cloudflare Pages + Worker production versiyon SHA, canlı smoke ve gerçek kimlikli D1 indeksi ayrı ayrı raporlanır.
7. Canlıda OAuth secret/token, şirket veri taşınması veya D1 migration bu geliştirme kapsamında yapılmaz.
