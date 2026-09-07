# KY PDKS Pro 1.9.0 — Ürün Kapsamı

KY PDKS Pro, KY ERP PDKS modülünün bağımsız Windows ürünüdür; ancak ayrı bir iş uygulaması değildir. **Aynı canonical React PDKS arayüzünü ve aynı D1 verisini** kullanır.

Windows'a özel kapsam:
- WebView2 içinde PDKS-only canonical UI,
- KYERP.PDKS.Agent,
- HEDEF_TR500 / FILE / TCP / SERIAL kart toplama,
- SQLite offline ham kart kuyruğu,
- Windows terminal kurulum sihirbazı,
- bağlantı tanılama, log ve yedek.

PDKS iş kapsamı:
- canlı devam,
- giriş/çıkış,
- puantaj,
- vardiya,
- izin,
- terminal/senkron,
- rapor/denetim,
- AI canlı kontrol + preview-first operasyon.

PDKS kapsamı DIŞI:
- maaş,
- banka/elden,
- avans/kesinti,
- icra/haciz,
- bordro,
- ikinci personel masterı.

Kapalı binary/SDK kullanan terminal için marka-model adapterı eklenir. Doğrulanmamış cihaz protokolüne saat/kapı/restart/yönetici-sil komutu tahmin edilmez.
