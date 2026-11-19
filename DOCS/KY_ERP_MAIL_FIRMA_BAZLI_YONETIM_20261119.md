# KY ERP — Firma bazlı E-Posta Yönetim Merkezi — 19.11.2026

## Kullanıcı kararı ve ekran
- Menü korunur: **Ayarlar & Sistem → Bağlantılar → E-Posta Hesapları**.
- "Hakan Emprime Hazır Mail Düzeni" ve sabit Hakan/Desen e-posta adresleri kaldırılır. Her firma kendi aktif `mainCompanySlug` kapsamındaki hesaplarını görür.
- Tek yönetim ekranı: **Posta Kutuları / Hesap Ekle / Onaylar / Sağlayıcı Durumu**. Üstten "Mail Merkezini Aç" günlük kullanıcı alanına götürür.
- Hesap ekleme: sağlayıcı, hesap türü (kişisel/ortak/bölüm), görünen ad, e-posta adresi ve bölüm kodu; mevcut Mail Core onay/OAuth akışı. Yalnız adapter+production ayarı hazır provider yeni talep açabilir.
- Mevcut hesapta görünen ad / bölüm etiketi düzenlenebilir; gerçek provider/e-posta kimliği ve hesap türü değiştirilmez. Bu alanlar OAuth yetkisi ve posta kutusu adresiyle bağlıdır; yeni kimlik yeni hesap talebiyle açılır.
- Varsayılan gönderim ve varsayılan alım ayrı düğmelerle seçilir veya kaldırılır. Backend yalnız hedef firmanın diğer varsayılanını temizler; onaysız, bağlı olmayan veya adapterı hazır olmayan hesap varsayılan yapılamaz.
- OAuth bağlı, onaylı, tam klasör senkronu ve adapter hazır durumu **ayrı** gösterilir; eski kayıtlar, e-posta geçmişi, Mail Core/File Hub ilişkileri silinmez. 15/0 gibi kısmi klasör durumları hazır gösterilmez.
- Yetki: düzenleme/varsayılan/karar firma sahibi veya uygulama sahibi; tenant'ın dışına düzenleme yok. Kullanıcı tarafından açık istenmeden mail gönderilmez ve üretim mali kaydı oluşturulmaz.
- Düzen masaüstü/tablet/telefonda responsive; Hakan'a özel ön tanımlar yok; standart menü yapısının altında tek ekran.

## Kaynaklar / test kapsamı
- Ön yüz: `APP/app/ky-erp-frontend/src/pages/admin/AdminMailConnectionsV2.jsx`, `AdminMailConnections.css`, `mailAccountRules.js`, `mailAccountRules.test.js`, `src/services/mailApi.js`.
- Worker: `APP/cloud/ky-erp-api/src/mail-communication-core.ts`, `mail-account-management.contract.test.ts`.
- Mevcut mail tabloları kullanılır. Yeni migration, OAuth secret, ayrı mail altyapısı yok.
- CI lint/test/build, PR/merge/deploy ve gerçek kullanıcı ekran kabulü birbirinden ayrıdır. Gerçek Hotmail OAuth ve 15 klasörün tam senkronu açık canlı kabuldür.

## 19.11.2026 ilk ekran incelemesi
- Kullanıcının gerçek KY ERP ekranında toplam 1 hesap, 1 aktif ve 1 OAuth bağlı; görünen DESEN Gmail hesabında **0/15** tam senkron; ana Hotmail ise hazır tanımda olup veritabanında ayrı kayıt olarak görünmüyor.
- Microsoft Graph üretim OAuth ayarı eksik uyarısı veriyor. Yeni UI bu engeli ortadan kaldırmış gibi davranmaz; secret/token GitHub'a ya da sohbete taşınmaz.
- ChatGPT Outlook bağlayıcısının erişilebilir olması KY ERP OAuth bağlılık kanıtı değildir. Hotmail'e kullanıcı adına gerçek gönderim yapılmadı.

## İzleme
Değişiklik ve CI, bu belgeyi içeren PR'ın commit/yayın kanıtıyla eşleştirilmelidir. **Gerçek tarayıcı kabulü ve sağlayıcı bağlantısı PASS değildir.**
