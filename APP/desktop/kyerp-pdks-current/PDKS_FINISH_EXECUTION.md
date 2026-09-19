# KYERP PDKS — FINISH EXECUTION

Bu dosya, `codex/kyerp-pdks-full-app-prep` dalındaki PDKS revizyonunu plan yazmakla kalmadan **uygulayıp bitirmek** için Codex çalışma emridir.

## Ana ürün kararı

- Ürün referansı **KYERP**'dir.
- Hedef 5.x yalnız **işlev, işlem mantığı, rapor, terminal ve veri davranışı referansı**dır.
- Hedef arayüzü KYERP'ye kopyalanmaz.
- Mevcut KYERP masaüstü ve KYERP.NET tasarım dili korunur.
- Mevcut çalışan KYERP işlevi sebepsiz değiştirilmez veya kaldırılmaz.
- Yeni ayrı PDKS uygulaması yazılmaz. Mevcut KYERP PDKS kaynakları geliştirilir.

Önce şunları oku:
1. `CODEX_PROMPT.md`
2. `docs/UI_PARITY_LOCK.md`
3. `docs/CODEX_HANDOFF.md`
4. `docs/ARCHITECTURE_TARGET.md`
5. `README.md`
6. `legacy-runtime/MANIFEST.md`

## Görev paylaşımı

Codex yalnız yerel repo üzerinde gerçek kodlama, refactor, build, test, masaüstü UI entegrasyonu ve birbirine bağlı çok dosyalı değişiklikleri yapar.

ChatGPT tarafı GitHub üzerinden branch/commit/PR kontrolü, doküman/kural güncellemesi, canonical kararlar, kod diff denetimi ve Codex'e verilecek sonraki talimatları yönetir. Codex bu işleri tekrar üretmek veya uzun raporlarla token harcamak zorunda değildir.

Codex:
- kullanıcıdan rutin teknik karar istemez,
- yalnız destructive canlı veri işlemi, gerçek secret/lisans, geri dönüşü zor dış sistem değişikliği veya ürün davranışında gerçek belirsizlik varsa durur,
- bir blocker diğer modülleri engellemiyorsa blocker'ı izole eder ve diğer fazlara devam eder.

## Çalışma şekli

Sadece rapor yazıp durma. Her fazda gerçek kaynak kod değişikliği yap, build/test al, hatayı kapat ve sonra sonraki faza geç. Canlı veriyi bozacak destructive DB migration yapma. `Hedef.exe` veya lisans üzerinde reverse engineering/patch yapma.

### Token / context disiplini

Bu repo büyüktür. Gereksiz context tüketme.

- Tüm repoyu tekrar tekrar okuma; önce `git grep`, `rg`, proje/solution dosyaları ve hedefli dosya okumaları kullan.
- `node_modules`, `bin`, `obj`, `dist`, `build`, `.git`, büyük backup/archive/runtime klasörlerini kaynak analizi için tarama.
- Aynı dosyayı değişiklik yoksa tekrar tekrar okuma.
- Uzun plan, uzun özet ve tekrar eden açıklama üretme; kod + kısa kanıt + test sonucu yeterlidir.
- Bir faz için önce ilgili modülü bul, sonra yalnız o modülün bağımlılıklarını aç.
- Büyük mimari değişiklikleri tek seferde bütün projeye yayma; küçük, build alınabilir adımlar halinde uygula.
- Her faz sonunda en fazla kısa bir kontrol özeti bırak: `değişen dosyalar / build-test / kalan engel`.
- Bir engel kısa sürede çözülemiyorsa tüm sistemi yeniden yazmaya kalkma; engeli izole et, güvenli workaround veya sonraki faza geçiş kararı ver.
- Her büyük faz sonunda küçük ve anlamlı commit oluştur ve yalnız `codex/kyerp-pdks-full-app-prep` dalına push et.
- `main` dalına merge etme, PR'ı kapatma.
- Öncelik sırası: çalışan build > veri güvenliği > temel PDKS işlevleri > Hedef parity > web sync > temizlik/kozmetik.

## Faz 0 — Baseline doğrulama

- Repo/branch durumunu doğrula.
- `APP/desktop/kyerp-pdks-current` altındaki aktif ve legacy kaynakları envanterle.
- .NET solution/projeleri, Node katmanlarını ve PDKS ile ilgili web/API yollarını belirle.
- Mevcut build komutlarını çalıştır; baseline hataları ayrı kaydet.
- Build kırığını yeni değişikliklerle karıştırma; önce mevcut durumu belgele.

## Faz 1 — KYERP PDKS mevcut durum haritası

Aşağıdaki alanların her birini `VAR / YARIM / YOK / HATALI` olarak kod üzerinden doğrula:

- Ana PDKS açılışı ve navigation
- Personel kartı
- İşe giriş / işten çıkış
- Kart numarası / cihaz-personel eşlemesi
- Giriş-çıkış kayıtları
- Manuel giriş-çıkış ekle/değiştir/sil
- İzinler
- Ek kazanç / kesinti
- Avans / ödeme
- Mesai / kesinti saatleri
- Puantaj
- Bordro
- Maaş / mesai ödemesi
- Departman / grup / servis / görev / durum tanımları
- Dönem işlemleri
- Terminal tanımı
- Terminalden veri alma / aktarım
- TNF import/export
- Günlük operasyon
- Canlı gelen-gelmeyen personel
- Gece/gündüz vardiya akışı
- Raporlar
- Yazdırma / PDF / Excel çıktıları
- Yetki / firma / tenant bağlamı
- Desktop ↔ KYERP.NET senkronu
- Offline/queue davranışı

Bu matrisi `docs/PDKS_STATUS_MATRIX.md` olarak oluştur ve kod değiştikçe güncel tut.

## Faz 2 — Hedef → KYERP işlev parity

Legacy kaynaklar, rapor şablonları, mevcut dokümanlar ve kod referanslarından Hedef'te bulunan işlevleri çıkar.

Her Hedef işlevi için:
- Hedef işlev adı
- KYERP karşılığı
- Durum: VAR / YARIM / YOK
- Yerleştirileceği KYERP modülü
- Gerekli veri/tablo/API
- Test kriteri

`docs/HEDEF_TO_KYERP_PARITY.md` üret.

**Kural:** Hedef ekranını kopyalama; eksik işlevi mevcut KYERP tasarımına yerleştir.

## Faz 3 — Kaynak/mimari temizlik

- Tek `KYERP.PDKS.sln` veya `.slnx` kullan.
- Aktif `src/` ile `legacy/` ayrımını netleştir.
- Büyük form/partial dosyalarını UI, domain, service, data, reports, dialogs sorumluluklarına ayır.
- Hard-coded DB yolu/parola/ortam bağımlılıklarını merkezi configuration'a taşı.
- Firebird erişimini repository/service katmanına al.
- SQL davranışını ilk aşamada değiştirme.
- Canlı DB şemasına destructive migration yapma.

## Faz 4 — Modül tamamlama sırası

Aşağıdaki sırayla eksikleri gerçek kodla kapat:

1. Personel
2. Giriş-Çıkış
3. İzin
4. Ek Kazanç / Kesinti / Avans
5. Puantaj
6. Bordro / Maaş / Mesai
7. Günlük Operasyon
8. Terminal / cihaz / veri aktarım / TNF
9. Raporlar ve çıktılar
10. Firma/tenant ve yetki bağlamı

Her modülde:
- mevcut KYERP UI korunacak,
- eksik Hedef işlevi KYERP düzenine eklenecek,
- validation eklenecek,
- veri erişimi servis/repository üzerinden olacak,
- build alınacak,
- smoke/contract test yapılacak.

## Terminal / TNF — kesin çalışma kuralı

### Canonical KYERP TNF v1

TNF sözleşmesi kesin ve blocker değildir:

`KartNo,Saat,GGAAYY,1,001`

Örnek:

`00003,08:28,250526,1,001`

Kurallar:
- tam 5 alan,
- KartNo tam 5 rakam,
- saat `HH:mm`,
- tarih `ddMMyy / GGAAYY`,
- 4. alan kesin `1`,
- 5. alan kesin `001`,
- başlık, isim, açıklama ve boş satır yok,
- duplicate satır kabul edilmez,
- eski `KartNo,Tarih,Saat` formatı TNF olarak kullanılmaz.

TNF için ayrı strict `TnfRecord` / `TnfFile` importer-exporter ve contract testleri oluştur. Generic terminal parser ile TNF sözleşmesini birbirine karıştırma.

### Terminal aktarım profilleri

Terminal formatları kod içine hard-code bırakılmayacak. KYERP tasarım dili içinde `Terminal Aktarım Profilleri` işlevi ekle. Hedef ekranını kopyalama; yalnız işlev mantığını kullan.

`TerminalTransferProfile` en az şu alanları desteklesin:
- `Id`, `Name`
- `TenantId`, `CompanyId`, `WorkplaceId`, `DeviceId`
- `FormatType`: `FixedWidth`, `Delimited`, `Tnf`
- `Separator`
- `Encoding`
- EmployeeCode start/length
- Year start/length
- Month start/length
- Day start/length
- Hour start/length
- Minute start/length
- EventCode start/length
- TerminalCode start/length
- `DateFormat`
- `TimeFormat`
- EntryCode mapping
- ExitCode mapping
- `ProgramPath`
- `TransferFilePath`
- `IsDefault`

İşlevler:
- yeni profil,
- profili kopyala,
- düzenle,
- sil,
- varsayılan yap,
- örnek satır yapıştır → parse önizleme/test,
- validation,
- profile JSON import/export.

`KYERP TNF v1` hazır ve korumalı canonical preset olarak gelsin. Kullanıcı canonical preset'i doğrudan bozmasın; kopyasını oluşturup değiştirebilsin.

Parser profile-driven strategy ile çalışsın. Fixed-width cihazlarda başlangıç/uzunluk alanları profile göre uygulansın. Delimited formatlarda separator ve tarih/saat formatı profile göre uygulansın.

Ayarlar legacy Hedef DB şemasına destructive alan ekleyerek saklanmasın. KYERP'nin kendi config/profile store yapısında, ileride cloud sync'e uygun şekilde saklansın.

### Fiziksel terminal protokolü

Fiziksel cihaz protokolü kesin kaynak yoksa tahmin edilmez ve reverse engineering yapılmaz.

- `ITerminalDeviceAdapter` sınırı oluştur.
- File/TNF adapterını tamamla.
- Parse edilmiş kayıtları güvenli Firebird `GIRCIK` aktarım katmanına bağla.
- İdempotent/duplicate guard ekle.
- Fiziksel cihaz adapterını yalnız gerçekten eksik protokol blocker'ı olarak işaretle.
- Bu blocker yüzünden puantaj, bordro, günlük operasyon, rapor veya sync geliştirmesini durdurma.

## Faz 5 — KYERP.NET ve API eşlemesi

PDKS desktop ile web birbirinden kopuk iki ürün olmayacak.

- Ortak domain isimlerini belirle.
- Mevcut Cloudflare API auth/session/tenant düzenini incele ve ona uyumlu, non-breaking PDKS sync contract oluştur.
- Desktop olaylarını cloud API'ye gönderecek sync sınırlarını tanımla.
- Web'deki personel/izin/puantaj gibi değişikliklerin desktop'a dönüş modelini tanımla.
- Offline kullanım için mevcut outbox'a retry/backoff ekle.
- Tenant/company/workplace/device/employee kimliklerini sabit firma varsayımından çıkar.
- Gerekirse yalnız additive migration dosyası hazırla; remote/canlı migration çalıştırma ve canlıya deploy etme.
- Mevcut web tasarımını masaüstüne, masaüstü tasarımını web'e kopyalama.

## Faz 6 — Test ve kabul

Aşağıdaki senaryolar en az smoke/integration seviyesinde doğrulanmalı:

- personel listele/ekle/değiştir
- giriş-çıkış görüntüle ve manuel kayıt işlemleri
- izin ekle/sil
- ek kazanç/kesinti/avans
- puantaj hesaplama
- bordro/ödeme hesaplama
- rapor üretme
- terminal profil parsing
- terminal kayıt aktarımı
- strict TNF import/export
- duplicate koruması
- firma/tenant ayrımı
- desktop ↔ API sync sözleşmesi

Canlı personel verisini test için kalıcı değiştirme. Yazma testi gerekiyorsa transaction + rollback kullan.

## Faz 7 — Final teslim

Bitmeden önce:

- tüm solution/build komutları başarıyla çalışmalı,
- hard-coded parola kalmamalı,
- aktif kodda gereksiz legacy bağımlılığı kalmamalı,
- `docs/PDKS_STATUS_MATRIX.md` güncel olmalı,
- `docs/HEDEF_TO_KYERP_PARITY.md` güncel olmalı,
- `docs/PDKS_REMAINING_DEBT.md` yalnız gerçekten kalan teknik borçları içermeli,
- README build/run adımlarını içermeli.

Final raporda yalnız kısa ve doğrulanabilir bilgi yaz:
- tamamlanan modüller,
- halen yarım olanlar,
- build/test sonuçları,
- canlıya geçiş öncesi zorunlu kontroller.

## Kabul kriteri

Görev, yalnız klasör düzeni veya doküman üretildiğinde bitmiş sayılmaz. KYERP PDKS kaynakları build almalı, temel modüller çalışmalı ve Hedef'ten gerekli işlevler KYERP yapısında karşılanmış olmalıdır.
