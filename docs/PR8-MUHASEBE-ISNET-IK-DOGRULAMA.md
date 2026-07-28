# PR #8 — Muhasebe, İşNet ve İK Doğrulama Kapsamı

Bu dalda kalıcı CI aşağıdaki zinciri her değişiklikte doğrular:

- Frontend production build
- Muhasebe, İşNet ve İK ekranları için genişletilmiş ESLint
- 15 Muhasebe, 5 İşNet ve 10 İK görünür sekmesinin menü, rota ve render bağlantıları
- Kritik frontend API ile backend controller eşleşmeleri
- Prisma Client üretimi
- NestJS backend build
- İşNet ve Muhasebe davranış testleri
- İK aylık ve günlük davranış testleri

## İK aylık güvenlik kuralları

- Personel bazında 225 veya 300 saat mesai tabanı
- Hafta içi mesai katsayısı 1,5
- Hafta sonu ve resmî tatil katsayısı 2
- SGK'lı personelde banka ve elden ödeme ayrımı
- SGK'sız personelde banka tutarının sıfır, ödemenin tamamının elden olması
- Maaş, yol, mesai, prim, izin, avans ve kesintilerin bordro taslağında birlikte gösterilmesi

## İşNet güvenlik sınırı

Gerçek İşNet portalında resmî irsaliye veya fatura gönderimi kullanıcı onayı olmadan yapılmaz. Canlı portal testi tamamlanmadan PR taslak durumda kalır ve main dalına birleştirilmez.
