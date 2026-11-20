# KY ERP Masaüstü 1.5.1 — Tek Kurulum / Yerel Entegrasyon Merkezi

Tarih: 20.11.2026. Ürün: mevcut `APP/desktop/ky-pdks` WPF/WebView2 KY ERP Masaüstü. **Yeni ikinci ERP ürünü, veritabanı veya ayrı yükleyici yoktur.**

## Kapsam / kullanıcı kararı

- Bir kez KY ERP Masaüstü kurulur; İşNet/NetteFatura, File Hub Agent, muhasebe arşivi, PSD önizleme, yerel dosya okuma ve klasör yedekleme aynı tek Setup içinde paketlenir.
- Windows makinedeki klasöre **yalnız o Windows kullanıcısının açık onayıyla** izin verilir. İzin amacı ayrı tutulur: muhasebe, belge, desen, salt-okunur kod/proje, File Hub indeks, File Hub arşiv yazma, yedek kaynak, yedek hedef.
- Normal web/telefon/diğer PC kullanımında aynı `kyerp.net` ve mevcut D1/Belge Havuzu korunur. Yerel erişim yalnız adaptörün kurulu olduğu bilgisayardadır; o PC kapalıyken yeni İşNet portal belgeleri çekilemez. Önceden arşivlenenler kalır.
- Kod/metin/XML/CSV/SQL/JSON arama ve 256 KB salt-okunur önizleme yereldir; dosya/şifre sohbet veya GitHub'a gönderilmez, kod çalıştırılmaz.
- Firma klasör yedeği ayrı tarihli, mevcut dosyaları değiştirmeyen snapshot; SHA-256 manifesti içerir, eski dosya silmez. **Bu Cloudflare D1 tam veritabanı yedeği değildir.** D1 ana veri otoritesi korunur. D1 yedekleme/geri yükleme ayrı yetki ve backup/restore kabulü ister.

## Mimari

```
KY ERP Masaüstü (mevcut WPF + WebView2, Windows oturumu)
 ├─ Yerel Dosya ve Yedek Merkezi (onaylı klasörler)
 │   ├─ salt-okunur dosya/kod/metin inceleme
 │   └─ SHA256 manifestli firma klasör snapshot
 ├─ İşNet portal adaptörü (Node gömülü, 127.0.0.1:8788)
 ├─ KY File Hub Agent (mevcut kanonik API + kullanıcının onaylı File Hub klasörü)
 ├─ Muhasebe Archive Worker (ayrıca FILE_HUB_WRITE onayı)
 ├─ PSD önizleme Worker (yetkili cloud işi, geçici kaynak)
 └─ Mevcut PDKS Agent (D1 otoritesi, ikinci personel veri tabanı yok)
KY ERP Web (Pages) + API (Worker) + D1/File Hub (tek kanonik kayıt)
```

- Yeni Windows paketi gömülü Node >= 22 içerir. Kullanıcının bilgisayarına ayrıca Node kurulmaz. Derleyici resmî Node LICENSE metnini pakete alır; saklı token/config içermez.
- Kullanıcı, `KY ERP Masaüstü → Yerel Dosya ve Yedek Merkezi` ekranından klasör seçer; kaynak klasörleri `READ_ONLY`, yazma hedefleri ayrı amaçla onaylanır.
- Dosya Servisleri/Agent eşleştirmesi hâlâ mevcut KY ERP `Depolama → Dosya Servisleri / Bölüm Atamaları` API'sini kullanır. Agent anahtarı yoksa indeks/Cloud Agent otomatik başlamaz; herhangi bir gizli anahtar üretilmez, GitHub'a yazılmaz. İşNet'in Windows oturum şifresi diske kaydedilmez.
- Kullanıcı isterse masaüstünde `Windows açılışında başlat` kutusunu işaretler. Yükleyici otomatik başlangıç izni veya sınırsız disk hakkını sessizce vermez.
- İşNet adaptörünün loopback sağlık kontrolü oturum başarısıyla karıştırılmaz; yetkili firma seçimi ve orijinal XML/PDF'nin mevcut belge havuzuna işlendiği gerçek kullanımda doğrulanmalıdır.
- Kayıtlı `EBelgeIsnetPortalSync`, `isnetLocalApi`, `isnet-local-portal-routes` mevcut kanonik ekran/API katmanıdır; tek Windows paketinin yerine ikinci İşNet platformu açılmaz.

## Gerçek test kanıtı (DESEN, 20.11.2026)

1. Node v24.20.0 ile `node --check`: `local-folder-authorization.mjs`, test dosyası, `file-hub-agent.mjs`, `accounting-archive-worker.mjs`, `server.mjs` **PASS**.
2. `node --test local-folder-authorization.test.mjs` **5/5 PASS** (firma izolasyonu, disk izni, File Hub okuma/yazma ayrımı).
3. Windows .NET SDK 8.0.425 `dotnet test` **14/14 PASS**, masaüstü WPF Release derlemesi **0 hata**. Önceden mevcut Shared nullability uyarısı bazı restore/publish çıktılarında görülebilir.
4. Inno Setup 6 ile WPF + PDKS + Node v24.20.0 + İşNet + File Hub modüllü **tek kurulum derlendi**.
5. `KY-ERP-Masaustu-Setup-1.5.1.exe`: 94.611.901 bayt; SHA-256 `48c26c78018f7048b0a7ea5c4c1f00564c44167418c97f32b8540bd94a54da2b`. DESEN üzerindeki sabit derleme çıktısı:
   `D:\KYERP\_BUILDS\KY-ERP-Desktop-1.5.1-20261120\`
   SHA-256 ile kopya da doğrulandı. Dosya GitHub'a, sohbete veya başka cloud depoya yüklenmedi.

## Açık gerçek kullanıcı kabulleri / güvenlik

- Bu setup **Authenticode imzalı değil**; Windows SmartScreen veya kurumsal politika uyarı verebilir. Kullanıcıya imzasız olduğu belirtilir.
- Kurulum **DESEN'e yüklenmedi**, mevcut Windows görevleri, PDKS Agent, file-hub yapılandırması, D1 business verileri veya canlı İşNet hesabı değiştirilmedi. Test paketi Windows'ta açılıp arayüz/klasör/backup UI etkileşimi ayrı kabul bekliyor.
- Setup'ın mevcut Inno PDKS kısmı, çalıştırılırsa `KYERP.PDKS.Agent` hizmetini durdurup yeniden oluşturabilir. Canlı PDKS cihazında bakım/onay olmadan **kuruluma başlanmaz**; mevcut görevleri etkileyebilir.
- `KYERP_AGENT_KEY` mevcut değilse File Hub otomatik bağlantısı hazır sayılmaz. Kullanıcının onayı olmadan yeni token, servis veya dış kurulum istenmez.
- Gerçek İŞNET portal giriş + dört belge XML/PDF + tenant Belge Havuzu kalıcı arşiv + fatura/irsaliye eşleştirme uçtan uca kabulü **henüz PASS değildir**.
- D1 tam yedek/geri yükleme uygulaması bu özellik paketinde **yoktur**; klasör yedeği bunun yerine geçmez.

## Kaynaklar
- `AGENTS.md`, `DOCS/KY_CHATGPT_DESEN_ERISIM_KURALI.md`.
- Özel DESEN köprü ve kota kuralları `cetin60kaya-lgtm/kyerp` `CONTROL/KY_CHAT_BRIDGE_AGENT_RULES.md`.
- `APP/desktop/ky-pdks/BUILD_SETUP.ps1` / `installer/KY-PDKS.iss`.
- `tools/file-hub-agent/README.md`.

