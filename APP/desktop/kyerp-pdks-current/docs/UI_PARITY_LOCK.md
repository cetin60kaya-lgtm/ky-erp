# KYERP PDKS UI / Workflow Parity Lock

Bu belge ürün kararıdır.

## Ana karar

**Kalıcı ürün referansı KYERP'dir. Hedef değildir.**

Mevcut KYERP masaüstü düzeni yeniden yapılmayacak, Hedef görünümüne çevrilmeyecek ve başka bir UX ile değiştirilmeyecektir.

Hedef uygulaması yalnızca şu alanlarda fonksiyonel referanstır:
- menü/işlev envanteri,
- işlem sıraları ve iş kuralları,
- raporlar,
- Firebird veri alanları ve veri davranışı,
- terminal/PDKS süreçleri,
- KYERP'de unutulmaması gereken eski fonksiyonlar.

Hedef'te olup KYERP'de bulunmayan bir işlev tespit edilirse, Hedef ekranı bire bir kopyalanmaz. İşlev **mevcut KYERP masaüstü düzenine** ve ilgili KYERP.NET tasarım/işleyiş kurallarına uyarlanarak eklenir.

## Masaüstü referansı

Korunacak ana yapı mevcut KYERP masaüstüdür:

- mevcut ana pencere yapısı,
- mevcut üst menü ve toolbar yerleşimi,
- mevcut ikon/komut sırası,
- mevcut çalışma alanı,
- mevcut durum/alt alan yapısı,
- mevcut child/modal pencere davranışı,
- mevcut Personel ve diğer modül ekranlarının yerleşimi.

Mevcut KYERP Personel ekranı ve diğer aktif KYERP ekranları ürün referansıdır. Bu ekranlar Hedef'e benzetilmez ve yeniden tasarlanmaz.

## Hedef → KYERP işlev paritesi

Her Hedef özelliği için aşağıdaki karşılık izlenir:

| Hedef işlevi | KYERP Desktop | KYERP.NET | Durum |
|---|---|---|---|
| Menü/toolbar işlevi | mevcut KYERP düzenine eklenmiş karşılık | web karşılığı | eksik/tamam |
| Form/dialog işlevi | KYERP masaüstü akışında karşılık | web eşdeğeri | eksik/tamam |
| DB işlemi | service/repository | API/domain | eksik/tamam |
| Rapor | desktop çıktı | web rapor/çıktı | eksik/tamam |
| Yetki | KYERP oturumu | KYERP oturumu | eksik/tamam |

Bir Hedef işlevinin karşılığı tamamlanmadan fonksiyonel parity tamamlandı sayılmaz.

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

- KYERP masaüstünü yeniden tasarlamak,
- KYERP'yi Hedef görünümüne çevirmek,
- Hedef ekranını doğrudan kopyalamak,
- yeni dashboard/sidebar/card düzeni üretmek,
- mevcut KYERP ekranlarını birleştirmek veya sadeleştirmek,
- mevcut KYERP alan, sekme, buton veya menülerini kullanıcı onayı olmadan kaldırmak,
- web tasarımını masaüstüne kopyalamak,
- Hedef'i ürün tasarım kaynağı kabul etmek.

## Multi-company kuralı

Görünüm mevcut KYERP olarak kalırken altyapı tek firmaya bağlı olmayacaktır. Aktif oturum bir `tenant/company/workplace` bağlamı taşır. Firma bilgisi, cihaz, DB yolu, çalışma kuralları veya kullanıcı kod içinde sabitlenmez.

## Desktop / Web senkron kuralı

Masaüstü ve KYERP.NET aynı PDKS domain sözleşmelerini ve işlev haritasını kullanır. Masaüstü terminal ve offline/cache görevlerini yürütür; KYERP.NET merkezi yönetim ve web kullanımını sağlar. Her istemci kendi mevcut KYERP tasarım dilini korur.

## Kabul kriteri

Bir refactor sonrası:

- mevcut KYERP masaüstü görünümü ve akışı bozulmamalı,
- mevcut KYERP işlevleri kaybolmamalı,
- Hedef'te bulunan eksik işlevler liste halinde izlenmeli,
- eklenen Hedef işlevleri KYERP düzenine uyarlanmalı,
- kullanıcı yeni bir masaüstü uygulaması öğrenmek zorunda kalmamalıdır.

Bunlardan biri ihlal edilirse değişiklik açık kullanıcı onayı olmadan kabul edilmez.
