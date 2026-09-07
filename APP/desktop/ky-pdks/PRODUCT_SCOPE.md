# KY PDKS Windows 1.8.0 — Ürün Kapsamı

KY ERP Windows build zinciri iki ayrı ürün üretir:

- **KY ERP Desktop**: tam ERP Windows kabuğu.
- **KY PDKS Desktop**: WebView/full ERP shell içermeyen PDKS-only WPF uygulaması.

PDKS-only ürünün kapsamı:

- kart cihazı / Hedef PDKS veri toplama,
- canlı ham kart,
- personel kart eşleştirme,
- D1 puantaj,
- eksik/tek basım kontrolü,
- vardiya/servis/izin operasyonu,
- dönem kontrolü,
- denetim raporu,
- offline SQLite/WAL kuyruk,
- otomatik D1 cihaz senkronu,
- log/yedek,
- Terminal / Cihaz Merkezi.

Hakan Emprime terminal profili:

- Hedef PDKS 5.0.29
- Ethernet
- IP `192.168.1.224`
- Port `5005`
- Cihaz No `1`
- Makine No `1`
- Yön `GIRIS`
- Baud `38400`
- Salt-okunur kayıt dosyası `C:\Hedef500\Terminal Bilgi Aktar\timerecords.txt`

Ana production-safe capture yolu Hedef PDKS dosya köprüsüdür. TCP erişim testi yalnız connect/close yapar ve payload göndermez. Kapalı/binary üretici protokolü doğrulanmadan cihaz saati, kapı, restart, yönetici silme veya cihaz kayıt silme komutları aktif edilmez.

İş verisinin ana kaynağı KY ERP D1'dir. Yerel SQLite yalnız ham kart, offline kuyruk, cache, log ve yedek içindir.
