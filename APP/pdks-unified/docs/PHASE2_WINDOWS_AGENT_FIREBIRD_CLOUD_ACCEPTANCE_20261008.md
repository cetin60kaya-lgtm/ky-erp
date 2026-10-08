# KY PDKS Unified — Windows Agent / Firebird / TNF / Cloud FAZ-2

**Tarih:** 08.10.2026  
**PR:** https://github.com/cetin60kaya-lgtm/ky-erp/pull/404  
**Durum:** Geliştirme / DRAFT / merge ve prod deployment YOK.

## Sınanan gerçek kaynak ve yazmasız karşılaştırma

- Firebird gerçek şeması **salt okunur** tarandı: 16 ilgili tablo / 8 trigger.
- Kaynak `KIMLIK`: `PKNO,GRUP,SERVIS`. `GIRCIK`: `GTUR/CTUR` fiziksel veya onaylı E kaydının ayrı tarafları.
- `GRUP` vardiya saati tek sütun değil: `BASSAAT1..5`, `BITSAAT1..5`, `VAD1..5`; doğrulanmamış otomatik eşleme yok.
- `SERVIS` eşlemesi `KOD/AD`, `KIMLIK.SERVIS` sayısal.
- `AVTUR` kaynak tanımları: **1=AVANS(-), 2=BANKA(-), 3=İLAÇ KESİNTİSİ(-)**. Genel bir Cloud kesintisini 2 veya 3 numaraya otomatik eşitlemek YASAK. Bu nedenle genel kesinti yerel uygulaması kapalı.
- `OZELIZIN` içinde `SIRA,PKNO,TARIH,TIP,SURESAAT,SUREDAKIKA` mevcut; D1 aralık/iş günü sayımı tam karşılaştırılmadan üretim yazması kapalı.
- `TATIL` tablo tanımı tarihsel tatil türüdür. `PLANA/PLANG` plan günü içerir; veri ilişkisi netleşmeden Cloud resmî tatili Firebird `TATIL` tablosuna yazılmaz.
- E tarafında (`GTUR=E/CTUR=E`) yıllık normal `TRYYYY.Tnf` kaydı aranmıyor. Fiziksel kayıt saatleri uydurulmaz.

## Güvenli Cloud protokolü

- `0060_pdks_unified_command_ledger.sql` artık tenant bazlı `ik_pdks_devices` cihaz kimlik kasası şemasını, `CLAIMED` lease ve ACK kanıt kolonlarını içeriyor.
- Windows Agent sadece cihaz ID + yüksek entropili gizli anahtarla yetkilendirilir; Cloud HMAC-SHA256 imzalı komut zarfı üretir.
- Yerel ajan imzada cihaz, tenant, commandId, outboxId, deliveryHash ve lease süresini doğrular. Aksi halde journal veya ACK üretmez.
- Cloud `ACKED` ancak güncel lease sahibi+hash, `journalId`, `commandPayloadSha256`, `evidenceSha256`, FDB kanıtı ve gerekli TNF kanıtı varsa kabul edilir.
- Tekil `requestId` ve outbox durable; aynı komutu ikinci kez uygulatmamak için SHA-256 komut kimliğine bağlı değişmez journal ve uygulanmış fiş kayıtları eklendi.
- Windows `--agent-loop` başlatıldığında en az 5 dakika aralıklı kontroller, tek örnek dosya kilidi ve `SISTEM/AgentState/unified-agent-health.json` durum kaydı vardır; **production otomatik başlatma kapalı**.
- Ayrı `Install-UnifiedAgentTask.ps1` varsayılan `Validate`; ancak EXE SHA ve kullanıcı düzeyindeki izinli credential doğrulanınca açık `Install` seçeneğiyle Windows oturum açılışına kurulabilir.

## İşlemlerin gerçekleşme sınıfları

**Kod olarak yerel mirroring uygulanmış, varsayılan olarak kapalı:** 
- `personnel-group`: imzalı komutu değişmez yerel grup politika dosyasına yazar.
- `holiday`: aynı gün için ikinci çelişen tanımı reddeden tarihli yerel tatil politika kaydı yazar.

Her ikisi de yalnız `KY_PDKS_UNIFIED_APPLY_ENABLED=1` ile açık rıza sonrası etkinleşebilir; yerel imzalı kaydı `SISTEM/UnifiedPolicies` altında tutar, fişi journal'a kaydedip Cloud ACK gönderir. **Bu kayıtlar tek başına canlı bordro/vardiya hesabını güncellemez.** Gerçek staging tenant üzerinden uçtan uca test edilmeden prod konfigürasyonunda bayrak açılmayacak.

**Yerel Firebird yazması hâlâ kilitli olan 9 işlem:** `work-group`, `service`, `assign-work-group`, `assign-personnel-group`, `assign-service`, `leave`, `advance`, `overtime`, `deduction`. Bazılarının kopya-FDB transaction sözleşmesi test edilse de ACK/anti-duplicate/FDB schema uyarlaması tümü için tamamlanmış sayılmaz.

**TNF:** `AtomicTnfFileStore` yedek, format doğrulama, aynı yıllık dosyaya sıra, dosya kilidi, önceki SHA256 şartı, yazma öncesi ikinci hash kontrolü ve kaza kurtarma denetimini içerir. Normal/E üretim yazma hattına henüz bağlanmadı.

## Doğrulanan test kanıtı

**DESEN KY-CONTROL izole worktree** (GitHub Actions / Remote Desktop harcanmadı):

- V9 HEAD: `820472587eac5e31dcc8fa62b2353fb5a67a66fd`.
- Cloud sözleşme+storage: **13/13**.
- Cloud kaynak rota/güvenlik: **13/13**.
- Gerçek Hono endpointi + SQLite ile D1 taklidi: **3/3** (device auth, imza, hatalı ACK, lease expiry, çift GET yarış, RETRY).
- Fiziksel kaynak/punch/TNF saf kurallar: **27/27**.
- Toplam **56/56 otomatik test**.
- Cloud `tsc --noEmit`: PASS.
- Windows Release: PASS, **0 uyarı, 0 hata**.
- `--agent-plan-selftest`, `--agent-journal-selftest`, `--agent-policy-selftest`, `--agent-loop-selftest`, `--tnf-store-selftest`: PASS.
- Firebird `gbak` ile **gerçekten ayrı** `D:\KYERP\_TEMP\PDKS_COPY_STAGE_20261008_213329\KY_PDKS_STAGE.FDB` kopyası oluşturuldu.
- Kopya-FDB `GRUP`, `SERVIS`, `KIMLIK` ataması, `OZELIZIN`, `AVANS TURKOD=1` insert/update işlem planları transaction içinde test edildi; **ROLLBACK VERIFIED**, stage test sonrası sayı ve kalıntı sıfır.
- Rapor: `D:\GoogleDrive\Hakan Emp\OTOMASYON\KY-CONTROL\OUTBOX\PDKS_UNIFIED_SYNC_VERIFY_V9_20261008.log`. `RESULT=PASS`; `LIVE_DATA_WRITE=NONE`.

## Production release durdurma maddeleri

1. Cloudflare **gerçek staging D1** üzerinde 0060 snapshot/migration + authenticated POST/readback + race/idempotency/rollback/tenant testleri henüz yok. Prod D1 migration **yapılmadı**.
2. Canlı Firebird yazmaları/düzeltmeleri, normal/E-GIRCIK, yıllık TNF atomic commit ve zorlu crash/rollback planı tamamlanmalı.
3. Eski legacy write endpointleri birleştirilip çift yazma engellenmeli.
4. PS-2000 cihaz SDK/terminal RAW, E/Puantaj/SGK/bordro ve 49 sekme saha kabulü eksik.
5. Android imzalı APK ve iOS cihaz signing/release testleri eksik.
6. Uçtan uca gerçek Cloud↔Windows bağlantısı, canlı olmadan staging izleme onayı ve kullanıcı ekran kabulü yok.

**Sabit karar:** PR #404 açık ve DRAFT tutulur, prod deploy/merge yok. Canlı FDB/TNF/RAW test amaçlı değişmeyecek. Remote kota korunacak; uzun testler KY-CONTROL üzerinden yürütülecek.
