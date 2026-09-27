# ACCEPTANCE TESTS

Yeni sohbet işi bitmiş saymadan aşağıdakilerin hepsini gerçek sistemde doğrulasın.

## Desktop
- Release build: 0 error / 0 warning.
- Contract, Smoke, ShellSmoke, UiAudit ve V4ShellSmoke geçmeli.
- FDB açılıp 58 kişi ve DATA_STATE.md sayımları görülmeli.
- Manuel E işleminde GTUR/CTUR=`E`, dakika alanı ve audit birlikte değişmeli.
- Yedek/geri yükleme çalışmalı.

## Terminal
- Bağlantı testi, cihaz ID, saat oku/yaz, sayaçlar çalışmalı.
- Manuel `Eşitle` ve saatli otomatik Eşitle aynı servisi kullanmalı.
- `Eşitle`: cihaz -> live.dat -> TNF -> FDB -> doğrula -> cihaz sil -> Cloud.
- Herhangi bir hata simülasyonunda cihazdaki kayıt silinmemeli.
- `Canlıyı Temizle` FDB/TNF'yi etkilememeli.

## Offline
- İnternet kapatılıp Desktop yeniden açılmalı.
- Personel, giriş/çıkış, puantaj, bordro, rapor ve terminal yerelde çalışmalı.
- Offline işlemler Outbox'ta birikmeli.
- İnternet gelince kuyruk otomatik boşalmalı ve iki taraf aynı versiyona gelmeli.

## Web / Android tablet
- Web PDKS desktop ile aynı personel/sayıları göstermeli.
- Webden yapılan izin/personel yetkili değişikliği desktop'a inmeli.
- Web `Eşitle` işi ana Desktop Agent'e gitmeli; web fiziksel terminale doğrudan bağlanmamalı.
- Son eşitleme: zaman, kayıt sayısı, cihaz/agent ve başarı/hata gösterilmeli.

## Final
- Görseller ile son UI karşılaştırılsın.
- Repo clean olmalı (yalnız bilinçli local/private dosyalar hariç).
- Final build paketi Drive'a konup SHA256 yazılmalı.