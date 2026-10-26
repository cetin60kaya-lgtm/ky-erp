# KY ERP / PC PDKS — ChatGPT DESEN Erişimi ve Yeni Sohbet Kuralı

**Kayıt:** 15.10.2026 · Kullanıcının kalıcı tercihi: DESEN üzerinde KY Control Hub ile kurulan gerçek ChatGPT erişimini yeni sohbetlerde sıfırdan kurmaya çalışma; mevcut bağlantı ve test kanıtlarını kontrol ederek işe devam et.

## Nereden başlanır?

- **Güncel özel çalışma talimatı:** GitHub üzerinden `cetin60kaya-lgtm/kyerp` özel deposunun `main` dalındaki `CONTROL/KY_CHAT_BRIDGE_AGENT_RULES.md` dosyasını oku. Bu dosyanın erişimi, o ChatGPT sohbetinde GitHub bağlayıcısının bu özel depoya yetkisi olmasına bağlıdır.
- Bu kamuya açık depoya **GitHub PAT, oturum anahtarı, DPAPI içeriği, gerçek ekran görüntüsü, kişisel çalışan kaydı, terminal RAW/FDB/TNF veya özel issue yorum içeriği** yazma.
- **Eski Remote Desktop Commander'ın kotasına bağımlı değilsin.** Doğrulanmış alternatif, yerel KY Hub Chat Bridge'in özel GitHub kaydıyla iletişimidir. Yine de sistemleri karıştırma: başka sohbette gerçek erişimi önce doğrula.
- Yerel KY Control Hub `127.0.0.1:8840`; MeshCentral `127.0.0.1:8443`; hedef PC `DESEN`. Bu adresler yalnız hedef PC üzerindeki yerel loopback adresleridir, ChatGPT tarafından doğrudan erişilebilir internet bağlantıları değildir.

## Gerçek kabul kanıtı (15.10.2026)

- Sistem durum sorgusu: gerçek DESEN bilgisayarından yanıt alındı (2560x1440, 8840 ve 8443 erişilebilir).
- Fare hareketi: iki farklı ekrandaki koordinata komut iletildi ve gerçek Windows yanıtı geldi.
- Ekran görüntüsü: 1x1 hatası **yerelde** düzeltildikten sonra 840x472 JPEG alındı ve incelendi.
- KY Control Hub açma: `open_hub` komutuna gerçek olumlu yanıt alındı.
- **Henüz ayrı kabulü olmayanlar:** canlı fare tıklaması, klavye girdisi, EXE/PDKS gerçek işlem testi. Bunları tamamlanmış gibi sunma.

## Her sohbet için işlem sırası

1. Kullanıcı DESEN veya yerel Windows kontrolü istediyse, özel depodaki en son kural dosyasını oku.
2. Bu sohbette GitHub erişimi yoksa erişim varmış gibi konuşma; kullanıcıyı aynı sistemi yeniden kurmaya yönlendirme.
3. Kullanıcının açıkça istediği, güvenli ve sınırlı eylemi gönder; benzersiz komut kimliği ve kısa UTC süre sonu kullan, gerçek yanıtı kimlikle eşleştir.
4. Gereksiz ZIP, token yenileme, eski servis kaldırma, başka uzak masaüstü uygulaması veya sahte PowerShell gösterisi yapma.
5. Ekran görüntüsünde hassas bilgi olabilir: **kullanıcının rızası ve güvenli görünüm olmadan görüntü alma/yorumlara taşıma**.
6. Canlı PDKS, Firebird, terminal ve Cloud değişiklikleri ek onay gerektirir; sadece ekran paylaşımı/araç yanıtı üretim kabulü değildir.

## Proje sınırları

- `ky-erp` projesinin production canonical kod dalı hâlâ `codex/model-uretim-kontrol-merkezi-final`. Sırf bu doküman `main` üzerinde diye yeni kod dalı üretim kaynağına dönüşmez.
- `kyerp` özel depo eski KY ERP V2 deposudur ve şimdilik köprü iletişimini taşır. Köprü issue'su devredeyken depoyu silme; ayrı güvenli bir depo oluşturulup köprü göç ettirilince bu referansı güncelle.
- `Pc-Pdks` ayrı, özel PDKS ürün deposudur. Yeni sohbet önceliğinde canlı DESEN bağlantısını doğruladıktan sonra uygulamayı oradan ilerlet.

## ChatGPT global talimatı konusunda sınır

Bu dosya ve `AGENTS.md` **depo/ajan kurallarıdır**, ChatGPT'nin sistem talimatını veya tüm hesap sohbetlerinin otomatik belleğini değiştirmez. Tüm yeni sohbetlerde görünür olması için kullanıcı ayrıca ChatGPT Kişiselleştirme / Özel Talimatlar alanına kısa yönlendirme koyabilir.

## 26.10.2026 — Canlı test sonucu ve tüm sohbetler için ortak kaynak

Kullanıcı gerçek DESEN PowerShell çıktısında mevcut `KY-Control-Hub-8840`, `KY-Control-Hub-MeshCentral-8443` ve `KY-Control-Hub-ChatBridge` görevlerini `Running` ve iki yerel portu `Listen` olarak doğruladı. Ardından aynı gün özel GitHub bridge issue #2 üzerinden gönderilen yeni `status` talebine DESEN'den `ok=true`, `desktop=true`, `hub8840=true`, `mesh8443=true` yanıtı alındı; ayrı `open_hub` talebi `ok=true`, `opened=KY_CONTROL_HUB_LOCAL` döndü. **ChatGPT → GitHub → gerçek DESEN → ChatGPT roundtrip PASS (26 Ekim 2026).** Güncel teknik kanıt ve her sohbetin adım adım protokolü **özel** `cetin60kaya-lgtm/kyerp/CONTROL/KY_DESEN_TUM_SOHBETLER_CANLI_KABUL_20261026.md` dosyasındadır; erişim için bağlı GitHub'ın özel depo yetkisi gerekir.

Tüm yeni KY ERP, DESEN, HKN, RIP/DTF ve PDKS sohbetleri yerel Windows işi öncesinde önce mevcut köprüyü kontrol eder, somut kullanıcı talebi kapsamında yeni kimlikle canlı yanıt doğrular. Remote Desktop Commander varsayılan değildir; ZIP/PAT/servis yeniden kurulmaz. 26 Ekim testi ekran görüntüsü, fare tıklama, klavye, Drive ajanı canlı heartbeat, PDKS/EXE ve yeniden başlatma sonrası otomatik çalışma kabulü değildir. Repo belgeleri ChatGPT sistem talimatlarını veya mevcut tüm sohbetleri kendiliğinden değiştirmez.

