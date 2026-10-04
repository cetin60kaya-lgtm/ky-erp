# KY PDKS Desktop — Final Feature Set (2026-10-04)

Bu belge `pdks-desktop` branch'indeki son masaüstü PDKS işlev setini özetler.

## Günlük operasyon

- Canlı Denetim
- İstisna Merkezi
  - eksik çıkış
  - geç giriş
  - erken çıkış
  - devamsızlık
  - eksik çalışma
  - fazla mesai
  - izinli günde kart hareketi
- Devam Geçmişi
- Bölüm Devam Analizi
- Giriş / Çıkış düzeltme
- İzin / mazeret
- Günlük / aylık puantaj

## Muhasebe ve dönem kapanışı

- Kazanç / kesinti / avans
- Genel bordro
- Aylık düzeltme / hızlı ödeme
- Dönem Kontrol Merkezi
  - eksik hareket
  - puantaj hazır
  - bordro var
  - ödeme var
  - kişi bazında kapanış durumu
- Ödeme kontrolü
- Maaş pusulası
- Mesai bordrosu

## Yeni kontrol raporları

- Giriş Çıkış • Eksik Hareketler
- Giriş Çıkış • Ara / Dışarı Süresi
- Puantaj • Uyuşmazlıklar
- Puantaj • İzinli Günde Hareket
- Puantaj • Tatil Çalışması
- Puantaj • Devam Özeti

## Yönetim görünümü

- Ana ekranda günlük eksik çıkış / geç / devamsız / mesai uyarıları
- Bölüm bazında devam ve mesai analizi
- Hızlı İşlemler: personel → kart/izin → istisna/puantaj → avans/kesinti → bordro/ödeme → dönem kontrol → veri/terminal

## Test modu

Geliştirme ve kabul testleri sırasında `KY_PDKS_SKIP_LOGIN=1` ile giriş ekranı atlanabilir. Normal kullanımda bu bayrak kapatılarak güvenli giriş tekrar devreye alınır.

## Zorunlu final denetim

1. Build: 0 error / 0 warning
2. FunctionAudit: tüm komutlar PASS
3. LiveUiWorkflowAudit: personel → kart → puantaj → bordro → ödeme → rapor → DB doğrulama PASS
4. UiAudit: yeni modüller dahil görsel yerleşim PASS
5. Publish edilen EXE ile masaüstündeki EXE SHA256 eşleşmeli
