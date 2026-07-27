# Changelog

## 2026-07-05 - IK tam kapsamli son onay uygulama katmani

- Tam kapsamli IK talimatina gore advanced aylik IK merkezi genisletildi; mevcut eski IK ekranlari ve URL aliaslari korunarak yeni sade menu akisi eklendi.
- Sol menu aylik bolumde yeni ana basliklara cekildi: IK Ozet, Personel Karti & Sozlesme, Puantaj & Izin, Mesai/Avans/Kesinti, Bordro & Odeme, SGK/Evrak/Ay Sonu Kontrol.
- Backend advanced IK servisine merkezi audit log havuzu eklendi:
  - `ik_audit_logs`
  - `GET /ik/advanced/audit-logs`
- Bordro hesaplama backend tarafina tasindi; puantaj, mesai, avans, kesinti, SGK beklenen gun, banka/elden ve manuel override birlikte hesaplanir.
- Manuel bordro duzeltmesi icin zorunlu sebep, eski/yeni JSON ve kullanici logu eklendi:
  - `ik_payroll_overrides`
  - `GET /ik/advanced/payroll`
  - `POST /ik/advanced/payroll/override`
  - `POST /ik/advanced/payroll/save`
- Mesai/avans/kesinti icin advanced finans hareketi ucu eklendi; hafta sonu mesai ayni gune `W` hafta sonu geldi puantaj istisnasi da yazar.
  - `POST /ik/advanced/finance-movement`
- Evrak yukleme advanced ekrana baglandi; dosya `DATA/uploads/ik-documents` altina yazilir, `hr_employee_documents` ve audit log kaydi olusur.
  - `POST /ik/advanced/documents/upload`
- Ayrilis/kidem ve kullanilmamis izin taslagi eklendi:
  - `ik_settlement_drafts`
  - `POST /ik/advanced/settlement-draft`
- Puantaj cozumleme sirasi duzeltildi: hafta sonu/resmi tatil otomatik `-` kalir, ancak kullanici istisnasi varsa `W/G/Y/...` kaydi otomatik tatili ezer.
- Frontend advanced IK ekranina personel cekmecesi icinde islem loglari, mesai/avans penceresi, kidem taslagi, bordro manuel duzeltme penceresi ve evrak yukleme baglandi.
- Prisma validate, backend build ve frontend build basarili calisti.
- Migration reseti, veri silme, mock/demo veri veya OneDrive yedek dosyasi uretme yapilmadi.

## 2026-07-04 - IK hizli istisna ve personel cekmecesi

- `Yillik Izin` menusu `Hizli Izin & Puantaj` olarak duzenlendi; ana ekran varsayilan olarak sadece islem gereken personel listesini gosterir.
- Personel bazli sag cekmece eklendi: ay takvimi, hizli durum secimi, saat duzeltmesi, belge/aciklama, tarih araligi ve normale dondurme ayni yerde calisir.
- Kontrol matrisi kapali `details` paneline alindi; ihtiyac olunca acilir, ana ekranin yukunu tasimaz.
- Backend tarafinda merkezi `resolveMonthlyDay(personelId, tarih)` mantigi eklendi:
  - donem kilidi kontrol edilir,
  - ise giris/cikis araligi uygulanir,
  - resmi tatil ve hafta sonu otomatik `-` cozulur,
  - gunluk istisna varsa o okunur,
  - aksi halde hafta ici otomatik `G` kabul edilir.
- Normal hafta ici `G` gunler veri tabanina yazilmaz; sadece izin/rapor/mazeret/ucretsiz/izinsiz/kart/saat istisnalari saklanir.
- Yeni advanced IK endpointleri eklendi:
  - `GET /ik/advanced/quick-list`
  - `GET /ik/advanced/person-calendar/:employeeId`
  - `POST /ik/advanced/exception`
  - `POST /ik/advanced/exception/delete`
  - `POST /ik/advanced/bulk-preview`
  - `POST /ik/advanced/bulk-confirm`
  - `GET /ik/advanced/exception-history`
  - `GET /ik/advanced/control-matrix`
- SGK/puantaj fark kontrolu de ayni cozumlenmis gun sonucunu kullanacak sekilde guncellendi.
- Migration reseti, veri silme veya OneDrive yedek dosyasi uretme islemi yapilmadi.

## 2026-07-04 - IK aylik advanced modul entegrasyonu

- Zip paketindeki IK aylik advanced ekranlari mevcut IK yapisi bozulmadan eklendi.
- Eski IK aylik ekranlari korunarak menuye uc yeni sekme baglandi:
  - Puantaj & Kart Takibi
  - SGK Bordro Aktarim
  - Aylik IK Kapanis
- Backend tarafinda `IkAdvancedController` ve `IkAdvancedService` IK modulune eklendi.
- Yeni endpointler eklendi:
  - `GET /ik/advanced/month`
  - `POST /ik/advanced/person-card/:employeeId`
  - `POST /ik/advanced/attendance`
  - `POST /ik/advanced/sgk/import`
  - `POST /ik/advanced/card/import`
  - `POST /ik/advanced/close-check`
  - Ayni endpointler `/api/ik/advanced/...` prefixi ile de aciktir.
- SQLite uzerinde guvenli `CREATE TABLE IF NOT EXISTS` yaklasimi ile yeni tablolar hazirlandi:
  - `ik_person_card_settings`
  - `ik_monthly_attendance`
  - `ik_sgk_imports`
  - `ik_sgk_rows`
  - `ik_monthly_close`
- SGK/Excel importlarinda sayisal alanlar icin `TL`, para simgesi ve bosluk gibi ek metinleri tolere eden parse duzeltmesi yapildi.

## 2026-07-04 - IK aylik ekranlari tamamlama

- `IkAdvancedMonthly` ekrani HTML referansina gore yeniden toparlandi; bos kart gorunumu kaldirildi.
- Puantaj ekranina yatay kaydirilabilir aylik matris, kart ayarlari, TNF on analiz havuzu ve secili gun hizli duzenleme paneli eklendi.
- Hucre tiklama ile durum dongusu eklendi; API kaydi sadece `Secili Gunu Kaydet` ile yapilir.
- SGK ekranina Excel on analiz havuzu, onayla ve aktar akisi, SGK/puantaj fark tablosu ve bordro/odeme karsilastirmasi eklendi.
- Aylik kapanis ekranina 12 maddelik kontrol listesi, evrak/belge paneli, maas/mesai/avans ozeti ve aylik Excel yedegi icerik paneli eklendi.
- Backend advanced servisinde aylik veri paketi izin, evrak, mesai/avans/kesinti, bordro, maas sozlesme ve kapanis loglari ile genisletildi.
- Yeni preview/confirm endpointleri eklendi:
  - `POST /ik/advanced/sgk/preview`
  - `POST /ik/advanced/sgk/confirm`
  - `POST /ik/advanced/card/preview`
  - `POST /ik/advanced/card/confirm`
- SQLite uzerinde veri silmeden ek kolonlar hazirlandi:
  - `ik_person_card_settings`: `personel_kodu`, `exit_date`, `active_passive`, `work_type`, `sgk_follow`, `payment_type`, `note`
  - `ik_monthly_attendance`: `early_exit`, `late_entry`, `document_id`
  - `ik_sgk_imports`: `version_no`, `status`
  - `ik_sgk_rows`: SGK kazanc, prim, vergi, isveren maliyeti ve fark sebebi kolonlari
- Yeni tablo eklendi:
  - `ik_monthly_close_logs`
- Prisma schema icine advanced IK tablo modelleri eklendi ve `npx prisma validate` ile dogrulandi.
- Build dogrulamasi:
  - Backend `npm run build`: basarili
  - Frontend `npm run build`: basarili
  - Prisma `npx prisma validate`: basarili

## 2026-07-04 - IK final referans duzenlemesi

- Final HTML referansina gore puantaj matrisi sticky ilk kolonlarla yeniden duzenlendi: personel, kart no, SGK, puantaj ve fark sabit kalir.
- Puantaj ust islem alani yil, ay, arama, gosterim filtresi, TNF aktar, toplu uygula, kaydet ve kontrol calistir sirasina alindi.
- `Yillik Izin` ekrani da ayni gunluk puantaj kaynagini kullanan matris ve sag sticky hizli duzenleme paneline baglandi.
- Gun durumlari final koda esitlendi: `G`, `Y`, `M`, `R`, `U`, `I`, `-`.
- SGK Excel yokken bordro karsilastirma satirlari artik `Hazir` gostermiyor; odeme onayi kapali ve acik uyariyla gosteriliyor.
- `/ik/sgk-bordro-aktirim` route alias'i eklendi.
- Backend puantaj kaydi kilitli donemde engellendi.
- TNF/kart aktariminda on kontrol havuzu icin kalici ust kayit ve satir tablolari eklendi:
  - `ik_card_imports`
  - `ik_card_import_rows`
- `ik_monthly_attendance` icin `created_by` ve `updated_by` alanlari eklendi.
- Prisma/PostgreSQL gecisi, migration reseti veya veri silme islemi yapilmadi.
- OneDrive icinde yedek dosya uretilmedi; kullanici istegine uygun olarak `.ik-yedek` paket adimi calistirilmadi.
- Build dogrulamasi:
  - Backend `npm run build`: basarili
  - Frontend `npm run build`: basarili
