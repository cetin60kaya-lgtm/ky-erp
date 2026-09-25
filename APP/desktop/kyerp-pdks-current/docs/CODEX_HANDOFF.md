# Codex handoff - KYERP PDKS ön düzenleme

Bu görev ilk genel düzenleme/refactor aşamasıdır. Davranış değiştirme, mevcut KYERP masaüstünü yeniden tasarlama veya Hedef görünümünü KYERP'ye taşıma görevi değildir.

## Ürün önceliği

**KYERP ana üründür. Hedef yalnız legacy fonksiyon referansıdır.**

- Mevcut KYERP masaüstü görünümü ve akışları korunur.
- Hedef'teki menü, işlem, rapor, terminal ve veri davranışları eksik fonksiyonları tespit etmek için kullanılır.
- Hedef'te olup KYERP'de olmayan işlevler, Hedef ekranı kopyalanmadan mevcut KYERP düzenine uyarlanır.
- KYERP.NET tarafındaki mevcut ürün dili korunur; masaüstü ve web aynı domain/işlev haritasını paylaşır.

## Öncelik

1. Projeyi aç; `docs/UI_PARITY_LOCK.md`, mevcut KYERP kaynaklarını ve `docs/ARCHITECTURE_TARGET.md` dosyasını oku.
2. Mevcut KYERP çalışan davranışlarını koru. DB şemasını değiştirme.
3. Hard-coded yol, parola ve ortam bağımlılıklarını merkezi configuration katmanına taşı.
4. `HKN.Personel.Native` içindeki büyük partial form dosyalarını sorumluluklarına göre ayır: UI, data access, dialogs, reports, domain helpers. **Mevcut KYERP görünümünü ve akışını değiştirme.**
5. Firebird erişimini form kodundan çıkarıp repository/service katmanına taşı; ilk aşamada SQL davranışını değiştirme.
6. Shell/Bridge/Legacy Web kodunu `legacy` olarak açıkça ayır; aktif kod ile karıştırma.
7. Tek çözüm yapısı oluştur (`KYERP.PDKS.sln` veya `.slnx`).
8. Ortak build komutu ve `README` güncellemesi yap.
9. Derleme hatası bırakma. Var olan smoke testlerin mantığını koru.
10. Hedef'teki her menü/ekran/işlem/rapor için parity checklist oluştur; KYERP Desktop ve KYERP.NET tarafında karşılığı olmayanları raporla.

## Kesin yapılmayacaklar

- KYERP masaüstü UI yeniden tasarımı yok.
- KYERP'yi Hedef'e benzetmek yok.
- Hedef ekranlarını bire bir kopyalamak yok.
- Yeni sidebar/dashboard/card düzeni yok.
- Mevcut KYERP menü, sekme, açılır pencere veya işlemini kaldırma/birleştirme yok.
- `Hedef.exe` reverse engineering/patching yok.
- Canlı `DATABASE.GDB` üzerinde destructive migration yok.
- Personel kayıtlarını test için kalıcı değiştirme yok.
- Eski kodu topluca silme yok; önce kullanımını doğrula.

## İstenen çıktı

- Net proje/klasör yapısı.
- Build alan, okunabilir kaynak.
- Configuration/DB erişimi merkezileştirilmiş yapı.
- Mevcut KYERP UI ve akışını koruyan build.
- Hedef → KYERP Desktop → KYERP.NET işlev parity matrisi.
- Refactor edilen dosyaların kısa özeti.
- Kalan teknik borç listesi.

Başlangıç noktası: `codex/kyerp-pdks-full-app-prep`.
