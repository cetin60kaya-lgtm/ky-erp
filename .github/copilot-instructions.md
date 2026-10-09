# KY ERP — GitHub / AI maliyet koruma talimatı

## Bütün KY ERP ajanları için ortak Güncelleme Geçmişi
- Önce `AGENTS.md` ve `DOCS/KY_ERP_GUNCELLEME_YAYIN_KAYIT_SOZLESMESI_2026-10-09.md` dosyalarını oku.
- Her iş commit/PR açıklamasına modül, hata/çözüm, CI kanıtı, merge/live/eksik durumunu yaz. Canlı durum sadece gerçek production Actions ve commit kanıtıyla belirlenir; sohbetin "yaptım" sözü yeterli değildir.
- KY ERP Platform Yönetimi > Sistem > Güncelleme Geçmişi tüm ajan ve sohbetlerin repo üzerinden yaptığı işlerin ortak salt-okunur defteridir.
- Hiçbir koşulda sırf kayıt oluşturmak için ayrı workflow, ikinci test ERP, D1 migration, ücretli servis, kalıcı GitHub token veya gizli bilgi ekleme.


Bu repo üzerinde çalışan AI ajanı veya Copilot önce kökteki `AGENTS.md` dosyasını okumalıdır.

Zorunlu kurallar:
- GitHub ücretli ek kullanım bütçesi 0 USD kabul edilir.
- Copilot Free varsayılandır; ücretli plana yükseltme veya ödeme denemesi kullanıcı açıkça istemedikçe yapılmaz.
- Yeni workflow varsayılanı `workflow_dispatch` olmalıdır.
- Otomatik CI için tek canonical kontrol akışı kullanılır; aynı işi yapan yeni workflow eklenmez.
- Windows hosted runner / PDKS native build varsayılan olarak manueldir.
- Production deploy, D1 migration ve canlı smoke genel push'ta otomatik çalışmaz.
- Workflow kendi branch'ine commit/push atarak kendisini tekrar tetikleyemez.
- Otomatik workflow'larda path filtresi + concurrency cancellation kullanılır.
- Artifact retention varsayılan 3 gündür.
- Maliyeti artırabilecek GitHub ayarı veya yeni otomasyon kullanıcı açıkça onaylamadan etkinleştirilmez.


## Remote Desktop kota koruma
- Remote Desktop yalnız gerçekten yerel Windows/Photoshop/Illustrator/PDKS/cihaz/dosya işi için kullanılır.
- GitHub, Cloudflare, web ve repo işleri için Remote kullanma.
- Basit iş 1-3, orta iş 5-8 Remote çağrısını hedefler; 10 üzeri gerekiyorsa önce tek/batch PowerShell scriptine birleştir.
- start_process/read_process_output polling döngülerinden kaçın; uzun işi mümkünse tek komutta tamamla.
- Birden fazla dosya için read_multiple_files veya tek script kullan; aynı dosyayı/klasörü tekrar tekrar okuma.
- Remote, uygun başka bir connector/tool varken kullanılmaz.
