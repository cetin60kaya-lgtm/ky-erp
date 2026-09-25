# Hedef 5.0.29 -> KYERP PDKS Envanter ve Runtime Parity Audit

Tarih: 2026-09-20

## Kaynak envanteri

| Envanter | Sayı | Kaynak | Durum |
|---|---:|---|---|
| Bulunan form/resource | 123 | `05_MODULLER/PDKS/01_HEDEF_SOKUM/Hedef-5.0.29/SUMMARY.md` | Statik envanter tamamlandı |
| Ayrıntılı parse edilen form | 121 | `FORMS.csv`, `FORMS_DETAILED.json`, `forms/` | Statik envanter tamamlandı |
| Çözülemeyen resource | 2 | `UNRESOLVED.md` | Kaynakta açık |
| TPageControl altındaki TabSheet | 72 | `TABS.md` | Statik envanter tamamlandı |
| TMenuItem | 280 | `MENUS.md` | Statik envanter tamamlandı |
| Toolbar/resource öğesi | 183 | `TOOLBAR.md` | Statik envanter tamamlandı |
| Bileşen | 4.713 | `COMPONENTS.csv` | Statik envanter tamamlandı |
| FR3 rapor şablonu | 56 | `REPORTS.md`, `reports/` | Statik envanter tamamlandı |

Bu sayılar legacy kaynağın çıkarılma kapsamını gösterir. 121 formun tamamının KYERP runtime'ında birebir yeniden uygulandığı anlamına gelmez.

## Runtime parity kanıtı

| Dilim | Kanıt | Sonuç |
|---|---|---|
| Ana shell | Menü ve toolbar sırası, gizli WC kaynağı | ShellSmokeTest geçti |
| Tanımlar / dönem | Legacy ölçüler, tab sırası ve varsayılan Bordro tabı | ShellSmokeTest geçti |
| Personel | 940x731 dialog, 6 üst tab, kişisel alanlar | ShellSmokeTest geçti |
| Giriş-çıkış / izin / avans | Legacy dialog ölçüleri ve CRUD | Shell + rollback Firebird smoke geçti |
| Puantaj | 689x504, 2 tab; günlük transactional PUANTAJ üretimi | Contract + shell + rollback Firebird smoke geçti |
| Bordro | 616x496, 3 tab, 10 alan genişliği, print/PDF/XLSX | Contract + shell + Firebird toplam sorgusu geçti |
| Terminal transfer | 409x553, legacy kontroller, 5 dakika tolerans | Contract + shell + rollback Firebird smoke geçti |
| Operasyon raporları | 5 ayrı menü hedefi ve 5 Firebird sorgusu | Shell + Firebird query smoke geçti |

## Açık parity alanları

- `YUVARLA` ve `PUANBILGI` içindeki kesin yuvarlama/ceza katsayıları günlük Puantaj hesabına uygulanmadı.
- Dönem kapatma ve muhasebe/bordro transfer semantiği doğrulanmadı.
- Fiziksel terminal protokol adapterı yok; dosya/TNF ve harici program başlatma akışı var.
- 56 FR3 şablonu envanterlendi; FastReport motoruyla piksel/şablon birebir render edilmedi.
- 121 parse edilen legacy formun tamamı ayrı KYERP form sınıfı olarak port edilmedi. Ana kullanıcı iş akışları native shell içinde karşılandı; tam form-by-form implementation parity iddiası yoktur.
- İki çözülemeyen legacy resource için statik kaynak kanıtı bulunmuyor.

## 2026-09-20 doğrulama sonucu

- `dotnet build KYERP.PDKS.sln -c Release`: 0 warning, 0 error.
- ContractTests: 22/22 PASS.
- ShellSmokeTest: `KYERP PDKS LEGACY SHELL PARITY OK`.
- Firebird SmokeTest: `FINAL_RESULT=PASS`.
- Firebird önce/sonra: aktif 10, toplam 55, test kalıntısı 0.
- Publish, setup, push, deploy ve migration çalıştırılmadı.

## İlgili commitler

- `cdec4f0` - günlük Puantaj hesaplama ve transactional upsert.
- `fd33a70` - toplu Bordro, yazdırma, PDF/XLSX ve kağıt ayarları.
- `7dbbaee` - legacy Terminal Transfer ve toleranslı import.
- `1729817` - doğrudan operasyon raporları.