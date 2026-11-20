# KY ERP — İşNet Yerel Google Drive Arşivi

**Tek fiziksel belge kaynağı.** Bu modül, NetteFatura'nın yerel Windows bilgisayarında doğrulanmış salt-okunur portal girişini kullanır. XML ve PDF dosyalarını **Google Drive for desktop tarafından zaten eşitlenen tek yerel klasöre** kaydeder. Aynı orijinal belgeyi KY ERP R2'ye, tarayıcının İndirilenler klasörüne veya başka bir Drive klasörüne **ayrıca kopyalamaz**.

## Bir defalık yerel kurulum

Node.js 22+ yeterlidir; ek npm paketi ve GitHub tokenı gerekmez. İşletmeci, senkron klasörü belirler:

```powershell
$env:KYERP_ISNET_ARCHIVE_ROOT = "D:\<Drive yerel eşitleme klasörü>\<Firma>\Firma Yedekleri\ISNET_EBELGE"
$env:PORT = "8790"
node .\server.mjs
```

Tarayıcı: `http://127.0.0.1:8790`. Uygulama yalnız `127.0.0.1` dinler, uzaktan herkesin erişebileceği bir ağ servisi değildir. Şifre yalnız işlem belleğinde tutulur; oturum temizleme ve programı kapatma şifreyi/cookie'yi bellekten kaldırır.

## Günlük kullanım

1. Yerel uygulamada İşNet'e gir → yetkili firmayı seç ve portal oturumunu aç.
2. Tarih aralığını seç. Dört kaynak için **Dört Türü Arşivle · XML + PDF** düğmesi gelen/giden e-Fatura ve e-İrsaliye listelerini sırayla tarar. İstersen tek belgeyi ayrı arşivle.
3. Her belge için bir klasör altında **bir orijinal XML ve bir orijinal PDF** saklanır; `kayit.json` yalnız kaynak kimliği, UUID, tarih ve SHA-256 özetlerini içerir. Orijinal belge baytlarını tekrar içermez.
4. Aynı dosya yeniden gelirse SHA-256 eşleşmesinde kopya yazılmaz; farklı bayt gelirse eskisi korunur ve hata verilir. PDF bulunamazsa XML korunur; sonraki denemede PDF aynı dizine tamamlanabilir.

İç yapı: `GELEN_FATURA`, `GIDEN_FATURA`, `GELEN_IRSALIYE`, `GIDEN_IRSALIYE` / sağlayıcı firma kimliği / yıl / belge no + sağlayıcı kayıt kimliği. Aynı belge farklı tarihte tekrar sorgulansa da normal koşullarda aynı dizin kullanılır.

## KY ERP bağlantı sınırı

- Arşivdeki **orijinal dosyanın fiziksel otoritesi Drive ile eşitlenen bu klasördür**. Uygulamadaki File Hub `GOOGLE_DRIVE` / `E_DOCUMENT` bağlantısı aynı orijinal dosyaya referans göstermelidir; R2'ye ikinci orijinal kopya göndermek bu mimarinin parçası değildir.
- Bu yerel Node uygulaması **kendiliğinden Cloudflare D1'e yazmaz** ve kullanıcı adına mali kayıt yapmaz. KY ERP File Hub provider yetkisi, firma bağlama ve D1 idempotent metadata ilişkisi ayrıca gerçek kullanıcı oturumuyla doğrulanmadan "ERP havuzuna otomatik işlendi" denmez.
- `kayit.json` içindeki belge kimliği/UUID/SHA-256 bilgileri D1'deki kayıtla eşleştirme için kullanılabilir. XML'deki kalem/KDV/irsaliye referans analizi canonical e-Belge motoruna aittir. İkinci muhasebe/şablon motoru oluşturulmaz.
- Kullanıcının gerçek İşNet şifresi, cookie'si, tokenı ve belge içeriği GitHub repo/issue/PR, ChatGPT veya canlı Worker'a geçirilmez.
- Drive senkronizasyonunun çevrimiçi ve dosyaların tamamlanmış olması Google Drive masaüstü durumu ve Drive tarafı okuma ile ayrıca doğrulanır. Yerel dosyanın varlığı tek başına bulut kopyası tamamlandı demek değildir.
- Otomatik Windows başlangıç görevi veya parola saklama kurulmaz. Manuel başlatıcı kullanıcı isteğiyle yerel cihaza konulabilir.

## Test

```powershell
node --check .\server.mjs
node --test .\archive-store.test.mjs
```

İlk izole testler: 2 dosyanın tek kaydı, aynı içeriği ikinci kez yazmama, PDF eksikliği tamamlama, değişmiş içerikte orijinali koruma, yol traversal engeli. Gerçek İşNet hesabıyla otomatik canlı arşiv kabulü ayrıca gerekir.
