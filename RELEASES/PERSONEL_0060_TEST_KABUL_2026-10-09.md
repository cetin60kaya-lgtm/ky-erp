# KY ERP Personel Portalı — Kabul Kontrolü (09.10.2026)

Durum: QA / Ön test. PR #405. Bu dosya yayın tetiklemez.

## Otomatik testler
- Frontend lint, test, build ve Worker typecheck, test, build.
- Komut: cd APP/cloud/ky-erp-api && python3 scripts/employee-portal-sandbox-smoke.py
- İzole SQLite 0060 DDL: 4 tablo, firma izolasyonu, hesap/cihaz ayrı onay, cihaz iptali, nonce tekrar koruması, onaycı yetkisi ve tek üretim/model bağlantısı.

## Gerçek cihaz ve canlı-öncesi kabul
1. Firma admini yalnız kendi İK Aylık personelini açabilmeli.
2. Cihaz onayı tek başına, hesap onayı tek başına personel bilgilerini göstermemeli.
3. İki onay sonrası PDKS saatleri ve yıllık izin ana İK kayıtlarıyla aynı olmalı.
4. Yeni telefon veya işyeri bilgisayarında ayrı cihaz onayı istenmeli.
5. Hesap pasifleştirme ve cihaz iptali imzalı isteklere engel olmalı.
6. Firma B personeli firma A bilgilerini, makinesini, modelini görememeli.
7. Makinacı kayıt testi: mevcut ortak model, makine, vardiya, sağlam/sakat, tek üretim bağlantısı; aynı requestId ile ikinci adet yazılmamalı.
8. Muhasebe, bordro, maaş, avans, yönetim erişimi PERSONNEL için 403.
9. Cihaz onay yetkisi verilip geri alınabilmeli.
10. KY Güvenlik, MFA ve mevcut üretim/boyahane akışı bozulmamalı.
11. Android Chrome, gerçek telefon ve işyeri PC testleri ayrıca kanıtlanmalı.

## Production kapısı
- Önce Github CI yeşil, izole veritabanı testi başarılı.
- Canlı D1 ön koşulları sadece-okuma sorguyla doğrulanacak.
- Canlı D1 tam SQL yedeği alınacak ve Actions artifact olarak saklanacak.
- 0060 yalnız eklemeli migration, ondan sonra Worker ve Pages kontrollü yayın.
- Gerçek cihaz / kullanıcı testlerinin kanıtı yoksa canlı hazır raporu yazılmayacak.
- Yayın özel RELEASES manifesti olmadan tetiklenmeyecek. D1 silme veya sıfırlama YASAK.
