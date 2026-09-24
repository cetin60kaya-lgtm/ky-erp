# KY ERP Muhasebe / e-Belge Gece Kapanış Kaydı — 2026-09-25

## Repo ve güvenli geri dönüş noktası

- Yerel repo: `D:\KYERP\ky-erp`
- Çalışma dalı: `codex/muhasebe-ebelge-final-clean-20260924`
- GitHub üzerindeki son güvenli WIP commit: `e2ab39101efc00b77b90e68e3603db6910793cd7`
- Bu commitin ana ebeveyni: `6de1a8f6f524b479519fb76ee7bdf289f0b0d862`
- Ek güvenlik dalı: `backup/muhasebe-ebelge-wip-e2ab-20260925`

## Bilgisayar kapanmadan önce yerelde yapılan ama henüz GitHub'a commit/push edilmemiş işlemler

Aşağıdaki değişiklikler Desktop Commander üzerinden doğrudan dosyalara yazıldı. Bilgisayar kapandığı için son git commit/push yapılamadı; yarın önce `git status` ve `git diff` ile doğrulanacak.

- Model listesi tüketicileri eski `shared-list` kullanımından canonical model endpointlerine geçirilmeye başlandı.
- Nest tarafında `/model-takip/models/shared-list` uyumluluk yollarının gereksiz kısmı kaldırıldı; canonical model sahipliği sadeleştirildi.
- Desen tarafındaki eski `models-simple` yolu kaldırılmaya başlandı; tüketiciler ortak model kaynağına yönlendirildi.
- Muhasebe/e-Belge tarafında kullanılmayan eski ekranlar, eski servisler ve dead-code dosyaları temizlendi.
- Eski İşNet'e özel frontend servis yüzeyi küçültüldü; İşNet yalnız provider/entegrasyon rolüne çekildi.
- Muhasebe yönetim özetindeki e-Belge yönlendirmesi eski `isnet` modülü yerine `e-belge / belge-havuzu` canonical rotasına alındı.
- Muhasebe canlı durum polling'i 2 saniyeden daha kontrollü hale getirildi; hata türünü ayıracak durum modeli üzerinde düzenleme yapıldı.
- Firma/Cari ekranındaki geçmişten kalma rutin hard-delete toolbar CSS kalıntısı kaldırıldı.
- Kullanılmayan `muhasebeApi.js`, eski İşNet servisleri, eski Supplier/Reports ekranları ve ilişkili CSS/yardımcı dosyalarının önemli bölümü kaldırıldı.

## Son doğrulanan testler

- Frontend production build: **başarılı** (`vite build`).
- Muhasebe/e-Belge hedef contract testleri: **5/5 başarılı**.
- Backend Nest build denemesi kod hatasıyla değil, yerel ortamda `nest` komutu bulunmadığı için çalıştırılamadı. Yarın bağımlılık/CLI ile tekrar doğrulanacak.

## Kritik bulgu

Cloud Worker tarafındaki `APP/cloud/ky-erp-api/src/index.ts` içinde `/api/models` endpointi şu an model kartlarını değil `products` tablosunu okuyup ürünleri model gibi döndürüyor. Bu durum model/desen/imalat/boyahane bağlarını yanlış veri kaynağına yöneltebilir.

Bu endpoint körlemesine kullanılmayacak. Canonical model kaynağı olarak `production-center` / gerçek model kayıtları / mevcut model store yapısından tek kaynak belirlenecek; sonra `/api/models` gerekiyorsa o kaynağa uyumluluk aliası olarak bağlanacak.

## Yarın ilk yapılacak kontrol sırası

1. Bilgisayar açılır açılmaz `D:\KYERP\ky-erp` içinde `git status`, `git diff --stat`, `git diff --check` çalıştır.
2. Yerel değişikliklerin bu kapanış kaydındaki maddelerle uyuştuğunu doğrula; hiçbir şeyi resetleme.
3. Frontend build + Muhasebe/e-Belge contract testlerini tekrar çalıştır.
4. Backend bağımlılıklarını kullanarak Nest build/typecheck çalıştır.
5. `/api/models` model/ürün kaynak çakışmasını çöz; model için tek canonical veri kaynağını kesinleştir.
6. Model endpointleri tamamlandıktan sonra Desen → İmalat → Boyahane tüketicilerini aynı kaynağa bağla.
7. Muhasebe/e-Belge dead-code temizliğini import graph ile tekrar tara; sadece gerçekten erişilmeyen dosyaları kaldır.
8. İşNet'i provider adapter olarak bırak; belge gerçeği yalnız canonical e-Belge havuzu + muhasebe kayıtlarında olsun.
9. Gerçek belge ile uçtan uca test: e-Belge → firma → cari → ürün/alias → LOT/stok → Boyahane → ödeme; satış tarafında irsaliye → fatura → alacak → tahsilat.
10. Her şey yeşil olduktan sonra yerel dalı tek temiz checkpoint commit ile GitHub'a pushla; daha sonra ana çalışma dalına alınacak.

## Korunacak temel kurallar

- Firma kartı tek firma gerçeği; cari hareket ayrı işlem katmanı.
- İşNet muhasebe değildir; yalnız e-Belge sağlayıcı/entegrasyon adaptörüdür.
- Aynı fatura/irsaliye birden fazla akıştan ikinci kez muhasebeleşemez.
- Rutin arayüzde hard-delete yok; pasife alma/birleştirme/alias tercih edilir.
- Model, desen, üretim ve boyahane için paralel model listeleri oluşturulmayacak; tek canonical model kaynağı kullanılacak.
- Büyük temizlik sonrası canlıya çıkmadan önce build, test ve gerçek veri smoke testi zorunlu.
