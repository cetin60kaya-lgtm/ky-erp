# Codex handoff - KYERP PDKS ön düzenleme

Bu görev yalnız ilk genel düzenleme/refactor aşamasıdır. Davranış değiştirme veya veri modeli yeniden tasarlama görevi değildir.

## Öncelik

1. Projeyi aç, mevcut kaynakları ve `docs/ARCHITECTURE_TARGET.md` dosyasını oku.
2. Çalışan davranışları koru. DB şemasını değiştirme.
3. Hard-coded yol, parola ve ortam bağımlılıklarını merkezi configuration katmanına taşı.
4. `HKN.Personel.Native` içindeki büyük partial form dosyalarını sorumluluklarına göre ayır: UI, data access, dialogs, reports, domain helpers.
5. Firebird erişimini form kodundan çıkarıp repository/service katmanına taşı; ilk aşamada SQL davranışını değiştirme.
6. Shell/Bridge/Legacy Web kodunu `legacy` olarak açıkça ayır; aktif kod ile karıştırma.
7. Tek çözüm yapısı oluştur (`KYERP.PDKS.sln` veya `.slnx`).
8. Ortak build komutu ve `README` güncellemesi yap.
9. Derleme hatası bırakma. Var olan smoke testlerin mantığını koru.
10. UI için yalnız düzen/temizlik yap; kullanıcı akışlarını ve alan adlarını değiştirme.

## Kesin yapılmayacaklar

- `Hedef.exe` reverse engineering/patching yok.
- Lisans mekanizmasına müdahale yok.
- Canlı `DATABASE.GDB` üzerinde destructive migration yok.
- Personel kayıtlarını test için kalıcı değiştirme yok.
- Eski kodu topluca silme yok; önce kullanımını doğrula.

## İstenen çıktı

- Net proje/klasör yapısı.
- Build alan, okunabilir kaynak.
- Configuration/DB erişimi merkezileştirilmiş yapı.
- Refactor edilen dosyaların kısa özeti.
- Kalan teknik borç listesi.
- Bir sonraki geliştirme aşaması için önerilen 5-10 maddelik sıra.

Başlangıç noktası olarak çalışma dalı: `codex/kyerp-pdks-full-app-prep`.
