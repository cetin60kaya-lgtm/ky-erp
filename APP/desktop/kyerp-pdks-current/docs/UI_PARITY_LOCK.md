# KYERP PDKS UI / Workflow Parity Lock

Bu belge ürün kararıdır.

## Ana karar

KYERP PDKS masaüstü uygulaması mevcut KY PDKS/Hedef tabanlı masaüstü düzeninin **yeniden tasarlanmış versiyonu olmayacaktır**. Mevcut masaüstü görünümü, menü yapısı, form mantığı ve kullanıcı akışı bire bir ürün referansıdır.

Kod altyapısı yeniden düzenlenebilir; kullanıcıya görünen masaüstü yeniden icat edilmez.

## Ana ekran referansı

Korunacak ana yapı:

- klasik Windows masaüstü ana pencere,
- üst menü: Ayarlar / Tanımlar / İşlemler / Raporlar / Araçlar / Transfer ve mevcut diğer girişler,
- ikonlu toolbar,
- mevcut toolbar sırası ve modül geçişleri,
- geniş çalışma alanı,
- alt durum çubuğu,
- klasik child/modal pencere davranışı.

Toolbar işlevleri mevcut üründeki sıra ve işlevleriyle korunur. Örnek mevcut girişler:

1. Bilgi Aktar
2. Gruplar
3. Dönemler
4. Bölümler
5. Giriş-Çıkışlar
6. Per. Bilgileri
7. Avanslar
8. Puantaj
9. Puantaj Son.
10. Bordro
11. Çalışma Tarihi

Kaynak/legacy uygulamada bulunan başka menü/toolbar işlemleri de envanterlenip parity checklist'e eklenir; atlanmaz.

## Personel Bilgileri referansı

Personel ekranı mevcut klasik yerleşimiyle korunur:

- sol tarafta personel listesi/grid,
- üst/sağ tarafta seçili personel temel bilgileri ve foto alanı,
- ana sekmeler:
  - Personel Bilgileri
  - Giriş ve Çıkışları
  - İzinler
  - Ek Kazanç ve Kesintiler
  - Bilgi
  - Ödemeler
- Personel Bilgileri içindeki Kimlik Bilgileri / Kişisel Bilgileri gibi alt sekmeler,
- alt bölümde Yeni Ekle / Değiştir / Sil / Per. Bilgisi ve mevcut diğer işlemler,
- arama ve sıralama alanları,
- aktif/ayrılan/toplam/listelenen personel sayaçları.

Bu ekran dashboard, kart, sidebar veya yeni bir master-detail UX tasarımına dönüştürülmez.

## İşlevsel parite

Her legacy özellik için üç karşılık izlenir:

| Legacy işlev | Desktop KYERP PDKS | KYERP.NET PDKS |
|---|---|---|
| Menü/toolbar | bire bir görünür karşılık | web karşılığı |
| Form/dialog | aynı masaüstü akışı | web eşdeğeri |
| DB işlemi | service/repository | API/domain |
| Rapor | desktop çıktı | web rapor/çıktı |
| Yetki | KYERP oturumu | KYERP oturumu |

Bir legacy işlevin karşılığı tamamlanmadan parity tamamlandı sayılmaz.

## Serbest olan değişiklikler

Kullanıcıya görünmeyen alanlarda:

- solution/proje ayrımı,
- service/repository/data katmanı,
- configuration,
- logging,
- auth/sync,
- multi-tenant company context,
- test altyapısı,
- build/installer,
- API kontratları

yeniden düzenlenebilir.

## Yasaklar

- masaüstünü yeniden tasarlamak,
- modern dashboard yapmak,
- sidebar navigasyona geçirmek,
- formları birleştirmek veya sadeleştirmek,
- alan, sekme, buton veya menü kaldırmak,
- mevcut işlem sırasını değiştirmek,
- web tasarımını masaüstüne kopyalamak,
- 'daha modern' gerekçesiyle görünümü değiştirmek.

## Multi-company kuralı

Görünüm aynı kalırken altyapı tek firmaya bağlı olmayacaktır. Aktif oturum bir `tenant/company/workplace` bağlamı taşır. Firma bilgisi, cihaz, DB yolu, çalışma kuralları veya kullanıcı kod içinde sabitlenmez.

## Desktop / Web senkron kuralı

Masaüstü ve KYERP.NET aynı PDKS domain sözleşmelerini kullanır. Masaüstü terminal ve offline/cache görevlerini yürütür; KYERP.NET merkezi yönetim ve web kullanımını sağlar. İki taraf aynı işlev haritasını paylaşır fakat **masaüstü görünümü web'e dönüştürülmez**.

## Kabul kriteri

Bir refactor sonrası kullanıcı mevcut masaüstünü açtığında:

- aynı menüyü aynı yerde bulmalı,
- aynı toolbar işlemine aynı yerden ulaşmalı,
- aynı formu aynı düzende görmeli,
- aynı alt ekran/dialog/sekme sırasını kullanmalı,
- aynı işlev sonucunu almalıdır.

Bunlardan biri değişirse değişiklik açık kullanıcı onayı olmadan kabul edilmez.
