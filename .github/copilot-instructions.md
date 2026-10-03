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
