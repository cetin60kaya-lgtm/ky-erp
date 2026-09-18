# Codex handoff - KYERP PDKS ön düzenleme

Bu görev yalnız ilk genel düzenleme/refactor aşamasıdır. Davranış değiştirme, masaüstü arayüzü yeniden tasarlama veya yeni UX üretme görevi değildir.

## Parite kilidi

Mevcut KY PDKS/Hedef tabanlı masaüstü uygulaması ürün referansıdır. Kullanıcıya görünen masaüstü **aynı kalacaktır**.

- Ana pencere, klasik Windows/MDI-child/modal mantığı korunur.
- Toolbar ve menü sırası korunur.
- İkonlu üst kısım korunur.
- Personel Bilgileri dahil bütün mevcut ekranlar aynı yerleşim mantığında kalır.
- Açılır menü, sekme, buton, filtre, liste ve işlem sıraları korunur.
- Hiçbir ekran yeni dashboard/sidebar/card tasarımına dönüştürülmez.
- Hiçbir mevcut işlev sadeleştirme gerekçesiyle silinmez/birleştirilmez.
- Görsel iyileştirme gerekiyorsa yalnız mevcut görünümdeki hata/hizalama düzeltmesi yapılır; yeni tasarım yapılmaz.

## Öncelik

1. Projeyi aç, `docs/UI_PARITY_LOCK.md`, mevcut kaynakları ve `docs/ARCHITECTURE_TARGET.md` dosyasını oku.
2. Çalışan davranışları koru. DB şemasını değiştirme.
3. Hard-coded yol, parola ve ortam bağımlılıklarını merkezi configuration katmanına taşı.
4. `HKN.Personel.Native` içindeki büyük partial form dosyalarını sorumluluklarına göre ayır: UI, data access, dialogs, reports, domain helpers. **Formların görünümünü ve akışını değiştirme.**
5. Firebird erişimini form kodundan çıkarıp repository/service katmanına taşı; ilk aşamada SQL davranışını değiştirme.
6. Shell/Bridge/Legacy Web kodunu `legacy` olarak açıkça ayır; aktif kod ile karıştırma.
7. Tek çözüm yapısı oluştur (`KYERP.PDKS.sln` veya `.slnx`).
8. Ortak build komutu ve `README` güncellemesi yap.
9. Derleme hatası bırakma. Var olan smoke testlerin mantığını koru.
10. Her mevcut menü/ekran/işlem için parity checklist oluştur; KYERP.NET PDKS tarafında karşılığı olmayanları raporla.

## Kesin yapılmayacaklar

- Masaüstü UI yeniden tasarımı yok.
- Yeni sidebar/dashboard/card düzeni yok.
- Formları web-benzeri ekrana çevirme yok.
- Mevcut menü, sekme, açılır pencere veya işlemi kaldırma/birleştirme yok.
- `Hedef.exe` reverse engineering/patching yok.
- Canlı `DATABASE.GDB` üzerinde destructive migration yok.
- Personel kayıtlarını test için kalıcı değiştirme yok.
- Eski kodu topluca silme yok; önce kullanımını doğrula.

## İstenen çıktı

- Net proje/klasör yapısı.
- Build alan, okunabilir kaynak.
- Configuration/DB erişimi merkezileştirilmiş yapı.
- Mevcut UI ile bire bir davranış/görünüm paritesini koruyan build.
- Desktop ↔ KYERP.NET menü/işlev parity matrisi.
- Refactor edilen dosyaların kısa özeti.
- Kalan teknik borç listesi.

Başlangıç noktası: `codex/kyerp-pdks-full-app-prep`.
