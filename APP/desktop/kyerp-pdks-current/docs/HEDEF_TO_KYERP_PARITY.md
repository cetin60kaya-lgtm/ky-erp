# Hedef → KYERP işlev paritesi

Hedef yalnız işlev/veri davranışı referansıdır. Aşağıdaki karşılıklar mevcut KYERP masaüstü düzenine yerleştirilir; Hedef görünümü kopyalanmaz.

| Hedef işlevi | KYERP karşılığı | Durum | Modül | Veri / API | Test kriteri |
|---|---|---|---|---|---|
| Personel kartı ve özlük | Mevcut Personel Bilgileri penceresi | VAR | Personel | `KIMLIK`, tanım tabloları | Listele/ekle/değiştir; UI düzeni korunur |
| İşe giriş/çıkış | Personel kartı işlemleri | VAR | Personel | `KIMLIK.IGTARIH/ICTARIH` | Tarih doğrulama ve aktif liste |
| Manuel giriş/çıkış | Giriş ve Çıkışları sekmesi/dialogu | VAR | Giriş-Çıkış | `GIRCIK` | CRUD + geceye taşan vardiya |
| İzin girişi | İzinler sekmesi/dialogu | VAR | İzin | `OZELIZIN` | Tekli/toplu CRUD, süre doğrulama |
| Kazanç/kesinti/avans | Ek Kazanç ve Kesintiler | YARIM | Finans | `AVANS` | Tür ve taksit semantiği ayrı doğrulanır |
| Puantaj hesaplama | Bilgi sekmesi | YARIM | Puantaj | `PUANTAJ`, `DONEM` | Dönem hesapla ve toplamları doğrula |
| Bordro | Ödemeler + Kişisel Bordro | YARIM | Bordro | `PUANTAJ`, `ODEME`, `KIMLIK` | Net/mesai/kesinti hesapları |
| Maaş/mesai ödemesi | Maaş ve Mesai Ödemesi dialogu | VAR | Ödeme | `ODEME` | Dönemsel upsert ve geri okuma |
| Organizasyon tanımları | Personel filtreleri/alanları | YARIM | Tanımlar | `GRUP/BOLUM/SERVIS/GOREV/DURUM/FIRMA` | CRUD ve kullanımda referans bütünlüğü |
| Dönem oluşturma/kapatma | Dönem seçimleri | YARIM | Dönem | `DONEM` | Oluştur/kapat, kapalı döneme kontrollü yazma |
| Terminal yönetimi | KYERP terminal ekranı | YOK | Terminal | terminal/device sözleşmesi | Cihaz ekle, bağlan, son durum |
| Terminal kayıt aktarımı | Desktop agent/import | YARIM | Terminal | Profile-driven File adapter + transaction `GIRCIK` import tamam; fiziksel cihaz adapterı bekliyor | İdempotent aktarım ve tekrar koruması |
| TNF import/export | KYERP içe/dışa aktar | VAR | Terminal | Strict canonical TNF v1 ve korumalı preset | Geçerli/geçersiz dosya ve duplicate testi |
| Günlük gelen/gelmeyen | Günlük Operasyon | YOK | Günlük Operasyon | personel + vardiya + attendance | Bugün gelen/geç/kayıp listeleri |
| Gece/gündüz vardiya | Vardiya operasyonu | YARIM | Günlük Operasyon | `GIRCIK` + vardiya tanımı | Gece yarısı sınır testi |
| Kişisel raporlar | Raporlar menüsü | YARIM | Raporlar | mevcut tablolar | Print preview ve veri kapsamı |
| PDF/Excel çıktısı | KYERP çıktı komutları | YOK | Raporlar | rapor DTO | PDF/Excel dosyası ve Türkçe karakter |
| Çoklu firma/yetki | Session context | YARIM | Yönetim | tenant/company/workplace | Firma dışı erişim reddi |
| Web senkron | Desktop sync/outbox | YARIM | Senkron | Tenant kapsamlı envelope + dosya outbox hazır; HTTP contract bekliyor | offline enqueue, idempotent push/pull |

Bu matris uygulama ilerledikçe `VAR` durumuna çevrilmeden önce ilgili build ve smoke kanıtı alınır.
