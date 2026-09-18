# Codex başlangıç komutu

Bu repo içindeki `APP/desktop/kyerp-pdks-current` projesini ön düzenlemeye al.

## EN KRİTİK KURAL — UI / İŞLEYİŞ PARİTE KİLİDİ

Bu uygulama **yeniden tasarlanmayacak, yeniden inşa edilmiş yeni bir masaüstü arayüze çevrilmeyecek.**
Mevcut KY PDKS/Hedef tabanlı masaüstü görünümü ve işleyişi ürün referansıdır.

Aşağıdakiler bire bir korunacak:
- ana pencere yapısı,
- üst menü sırası,
- toolbar ikonlarının yeri/sırası,
- `Bilgi Aktar`, `Gruplar`, `Dönemler`, `Bölümler`, `Giriş-Çıkışlar`, `Per. Bilgileri`, `Avanslar`, `Puantaj`, `Puantaj Son.`, `Bordro`, `Çalışma Tarihi` ve diğer mevcut girişler,
- açılır menüler,
- alt menüler,
- sekmeler,
- klasik child/modal pencere mantığı,
- buton isimleri ve ekran akışı,
- Personel Bilgileri penceresinin iki kolonlu mevcut masaüstü düzeni,
- personel listesi, sağ bilgi alanları, sekmeler, alt butonlar,
- kullanıcı açısından tıklama sırası ve işlem davranışı.

**Yasak:** modern dashboard, kart tasarımı, sidebar, SPA benzeri yeni masaüstü arayüz, yeni navigasyon modeli, mevcut formları farklı UX'e dönüştürme, ekranları birleştirme veya sadeleştirme.

Kod iç mimarisi temizlenebilir; kullanıcıya görünen masaüstü ise mevcut referansın bire bir devamı olacak.

Önce şu dosyaları sırayla oku:
1. `README.md`
2. `docs/UI_PARITY_LOCK.md`
3. `docs/ARCHITECTURE_TARGET.md`
4. `docs/CODEX_HANDOFF.md`
5. `legacy-runtime/MANIFEST.md`

Kurallar:
- Mevcut çalışan işlevleri değiştirme.
- Hiçbir mevcut menü/işlev/sekme/raporu kaldırma.
- Firebird DB şemasına destructive değişiklik yapma.
- `Hedef.exe` üzerinde patch/reverse engineering yapma.
- Aktif kaynak ile `legacy/` kaynaklarını net ayır.
- Önce çözüm/proje klasörlerini, configuration ve data-access katmanını düzenle.
- UI alan isimlerini, ölçüsel yerleşimi ve kullanıcı akışını koru.
- Her önemli adımda build al; build kırık bırakma.
- Smoke testlerin rollback mantığını koru.
- Hard-coded parola bırakma.
- Multi-company hazırlığı kod iç mimarisinde yapılabilir fakat görünür UI davranışı değiştirilmez.
- Web/KYERP.NET tarafındaki PDKS ekranları masaüstündeki mevcut menü ve işlem haritasını eksiksiz karşılayacak şekilde modellenir; masaüstü web görünümüne çevrilmez.

İstenen ilk teslim:
- temiz `KYERP.PDKS` solution yapısı,
- modüler klasör/proje düzeni,
- merkezi configuration,
- merkezi Firebird data katmanı,
- **görsel ve davranış olarak mevcut masaüstüyle aynı kalan build**,
- eksik menü/işlev parity raporu,
- yapılanlar/kalanlar raporu.

Çalışma dalı: `codex/kyerp-pdks-full-app-prep`.
