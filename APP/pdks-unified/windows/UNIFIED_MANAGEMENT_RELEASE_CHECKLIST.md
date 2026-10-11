# KY PDKS Unified — Yönetim & Entegrasyon / Windows kabul kapısı

Windows bileşenleri bağımsız: APP/pdks-unified/windows = .NET 8 WinForms WebView2 Unified, APP/desktop/ky-pdks = eski WPF ve KYERP.PDKS.Agent servisi. Unified Setup yalnız kendi dosyalarını kurar, önceki WPF hizmetini değiştirmez ve veri/yedek silmez.

Yönetim sekmeleri gerçek KY ERP adminApi kullanıcı/firma/izin/backup/log kaynaklarını okur; güncelleme işlemleri mevcut yetkili KY ERP Yönetim sayfalarına geçer. Firma yetkisi yoksa okuma yapılmaz. Cloud outbox ACK fiziksel terminal kanıtı değildir.

Yerel tanı: Production WebView2 içinde aynı origin için GET /__pdks_local__/health.json; yalnız AgentState ve SyncJournal üzerinde anonim sayaçlar okunur. Offline QA ve tarayıcıda kapalıdır. Agent son heartbeat canlı terminal kanıtı değildir. Hiçbir ham kart, kişisel bilgi, parola, token, hata gövdesi veya path döndürülmez.

Yedek kaynakları farklı: eski WPF yerel SQLite WAL + quick_check; KY ERP Cloud D1/R2/SQL firma yedeği ve Firebird/TNF ayrıca doğrulanır. Geri yükleme yalnız mevcut KY ERP Yönetim güvenlik akışında yapılır.

Ön kontrol: PowerShell ile tools/Check-UnifiedRuntime.ps1 -FailIfMissing, Windows x64 + .NET 8 Desktop Runtime + WebView2 kurulumunu, eski hizmet ve Unified görev durumlarını yalnız okur. FP_CLOCK x86 terminal köprüsü ayrıca tutulur; x64 uygulama içine gömülmez.
Paket: tools/Build-KyPdks-UnifiedSetup.ps1, npm test/build, .NET build, izole Agent selftest, win-x64 publish, Inno Setup ve SHA256. Yeni benzersiz dist klasörü; canlı DB, yıllık TNF veya yedekleri silmez.

Gerçek Windows EXE/Setup build, WebView2 ilk açılış, Agent görev start/stop/reconnect ve fiziksel cihaz kabulü tamamlanmadan üretim hazır değildir. Merge veya canlı deploy yapılmaz.
