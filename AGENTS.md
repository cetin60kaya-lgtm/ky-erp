# KY ERP — ANA YÖNLENDİRME

> **Önemli:** GitHub default branch'i `main` tarihsel/yardımcı branch'tir. Güncel KY ERP production kaynak kodu ve çalışma kuralları için `main` canonical kabul edilmez.

## Yeni sohbet / yeni ajan zorunlu başlangıç

1. Önce `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md` dosyasını oku.
2. Gerçek production kaynak branch'e geç veya onu GitHub'dan oku: `codex/model-uretim-kontrol-merkezi-final`.
3. O branch'teki `AGENTS.md` dosyasını teknik ve güvenlik açısından üstün çalışma sözleşmesi kabul et.
4. Aktif feature branch varsa (ör. Desktop çalışması) aynı `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md` dosyasının o branch'teki daha yeni kopyasını kontrol et.
5. Kullanıcı açıkça `onay / canlıya al / deploy / merge` demeden production deploy veya merge yapma.

## Güncel proje kimliği

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
- Public site: `https://kyerp.net`
- ERP uygulaması: `https://app.kyerp.net`
- API: `https://api.kyerp.net`

## Güncel çalışma yönü — 03.09.2026

- KY ERP Desktop geliştirme sonrası ilk gerçek kontrol ortamıdır.
- GitHub ana kaynak kodu ve geçmiş/yedek merkezidir.
- kyerp.net yalnız Desktop üzerinde kullanıcı kontrolünden geçen ve açıkça onaylanan değişiklikleri alır.
- Kullanıcı GitHub/VS Code ile manuel uğraştırılmaz; mümkün olduğunca otomatik build/güncelleme akışı kullanılır.
- Aktif Desktop branch'i: `codex/ky-erp-desktop-final-20260903`.
- Draft PR: `#56 — KY ERP Desktop 1.7.2 — tam Windows ERP uygulaması`.
- Kullanıcı Desktop 1.7.2'nin açıldığını ve oturumun çalıştığını gerçek Windows cihazda doğrulamıştır.
- İlk ayrıntılı modül kontrolü: `İK > Günlük Giriş`.

## Eski main kuralları

Bu dosyada daha önce bulunan OneDrive/SQLite/yerel DATA ve `tasarim-final-v1` merkezli kurallar güncel canonical mimari değildir. Gerekirse Git geçmişinden tarihsel referans olarak incelenebilir; yeni geliştirme kararlarında kullanılmamalıdır.

## Güvenlik

- Production verisini test için silme/sıfırlama.
- Şifre, MFA secret, API key veya tokenı GitHub'a yazma.
- Kullanıcı onayı olmadan resmî İşNet belge gönderimi, production migration veya deploy yapma.
- Değişiklikten önce ilgili feature branch ve güncel Proje Kontrol Merkezi okunmalıdır.


## GitHub maliyet ve Actions ana kuralı — 04.10.2026

Bu kural KY ERP üzerinde çalışan tüm AI ajanları, ChatGPT/Codex sohbetleri ve GitHub otomasyonları için zorunludur.

- GitHub ücretli ek kullanım bütçesi varsayılan olarak **0 USD** kabul edilir. Actions, Codespaces/Kod Alanları, Packages/Paketler, Git LFS ve ek AI kredi ürünlerinde bütçe aşımıyla ücretli kullanıma geçilmez.
- **Copilot Free** varsayılandır. Kullanıcı açıkça istemedikçe Copilot Pro/Pro+ veya başka ücretli GitHub servisi açılmaz, yükseltilmez ve ödeme yeniden denenmez.
- Yeni GitHub Actions workflow oluşturma varsayılanı `workflow_dispatch` (manuel) olmalıdır. Otomatik `push`, `schedule` veya geniş kapsamlı `pull_request` tetikleyicisi ancak zorunluysa ve mevcut canonical kontrol akışında çözülemiyorsa eklenir.
- Otomatik CI için **tek canonical kapı** kullanılır: frontend + Worker temel kontrolü. Aynı işi yapan ikinci/üçüncü workflow oluşturulmaz.
- Windows hosted runner yalnız gerçekten Windows/PDKS/native derleme zorunluysa kullanılır; bu işler varsayılan olarak manuel çalıştırılır. Normal web/Worker kontrollerinde Ubuntu tercih edilir.
- Production deploy, D1 migration, canlı smoke ve benzeri pahalı/etkili işler genel kod push'unda otomatik koşturulmaz; açık release tetikleyicisi veya manuel dispatch kullanılır.
- Bir workflow kendi branch'ine commit/push atarak kendisini yeniden tetikleyen döngü oluşturamaz.
- Tüm otomatik workflow'larda uygun `paths` filtresi ve `concurrency.cancel-in-progress: true` kullanılır. Eski koşu tamamlanmadan yeni aynı iş geldiyse eski koşu iptal edilir.
- Artifact/log saklama süresi varsayılan **3 gün**; özel gerekçe yoksa 7/14/30 gün kullanılmaz.
- Her yeni sohbet/ajan GitHub workflow değiştirmeden önce bu bölümü kontrol eder; maliyeti artıracak bir değişiklik kullanıcı açıkça onaylamadıkça yapılmaz.


## Remote Desktop Commander kullanım ana kuralı — 04.10.2026

Bu kural KY ERP üzerinde çalışan tüm ChatGPT/AI ajanları ve yeni sohbetler için zorunludur. Amaç Remote MCP çağrı sayısını ve aylık kota tüketimini minimumda tutmaktır.

### Varsayılan: Remote Desktop KULLANMA

Remote Desktop yalnız aşağıdaki işler için kullanılır:
- Windows/Photoshop/Illustrator/PDKS Desktop gibi gerçekten yerel makineye bağlı uygulamalar.
- Yerel klasör, cihaz, yazıcı, dongle, sürücü, servis veya yalnız o PC'de bulunan dosya/ayar kontrolü.
- GitHub'da olmayan binary/yerel entegrasyon testi.

Şunlar için Remote Desktop kullanılmaz:
- GitHub repo/kod/dosya okuma-yazma; GitHub connector kullanılır.
- Cloudflare/public web kontrolü; uygun web/connector kullanılır.
- Chat içindeki dosya analizi; Files/Python/container kullanılır.
- Aynı bilgiyi başka bir mevcut araçtan alabiliyorsak Remote açılmaz.

### Çağrı tasarruf standardı

1. **Tek iş = mümkünse tek Remote oturumu / tek komut.** Bir işi 20 küçük komuta bölme.
2. `start_process` içinde mümkün olduğunca bütün PowerShell kontrollerini tek scriptte topla ve sonucu tek seferde döndür.
3. `read_process_output` ile sürekli polling yapma. Komut 3 saniyede bitebiliyorsa tek çağrıda bitir; uzun işte yalnız gerçekten gerektiğinde tekrar oku.
4. Birden fazla dosya okunacaksa tek tek `read_file` yerine `read_multiple_files` veya tek PowerShell komutu kullan.
5. Aynı klasörü/dosyayı tekrar tekrar listeleme/okuma. Önce hedefi belirle, sonra tek geçiş yap.
6. Değişikliklerde onlarca `edit_block` yerine mümkünse dosyayı bir kez okuyup tek güncellemede yaz.
7. Durum kontrolü için aynı komutu peş peşe çağırma. Sonuç değişmediyse tekrar sorgulama.
8. Yerel aramada önce tek geniş arama, sonra yalnız gerekli sonucu daralt; gereksiz recursive tekrarlar yapma.
9. Remote üzerinden ekran görüntüsü/GUI otomasyonu mevcut araç setinde yoksa bunu telafi etmek için gereksiz terminal döngüsü kurma.
10. İş bitince ek "emin olma" kontrollerini zincirleme yapma; kritik işlemlerde yalnız 1 doğrulama yeterlidir.

### Çağrı bütçesi

- Basit yerel kontrol: hedef **1–3 Remote çağrısı**.
- Orta seviye yerel düzeltme: hedef **en fazla 5–8 Remote çağrısı**.
- Büyük yerel operasyon: önce planla; **10 çağrıyı aşacaksa** çağrıları batch edecek script/tek komut oluştur. 10 üzeri ancak teknik olarak zorunluysa yapılır.
- Normal repo/web/Cloudflare işleri için hedef **0 Remote çağrısı**.

### Yasak davranışlar

- Her küçük adımda `start_process` + `read_process_output` döngüsü kurma.
- Aynı dosyayı art arda tekrar tekrar okuma.
- Aynı işlemi doğrulamak için farklı araçlarla üç-dört kez aynı kontrolü yapma.
- Remote Desktop'ı sadece "hazır bağlı" olduğu için kullanma.
- Kullanıcının kotasını hızla tüketen deneme-yanılma döngülerine girme.

### Öncelik sırası

1. GitHub / ilgili connector
2. Files / container / Python
3. Web / diğer uygun araç
4. **Yalnız yerel zorunluluk varsa Remote Desktop Commander**

Bu kural maliyet/kota koruma kuralıdır ve performans/kolaylık gerekçesiyle atlanamaz.
