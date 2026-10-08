# KY PDKS — 2026 Modern UI / Desktop + Web + Mobile çalışma kaydı

Tarih: 08.10.2026
Durum: BAŞLADI / FEATURE BRANCH — henüz production veya masaüstü canlı dağıtım yok
Branch: `feature/pdks-modern-workspace-20261008`
Base: `codex/model-uretim-kontrol-merkezi-final` @ `863fbef72e748cb9b0d7143366a4ecdb7bd5e701`

## Kesin hedef
- Üç bağımsız yazılım değil; KY PDKS desktop terminal/Firebird/TNF, kyerp.net ve KY ERP Mobil aynı kuralları/kimlikleri kullanır.
- Eski Hedef tarzı sıkışık tablo ve yinelenen menü/panellerden vazgeç. Modern, okunabilir, iş odaklı düzen kur.
- Personel listesi kart no, ad soyad, grup. Aktif varsayılan; Pasif/Tümü açık filtre. Detay seçilen kişide.
- Giriş/Çıkış görünümü: tarih, giriş, çıkış, kaynak, durum, yetkili düzeltme; fiziksel kanıt değiştirilmez.
- Ay ve yıl ayrı kontrol. Puantaj, E, izin, bordro, rapor ve terminalde aynı tasarım yaklaşımı.
- Sync kanıtı yoksa "0 devamsız" veya "18 devamsız" kesin kabul edilmez; canlılık ile son web yenilemesi ayrılır.
- Maaş/PDF/senkronu ekran tasarımı uğruna değiştirme.

## Pazar referansı
- Factorial: dashboard team status, pending work, self-service, anlaşılır çalışma durumu.
  https://help.factorialhr.com/en_US/managing-my-employee-profile/about-the-factorial-dashboard
- Deputy: time & attendance, günlük liste, zaman kartı, istisna/puantaj onayı.
  https://www.deputy.com/features/time-and-attendance
- Görsel taklit veya proprietary kod kullanılmadı, yalnız etkileşim yaklaşımı örnek alındı.

## İlk kod revizyonu — tamamlanan KOD, saha kabulü değil
1. `PdksPersonnelDesk.jsx/css`: üç sütunlu personel seçici, etiketli filtre, seçili kişinin kısa özeti, Giriş/Çıkış, ayrı Puantaj, İzinler, E kaynak işareti, yatay kaydırılabilir okunaklı tablo.
2. `PdksLiveHome.jsx/css`: yeni günlük merkez, son geçiş listesi, cihaz/ajan durumu ve son terminal aktarımı, senkron belirsizse devamsızlık/missing/inside sayılarını belirsiz gösterme.
3. `PdksReportCenter.jsx/css`: yedi kolonluk rapor ve satır bazında açılabilen ek ayrıntı; ayrı istisna tablosu.
4. `pdks-shell.css`: okunaklı global PDKS context navigation.
5. `services/pdksPresentation.js`: tarih dahil aktif/pasif personel sınıflaması ve senkron sağlık hesaplama.
6. `services/pdksPresentation.test.js`: filtre/selection/senkron guard regresyon testleri.
7. GitHub kaynak kodundan izole olarak 9 JS mantık örneği çalıştırıldı: 9/9 PASS. Frontend production build, görsel GUI testi ve gerçek senkron kabulü henüz bekliyor.

## Sıradaki işleri bu sırayla bitir
1. `npm ci && npm test && npm run build && npm run lint` — feature branch checkout üzerinde. PDKS kaynakları için ESLint/JSX derleme kontrolü. GitHub Actions kullanımına gereksiz ücret çıkarmamak için mevcut Drive/KY-CONTROL ajanı tercih edilir.
2. Modern PDKS web Personel, Giriş/Çıkış, Puantaj, Rapor ekranlarının gerçek cihaz/desktop verisiyle ekran görüntülü 1366/1920/mobil testleri.
3. Desktop `HKN.Personel.Native` menü ve Personel/Puantaj/MonthlyAttendanceAdminForm form geçişleri: tek geçiş motoru, sanallaştırılmış liste, asenkron okumalar, performans ölçümü; E/DB/TNF davranışını değiştirmeden.
4. Web `PdksPageV2` legacy tabloları, Terminal Merkez, Vardiya/Kural/Tatil, Dönem kapama, Rapor yazdırma/PDF tasarımlarını modern ortak UI'a taşı.
5. Desktop veri güvenliği: ImportDetailed partial-failure, idempotent terminal transfer, ERR, DB/TNF farkları, E sadece DB, audit ve rollback. Üretim verisini testte değiştirme.
6. Web/Desktop ortak API contract: kanonik personel-kart ID map, senkron versions, offline outbox, terminal kimlik/MAC, kilit ve admin yetki kapıları. Masaüstü kabulünden sonra bulut PDKS tam UI fonksiyonlarını bağla.
7. Genel/kişisel bordro A4/A3 + Excel/PDF + imza, baskı doğruluğu ve admin şablonları. Bordro kaynak rakamlarının eşitliği.
8. KY ERP Mobile: mevcut React mobil router'a PDKS yönetici ve personel rotaları; sunucuda personel self-only yetki. Capacitor Android/iOS paketleri yalnız yetki ve senkron kapıları tamamlanınca.
9. Görsel test, FDB/TNF test yedeği, cihaz tekrar aktarım, offline/online, iki uçlu yazma, kullanıcı kabulünden sonra güvenli production merge/Cloudflare Git Integration ve read-only canlı smoke.

## Kesin kabul kapıları
- Build 0 hata; eslint/testler temiz; dar/geniş ekran taşma yok.
- Aktif/Pasif/Tümü görünüm ve seçilen personel doğru; hızlı geçişler donmuyor.
- Fiziksel veri yokken uydurma kart/puantaj gösterilmiyor.
- Desktop -> Web -> Mobil sayılar senkron ID ve son güncelleme metasıyla eş.
- E yalnız DB'de; yıllık TNF normal kanıtın aynası. E için ayrı audit. Ham terminal arşivi korunur.
- Yetkisiz kullanıcı başka kişinin maaş veya ayrıntılı PDKS kaydını göremez.
- Live D1 migration/reset, gerçek iş kayıtları, bordro ve terminal log silme bu UI dalının kapsamı dışıdır.
- Güncel production HEAD her merge'den önce yeniden alınır; diğer KY ERP modülleri bozulmaz.


## 08.10.2026 — Google Drive KY-CONTROL ajanıyla test kanıtı

- GitHub Actions çağrısı: **0**. İşlemler DESEN üzerindeki KY-CONTROL v2 runner ile yapıldı.
- Test çalışma alanı: `D:\KYERP\_TEMP\PDKS_UI_REVIEW_20261008_01`; üretim repo/servis, Firebird/TNF veya Cloudflare yayın yolu değiştirilmedi.
- Çekilen commit: `2f8b4b568f76d6e355dc5ab79480a5c341a3a613`.
- `npm ci --no-audit --no-fund`: başarılı; 206 paket.
- `npm test`: **291 test / 276 geçti / 15 başarısız**. 4 yeni PDKS filtre/seçim/senkron testi geçti. Mevcut genel ERP test başarısızlıkları Günlük Operasyon/İK izin/güvenlik/e-Belge sözleşmelerinde görülüyor; bunlar çözülmeden bütün repo için yeşil test durumu iddia edilmeyecek.
- `npm run lint`: logda ESLint hatası veya uyarısı görülmedi (ayrı çıkış durumunu ajan sonuç kaydıyla son teyit et).
- `npm run build`: Vite 8.1.5, 2005 modül, dağıtım dosyaları üretildi; logda başarı `built in 1.52s`. AuthContext dynamic import için nonfatal bundle warning mevcut.
- İzole Node test komutu `npm exec -- node ...` npm'in `node@26.11.1` indirme/onay istemesine takıldı; test tasarımında `node --test ...` doğrudan kullanılacak. Bütün mevcut test paketinde PDKS testlerinin geçmesi bunu telafi eden ayrı kanıttır.
- Tam UI ekran fotoğrafları, e2e, desktop exe revizyonu, web/Cloud ortak veri garantisi, Android/iOS paketleri **henüz yapılmadı**. Kullanıcıya nihai dağıtım olarak sunma.
- Önemli bütçe: Remote Desktop sınıra yakın olduğundan yeni test sonuçlarını Google Drive connector ile al; yalnız ajanı tetiklemek için Remote kullanmak gerekiyorsa minimuma indir.

### Üretim kapısı
Tek başına frontend build başarılı olmak production merge için yeterli değildir. 15 genel KY ERP sözleşme hatası ayrıştırılmalı; baseline ile karşılaştırılıp PDKS kaynaklı regresyon olmadığı gösterilmeli. Üretim D1/DB/TNF erişimi/senkron değişikliği için daha sıkı kabul uygulanmalı.


## 08.10.2026 — Masaüstü tamamlanan kaynak düzeltmeleri ve SON TEST

**Ayrı kanonik desktop dalı:** `feature/pdks-desktop-navigation-fix-20261008` (kaynak `pdks-desktop`; web dalına desktop projesi kopyalanmadı).

Son test HEAD: `80690d7ae4abe124bbc8be5b3ae22a837c25d8f0`.

- `PersonelForm.ModernV2.cs`: Personel arama handler'ı tek sahibi olan ScopeFilterFix üzerinden çalışır; yinelenen olay kaldırıldı.
- `PersonelForm.ScopeFilterFix.cs`: Aktif/Pasif/Tümü sırasında yerinde DataView filtreleme, yeniden giriş koruması, gecikmiş kişi seçimi sıfırlama, görünmez hücreye CurrentCell atamama.
- `PersonelForm.Classic.cs`: Kart No / Ad Soyad / Grup dışında liste sütunları tek seferlik düzenlenir; sütunlar her DataBindingComplete'de yeniden gizlenmez.
- `AttendancePlanDialog.cs`: tarih/dönem değişikliğinde 220ms debounce ile tekrarlı Firebird okuma azaltıldı. Önizle tıklamasında seçili son dönemin uygun personeli senkron tekrar kontrol edilir. Plan donmuş olur; Uygula yeni random plan üretmez.
- `MonthlyAttendanceAdminForm.cs`: E kayıtlarının TNF'de kalma durumu sahte "✓ E TNF boş" olarak sunulmaz. Giriş/çıkış normal olsa bile yalnız TNF farkı "Sorunlular", "Sorunluları Seç" ve renk vurgusunda yer alır. Her şey read-only raporlama UI kontrolüdür; veri hiçbir testte değiştirilmedi.

**DESEN üzerindeki KY-CONTROL v2 ajanıyla izole çalışma alanında nihai kanıt:**
- `dotnet build KYERP.PDKS.sln -c Release -warnaserror`: BUILD_EXIT=0 / 0 Hata.
- `dotnet run --project tools/ContractTests/ContractTests.csproj -c Release --no-build`: CONTRACT_EXIT=0, `KYERP PDKS CONTRACT TESTS OK`. Terminal duplicate guard, TNF import/export, attendance, payroll ve 2026 official payroll dahil bütün contract testleri PASS.
- `dotnet run --project tools/ShellSmokeTest/ShellSmokeTest.csproj -c Release --no-build`: SHELL_EXIT=0, `KYERP PDKS 6.7.0 SHELL SMOKE OK`.
- Agent OUTBOX günlükleri: `PDKS_DESKTOP_FINAL_GATE_20261008.log` ve önceki `PDKS_DESKTOP_LAST_VERIFY_20261008.log`.
- Web son `npm run lint`, 9/9 dedicated test, `npm run build`: PASS. Drive: `PDKS_VERIFIED_WEB_LINT.log`, `PDKS_VERIFIED_WEB_PDKS_TEST.log`, `PDKS_VERIFIED_WEB_BUILD.log`.
- Genel web tam testte 296 içinde 15 PDKS dışı sözleşme başarısızlığı devam ediyor (önceki baseline ile aynı sayı). Bu dal üzerinde bütün KY ERP temiz kabulü iddia edilmez.

**Açık kabul kapıları:** Yaşayan Firebird/TNF verileriyle hiç yazmadan ekran/işlem ve gerçek cihaz E kanıtı doğrulaması, WinForms GUI üzerinden Active/Pasif hızlı geçiş ve aylık admin, .NET release publish + SDK paket doğrulama, web ERP production HEAD yeniden uzlaşması, rol yetki/kişisel bordro/PDF imza ve mobil Android/iOS gerçek cihaz testleri, desktop↔D1 tutarlılığı. Bu gerçekleşmeden "tamam" veya canlı deployment denmez. Remote/Desktop Commander sadece zorunlu işlemde; GitHub Actions bu etapta kullanılarak test yapılmadı.


## 08.10.2026 — İzole bütünlük düzeltmeleri / kanıt ve açık kapılar

### Güvenli geliştirme dalları
- Masaüstü: `fix/pdks-desktop-integrity-20261008` (ayrı masaüstü feature dalından türetildi).
- Web/API: `fix/pdks-web-integrity-20261008` (modern web feature dalından türetildi).
- `main`, `pdks-desktop`, açık/kapalı PR ve production deployment değiştirilmedi; GitHub Actions çalıştırılmadı.
- DESEN izole test dizini: `D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02`. Canlı FDB, yıllık TNF, cihaz kayıtları, bordro veya canlı EXE test amaçlı değiştirilmedi.

### Kod düzeltmeleri
- `AttendanceImportService.ImportDetailed(..., requireCompleteBatch:true)` en az bir Skipped sonucunda tüm Firebird batch'ini tek transaction içinde reddeder. Yüzeydeki terminal servisi ayrıntılı skipped/ERR kanıtı sunar.
- Otomatik terminal aktarımı artık eski `DeleteAfterValidatedTransfer` ayarı olsa bile cihaz loglarını kendiliğinden temizlemez.
- Web kart import köprüsünde tenant/PDKS yazma izni denetimi, fail-closed dönem kontrolü, gerçek D1 `meta.changes` ile kabul adedi, tarih doğrulaması ve birden çok personele bağlı kartların reddi eklendi.
- Web kişide elle girişte varsayılan uydurma 08:30/19:00 kaldırıldı; kullanıcıya yalnızca web/D1 onayı verilir, Firebird/TNF eşitlendi denmez.
- Geçmiş dönem personeli gösterimi, SGK/kart ayrımı düzeltildi.
- Masaüstü normal plan artık saat uydurmaz veya fiziksel zamanı doğal toleransa çekmez; eksik kanıt durumunda uygulama kilitlenir. Fiziksel zamanın değişmediği ayrıca `RequireRealSourceMinutes` kontrolüyle korunur.
- `PdksCloudInbox` desteklenmeyen/eşleşmeyen WEB değişikliğini sessizce uygulanmış kabul etmez. Kaynak/personel uyuşmazlığında cursor ilerlemez.
- Eski `AttendanceBulkCorrectionService` çağrıları hâlâ kaynakta mevcuttur; ayrı write yollarının tek admin servisine indirilmesi tamamlanmamıştır.

### Gerçek test sonuçları
- Desktop son kaynak (evidence gate düzeltmeleri dahil, `6b0799c0`): Release build **0**, ContractTests **0**, ShellSmokeTest **0**. Kaynak: izole DESEN `desktop-verified-gate.txt`.
- Web (kart tekrar kullanımı ve tarih ek kontrolü öncesi): PDKS dedicated node tests **0**, ESLint **0**, Vite build **0**.
- Web tam testte 15 farklı başarısız test adı baseline web feature dalında da aynı; **0 yeni başarısız test adı**. Genelde Günlük Operasyon, İK/izin, belge ve güvenlik işlevlerinde; repo genel testi henüz yeşil değildir.
- Cloud (en son kart çakışması/tarih ek kontrolü öncesi): TypeScript `tsc --noEmit` **0**, `node --experimental-strip-types --test src/*.test.ts` **0**.
- Kart/tarih son ek commitlerinin toplu test çalıştırma çağrısı güvenlik kontrolü nedeniyle bloklandı; **bu son ekleme için test PASSED iddia edilmez**.
- Gerçek Firebird transaction hata enjeksiyonu, fiziki cihaz, SDK, yayın EXE/GUI, uçtan uca Firebird↔D1 mutabakat, gerçek APK/iOS ve production kabulü **AÇIK**.

### Sonraki korumalı kapılar
1. Son web/API commitleri üzerinde yalnız izole `node --test`, `npm run lint/build`, `tsc --noEmit` ve Cloud unit testlerini tekrar çalıştır.
2. `AttendanceBulkCorrectionService` ve `LiveAttendanceForm.Actions.cs` gibi paralel/dormant yazma yollarını tek önizleme-onay servisinde birleştir; fiziksel saat uydurma veya iş kanıtı üretme yok.
3. Test FDB ve test yıllık TNF üzerinde kısmi aktarım/çökme/idempotency/rollback gerçek entegrasyon testlerini yap.
4. Terminal MAC+SDK gerçek okuma; desktop 1366/1920 GUI, ay/yıl ve dönem; Cloud personel ID/source/cursor/outbox/ACK; rol+bordro testlerini tamamla.
5. Web ve native mobil kabul, gerçek production HEAD uzlaştırması ve açık yayın onayı olmadan deploy/DB migrate/terminal silme yapma.
