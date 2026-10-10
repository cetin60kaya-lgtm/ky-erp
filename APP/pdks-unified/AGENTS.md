# PC PDKS — Ortak Çalışma Kuralları (10.10.2026)

Bu dosya PC PDKS projesinin **mevcut** KY PDKS uygulamasını geliştiren bütün sohbetler ve kod ajanları içindir. Yeni uygulama/kabuk oluşturmayın. Ana referans: `feature/ky-pdks-unified-product-shell-20261008`; repo: `cetin60kaya-lgtm/ky-erp`. `main` ve canlı yayın dalına dokunmayın.

## Kesin kurallar
- Kendi aşağıdaki feature branch'inizde çalışın. Referans dalına, diğer görev dallarına ve `main` dalına doğrudan commit/merge yapmayın. Çakışan dosyalarda değişiklik gerekirse koordinasyon notuna yazın.
- Mevcut React 9 bölüm/49 sekmeyi, Windows .NET 8 WebView2 uygulamasını, Windows Agent/Firebird/TNF/QR/USB ve mevcut D1 entegrasyonlarını kullanın; örnek, maket veya yalnız menü olarak tamamlandı demeyin.
- Gerçek Hedef terminali ve iki eski cihaz profili eski uygulamadan **kanıtla** alınacak. Bilinen Cihaz1: 192.168.1.224:5005, makine 1, FP_CLOCK.ocx + TMPCCOMM.dll/x86; ikinci profilin adres/ayarını uydurmayın. Cihaz elektriği kapalı olabilir. Okuma testi, bağlantı yok, cihaz kapalı, kimlik yanlış gibi durumları ayrı gösterin.
- Üretim Firebird FDB/GDB, yıllık TNF, fiziksel terminal hafızası/RAW, Cloudflare D1, kart atama ve maaş/ödeme kayıtlarına doğrulanmış kullanıcı onayı olmadan **yazmayın, silmeyin, taşımayın, deploy etmeyin**. Salt okunur okuma da kaynak yetkisi ve erişim sınırlarını korumalıdır. İzole kopya, yapay veri ve transaction rollback testi serbesttir.
- Kişisel personel dosyası/kimlik/maaş ve FDB/TNF/özel terminal dump'ını GitHub'a, loga, çıktıya, üçüncü taraf servise koymayın. Şifre/lisans/SDK ikilileri repoya eklenmez.
- Çalışma bitti iddiası için: gerçek kod bağlantısı + beklenen ekran eylemi + hata/yetki durumu + hedefli test + entegre derleme + gerçek ortam kabul kanıtı gerekir. Otomatik test yalnız simülasyon ise bunu söyleyin. `49 sekme açıldı` = `49 işlem hazır` DEĞİLDİR.
- Her tamamlanan anlamlı modülde test ve yerel/uzak commit oluşturun, uygun PR açın; kullanıcıdan her küçük adım için onay istemeyin. Bu sohbetlerde bitmeyen, çalışmayan işi açık blocker olarak tutun. Taslak PR'ı onaysız birleştirmeyin. İş tamamlandı deyip sohbeti kapatmayın; kalan modüllere devam edin. Üretim saha testi için gereken cihaz/erişim kanıtı yoksa bunu teknik engel olarak belirtin.

## İş sahipliği / ayrı branch'ler
1. **Terminal & Cihaz** — `feature/ky-pdks-terminal-multidevice-fpclock-20261010`: Cihaz1+Cihaz2 gerçek profilleri, FP_CLOCK/x86 köprüsü, çoklu bağlantı/yeniden bağlantı, canlı cihaz sayacı ve okuma, kart yazıcı sürücü/şablonları. Dosya sahibi: `APP/pdks-unified/device-gateway` ve yalnız terminale özgü Windows bağlantı dosyaları.
2. **Personel & Kart** — `feature/ky-pdks-personnel-card-20261010`: Personel 360, fiziksel kart atama/değiştirme geçmişi, istihdam/özlük/evrak. Dosya sahibi: personel ekranları ve doğrulanmış personel sözleşmeleri.
3. **Devam & Puantaj** — `feature/ky-pdks-attendance-puantaj-evidence-20261010`: RAW–Firebird–TNF–E hareketleri, çift/gündüz/gece vardiya, izin/tatil, günlük/aylık puantaj ve istisna; kuralsız süre/ücret üretme.
4. **Bordro & Rapor** — `feature/ky-pdks-bordro-rapor-20261010`: onaylı puantaj girdileriyle maaş/yol/yemek/mesai/avans/kesinti/banka/elden, ödeme fişi ve imza/Excel/PDF; onaysız bordro kesinleştirme yok.
5. **Yönetim & Entegrasyon** — `feature/ky-pdks-management-integration-20261010`: firma/rol/yetki, yedekleme, hata merkezi, Cloud outbox/ACK, Windows kurulum/sürüm, yönetim ekranları. Entegrasyon testleri ve birleştirme kapısında koordinasyon; diğer dalların kodunu çekmeden değiştirmeyin.

**Ortak dosya çakışmaları:** `PdksUnifiedApp.jsx`, `tabBindings.js`, `productModel.js`, `Program.cs` ve paketleme scriptleri için PR'da açıkça değişiklik listesi ve neden yazın. Modül mantığını ayrı dosyada tutup merkez UI kayıtlarını minimum değiştirin. Bağımsız dallar birbirinin kodunu zorla sıfırlamasın.

## Birleştirme ve teslim
Merkez sohbet önce GitHub branch farklarını, testleri ve draft PR'ları denetler; sonra tek entegrasyon dalında sırasıyla terminal → personel → puantaj → bordro → yönetim değişikliklerini seçici entegre eder. Her adımın ardından test; sonra komple backend/frontend/Windows/agent ve izole FDB/TNF kabulü; **sonra** yeni Windows EXE+kurulum paketi, SHA256 ve doğrulanmış saha test planı. `KY-PDKS-MENU-TEST.exe` izole menü testidir, canlı kurulum gibi sunulmaz. Ana dala merge ve üretim dağıtım ayrı onay ister.

Merkez denetim belgesi: `APP/pdks-unified/docs/PC_PDKS_COORDINATION_20261010.md`.
