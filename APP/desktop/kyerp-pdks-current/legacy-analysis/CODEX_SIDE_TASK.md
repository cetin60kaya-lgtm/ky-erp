# CODEX SIDE TASK — Hedef 5.0.29 Legacy Extraction

Bu görev ana geliştirmeden bağımsız yardımcı analiz işidir. Ana kaynak kodu değiştirme; yalnız `legacy-analysis/` altında çıktı üret.

## Amaç
`D:\Hedef500\Hedef500\Hedef.exe` ve yanındaki `Report`, `Library`, `Terminal Bilgi Aktar`, `Temp`, `Yardim` klasörlerini statik olarak inceleyip KYERP PDKS için bire bir legacy ekran kataloğu çıkarmak.

## Kesin kurallar
- `D:\Hedef500\Hedef500` içindeki hiçbir dosyayı silme/değiştirme.
- `Temp` klasörünü ve 0 KB olabilen `Terminal Bilgi Aktar\timerecords.txt` dosyasını normal runtime parçası kabul et.
- Hedef.exe'yi patchleme, çalışırken memory yazma, lisans/aktivasyonla oynama.
- Canlı `DATABASE.GDB` üzerinde yazma işlemi yapma.
- Ana `src/` altında kod değiştirme; yalnız analiz raporu ve extractor scriptleri oluştur.

## Çıktılar
`legacy-analysis/Hedef-5.0.29/` altında:
1. `FORMS.csv` — form/class adı, caption, yaklaşık boyut, bulunan kontrol/caption ipuçları.
2. `MENUS.md` — ana menü ve alt menü ağacı.
3. `TOOLBAR.md` — toolbar sırası ve captionlar.
4. `REPORTS.csv` — tüm `.fr3` dosyaları, boyut, olası bağlı modül.
5. `RUNTIME_FILES.md` — Data/Temp/Terminal/Library/Yardim/Yedek görevleri ve korunacak dosyalar.
6. `FORM_TO_MODULE.md` — TPersonelF, dönem, grup, bölüm, puantaj, bordro, avans, izin, terminal, çalışma tarihi vb. eşleşmesi.
7. `EXTRACTION_NOTES.md` — TPF0/Delphi form resource bulguları ve hangi kısımların güvenilir çıkarılabildiği.

## Öncelik
Önce şu modülleri bitir: Grup, Bölüm, Dönem, Personel, Giriş-Çıkış, Avans, Puantaj, Puantaj Sonuçları, Bordro, Terminal Veri Transferi, Çalışma Tarihi.

## Bitiş kriteri
Ana uygulamayı tahminle yeniden tasarlamaya gerek bırakmayacak kadar net bir ekran/form envanteri ve dosya eşleme raporu üret. Kod değişikliği yapma; sadece analiz çıktısını commit et.