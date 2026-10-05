# HAKAN EMP — TAM DURUM, YAPILANLAR, NASIL YAPILDI, KALANLAR VE PLAN

**Tarih:** 06.10.2026  
**Proje:** HAKAN EMP — İmalat & Finans  
**Repo:** `cetin60kaya-lgtm/ky-erp`  
**Aktif geliştirme branch:** `codex/hakan-emp-final`  
**Repo sürümü:** **1.5.0**  
**Son sahada doğrulanmış kurulu sürüm:** **1.4.0**  
**Amaç:** Muhasebecinin tekrar tekrar veri yazmadığı, imalatı havuz mantığıyla takip eden, PDF faturayı otomatik okuyan, cari/çek/not/ödeme işlerini tek masaüstü uygulamasında yöneten sade ve hızlı sistem.

---

## 1. ANA KARAR — UYGULAMA ARTIK “DÜZ KAYIT” DEĞİL “HAVUZ” MANTIĞINDA

Sistemin merkezi **İmalat Havuzu**dur.

Bir model için iş açıldığında model aktif havuza girer. Modelin altına üretim fişleri, irsaliyeler, faturalar ve notlar eklenir. Model yalnızca tamamlandığında aktif havuzdan çıkar ve **Tamamlananlar** bölümüne gider.

### Aktif iş yaşam döngüsü

```text
GELEN İMALAT
   ↓
ÜRETİM DEVAM
   ↓
ÜRETİM TAMAM
   ↓
İRSALİYE BEKLİYOR / İRSALİYE EKSİK
   ↓
FATURA BEKLİYOR
   ↓
TAMAMLANDI
   ↓
AKTİF HAVUZDAN ÇIKAR → TAMAMLANANLAR
```

### Temel hesap

```text
Gelen Adet
- Toplam Üretim
- İrsaliye
- Fatura
= aşamaya göre kalan / yapılacak iş
```

Uygulama model satırında yalnız rakam göstermemeli; **sıradaki işi** göstermelidir:

- “3.500 ADET ÜRETİM KALDI”
- “İRSALİYE İSTE”
- “4.200 ADET İRSALİYE EKSİK”
- “500 ADET FATURA KES”
- “TAMAM”

Bu kural backend’de durum kodlarıyla çalışmaktadır.

---

## 2. HAFTALIK İMALAT DÜZENİ — YAPILDI

Makine fişleri haftalık toplanmaktadır. Bu nedenle üretim hareketleri **Pazartesi–Pazar 7 günlük dönemlere** ayrılmıştır.

### Yapılan

- Üretim kaydı fişin üzerindeki **tarihe göre** haftaya bağlanır.
- Ekranda:
  - Önceki Hafta
  - Bu Hafta
  - Sonraki Hafta
  geçişleri vardır.
- Haftalık görünüm değişince modelin genel geçmişi silinmez.
- Açık model haftalar boyunca havuzda kalabilir.
- Aynı açık modele yeni haftada yeni üretim fişi eklenebilir.
- Model detayında hem:
  - seçili haftanın üretimi / fiş adedi / sakatı
  - hem de modelin genel toplamı
  ayrı gösterilir.
- Geçmiş haftalar korunur.

### Kritik kural

**Yeni hafta = yeni model kaydı değildir.**

Hafta yalnızca üretim fişlerinin raporlama katmanıdır. Model işi fatura dengesi tamamlanana kadar havuzda yaşamaya devam eder.

---

## 3. MODEL / REPETE MANTIĞI — YAPILDI, SON KONTROL GEREKİYOR

Model daha önce üretilmiş olabilir.

### Kural

- Model adı geçmişte varsa otomatik olarak “eski kayıt” olduğu anlaşılır.
- Aynı modelin açık işi varsa yeni üretim o açık işe gider.
- Eski iş tamamlanmışsa yeni üretim geldiğinde **yeni iş / repete** açılır.
- Zemin rengi iş kartında tutulur.
- Model adı benzerlikleri ve repete ayrımı korunmalıdır.
- Aynı modele yanlışlıkla iki ayrı açık iş açılması engellenmelidir.

### Planlanan son sağlamlaştırma

Tamamlanan işlerden yeni repete açılırken görünür bir sıra adı kullanılacak:

```text
MODEL ADI
İlk İş
Repete 01
Repete 02
...
```

Bu yalnız gösterim olabilir; ana model adı değişmemelidir.

---

## 4. ÜRETİM GİRİŞİ — YAPILDI

Muhasebeci çok sayıda makine fişi girdiği için giriş seri olacak şekilde tasarlanmıştır.

### Zorunlu / kullanılan alanlar

- Tarih
- Model
- Zemin rengi
- Makine No
- Vardiya: Gündüz / Gece
- Makinacı
- Üretim Adedi
- Kumaş Sakatı
- Baskı Sakatı

### Kullanılmayan gereksiz alanlar

- Yardımcı
- Serimci
- Fikse ısı/hız gibi imalat takip hedefi dışındaki ayrıntılar
- Fazladan açıklama alanları

### Kullanım

- TAB ile seri geçiş
- Makine seçildiğinde tanımlar kullanılır.
- Makinacı listesi Ayarlar’dan yönetilir.
- Makinacı makineden makineye değişebilir.
- Fiş girildikten sonra modelin toplam üretimi anında güncellenir.

---

## 5. MODEL DETAY PENCERESİ / HAVUZ İŞLEM MERKEZİ — YAPILDI

Model satırına tıklanınca orta ekranda açılan model kartı artık işin ana merkezidir.

### Model kartından yapılabilen işlemler

- Yeni İmalat Kaydı
- Gelen Adedi Düzenle
- İrsaliye Ekle
- Fatura Ekle
- Cariyi Aç
- İç Not Ekle
- Haftalık hareketleri gör
- Tüm geçmişi gör

### Pencere davranışı

- Drawer/modal katman sorunu düzeltildi.
- Backdrop model penceresinin altında kalır.
- Açılır pencerelerin boyutu kullanıcı tarafından değiştirilebilir.
- Hızlı modal boyutu yerel olarak hatırlanır.
- Model detay penceresi boyutu da saklanabilir.

### Kalan

Kullanıcının son talebi gereği **her hareket satırına “Düzenle / Sil”** eklenmesi gerekiyor. Bu henüz tüm kayıt tiplerinde tamamlanmadı.

---

## 6. DÜZENLE / SİL KURALI — PLANLANDI, UYGULANACAK

Yanlış giriş her zaman olabilir. Bu nedenle aşağıdaki tüm kayıtların yanında işlem kontrolü olacak:

- Üretim fişi
- İrsaliye
- Fatura
- Cari ödeme/tahsilat
- Çek
- Ödeme hatırlatma
- Not
- Firma
- Makine
- Makinacı

### Güvenli yaklaşım

Doğrudan sessiz veri silmek yerine:

- **Düzenle:** eski değer → yeni değer değişim kaydı tutulur.
- **Sil:** mümkünse soft-delete / iptal / ters kayıt mantığı kullanılır.
- Toplamlar yeniden hesaplanır.
- Silinen/düzeltilen kayıt yüzünden havuz durumu yeniden değerlendirilir.
- Kritik finansal kayıtlarda audit izi korunur.

Amaç: “yanlış girdim, düzelttim” işlemi toplamları bozmadan yapılabilsin.

---

## 7. CARİ — YAPILDI

Cari tek bir “Taha Cari” ekranı değildir.

### Yapılan

- Çoklu firma kartı
- Firma seçimi
- Açılış bakiyesi
- Kesilen faturalar
- Alınan ödemeler
- Güncel bakiye
- Firma hareket geçmişi
- Firma aktif/pasif
- Firma düzenleme
- Taha varsayılan olabilir ancak sistem tek firmaya kilitli değildir.

### Cari hesap

```text
Açılış Bakiyesi
+ Kesilen Faturalar
- Alınan Ödemeler
= Güncel Bakiye
```

Fatura Havuzu ile otomatik işlenen fatura aynı zamanda cari harekete düşecektir.

---

## 8. ÖDEME HATIRLATMA — YAPILDI

Ayrı menüdür ve sol menüde alt sıralardadır.

### Özellikler

- Kime / firmaya ödeme
- Vade tarihi
- Tutar
- Açıklama / not
- Bekleyen
- Geciken
- Ödendi
- Tümü
- “Ödendi” işlemi

### Kalan

Düzenle / sil / iptal işlemleri genel audit yapısına bağlanacaktır.

---

## 9. NOTLARIM — YAPILDI

Patron ile muhasebeci arasında kağıt not mantığında ayrı menüdür.

### Özellikler

- Patron → Muhasebe
- Muhasebe → Patron
- Başlık
- İçerik
- Kategori
- Öncelik
- Sabitleme
- Aktif / pasif
- Tamamlandı

Model kartından ilgili modele iç not da bırakılabilir.

---

## 10. ÇEK TAKİP — YAPILDI, SON DÜZENLEME VAR

### Yapılan

- Ödenecek
- Bu Ay
- 3 Ay
- Ödendi
- Gelen
- Giden
- Tümü
- Ay ay ayrı blok
- Her ay ayrı görsel ton
- Aylık toplam
- Açık / ödenen / gelen toplamları
- Firma / kişi
- Banka
- Çek no
- Vade
- Tutar
- Açıklama
- Makbuz bilgisi
- Makbuzu alan kişi
- Çek görseli
- A4 yatay çıktı
- Excel / CSV çıktı

### Kalan

- Düzenle / sil / iptal kontrolü genel audit yapısına bağlanacak.
- A4 yatay çıktı son görsel kontrolü yapılacak.

---

## 11. AYARLAR — YAPILDI

Ayarlar artık yalnız Makine ekranı değildir.

### Bölümler

- Firma Ayarları
- İmalat Ayarları
- Makine & Makinacı
- Cari Ayarları
- Çek Ayarları
- Senkron & Yedek
- Fatura Havuzu klasör/izleme ayarları repo 1.5.0’da eklenmiştir.

### Makine / makinacı

- Makine ekle
- Makine düzenle
- Makine çıkar/pasife al
- Makinacı ekle
- Makinacı düzenle
- Gündüz/gece makinacı ataması

---

## 12. FATURA HAVUZU — REPO 1.5.0’DA KODLANDI

Bu yeni ana otomasyon yöntemidir.

**Durum:** Kod repo’da mevcut. Sahadaki son doğrulanmış kurulum 1.4.0 olduğu için 1.5.0 paketlenip DESEN PC’ye ajan üzerinden kurulmalı ve gerçek PDF testi yapılmalıdır.

### Kullanıcı akışı

Kullanıcı PDF faturayı yalnız şu klasöre bırakır:

```text
OneDrive\HAKAN EMP\FATURA HAVUZU\GELEN
```

Sistem PDF’yi otomatik okur.

### PDF’den çıkarılan bilgiler

- Fatura No
- Fatura Tarihi
- Firma
- Model
- Adet
- Ödenecek Tutar
- Dosya adı
- Ham parse metni (eşleştirme/debug için DB’de sınırlı tutulur)

### Otomatik eşleştirme

- Firma aktif firma kartlarıyla eşleştirilir.
- Model yalnız **açık imalat havuzundaki modeller** arasında aranır.
- Dosya adından da model sinyali alınır.
- Model eşleşme puanı **%85 ve üzeriyse** otomatik işlem yapılabilir.
- Emin olunmazsa kullanıcıya “Eşleştir” ekranı açılır.

### Başarılı akış

```text
GELEN
  ↓
PDF OKU
  ↓
FİRMA BUL
  ↓
MODEL BUL
  ↓
FATURA NO + TARİH + ADET + TUTAR
  ↓
AÇIK MODEL İŞİNE FATURA HAREKETİ
  ↓
CARİYE FATURA HAREKETİ
  ↓
HAVUZ DURUMUNU YENİDEN HESAPLA
  ↓
DOSYAYI TAŞI
```

### Başarılı PDF’nin taşınacağı yer

```text
FATURA HAVUZU\ISLENDI\YYYY\MM\FIRMA\
```

Örnek:

```text
FATURA HAVUZU\ISLENDI\2026\10\TAHA GİYİM\HKN2026000000823 NYCTEAM KALAN.pdf
```

### Eşleşmeyen

```text
FATURA HAVUZU\ESLESTIRME BEKLIYOR
```

### Hatalı / okunamayan

```text
FATURA HAVUZU\HATALI
```

### Çift kayıt koruması — YAPILDI

İki ayrı kontrol vardır:

1. PDF dosyasının **SHA-256 hash’i**
2. **Fatura numarası**

Aynı PDF veya aynı fatura ikinci kez atılırsa finansal kayıt ikinci kez oluşturulmaz.

### Tarama

- İzleme varsayılan olarak açık.
- Ayarlanabilir tarama süresi varsayılan **30 saniye**.
- Kod 5 saniyede bir kontrol döngüsüne girer ancak gerçek taramayı süre eşiğine göre yapar.
- “Şimdi Tara” manuel butonu da vardır.

### Manuel giriş

Otomasyon ana yöntemdir ama **+ Fatura hızlı giriş** kaldırılmayacaktır.

PDF yoksa veya acil/özel durum varsa:

- Firma
- Model
- Tarih
- Fatura No
- Adet
- Tutar

elle girilebilir.

---

## 13. EKİM 2026 FATURALARI — TESPİT EDİLDİ, CANLI İMPORT BEKLİYOR

Ekim 2026 için tespit edilen PDF faturalar:

| Fatura | Tarih | Firma | Model | Adet | Ödenecek |
|---|---|---|---|---:|---:|
| HKN2026000000821 | 01.10.2026 | MODAKS | DARENAS | 6.104 | 51.273,60 TL |
| HKN2026000000822 | 01.10.2026 | MODAKS | DARENAS | 6.104 | 51.273,60 TL |
| HKN2026000000823 | 02.10.2026 | TAHA | NYCTEAM | 565 | 6.102,00 TL |
| HKN2026000000824 | 02.10.2026 | TAHA | MIRET-A | 500 | 9.000,00 TL |
| HKN2026000000825 | 02.10.2026 | TAHA | MALICE | 2.815 | 33.780,00 TL |
| HKN2026000000826 | 05.10.2026 | TAHA | BABYBOYMAY | 5.150 | 55.620,00 TL |
| HKN2026000000827 | 05.10.2026 | TAHA | RONYUS | 8.000 | 124.800,00 TL |
| HKN2026000000828 | 05.10.2026 | TAHA | KISAZOR | 9.049 | 86.870,40 TL |

**Toplam:** 38.287 adet / 418.719,60 TL

Not: HKN2026000000820 SADUNA faturası 30.09.2026 tarihli olduğu için Ekim importuna dahil edilmeyecek.

### Import kuralı

- Önce açık model havuzu kontrol edilir.
- Firma doğrulanır.
- Aynı fatura no daha önce var mı kontrol edilir.
- Model açık havuzda yoksa otomatik sahte iş açılmaz; “Eşleştirme Bekliyor”a düşürülür.
- Kullanıcı doğru işi seçer veya yeni iş/repete açar.
- Sonra fatura işlenir.

---

## 14. EKİM 2026 İMALAT KAYITLARI — İMPORT İŞİ DEVAM EDİYOR

Kaynak: `İMALAT BASKI MUHASEBE.xlsm`

Amaç:

- Yalnız 2026 Ekim üretim kayıtlarını almak
- Model bazında toplamak
- Tarihe göre haftasına bağlamak
- Aynı modelin devam fişlerini aynı açık havuz işine bağlamak
- Yeni/repete ayrımını doğru yapmak
- Makine, vardiya, makinacı, adet, zemin ve sakatları kaydetmek

### Güvenlik

Toplu import başlamadan:

1. Canlı DB yedeği
2. Duplicate kontrol
3. Aynı tarih/model/makine/adet kombinasyonu kontrolü
4. Import
5. Model toplamları kontrolü
6. Haftalık toplam kontrolü
7. Son rapor

**Şu an canlı Ekim toplu import tamamlanmış sayılmamalıdır.**

---

## 15. KY-CONTROL AJAN — REMOTE YERİNE ANA İŞLEM YOLU

Remote Desktop kotası gereksiz tüketilmeyecek.

### Ana yöntem

```text
ChatGPT
  ↓
Google Drive / KY-CONTROL INBOX
  ↓
DESEN PC KY-CONTROL v2 ajan
  ↓
payload / komut
  ↓
uygulama / DB / build / test
  ↓
OUTBOX sonuç
  ↓
ChatGPT kontrol
```

### Durum

DESEN ajanı v2.0.0 olarak çalışacak şekilde kurulmuştur.

### Remote kullanım kuralı

Remote Desktop yalnız:

- görsel olarak başka türlü çözülemeyen PC problemi
- Windows GUI zorunluluğu
- ilk ajan kurtarma
- son derece sınırlı tek seferlik kontrol

için kullanılacaktır.

Kod değişikliği, DB sorgusu, import, build, test ve paketleme mümkün olduğunca ajan/GitHub üzerinden yapılacaktır.

---

## 16. UYGULAMA TEKNİK MİMARİSİ

### Masaüstü

- Electron
- Yerel HTTP servis
- Node.js
- `node:sqlite`
- Portable EXE

### Canlı DB

```text
%APPDATA%\HAKAN EMP\data\IMALAT.db
```

### Repo

Canlı üretim verisi repoda değildir.

Repo yalnız:

- kod
- test
- seed şeması / kurulum
- paketleme
- dokümantasyon

içindir.

### OneDrive

OneDrive:

- incremental senkron
- fatura havuzu
- çek görselleri
- final EXE
- yedek/transfer

için kullanılır.

Ana SQLite DB’nin aynı anda iki PC tarafından OneDrive üzerinden doğrudan açılması hedeflenmez.

---

## 17. PC + ANDROID HEDEFİ

Kullanıcının hedefi PC ve Android’den aynı iş verisini kullanmaktır.

### Mevcut

- PC masaüstü uygulaması mevcut.
- OneDrive incremental event sync altyapısı mevcut.
- Android tarafı için sync klasör mimarisi düşünülmüştür.

### Henüz final değil

- Android APK
- Android’de tam veri giriş ekranları
- iki cihazda conflict çözümü
- offline queue
- kesin cihaz yetki politikası

PC iş akışı stabil olduktan sonra APK çıkarılacaktır.

---

## 18. TEST / KALİTE KURALI

Her final sürümde:

1. `npm install`
2. `npm run check`
3. `npm test`
4. SQLite `PRAGMA integrity_check`
5. DB yedeği
6. EXE build
7. kurulum
8. API smoke
9. gerçek tıklama / modal / drawer testi
10. OneDrive final EXE hash kontrolü

### Otomatik testte kapsanan önemli senaryolar

- haftalık üretim ayrımı
- aynı işin farklı haftalarda devam etmesi
- toplam üretimin korunması
- irsaliye + fatura tamamlanınca aktif havuzdan çıkış
- Tamamlananlar’a geçiş
- model drawer katmanları
- modal açılması
- menü geçişleri

---

## 19. SÜRÜM DURUMU

### 1.4.0

Sahada son doğrulanmış çalışan paket:

- Haftalık İmalat Havuzu
- model işlem merkezi
- katman/tıklama düzeltmeleri
- haftalık testler

### 1.5.0

Repo sürümü.

Eklenen ana özellik:

- **Fatura Havuzu**
- `pdf-parse`
- PDF klasör izleme
- otomatik firma/model eşleştirme
- duplicate engeli
- ISLENDI / ESLESTIRME BEKLIYOR / HATALI klasör akışı
- Fatura Havuzu UI
- klasör ayarları

### Dikkat

README içinde portable output satırı hâlâ 1.4.0 göstermektedir. Paket sürümü 1.5.0’dır. Final temizlikte README düzeltilmelidir.

**1.5.0 henüz “DESEN PC’de final doğrulandı” kabul edilmeyecek.** Ajanla paketlenip kurulmalı ve gerçek PDF testinden geçmelidir.

---

## 20. ŞİMDİ YAPILACAKLAR — ÖNCELİK SIRASI

### P0 — hemen

- [ ] 1.5.0 kodunun `npm run check` testi
- [ ] 1.5.0 smoke test
- [ ] Fatura Havuzu için örnek PDF test seti
- [ ] 821–828 Ekim faturalarının duplicate kontrollü test importu
- [ ] DARENAS’ın iki ayrı MODAKS faturasında aynı açık işe doğru eklenme kontrolü
- [ ] PDF başarılıysa ISLENDI/2026/10/FIRMA altına taşınma kontrolü
- [ ] eşleşmeyen modelin ESLESTIRME BEKLIYOR’a gitmesi
- [ ] aynı PDF ikinci kez atıldığında ikinci finansal kayıt oluşmaması
- [ ] 1.5.0 EXE
- [ ] DESEN PC’ye KY-CONTROL ajanıyla kurulum
- [ ] OneDrive final EXE güncelleme

### P1 — imalat verisi

- [ ] Ekim 2026 Excel üretim kayıtlarını çıkar
- [ ] haftalara böl
- [ ] açık model / yeni model / repete kararını ver
- [ ] toplu import
- [ ] toplamları doğrula
- [ ] kullanıcının vereceği son makine fişlerini ekle

### P1 — kullanıcı hatası güvenliği

- [ ] Üretim satırı Düzenle
- [ ] Üretim satırı Sil/İptal
- [ ] İrsaliye Düzenle
- [ ] İrsaliye Sil/İptal
- [ ] Fatura Düzenle
- [ ] Fatura İptal/Ters kayıt
- [ ] Ödeme düzenle/iptal
- [ ] Çek düzenle/sil
- [ ] Reminder düzenle/sil
- [ ] Audit kayıt ekranı

### P2 — görsel/kullanım

- [ ] tüm modal/drawer boyut hatırlama son kontrolü
- [ ] yazı ölçeği tüm ekranlarda son kullanıcı testi
- [ ] havuz satırında “SON İŞLEM” alanı
- [ ] havuz satırında “SIRADAKİ İŞLEM” daha baskın görünüm
- [ ] Tamamlananlar filtreleri: tarih / firma / model / repete
- [ ] A4 çek çıktısı son tasarım kontrolü

### P3 — Android

- [ ] PC stabil final
- [ ] Android ekran kapsamı
- [ ] event sync conflict politikası
- [ ] APK
- [ ] gerçek iki cihaz testi

---

## 21. FATURA HAVUZU İÇİN SON KULLANICI AKIŞI

### Otomatik

```text
1. Faturayı kes.
2. PDF’yi FATURA HAVUZU\GELEN’e bırak.
3. Başka işlem yapma.
4. Uygulama okur.
5. Model/firma netse otomatik işler.
6. PDF ISLENDI klasörüne taşınır.
7. Model havuzu ve cari otomatik güncellenir.
```

### Emin değilse

```text
PDF → EŞLEŞTİRME BEKLİYOR
             ↓
Uygulamada Eşleştir
             ↓
Firma / Model seç
             ↓
Eşleştir ve İşle
             ↓
ISLENDI
```

### Elle

```text
+ Fatura
→ firma
→ model
→ tarih
→ fatura no
→ adet
→ tutar
→ kaydet
```

Otomatik sistem hiçbir zaman manuel hızlı girişi kaldırmayacaktır.

---

## 22. TAMAMLANMA KRİTERİ

HAKAN EMP uygulaması “final kullanıma hazır” sayılacaksa:

- İmalat Havuzu yanlış model açmamalı.
- Haftalık üretim eski haftayla karışmamalı.
- Açık model tamamlanmadan kaybolmamalı.
- Tamamlanan model aktif havuzda kalmamalı.
- Fatura PDF’si elle tekrar yazılmamalı.
- Aynı fatura iki kez işlenmemeli.
- Eşleşmeyen otomatik tahminle yanlış modele yazılmamalı.
- Cari bakiye fatura/tahsilatla doğru çalışmalı.
- Yanlış kayıt düzenlenebilmeli / iptal edilebilmeli.
- Her kritik işlemden sonra toplamlar yeniden hesaplanmalı.
- DB yedeklenebilir ve integrity check geçmeli.
- Remote Desktop olmadan KY-CONTROL ajanıyla bakım yapılabilmeli.

---

## 23. KISA SON DURUM

**Çalışan temel:** İmalat Havuzu + Haftalık Üretim + Cari + Çek + Not + Ödeme Hatırlatma + Ayarlar.  
**Repo’da yeni:** Fatura Havuzu 1.5.0.  
**Sahada son doğrulanmış:** 1.4.0.  
**Şimdi ana iş:** 1.5.0’ı ajanla test/kur, Ekim imalat + Ekim faturaları toplu yükle, ardından tüm kayıt tiplerine Düzenle/Sil güvenliğini tamamla.  
**Remote Desktop:** varsayılan yöntem değil.  
**Ana bakım kanalı:** GitHub + KY-CONTROL v2 ajan + OneDrive INBOX/OUTBOX.
