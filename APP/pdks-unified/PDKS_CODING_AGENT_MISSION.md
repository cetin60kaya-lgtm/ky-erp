# KY PDKS — Güvenli Geliştirme Ajanı / 09.10.2026

**Hedef:** PDKS uygulamasını gerçek verilerle çalışacak, üretime geçmeden önce test edilebilir kurumsal Windows/Web modülüne dönüştürmek. Arayüzün mevcut 9 bölüm / 49 sekme düzenini KORU. Demo raporu gerçek personel kanıtı değildir.

## Her çalıştırmanın zorunlu başlangıcı
1. `AGENTS.md`, `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`, `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md` ve `APP/pdks-unified/README.md` oku.
2. Yalnız **mevcut güvenli PDKS izolasyon checkout'unda** çalış; canonical `D:\Googledrive\KYERP\00_CANONICAL\GITHUB\ky-erp` başka branch'te ve 27 kirli değişiklikte. Asla `git reset --hard`, `git clean`, `git pull --rebase` veya force push yapma.
3. PR [#404](https://github.com/cetin60kaya-lgtm/ky-erp/pull/404), dal `feature/ky-pdks-unified-product-shell-20261008`. **Draft** kalır. Yalnız ilgili PDKS modülü üzerinde değişiklik yap; muhasebe ve diğer ERP modüllerini değiştirme.
4. Canlı Firebird FDB, yıllık TNF, terminal belleği/SDK konfigürasyonu ve Cloudflare production D1'e **yazma veya deployment yok**. Verileri yalnız onaylanmış READ-ONLY kanıt adımında oku. Şifre, API key, kartın tamamı, isim, biyometrik şablon ve personel dosyalarını GitHub'a, Google Drive OUTBOX'a veya Codex metin cevabına aktarma. Üretim DB migrasyonu, işlenen bordro ve gerçek cihaz yeniden yapılandırması yasak.
5. Gerçek Firebird yalnız `Prepare-IsolatedFirebirdCopy.ps1` onaylı `gbak` backup/read; yazma/rollback testleri sadece `D:\KYERP\_TEMP\PDKS_COPY_STAGE_*\KY_PDKS_STAGE.FDB`. Kaynak farklıysa hata ver; tahmin etme. Yıllık TNF formatı `KartNo,Saat,GGAAYY,1,001`, E tipi ayrıdır; fiziksel okutma icat etme.
6. **Yayıma hazır = Chrome 49 sekme + güvenlik testleri + kopya Firebird rollback + Agent/Cloud E2E geçmesi** ve en az bir gerçek cihaz/RAW kaynak kabulü. Geçmemiş işleme "BİTTİ" deme.
7. Agent yerel checkout'u değiştirebilir ama **otomatik commit, push, PR merge, canlı deploy ve üretim DB/terminal yazma yapamaz**. Değişiklikleri `git diff --check` ve test sonuçlarıyla incelemeye bırak.

## Görev sırası — en küçük kanıtlanabilir artış
1. **Gerçek Kayıt Okuma:** Hedef terminal `KYERP.TerminalBridge.exe` + `FP_CLOCK.ocx` read-only status/RAW, gerçek kart numarası/işe giriş-çıkış eşlemesi, şirket izolasyonu. Çıkış belirsiz ise `AUTO` yönünü otomatik IN/OUT atama. Demo değil, kimlik ve zaman kaynağı ispatı. Harici biyometrik veri kaydetme.
2. **Gerçek Firebird ↔ TNF gözlem:** `KIMLIK.PKNO`, `GIRCIK.GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR` ve `TRYYYY.Tnf`; salt okunur günlük karşılaştırma ile eksik/mükerrer/E kodu raporu. Kişisel veriler yalnız yetkili yerel GUI'de; Drive/GitHub'a sadece anonim toplamlar.
3. **Personel 360°, Devam, Vardiya/İzin:** menülerde bağlanmamış butonları somut read endpointlerine bağla. Yetki, SGK kartlı filtre, kişi çıkış/giriş tarihi, iki vardiya/gece, resmi tatil kuralları ve 08:30/19:00 standartlarını koru. Zorunlu insan onayı olmayan sahte "gelmedi" statüsü oluşturma.
4. **Güvenilir gerçek test Windows arayüzü:** mevcut offline `KY-PDKS-MENU-TEST.exe` menü testinden üretimde doğru oturum ve Firebird kanıtlı local proof görünümüne doğru ilerle. Hata verene kadar hiçbir "hazır" veya "bağlı" durumu gösterme.
5. **Cihaz ve Cloud outbox:** gerçek SDK adaptörünü model/firmware bazlı sertifikalandır; D1 staging migration 0060 ayrı yedek/izin olmadan yok; tokenları ön yüze koyma. Bağlantı testi ≠ fiziksel RAW ≠ FDB/TNF ≠ Cloud ACK.
6. **Yazma işlemleri:** yalnız izole kopyada test + idempotency + journal/crash/retry doğrulaması; gerçek kaynakta nihai kabul bekle.

## Test / Handoff
- İlgili UI JS testleri, `npm.cmd run build`, Cloud TypeScript/contract/E2E, Windows Release build ve güvenli kopya Firebird tam kabulü: `APP/pdks-unified/windows/tools/Test-UnifiedProductAcceptance.ps1`.
- Kullanıcı hiçbir yeni test için eski dosyalarını silmek, genel Windows temizliği yapmak veya bütün ERP'yi yeniden kurmak zorunda değildir.
- Her görevde çıktı: `DURUM`, `GÜNCEL HEAD`, `DEĞİŞEN DOSYALAR`, `GEÇEN TESTLER`, `AÇIK RİSK`, `SIRADAKİ ADIM`. Hata kodu ve anonim sayılar yeterli; personel verisi yok.
