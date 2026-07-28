# PR #8 — Muhasebe, İşNet ve İK Doğrulama Sonucu

## Nihai otomatik kontrol

- Frontend production build: başarılı
- Muhasebe, İşNet ve İK genişletilmiş ESLint: başarılı
- Sekme, rota, render, API ve controller denetimi: 76/76 başarılı
- Prisma Client üretimi: başarılı
- NestJS backend build: başarılı
- İşNet ve Muhasebe davranış testleri: 48/48 başarılı
- İK aylık ve günlük davranış testleri: 7/7 başarılı

## Denetlenen görünür ekranlar

### Muhasebe — 15 sekme

1. Yönetim Özeti
2. Firma Kartları
3. Firma Yetkilileri
4. Envanter ve Ürünler
5. Gider Kategorileri
6. Tedarikçi Faturaları
7. Kesilen Faturalar
8. İrsaliye–Fatura Kontrolü
9. Cari Hareketler
10. Çek ve Ödeme
11. Mail ve Ekstre
12. Kâr–Zarar
13. KDV Kontrolü
14. Muhasebe Raporları
15. Mail Şablonları

### İşNet — 5 ana sekme

1. Yönetim Merkezi
2. Belge Merkezi
3. İrsaliye ve Fatura İş Akışı
4. Arşiv ve Gönderim
5. Ayarlar ve Bağlantı

Fatura önizleme ve kontrollü gönderim için kullanılan gizli işlem rotası da denetlenmiştir. İş Akışı sekmesi nihai `IsnetWorkflowFinalPage` ekranına bağlıdır; eski ara ekran kaldırılmıştır.

### İK — 10 sekme

1. İK Özeti
2. Personel Kartları
3. Mesai, Avans ve Kesinti
4. Puantaj ve İzin
5. Bordro ve Ödeme
6. SGK ve Evrak Kontrolü
7. Günlük Personel
8. Günlük Personel Kartları
9. İK Raporları
10. Günlük Ödeme Fişleri

## İK aylık güvenlik kuralları

- Personel bazında 225 veya 300 saat mesai tabanı
- Hafta içi mesai katsayısı 1,5
- Hafta sonu ve resmî tatil katsayısı 2
- SGK'lı personelde banka ve elden ödeme ayrımı
- SGK'sız personelde banka tutarının sıfır, ödemenin tamamının elden olması
- Maaş, yol, mesai, prim, izin, avans ve kesintilerin bordro taslağında birlikte gösterilmesi

## İşNet güvenlik sınırı

Kod, rota, build ve otomatik davranış testleri doğrulanmıştır. Gerçek İşNet hesabında canlı giden irsaliye veya resmî fatura gönderimi yapılmamıştır. Gerçek sabit taşıyıcı bilgileri, test-numunesi muafiyet kodu ve TAHA 125 kişi kayıtları yerel kayıt merkezine girilip canlı portal geri okuması doğrulanmadan PR taslak durumda kalır ve `main` dalına birleştirilmez.
