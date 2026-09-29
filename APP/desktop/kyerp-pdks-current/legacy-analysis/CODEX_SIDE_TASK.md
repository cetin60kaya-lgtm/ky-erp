# CODEX SIDE TASK — Hedef 5.0.29 Legacy Extraction

Bu görev ana geliştirmeden bağımsız yardımcı analiz işidir. Ana kaynak kodu değiştirme; sadece Hedef 5.0.29 söküm/analiz çıktısı üret.

## Ana çalışma merkezi
Paylaşılan proje/analiz/artifact merkezi:
`D:\GoogleDrive\KYERP-MERKEZ`

Legacy söküm çıktısını buraya yaz:
`D:\GoogleDrive\KYERP-MERKEZ\PDKS\02-LEGACY-ANALYSIS\Hedef-5.0.29`

GitHub kaynak kodu canonical kalır. `.git` klasörünü Google Drive içine kopyalama veya taşıma. Ana repo kaynak kodunu değiştirme.

## Kaynak
`D:\Hedef500\Hedef500\Hedef.exe` ve yanındaki `Report`, `Library`, `Terminal Bilgi Aktar`, `Temp`, `Yardim`, `Yedek`, `Data` klasörleri.

## Kesin kurallar
- `D:\Hedef500\Hedef500` içindeki hiçbir dosyayı silme/değiştirme.
- `Temp` klasörünü ve 0 KB olabilen `Terminal Bilgi Aktar\timerecords.txt` dosyasını normal runtime parçası kabul et.
- Hedef.exe'yi patchleme, çalışırken memory yazma, lisans/aktivasyonla oynama.
- Canlı `DATABASE.GDB` üzerinde INSERT/UPDATE/DELETE yapma; yalnız read-only şema incelemesi yap.
- KYERP `src/` altında kod değiştirme.
- Çıktı ve extractor scriptlerini yalnız `D:\GoogleDrive\KYERP-MERKEZ\PDKS\02-LEGACY-ANALYSIS\Hedef-5.0.29` altında üret.

## Çıktılar
Aşağıdakileri eksiksiz üret:
1. `FORMS.csv` — form/class adı, caption, yaklaşık boyut, bulunan kontrol/caption ipuçları.
2. `FORMS_DETAILED.json` — form/component hiyerarşisi, component type/name/caption/Left/Top/Width/Height ve bulunabilen event isimleri.
3. `COMPONENTS.csv` — bütün çıkarılabilen VCL componentleri.
4. `MENUS.md` — ana menü ve bütün alt menü ağacı.
5. `TOOLBAR.md` — toolbar sırası, captionlar, mümkünse resource/icon eşleşmeleri.
6. `REPORTS.csv` — bütün `.fr3` dosyaları, boyut, olası bağlı modül.
7. `DATABASE_SCHEMA.md` — read-only tablo/alan/ilişki özeti.
8. `RUNTIME_FILES.md` — Data/Temp/Terminal/Library/Yardim/Yedek görevleri ve korunacak dosyalar.
9. `FORM_TO_MODULE.md` — form class ↔ kullanıcı modülü eşleşmesi.
10. `EXTRACTION_NOTES.md` — TPF0/Delphi form resource bulguları ve güvenilirlik notları.
11. `UNRESOLVED.md` — çözülemeyen/sadece native code içinde kalan noktalar.
12. `forms\` — çıkarılabilen her Delphi form resource'unu form bazlı ayrı dosya olarak sakla.
13. `tools\` — otomatik extractor scriptleri.

## Öncelik
Önce şu modülleri bitir: Grup, Bölüm, Dönem, Personel, Giriş-Çıkış, Avans, İzin, Puantaj, Puantaj Sonuçları, Bordro, Terminal Veri Transferi, Çalışma Tarihi, Raporlar, Kullanıcı/Giriş.

## Bitiş kriteri
Ana uygulamayı tahminle yeniden tasarlamaya gerek bırakmayacak kadar net ekran/form envanteri üret. Son raporda toplam bulunan form sayısı, detaylı çıkarılan form sayısı, rapor sayısı ve çözülemeyen noktaları sayısal olarak özetle. KYERP kaynak kodunu değiştirme.