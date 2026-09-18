# Codex başlangıç komutu

Bu repo içindeki `APP/desktop/kyerp-pdks-current` projesini ön düzenlemeye al.

## EN KRİTİK KURAL — ÜRÜN REFERANSI KYERP'DİR

**Hedef uygulaması görsel/UX ürün referansı değildir.**
Kalıcı ürün referansı mevcut **KYERP masaüstü düzeni ve KYERP.NET tasarım/işleyiş kurallarıdır**.

Hedef yalnız şu amaçlarla referans alınır:
- eksik menü/işlev envanteri,
- iş akışı ve işlem mantığı,
- rapor listesi,
- Firebird veri/alan davranışı,
- terminal ve PDKS süreçleri,
- mevcut fonksiyonların unutulmaması.

Hedef'te bulunan bir işlev KYERP'de yoksa, **Hedef ekranını kopyalama**. O işlevi mevcut KYERP masaüstü düzenine ve KYERP.NET ürün diline uyarlayarak ekle.

## KYERP MASAÜSTÜ KİLİDİ

Mevcut KYERP masaüstü yeniden inşa edilmeyecek ve başka bir görünüme dönüştürülmeyecek.

Korunacaklar:
- mevcut KYERP ana pencere yapısı,
- mevcut KYERP menü/toolbar yerleşimi,
- mevcut KYERP Personel ve diğer modül ekranlarının yerleşimi,
- mevcut KYERP sekme, buton, açılır pencere ve işlem akışları,
- kullanıcı açısından mevcut KYERP çalışma alışkanlığı.

**Yasak:** Hedef görünümünü KYERP'ye kopyalamak, KYERP'yi Hedef'e benzetmek, yeni dashboard/sidebar/card tasarımı üretmek, mevcut KYERP ekranlarını yeniden tasarlamak veya mevcut akışları sebepsiz değiştirmek.

Önce şu dosyaları sırayla oku:
1. `README.md`
2. `docs/UI_PARITY_LOCK.md`
3. `docs/ARCHITECTURE_TARGET.md`
4. `docs/CODEX_HANDOFF.md`
5. `legacy-runtime/MANIFEST.md`

Kurallar:
- Mevcut çalışan KYERP işlevlerini değiştirme veya silme.
- Hedef'teki bütün menü/işlev/raporları envanterle; eksik olanları KYERP düzenine göre eşle.
- Firebird DB şemasına destructive değişiklik yapma.
- `Hedef.exe` üzerinde patch/reverse engineering yapma.
- Aktif kaynak ile `legacy/` kaynaklarını net ayır.
- Önce çözüm/proje klasörlerini, configuration ve data-access katmanını düzenle.
- KYERP UI alan isimlerini, yerleşimini ve kullanıcı akışını koru.
- Her önemli adımda build al; build kırık bırakma.
- Smoke testlerin rollback mantığını koru.
- Hard-coded parola bırakma.
- Multi-company hazırlığını kod iç mimarisinde yap; tek firma bilgisi kod içine gömülmesin.
- KYERP.NET ve masaüstü aynı PDKS işlev/domain haritasını paylaşsın; iki istemcinin kendi mevcut tasarım dili korunsun.

İstenen ilk teslim:
- temiz `KYERP.PDKS` solution yapısı,
- modüler klasör/proje düzeni,
- merkezi configuration,
- merkezi Firebird data katmanı,
- **mevcut KYERP masaüstü görünümünü ve akışını koruyan build**,
- Hedef → KYERP eksik menü/işlev/rapor parity raporu,
- yapılanlar/kalanlar raporu.

Çalışma dalı: `codex/kyerp-pdks-full-app-prep`.
