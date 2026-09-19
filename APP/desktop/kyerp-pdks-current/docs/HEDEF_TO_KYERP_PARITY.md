# Hedef → KYERP işlev paritesi

Hedef yalnız işlev/veri davranışı referansıdır. Aşağıdaki karşılıklar mevcut KYERP masaüstü düzenine yerleştirilir; Hedef görünümü kopyalanmaz.

| Hedef işlevi | KYERP karşılığı | Durum | Modül | Veri / API | Test kriteri |
|---|---|---|---|---|---|
| Personel kartı ve özlük | Mevcut Personel Bilgileri penceresi | VAR | Personel | `KIMLIK`, tanım tabloları | Listele/ekle/değiştir; UI düzeni korunur |
| İşe giriş/çıkış | Personel kartı işlemleri | VAR | Personel | `KIMLIK.IGTARIH/ICTARIH` | Tarih doğrulama ve aktif liste |
| Manuel giriş/çıkış | Giriş ve Çıkışları sekmesi/dialogu | VAR | Giriş-Çıkış | `GIRCIK` | CRUD + geceye taşan vardiya |
| İzin girişi | İzinler sekmesi/dialogu | VAR | İzin | `OZELIZIN` | Tekli/toplu CRUD, süre doğrulama |
| Kazanç/kesinti/avans | Ek Kazanç ve Kesintiler | YARIM | Finans | `AVANS` | Tür ve taksit semantiği ayrı doğrulanır |
| Puantaj hesaplama | Bilgi sekmesi + hesap çekirdeği | YARIM | Puantaj | `PUANTAJ`, `DONEM` | Canlı iş kurallarıyla dönem hesapla ve toplamları doğrula |
| Bordro | Ödemeler + Kişisel Bordro | YARIM | Bordro | `PUANTAJ`, `ODEME`, `KIMLIK` | Net/mesai/kesinti hesapları + batch/kapanış |
| Maaş/mesai ödemesi | Maaş ve Mesai Ödemesi dialogu | VAR | Ödeme | `ODEME` | Transaction tabanlı dönemsel upsert ve geri okuma |
| Organizasyon tanımları | Organizasyon Tanımları ekranı | YARIM | Tanımlar | `GRUP/BOLUM/SERVIS/GOREV/DURUM/FIRMA` | CRUD var; tüm çapraz tablo referanslarında güvenli silme doğrulanmalı |
| Dönem oluşturma/kapatma | Dönem Tanımları | YARIM | Dönem | `DONEM` | Oluştur/düzenle var; kapatma kuralı/kolonu doğrulanmalı |
| Terminal yönetimi | Terminal Aktarım Profilleri | VAR | Terminal | KYERP config JSON store; canonical TNF preset | Alan bazlı düzenle/kopyala/default/preview/import/export |
| Terminal kayıt aktarımı | Desktop File/TNF import | YARIM | Terminal | Profile-driven File/TNF adapter + transaction `GIRCIK` import tamam; fiziksel cihaz adapterı bekliyor | İdempotent aktarım ve tekrar koruması |
| TNF import/export | KYERP içe/dışa aktar | VAR | Terminal | Strict canonical TNF v1 ve korumalı preset | Geçerli/geçersiz dosya ve duplicate testi |
| Günlük gelen/gelmeyen | Günlük Operasyon | VAR | Günlük Operasyon | personel + `GIRCIK` roster karşılaştırması | Bugün gelen/kayıp/açık kayıt listeleri |
| Gece/gündüz vardiya | Vardiya operasyonu | YARIM | Günlük Operasyon | `GIRCIK` + vardiya tanımı | Gece yarısı sınır testi + vardiya masterı |
| Kişisel raporlar | Raporlar menüsü | YARIM | Raporlar | mevcut tablolar | Print preview ve veri kapsamı |
| PDF/Excel çıktısı | KYERP çıktı komutları | VAR | Raporlar | ortak `ReportTable` exporter | PDF/XLSX dosyası ve Türkçe karakter |
| Çoklu firma/yetki | Session context | YARIM | Yönetim | tenant/company/workplace | Uygulama genelinde firma dışı erişim reddi |
| Web senkron | Desktop sync/outbox | YARIM | Senkron | Bearer push/pull client + retry outbox + auth-enjeksiyonlu Worker contract; canonical auth bağlantısı bekliyor | offline enqueue, idempotent push/pull |

Bu matris uygulama ilerledikçe `VAR` durumuna çevrilmeden önce ilgili build ve smoke kanıtı alınır.
