# KY ERP — ANA PROJE DURUMU, YAPILANLAR VE YAPILACAKLAR

**Belge tarihi:** 12.09.2026  
**Belge amacı:** KY ERP projesinin tek ana devam/kontrol kaydı.  
**Kural:** Yeni büyük işler, canlıya alınan değişiklikler, saha kurulumları ve kapanan maddeler bu dosyada güncellenecek.  
**Canlı production dalı:** `codex/model-uretim-kontrol-merkezi-final`  
**Repo:** `cetin60kaya-lgtm/ky-erp`

---

## 1. DURUM ETİKETLERİ

- ✅ **CANLI / TAMAM:** Kod production'da ve canlı doğrulaması yapılmış iş.
- 🟢 **HAZIR:** Kod/test tamam; saha veya dış servis kurulumu bekliyor.
- 🟡 **DEVAM:** Aktif geliştirme veya son düzenleme işi.
- 🔵 **PLAN:** Onaylanmış mimari/iş; henüz uygulaması tamamlanmamış.
- 🔴 **KRİTİK EKSİK:** Sistemin tam çalışması için mutlaka kapanması gereken konu.
- ⚪ **HARİCİ BAĞIMLILIK:** OAuth, üçüncü taraf servis, fiziksel cihaz, BIOS/ağ vb.

---

# 2. CANLI ALTYAPI VE ÜRETİM MİMARİSİ

## ✅ Canlı yapı

- `kyerp.net` → kurumsal/public site.
- `app.kyerp.net` → KY ERP uygulaması.
- `api.kyerp.net` → Cloudflare Worker API.
- Frontend: React + Vite + Cloudflare Pages.
- API: Cloudflare Worker.
- Veritabanı: Cloudflare D1 `ky-erp-db`.
- Dosya/önizleme/cache: Cloudflare R2.
- Repo: özel GitHub deposu.
- Cloudflare Git Integration production yayını için aktif.
- API health ve canlı asset kontrolleri release sonrası doğrulanıyor.
- Tenant/firma izolasyonu temel kural.
- Kritik üretim değişikliklerinde test → build → deploy → canlı doğrulama sırası korunacak.

## 🟡 Altyapıda izlenecek işler

- D1 okuma kullanımını ve maliyetini izlemeye devam et.
- Gereksiz yüksek frekanslı heartbeat/log yazılarını D1'e yığma.
- Agent/presence gibi geçici verileri mümkün olduğunca daha uygun ephemeral yapıda tut.
- Cloudflare, Worker, Pages ve R2 kullanım/maliyet raporunu Yönetim ekranında tek yerde toplama.
- Sistem kritik servisleri için durum/arıza bildirimlerini Sistem Merkezi ile birleştirme.

---

# 3. SİSTEM MERKEZİ / SİSTEM NÖBETÇİSİ / UZAKTAN ERİŞİM

## ✅ CANLIYA ALINAN YAZILIM

**PR:** `#273`  
**Production merge commit:** `a9498f5f`  
**Canlı tarih:** 12.09.2026

Tamamlananlar:

- Responsive **Sistem Merkezi / Sistem Nöbetçisi** modülü.
- PC, tablet ve telefon uyumlu kontrol ekranı.
- Cihaz kayıt modeli.
- Cihaz heartbeat ve online/offline durumu.
- CPU / RAM / disk gibi cihaz sağlık verileri için agent altyapısı.
- Cihaz olay/geçmiş kayıtları.
- Wake-on-LAN komut akışı.
- `Uyandır` ve `Aç ve Bağlan` akışı için temel mimari.
- Uzak masaüstü motorundan bağımsız adapter yapısı.
- RustDesk ana aday; Guacamole ve diğer motorlara genişleyebilir.
- Allowlist komut sistemi.
- Serbest/limitsiz shell varsayılan olarak kapalı.
- Kilitle / restart / shutdown / servis restart / log toplama komut modeli.
- Agent başına ayrı anahtar.
- Agent token hash olarak saklanır.
- Windows tarafında DPAPI koruması.
- Windows **KY Sentinel Agent**.
- Sentinel Agent kurulum/kaldırma PowerShell scriptleri.
- LAN Bridge üzerinden WoL yönlendirme modeli.
- Normal `ADMIN` otomatik Sistem Merkezi sahibi değildir.
- Sentinel yönetim sahibi yalnız `SUPER_ADMIN`.
- Yetki verilen normal kullanıcıya cihaz ve aksiyon bazında erişim verilebilir.
- Tek kullanımlık / süreli / kalıcı remote grant modeli.
- Kritik power işlemlerinde ek onay mantığı.
- Yeni production D1 migration gerektirmeyen `json_store` tabanlı ilk sürüm.

### ✅ Yayın doğrulaması

- Frontend: **131/131 test** geçti.
- Frontend lint geçti.
- Frontend production build geçti.
- Worker typecheck geçti.
- Worker unit: **405/405 test** geçti.
- Local disposable D1 auth integration smoke geçti.
- Wrangler production dry-run geçti.
- Canlı `api.kyerp.net` health OK.
- Canlı agent endpoint'i yetkisiz isteği `AGENT_UNAUTHORIZED` ile reddediyor.
- Canlı frontend bundle'ında `SystemSentinelPage`, `sistem-merkezi` ve Sentinel API mevcut.
- Canlı Sentinel chunk: HTTP 200 / `application/javascript`.

## 🔴 Sistem Merkezi için kalan saha işleri

1. **Desen PC'yi canlı Sentinel'e enroll et.**
2. Agent'ı Windows SYSTEM altında otomatik çalışan servis/görev olarak aktif et.
3. En az bir adet 7/24 açık **LAN Bridge** belirle: sürekli açık PDKS/server/router; alternatif Raspberry Pi/mini PC.
4. Desen PC tam kapalıyken gerçek Wake-on-LAN testi yap.
5. BIOS/UEFI WoL durumunu gerçek tam-kapanma testi ile doğrula.
6. `Aç → Agent online → Uzak Masaüstü` zincirini uçtan uca test et.
7. RustDesk self-hosted ID/relay sunucusunu kur.
8. RustDesk adapter'ını ERP cihaz kartlarıyla bağla.
9. AnyDesk'i geçiş döneminde yalnız acil fallback olarak tut.
10. İkinci PC'de pilot yap; sonra diğer cihazlara toplu yay.
11. Android telefonda Sistem Merkezi kontrol görünümünü gerçek saha testiyle kontrol et.
12. Owner bildirimleri: cihaz offline, agent düşmesi, başarısız komut, yeni cihaz ve uzak oturum uyarıları.
13. Oturum açıldığında görünür “uzak bağlantı aktif” bildirimi ve owner tarafından sonlandırma.
14. Gerekirse hassas makinelerde session recording opsiyonu.

## 🔵 Sistem Nöbetçisi V2

- Kural motoru: “IF … THEN …”.
- File Agent / PDKS Agent servislerini kontrollü otomatik restart.
- Disk %90 üstü, crash loop, ağ gecikmesi, olağandışı cihaz davranışı uyarıları.
- Komut Merkezi: “Desen bilgisayarını aç ve bağlan”, “PDKS bilgisayarında bağlantı neden yok?” gibi orkestrasyon.

---

# 4. GÜVENLİK / OTURUM / TELEFON ONAYI

## ✅ Yapılanlar

- MFA tabanlı güvenli giriş yapısı.
- Google/Microsoft Authenticator desteği.
- Owner için özel kurtarma/güvenlik akışı.
- Telefon onay sistemi ve ayrı **KY ERP Güvenlik** PWA yaklaşımı.
- Güvenilir cihaz mantığı.
- Bildirim merkezi üzerinden güvenlik/onay aksiyonları.
- Owner / şirket sahibi / normal kullanıcı yetki ayrımı.
- Session/audit altyapısı ve fail-closed kritik güvenlik yaklaşımı.
- Turnstile, login rate-limit, API cache bypass ve Cloudflare güvenlik katmanı.
- Uygulama sahibi kendi işlemlerinde gereksiz iç onay kuyruğuna düşmez.
- Güvenlik/yönetim işlemleri merkezileştirildi.
- Header'da “Süper Yönetici” gösterimi firma adından ayrıldı.

## 🟡 Kalan/izlenecek

- Telefon onayında tekrar bildirim / yanlış “reddedildi” edge-case'lerini saha kullanımında izleme.
- Passkey/WebAuthn ile kritik owner step-up doğrulamasını V2'ye alma.
- Sistem Merkezi remote grant işlemlerini KY ERP Güvenlik uygulamasına bağlama.
- Delegasyonlarda süre ve cihaz scope'unu arayüzde daha görünür yapma.
- Güvenlik olaylarını Sistem Nöbetçisi bildirimlerine bağlama.

---

# 5. MUHASEBE / e-BELGE / İŞNET

## ✅ Temel yapı

- Muhasebe ana modülü, cari/firma altyapısı, çek/ödeme/tahsilat merkezi.
- Resmî / iç kayıt ayrımı, hızlı cari açma, çek görselleri ve ekleri.
- Açık borç / kart / nakit-havale / cari hareket detayları.
- e-Belge merkezi ve İşNet entegrasyon altyapısı.
- Gelen/giden belge akışları, fatura/irsaliye ayrımı, canonical belge havuzu.
- XML deterministic parse; PDF/görsel document intelligence altyapısı.
- Tedarikçi/müşteri yönü, ürün/LOT politikası, Boyahane LOT bağlama mantığı.
- Gider/stock yönlendirme ve aynı fiziksel mal kabulün tekrar stoklanmasını önleyen yaklaşım.
- İşNet outgoing recovery, portal fallback, tenant guard ve çok firma yapısı.

## 🟡 Aktif ana hedef

- Güncel 12–13 firma/cari ile temiz başlangıç.
- XML/PDF/görsel yüklenince belge satırlarını çıkar.
- Tedarikçi, ürün, LOT eşleştirme.
- Boyahane stok/reçete bağlantısı.
- Cari borç/alacak hareketlerini otomatik oluşturma.
- İrsaliye → fatura eşleştirmesi; kısmi/çoklu irsaliye senaryoları.
- Belge dosya arşivi, banka/ödeme planı ve 12 aylık maliyet/fiyat geçmişi.

## 🔴 Kapanması gereken işler

1. Canlı firma/cari başlangıç verisini temiz şekilde oluştur.
2. İşNet gerçek credential/provider durumunu her firma için doğrula.
3. Gelen belge → cari → ürün → LOT → stok → Boyahane zincirini gerçek belgeyle test et.
4. Giden e-Fatura/e-İrsaliye portal/API karşılaştırmasını tamamla.
5. Düşük confidence PDF/görsel kayıtlarını manuel kontrol kuyruğuna al.
6. Muhasebe raporlarını canonical akıştan üret.
7. Cari ekstresi, ödeme planı ve vade hatırlatmalarını tek ekranda birleştir.
8. İşNet ve manuel belgelerin aynı canonical havuza düştüğünü canlı veride doğrula.

---

# 6. MAIL MERKEZİ / İLETİŞİM MERKEZİ

## ✅ Yapılanlar

- Gmail/Outlook benzeri Mail Merkezi.
- Gelen/Giden/Çöp klasörleri, okundu/okunmadı, çöp/spam unread ayrımı.
- Sayfa yenilemeden yenileme yaklaşımı.
- PDF/PNG/JPEG/metin ve bazı medya önizlemeleri.
- Ekleri toplu indirme ve OneDrive/external link açma.
- Gmail sync/klasör altyapısı, Microsoft Graph adapter, provider-neutral mail core.
- Mail approval, firma sahibi/Super Admin yönetimi, File Hub attachment bağlantısı.
- Reply/conversation koruma ve sandbox rich HTML preview.

## ⚪ Dış bağlantı bekleyenler

- Gerçek Gmail OAuth production credential/callback final bağlantıları.
- Microsoft/Hotmail bağlantıları.
- Kurumsal posta hesaplarını tek tek canlı bağlama.
- Mail sender/department hesaplarını firma bazında kesinleştirme.

## 🟡 Son saha kontrolü

- Gerçek inbox'ta yeni mail, delete→Trash, unread sayaç, inline görseller, büyük ekler, OneDrive linkleri, reply thread ve firma bazlı yetki.

---

# 7. İK / BORDRO

## ✅ Yapılan ana mantıklar

- Personel kartları ve aylık dönem hazırlama/kalıcılık.
- Pasif personelin çıkış ayındaki bordroda kalması.
- SGK ile aktif/pasif durumun ayrılması.
- Mesai/kesinti saat parametreleri ayrı; örnek 225 / 300.
- Gün eksik ve saat eksik; tam gün 10 saat; maaş/30×gelmediği gün hesabı.
- Son bordroda banka/elden/mesai/kesinti/yol düzenleme ve kaynağa geri yazma.
- Toplu/tekli ödeme fişi, A4 çıktılar, Excel bordro.
- Personel geçişi ve yıllık izin bakiyesi.

## 🟡 Son kontrol işleri

- Gerçek aylık bordroyla tam mutabakat.
- Elden/banka toplamlarını muhasebe ödeme kayıtlarına bağlama.
- İcra/haciz/özel kesintileri gerçek personelle doğrulama.
- Yıllık izin hareketlerini PDKS ile birebir eşleştirme.
- Emekli personel özel senaryolarını son kontrol.

---

# 8. PDKS

## ✅ Web tarafı

- PDKS ana navigasyon grupları, Günlük Kart/operasyon, Personel/İK, Terminal & Sistem, Rapor & Denetim.
- Cihaz/terminal kayıt modeli, device secret hash, heartbeat/import endpoint.
- SGK/kart scope ayrımı, denetim hesabı read-only, kart hareketi operasyon mantığı.
- İzin/attendance sahipliği PDKS'te kalır.

## 🟡 Windows PDKS Desktop / Agent

Geçmiş sorunlar: setup açılıp kapanma, runtime/.NET/Node paketleme, Count property, startup crash, kullanıcıya fazla manuel iş.

Hedef: tek Setup, otomatik servis, headless HTTPS sync, cihaz tanımlama, canlı izleme, kart okuyucu olaylarını web PDKS'e taşıma, güncelleme/log ve Sistem Merkezi sağlık kontrolü.

## 🔴 Kalan saha işleri

1. Gerçek kart cihazından canlı okutma testi.
2. Kart olayı → Windows Agent → API → web PDKS zinciri.
3. Windows agent installer'ı tek setup haline getir.
4. Startup crash'i temiz Windows kurulumunda test et.
5. Sistem Merkezi'ne PDKS Agent servis kontrolü ekle.
6. Kart cihazı koparsa Sistem Nöbetçisi uyarısı.
7. Personel/SGK/PDKS aylık mutabakat ekranını sonlandır.

---

# 9. DENETİM / UYGUNLUK / EVRAK TAKİP

## 🟢 Temel modül mevcut

- Compliance/Denetim merkezi yaklaşımı.
- Dosya/evrak takip mantığı.
- Yetki kontrollü görünüm ve İK denetim hesabı sınırlandırması.

## 🔵 Tam hedef

- Disney, Sedex, müşteri özel denetimleri, SGK/personel, iş güvenliği, eğitim, sertifika, makine/periyodik kontrol, sözleşme, kalibrasyon vb.
- Belge türü, firma, son geçerlilik, sorumlu, dosya, yenileme periyodu, durum, not, standart bağlantısı.
- Süre dolmadan **10 gün önce** uyarı.
- Eksik belge tespiti, aylık yenileme listesi, tek tuş denetim paketi export.
- AI evrak kontrolü, File Hub bağlantısı, geçmiş versiyon saklama.

---

# 10. DESEN / MASTER / MODEL

## ✅ Ana prensipler

- Desen Master ana otorite; yerleşim versiyonlu; beden dinamik olabilir.
- “Desenden Gelen Modeller” bekleyen/onaylı akışı.
- Desen/kanal küçük görsel hafızası; kanal isim/sayı analizi.
- Model renklerinin Boyahane'ye aktarılması.
- Pano ölçüleri: Büyük 40×45 cm, Küçük 40×30 cm.
- 6 pano/tek kalıp gibi yerleşim-fire senaryoları.

## 🟡 Yapılacaklar

- Pano fire hesabı ve kesim/yerleşim optimizasyonu.
- Desen → Kalıphane → Boyahane → İmalat tek model timeline.
- Revizyonda eski yerleşim/kanal/reçete bağlarını koru.
- Desen görsellerini File Hub canonical arşivine bağla.

---

# 11. PHOTOSHOP UXP / HKN DESEN PANELİ

## ✅ Hedeflenen ana akış

- Seçimden gerçek RGB → kanal adı → spot kanal → yalnız seçili alan → RGB; tek History adımı.
- Beyaz/şeffaf fon, Expand/Contract, Trim, JPEG/TIFF/PDF kayıt, `qq`, AKS, spot sayısı, çözünürlük, DTF Hazırlık.

## 🟡 Son bilinen UXP işleri

- TRIM sonrası `<unknown>` ve `Select` hatalarını kapat.
- “Seçili” tuşu `qq` gibi gözleri açmalı; şerit haline getirmemeli.
- AKS yer yoksa geri gelme/düzen sorununu kapat; spot kadar dinamik satır.
- Sol/sağ artılar eşit; Arial Bold 14 pt; 508 ppi; anti-alias None.
- `cm` kaldır; en/boy iki sayı noktalı; tarih altta; taşma yok.
- Görselleri ayrı klasöre JPEG kalite 3 kaydet.
- DTF Hazırlık: beyaz fon → daraltma → Trim → PDF → kapat.
- Ekran titremesi ve “aks 9'a yazıyor / seçim yokken aks geldi” edge-case'lerini kapat.

---

# 12. BOYAHANE

## ✅ Ana yapı ve kurallar

- Sol model renkleri+KG; orta reçete; sağ Ortak Panel.
- Varsayılan su bazlı; Kayıtlı Renkler, İşlem Logu, timeline/restore, kg+LOT üretim kaydı.
- Excel kolonları: `ST, Ürün, LOT, KG/GR, GR1, GR2, GR3, GR4, %, Marka, Ürün Ticari Adı`.
- 2 varsayılan satır şeffaf/beyaz + 2 boş; KG/GR ve % otomatik; ST ürün/pigment kuralı.

## 🟡 Kalanlar

- Muhasebe ürün/LOT → otomatik stok.
- Reçete tüketimi → LOT stok düşümü.
- Sipariş → cari/fatura → stok → Boyahane.
- Reçete maliyet geçmişi, 12 aylık analiz, lot bitiş/minimum stok uyarısı.

---

# 13. KALIPHANE

## 🔵 Planlanan yapı

- Kalıp no `EBAT-XXX` (ör. `60x70-001`).
- Ebat + not + bağlı desen/takım.
- Kalıbın nerede olduğu, imalat girişi, bakım/hasar, görsel/dosya arşivi ve üretim geçmişi.

---

# 14. İMALAT / ÜRETİM

## ✅ Ana hedef/yapı

- Ortak Panel iş emri, model/desen, bölünebilir makine, Android saha.
- İlk ürün/hatalı/denetim görsel kaydı, üretim fişi, operatör/makine/vardiya, Günlük Operasyon.

## 🟡 Kalanlar

- Mobil saha final testi, paralel üretim/makine bölme, hata görseli timeline.
- Boyahane LOT→İmalat tüketim, fire/yeniden baskı/hatalı sayıları.
- Üretim bitince muhasebe/maliyet akışı.

---

# 15. GÜNLÜK OPERASYON

## ✅ Yapılanlar

- Dashboard, hızlı aksiyon, hafta/gün/ay, gece/gündüz altyapısı, mobil/tablet uyumu, fail-soft ana veri.

## 🟡 Son tasarım/işlev kontrolü

- Açık/okunabilir bölüm renkleri; her bölüm farklı ikon/renk.
- Tıklanan bölümün iç sekmeleri aynı renk ailesinin açık tonu.
- Gereksiz özet/haftalık özet/sınıflandırma tekrarları yok.
- İşlem yazıları okunabilir; sahada hızlı aksiyon son rötuşu.

---

# 16. ANDROID / TABLET / MOBİL

## ✅ Yapılan prensipler

- Telefon/tablet/PC görünüm modu, otomatik algılama, manuel mod ve ölçek.
- Touch target, klavye/safe-area, ana PWA ve ayrı KY ERP Güvenlik PWA.
- Mobil owner session kontrollü resume.

## 🟡 Devam

- Saha modülleri: Numune, Sevkiyat, İmalat.
- Sistem Merkezi mobil kontrol yüzeyi.
- Telefon cloud source-of-truth'un güvenli kontrol yüzeyi; server değildir.
- FCM push; sürekli polling yok; Android Keystore/cihaz anahtarı.
- PC durum/uyandırma/servis/remote session ve kritik biyometri/step-up.

---

# 17. FILE HUB / DOSYA / ONEDRIVE / DRIVE

## ✅ Temel yaklaşım

- Provider-neutral File Hub; OneDrive ve Google Drive.
- R2 preview/cache/iş amaçlı; firma-modül-entity dosya ilişkileri.
- Mail attachment, accounting archive, desen/model, agent tabanlı yerel dosya akışı.

## 🟡 Kalanlar

- Gerçek Google Drive ve OneDrive/Microsoft OAuth.
- Tenant connection ekranlarının gerçek hesap testi.
- Ana kaynak sağlayıcısını UI'da açık göster.
- Dosya indeksleme/arama ve Sistem Merkezi File Agent sağlık kontrolü.

---

# 18. KY ERP ASİSTAN / AI

## 🟢 Mevcut temel

- ERP asistanı, tenant bağlamı, File Hub bilgisi, dosya uydurmama kontratları.
- Workers AI / AI Gateway ve firma bazlı kullanım ölçümü.

## 🔵 V2 hedefleri

- Preview-first işlem önerisi; kritik işlemde onay.
- Sistem Nöbetçisi teşhisi, muhasebe document intelligence, denetim evrak analizi.
- Üretim/stok/LOT anomalileri ve bordro/PDKS tutarsızlık analizi.

---

# 19. UI / UX ORTAK KABUK

## ✅ Canlı

- Responsive AppV3 shell, PC/tablet/telefon, Ctrl+K Hızlı İşlem, sekmeler, Bildirim Merkezi.
- Profil/güvenlik, Görünüm & Uygulamalar, bölüm ikonları, modern sidebar/topbar, sekme renkleri.

## 🟡 Sürekli kalite kuralı

- Açık renkler, yüksek kontrast, gereksiz tekrar yok.
- Aynı iş iki farklı menüde gereksiz tekrar etmez.
- Telefon görev odaklı; masaüstü ekranı sıkıştırılmaz.
- Yönetim/güvenlik sol menüyü gereksiz kalabalıklaştırmaz.

---

# 20. FİYATLANDIRMA / TURLAMA

## 🔵 İş kuralları

- Ölçü cm; renk 1/3/5/7/9/11; efekt; adet; boya; günlük kapasite; baskı lokasyonu.
- Departman fiyat ayrımı; ense düşük maliyet; geçmiş fiyat; 12 aylık filtre.

## 🟡 Yapılacak

- Geçmiş işlerden fiyat önerisi.
- Boyahane/reçete gerçek maliyeti ve İmalat süresi/kapasitesi.
- Firma özel fiyat hafızası; teklif→sipariş→üretim→fatura zinciri.

---

# 21. ÖNCELİKLİ SIRADAKİ İŞLER

## P0 — Hemen

1. **Sistem Merkezi saha kurulumu:** Desen PC enrollment, LAN Bridge, gerçek WoL, RustDesk.
2. **PDKS gerçek cihaz zinciri:** kart okutma → agent → API → web.
3. **Muhasebe temiz canlı başlangıcı:** cari → gelen belge → LOT → Boyahane.
4. **Mail OAuth gerçek hesap bağlantıları.**
5. **File Hub gerçek OneDrive/Google Drive bağlantıları.**

## P1 — Sonraki

6. Denetim/Uygunluk evrak merkezi + 10 gün hatırlatma.
7. Sistem Nöbetçisi otomasyon kuralları.
8. Boyahane gerçek LOT stok tüketimi.
9. İmalat mobil saha finali.
10. İK/PDKS/bordro aylık mutabakat finali.
11. Photoshop UXP panel son hata temizliği.

## P2 — Genişleme

12. Kalıphane tam modülü.
13. Fiyatlandırma/turlama motoru.
14. AI anomali/öneri motoru.
15. Passkey/WebAuthn.
16. Gelişmiş remote session yönetimi/recording.
17. IoT/UPS/router/printer/NAS/üretim makinesi Device Registry.

---

# 22. KAPANIŞ / “PROJE TAMAM” KRİTERLERİ

- [x] Web uygulaması production'da.
- [x] API production'da.
- [x] D1 / R2 altyapısı.
- [x] Auth / MFA / güvenlik.
- [x] Responsive PC/tablet/telefon kabuğu.
- [x] Sistem Merkezi yazılımı production'da.
- [ ] En az iki Windows cihaz Sentinel'e bağlı.
- [ ] Tam kapalı PC gerçek WoL testi geçti.
- [ ] Self-hosted remote desktop canlı.
- [ ] PDKS gerçek kart cihazı uçtan uca çalışıyor.
- [ ] Muhasebe gerçek fatura/irsaliye → cari → LOT → stok → Boyahane zinciri çalışıyor.
- [ ] Gmail/Outlook gerçek üretim hesapları bağlı.
- [ ] File Hub gerçek OneDrive/Google Drive bağlantısı doğrulandı.
- [ ] Denetim evrak/hatırlatma sistemi aktif.
- [ ] Photoshop UXP kritik Trim/Select/AKS hataları kapandı.
- [ ] İmalat saha mobil akışı onaylandı.
- [ ] İK aylık bordro gerçek ay mutabakatı yapıldı.
- [ ] Backup/restore tatbikatı yapıldı.
- [ ] Owner kritik işlemleri için ek step-up/passkey planı tamamlandı.

---

# 23. PROJE ÇALIŞMA KURALLARI

1. Production branch'e kör değişiklik yapılmaz.
2. Önce mevcut production durumu okunur.
3. Feature değişiklikleri test edilir.
4. Frontend test/lint/build geçmeden canlıya alınmaz.
5. Worker typecheck/test/build geçmeden canlıya alınmaz.
6. Kritik migration/write/deploy için uygulama sahibi onayı gerekir.
7. Canlıya alındı denmesi için gerçekten canlı doğrulama yapılır.
8. D1'e gereksiz sürekli heartbeat/log yazılmaz.
9. Secret/token repo veya MD dosyasına yazılmaz.
10. Normal `ADMIN` otomatik uygulama sahibi değildir.
11. Remote control yetkisi cihaz ve işlem scope'lu olmalıdır.
12. Agent tarafında varsayılan serbest shell yoktur.
13. Kullanıcıya gereksiz manuel iş bırakılmamalıdır.
14. Windows kurulumlarında mümkün olduğunca tek Setup / tek komut hedeflenir.
15. Desktop Commander kotası gereksiz okuma/arama için harcanmaz; yalnız yerel PC işlemi gerektiğinde kullanılır.
16. Bu dosya her büyük release sonrasında güncellenir.

---

# 24. SON CANLI KAYIT

**12.09.2026 — Sistem Merkezi V1**

- PR `#273` production'a merge edildi.
- Production commit: `a9498f5f`.
- API health canlı doğrulandı.
- Sentinel agent authentication gate canlı doğrulandı.
- Sistem Merkezi frontend bundle/chunk canlı doğrulandı.
- Production D1 migration uygulanmadı.
- Sistem Merkezi yazılımı canlı; fiziksel agent/LAN Bridge/RustDesk saha kurulumu sıradaki ana iştir.

---

**Bu dosya KY ERP için ana “ne yaptık / ne kaldı / sırada ne var” kaydıdır.**