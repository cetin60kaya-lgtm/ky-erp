# KY ERP — GitHub / AI maliyet koruma talimatı

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
