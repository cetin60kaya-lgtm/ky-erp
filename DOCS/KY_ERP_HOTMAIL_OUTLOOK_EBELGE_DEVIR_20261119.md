# KY ERP — HOTMAIL / OUTLOOK / E-BELGE / MODEL 360 — SOHBET DEVİR VE KABUL
**Tarih:** 19.11.2026  
**Canonical:** `cetin60kaya-lgtm/ky-erp` / `codex/model-uretim-kontrol-merkezi-final`  
**Geliştirme PR:** #597 — https://github.com/cetin60kaya-lgtm/ky-erp/pull/597  
**Geliştirme dalı:** `feature/hotmail-graph-delta-draft-model360-20261119`  

## Kesin kullanıcı kararları
- Tek canonical Model 360 kartı DESEN, İmalat, Boyahane, Muhasebe/e-Belge ve Mail'de ortak açılır.
- Bir HKN/ DDM birden fazla model kalemi içerebilir; bir model birden fazla belgeye bağlanabilir.
- Toplu gönderimde **her HKN için ayrı mail**; bir HKN'nin tek gönderim işi bütün doğrulanmış ilgili model kartlarında görünür.
- Google Drive/File Hub mevcut bağlantısı ve İşNet ayrı kalır. Mail için kişisel Microsoft OAuth gereklidir. Şifre/token sohbete veya GitHub'a konmaz.
- Kullanıcıdan açık gönderim komutu gelmeden gerçek mail, fatura veya mali kayıt oluşturulmaz.

## PR #597 kod kapsamı
1. `mail-microsoft-delta-core.ts`: Graph `@odata.nextLink` ile kesintisiz devam, yalnız `@odata.deltaLink` ile tamamlanma; aynı hesap/klasör URL doğrulaması ve testleri.
2. `mail-microsoft-graph.ts`: her klasörün ara devam adresi `mail_sync_cursors` içinde saklanır, tamamlanmamış sayfa `last_success_at` olarak yeni tam kabul yazılmaz; hata hâlinde son tam sayfa tekrar oynatılır. Ek metadata alımı başarısızsa mevcut ek kanıtı silinmez.
3. Mevcut 5 dakikalık `main-entry-security.ts` cron'unda düşük kotalı otomatik tarama: yalnız zaten `ACTIVE + APPROVED + provider_connected=1` hesap, tek hesap/iki klasör/birer sayfa. Yeni OAuth istemez, mail göndermez.
4. `POST /api/mail/drafts/:id/provider-draft/microsoft`: KY ERP taslağını gerçek Outlook Taslaklar klasörüne de kaydeder; aynı draft ID ve File Hub eklerini yeniden kullanır. Gönderim onayı yine ayrı gerekir.
5. `invoice-mail-model-evidence.ts` + `accounting-invoice-mail-routes.ts`: kabul edilen bir HKN/DDM e-postasını, iki PDF'le **kesin File Hub ilişkisi** bulunan bütün canonical modellere bağlar; tek gönderim kaydı değişmez.
6. `GET /api/muhasebe/invoice-mail-outlook-history`: yalnız Outlook Gönderilenler'den gelmiş, iki PDF eki ve model bağlantısı doğrulanmış manuel mail kanıtını salt okunur sunar. Başlık benzerliğinden otomatik kesin eşleşme yoktur.
7. AdminMailConnectionsV2 + Model360Modal + InvoiceMailWorkspace: onay/OAuth/senkronizasyon ayrımı, gerçek Outlook taslağı ve eski Gönderilenler kanıtı görüntüsü.

## Gerçek test ve yayın sınırları
- PR #597'nin ilk commit'inde Worker build, eksik export nedeniyle başarısız oldu ve **düzeltildi**.
- Düzeltme commit'i `9e81639b25e2726c24f3ae85333d03646679488c`: Frontend lint/test/build **PASS**, Worker typecheck/test/build **PASS** (GitHub Actions #44469401143).
- Bu kayıt tek başına canlı Hotmail OAuth kabulü veya gerçek Inbox/Sent arşivi PASS değildir.
- PR merge ve Cloudflare Pages/Worker deploy, ayrıca SHA/gerçek bağlantı doğrulaması ile kayıt edilmelidir.
- Hiçbir gerçek Hotmail OAuth bağlantısı, kullanıcı maili gönderimi, veri silme, mail fiyatı otomatik işleme veya yeni Drive bağlantısı yapılmadı.

## Bir sonraki sohbet / gerçek kabul sırası
1. Yukarıdaki repo ve güvenlik/erişim ana kurallarını oku; önce PR #597'nin en son SHA, CI ve merge durumunu teyit et.
2. `Bağlantılar & Depolama → E-Posta Hesapları` üzerinden hazır Hotmail hesabının **firma onayı, OAuth bağlı, tam senkron** durumlarını canlı yetkili oturumda kontrol et. Hazır profil bulunması gerçek bağlantı değildir.
3. Kullanıcı Microsoft giriş ekranında OAuth yetkisi verir; `MICROSOFT_MAIL_CLIENT_ID` / `MICROSOFT_GRAPH_CLIENT_ID` uygulama kaydı kişisel Microsoft hesabına izin vermelidir. Secret veya token isteme/yayımlama.
4. Gelen Kutusu ve Gönderilenler ilk tam taramayı `hasMore=false` olana kadar güvenle sürdür; en az 01.09.2026 sonrasındaki HKN/DDM PDF eklerini gerçek Outlook ile örnekle.
5. Tek HKN'de üç model; bir DDM'de çoklu model; doğru File Hub bağlantıları ve üretim adetleriyle Model 360 ekranında kontrol et. Belirsiz model-kalem eşleşmesi REVIEW_REQUIRED kalır.
6. Gerçek Outlook taslak oluşturmayı (göndermeden) Outlook klasöründe görerek kabul et. Gönderim alıcı/PDF ön kontrolü ve **ayrı kullanıcı onayı** olmadan gerçek maili gönderme.
7. Açık P2: XML model kodlarının kullanıcı onayıyla canonical satır linkine yazılması, HKN'nin birden fazla DDM'yi kapsadığı senaryolar, eski Outlook arşivinin tümünün kapsanması ve mail fiyat tekliflerinin yalnız taslak/inceleme olarak model kartında önerilmesi. Kesin fiyat/finans kaydı otomatik yazılmaz.
8. DESEN/Windows gerekirse KY Control Hub Chat Bridge; yeni ZIP/token/Remote Desktop kurulumu isteme. Gerçek Windows yanıtı olmadan PASS deme.

**Not:** Bu belge yeni sohbet için değişmez devirdir; PR ve gerçek CI/yayın kanıtının yerine geçmez.
