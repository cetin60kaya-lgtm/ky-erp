# Codex başlangıç komutu

Bu repo içindeki `APP/desktop/kyerp-pdks-current` projesini ön düzenlemeye al.

Önce şu dosyaları sırayla oku:
1. `README.md`
2. `docs/ARCHITECTURE_TARGET.md`
3. `docs/CODEX_HANDOFF.md`
4. `legacy-runtime/MANIFEST.md`

Kurallar:
- Mevcut çalışan işlevleri değiştirme.
- Firebird DB şemasına destructive değişiklik yapma.
- `Hedef.exe` üzerinde patch/reverse engineering yapma.
- Lisans mekanizmasına dokunma.
- Aktif kaynak ile `legacy/` kaynaklarını net ayır.
- Önce çözüm/proje klasörlerini, configuration ve data-access katmanını düzenle.
- UI alan isimlerini ve kullanıcı akışını ilk aşamada koru.
- Her önemli adımda build al; build kırık bırakma.
- Smoke testlerin rollback mantığını koru.
- Hard-coded parola bırakma.

İstenen ilk teslim:
- temiz `KYERP.PDKS` solution yapısı,
- modüler klasör/proje düzeni,
- merkezi configuration,
- merkezi Firebird data katmanı,
- mevcut UI davranışı korunmuş build,
- yapılanlar/kalanlar raporu.

Çalışma dalı: `codex/kyerp-pdks-full-app-prep`.
