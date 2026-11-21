# KY ERP — Tek Firma Ana Arşivi, 10 Sade Bölüm (V2)

**22 Kasım 2026.** Kullanıcının yeni kesin kararı bu belgedir. Önceki `KY_ERP_FIRMA_TEK_KOK_MEVCUT_HAKAN_EMP_KLASOR_STANDART_20261122.md` V1 kök-12 planı **tarihsel** kaldı. Yeni bütün dosya sözleşmesi **modül bazlı**dır. GitHub `main` canonical kaynak değildir.

## Kaynak incelemesinden çıkan gerçek

- Aktif File Hub yetkili firma/sağlayıcı kök ID'si ve `file_hub_bindings` (module_code + purpose_code + root_path) alanını kullanır. Kullanıcının klasör adı değişebilir, modül kimliği **değişmez**. Aynı dosya ayrıca D1 File Hub ilişkilerine bağlanır.
- Muhasebe/İşNet: 101 XML+PDF çiftinin mevcut kaynağı hâlâ kökteki `KY-ISNET-BELGELER`; sürüm arşivi ayrı `_INCELEME` içinde, aktif 8791 oturumu bu kökü kullanıyor. D1 aktarımı ayrı kabul gerektirir.
- Desen model kaynakları mevcut `modeller`, `görsel`, `giden desenler`, `yerleşim dosyaları` altında. Fiziksel taşıma yapılırsa eski model/resim/PSD path, dosya servisleri ve otomasyon yolları eşzamanlı güncellenmelidir.
- Boyahane: reçete/kalite kanalları var; `EvrakDenetimPage.jsx` içinde örnek evrak listesi bulunuyor; arşive tam entegrasyon tamamlanmadan gerçek dosya yüklenmiş sayılmaz.
- İK: `ik-personnel-media.ts` personel fotoğraflarını bugün D1 metadata + R2 aslı olarak tutuyor ve eski fotoğrafı değiştirebiliyor. Bu servis ortak File Hub dosya birincil arşivine geçirilmeden `İK/Personel Evrakları` görünmesi tam arşiv kabulü değildir. Kişisel/sağlık/maaş dosyası kullanıcıya açık Drive paylaşımına otomatik taşınmaz.
- Yönetim: File Hub mevcut D1 olaylarını gösteriyor. `YÖNETİM/Loglar` veya `Firma Yedekleri` oluşturulması gerçek tam D1 yedeği aldığı anlamına gelmez.

## 1. Onaylanan fiziksel ağaç

```text
FİRMA ANA KLASÖRÜ [webde provider / OAuth / folder ID, yerelde yalnız isteğe bağlı]
├── DESEN/
│   ├── Modeller/               [eski modeller kaynağının hedefi]
│   ├── Görseller/              [eski görsel / yıl düzeni hedefi]
│   ├── Giden Desenler/         [eski giden desenler PSD kaynağının hedefi]
│   ├── Yerleşim Dosyaları/     [eski yerleşim dosyaları PDF hedefi]
│   └── DTF/
├── MUHASEBE/
│   ├── e-Belgeler/
│   │   ├── Gelen e-Fatura/
│   │   ├── Giden e-Fatura/
│   │   ├── Gelen e-İrsaliye/
│   │   └── Giden e-İrsaliye/
│   ├── Sahadan Gelen İrsaliye/
│   ├── Çek ve Ödemeler/
│   ├── Cari ve Gider Evrakları/
│   └── Vergi ve KDV/
├── BOYAHANE/
│   ├── Model Formları/
│   ├── Reçeteler/
│   └── Kalite/
├── İK/
│   ├── Personel Evrakları/
│   ├── Bordro ve Ödemeler/
│   └── İzin ve Puantaj/
├── İMALAT/
│   ├── İş Emirleri/
│   └── Sevkiyat/
├── DENETİM/
│   ├── Denetim Evrakları/
│   │   ├── Disney/
│   │   └── FAMA/
│   ├── MSDS/
│   ├── TDS/
│   ├── Periyodik Bakımlar/
│   └── Standartlar/
├── FORMLAR/
│   ├── Yemek/
│   ├── Temizlik/
│   └── Genel/
├── YÖNETİM/
│   ├── Firma Yedekleri/
│   │   └── Geçmiş Arşiv/      [yalnız Hakan Emp tarihî yedek, korunuyor]
│   ├── Loglar/
│   ├── Sistem Raporları/
│   └── Firma Belgeleri/
├── OTOMASYON/                  [Hakan Emp mevcut teknik içerikler korunur]
└── gelen dosyalar/            [mevcut kaynak, kategori ataması bekleyenler]
```

Kök `OTOMASYON` ve `gelen dosyalar` isimleri eski aktif süreçlere bağımlı olabileceği için ilk etapta yerinde. Müşteriler her bölümde kendi isimlerini kullanabilir; File Hub kayıtları klasör adına değil sabit module/purpose koduna bağlıdır.

**HKN/DDM:** belge numarası ve XML içindeki gerçek tanımlayıcılar korunur; sadece klasör adları kurumsal `Giden e-Fatura` / `Giden e-İrsaliye` olur. Yüzlerce tarihî PDF dosyası canlı Mail ve model bağlantıları doğrulanmadan taşınmayacak.

## 2. Hakan Emp canlı Google Drive uygulama kaydı

**Tamamlanan fiziksel işlemler:** 8 üst bölümün ve yukarıdaki alt dizinlerinin gerçek Google Drive kökünde oluşturulması; yanlışlıkla iki kez açılan **yalnız yeni ve boş olduğu doğrulanmış** 20 dizinin silinmesi ve 8 bölümde **0 mükerrer isim** okunması; eski kökte boş `DTF` dizininin aynı Drive klasör ID'siyle `DESEN/DTF` altına taşınması; eski `FIRMA YEDEKLERI` dizininin aynı ID ve içeriğiyle `YÖNETİM/Firma Yedekleri/Geçmiş Arşiv` olarak taşınması; aktif `KY-ISNET-BELGELER` dört yönü kontrol edildi.

**Korunan ve henüz fiziksel taşınmayan kaynaklar:** `modeller`, `görsel`, `giden desenler`, `yerleşim dosyaları`, `HKN E-FATURA`, `DDM E-İRSALİYE`, `KY-ISNET-BELGELER`, `KESİMDEN GELEN İRSALİYE`, `İMALAT BASKI MUHASEBE .xlsm`. Bunlar üretim kullanıcılarının aktif dosya yolu olduğundan, kod path/tenant/Drive kimliği eşleştirme ve Outlook/8791 canlı kabulü geçmeden taşınmaz; kopyalanıp ikinci kanonik arşiv açılmaz.

**D1 / model / Outlook / personel:** canlı File Hub provider bağlantısı ve gerçek D1/index kabulü bu işlemde yapılamadı. Yeni klasörlerin görünmesi, bu modüllerden otomatik dosya yüklenmesi veya yedek alınması anlamına gelmez.

## 3. Her firmanın tek kurulum iş akışı

1. Yönetim → Bağlantılar & Depolama → Dosya Servisleri → seçili firmanın Google/OneDrive/SharePoint OAuth hesabı ve **tek ana klasör folder ID**.
2. Yönetim → **Klasör Düzeni** haritası → modül/amaç kodunu aç → mevcut hedefi kontrol et veya gerçek provider klasörünü **Klasör Seç** ile bağla; firma klasör adını istediği gibi kullanır.
3. Belge yükleyen web kullanıcısı masaüstü yüklemek zorunda değil. Birinci arşiv provider (Drive/OneDrive), D1 metadata/ilişki, R2 yalnız preview/cache olabilir; eski R2 istisnaları migration ile çözülür.
4. Muhasebeci isterse Windows yardımcı 8791 kurar; tek aktif arşiv yazıcısı ve tek yetkili portal oturumu, eski arşiv koruması. DESEN işçisi yüksek PSD/AI için isteğe bağlı yerel dosya erişimini onaylar.
5. İK/Denetim/Banka/Loglar için dosya bağlantısı ayrıca rol ve provider ACL denetimi geçirir. Aynı Drive kökünün herkesle paylaşılması hassas yetki sayılmaz.
6. Yedekleme gerçek D1 tutarlı export + sağlayıcı dosya envanteri + doğrulanan restore paketi gerektirir; klasöre birkaç dosya koymak `Firma Yedekle` PASS değildir.

## 4. Yayın/taşıma güvenlik kapısı

- Önce PR #634 İşNet + File Hub tabanı; sonra PR #635 masaüstü/çok firma düzeni ve bu V2. (PR #635 taslak; release değil.)
- Bulut OAuth tenant/root ID ve `file_hub_bindings` gerçek D1 kabulü; 101 XML+PDF; aynı providerFileId / asset / model bağları; 8791 yeni yol ile idempotent yazma; Outlook HKN+DDM hızlı gönderim; IK fotoğraf eski R2 ana kaynağının güvenli File Hub geçişi.
- Ardından tek tek **kopyasız Drive parent move**; her klasör için önceki parent, yeni parent, Drive ID, dosya sayısı ve model dosya erişim kontrolü. Hata olursa aynı ID ile eski parent'a geri dön.
- Sonrasında eski kökün kaldırılması ancak tüm akışlar ispatlandığında. Canlı merge/deploy ve D1 finansal finalizasyon burada yapılmadı.

## 5. Kod kaynakları

- `APP/app/ky-erp-frontend/src/pages/admin/CompanyArchiveLayout.js`: modül ve önerilen klasör haritası, kişiye özel binding'in önceliği.
- `APP/app/ky-erp-frontend/src/pages/admin/AdminStorageCenter.jsx`: tek firma Klasör Düzeni yönetim sekmesi.
- `APP/app/ky-erp-frontend/src/pages/admin/StorageDocumentCatalog.js`: Formlar, Denetim, Boyahane/Yönetim belge türleri.
- `APP/desktop/ky-pdks/src/KyPdks.Desktop/CompanyArchiveLayout.cs`: yalnız isteğe bağlı Windows kök seçimi, mevcut dosyaları otomatik taşımaz.
- `TOOLS/isnet-drive-archive/isnet-drive-yerel.mjs`: tarihî kökte eski 4 yön ismi; yeni `e-Belgeler` kökünde kurumsal 4 yön ismi.

**Güvenlik:** Gerçek kullanıcı kimliği, şifre, token, özel Drive dosya kimliği veya personel içeriği bu belgeye yazılmadı.
