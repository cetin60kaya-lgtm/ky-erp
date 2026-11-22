# KY ERP — Onaylı cihaz ve güvenli hızlı giriş (19.11.2026)

## Kullanıcı kararı
- KY ERP web, masaüstü tarayıcı, telefon, tablet ve KY ERP PRO aynı canonical WebAuthn giriş sözleşmesini kullanır.
- İlk kayıt: mevcut kimlik doğrulaması + izin verilen platform biyometrisi/ekran PIN'i; parmak izi görüntüsü veya cihaz özel anahtarı sunucuya gönderilmez.
- Sonraki hızlı giriş: kullanıcı cihazdaki **Parmak İzi / Yüz Tanıma / PIN** ya da Windows Hello'ya dokunur; 2 haneli KY Güvenlik eşleştirmesi bu hızlı giriş yolunda aranmaz.
- Güvenlik onayını tamamen kaldırma yok: yeni cihaz, riskli giriş, firma yönetici onayı, BOTH_MFA, hesap kurtarma ve kritik işlemler mevcut yetkilerle korunur.
- Personel öz-servis hesabı yönetim paneli rolüne yükseltilmez. Her oturumda firma/rol hakları sunucuda yeniden hesaplanır.
- Sahip olunan passkey'ler Güvenlik Merkezi > Onaylı Cihazlar'da listelenebilir; son 5 dakikalık geçerli oturumda kendine ait anahtar kaldırılabilir.
- Kayıt/çıkarma işlemleri geri alınabilir; tarayıcı veya mobil uygulama silinmez ve mevcut oturumlar sessizce kapatılmaz.

## Sınır ve güvenlik
- WebAuthn platform erişimi yoksa standart parola, Turnstile ve MFA/telefon onayı devam eder.
- Sistem sahibi Windows tarayıcısına uzun ömürlü yönetici tokenı güvenli olmayan localStorage üzerinden eklenmez. Kapat-aç sonrasında aynı oturum sürmüyorsa kayıtlı Windows Hello ile tek kullanıcı hareketi gerekir.
- Mobil PRO mevcut kısa oturum sürdürme akışını kullanır, süresi dolunca biyometrik hızlı giriş uygulanır.
- Mevcut sunucu oturum sınırı: parola-only 8 saat, MFA 10 saat; otomatik yenileme sahip hesapları için ayrıca yasak. Bu revizyonda limitler artırılmadı.
- Cihazın kaybolması / yetki değişimi / kurtarma sonrası geçiş anahtarı iptali korunur.
- Kod dalı: `feature/kyerp-mobil-passkey-tum-kullanicilar-20261118`; PR #591. Production merge/deploy yapılmış sayılmaz.

## Teknik kabul
1. Frontend lint/test/build + PRO PWA bundle ve Worker typecheck/test/build (gerçek CI commit SHA'yla doğrulanacak).
2. Samsung Android'de KY PRO: ilk şifre + telefon doğrulaması -> anahtar kaydı -> uygulama kapat -> parmak izi/PIN -> ERP ekranı.
3. Windows Chrome: kayıtlı Windows Hello -> Chrome kapat/aç -> tek kullanıcı dokunuşuyla ERP -> yetkiler doğru.
4. Normal KY ERP telefonda ve tablette aynı protokol, firma kullanıcı/owner sınırları.
5. BOTH_MFA hesapta geçiş anahtarının tek başına yetkiyi aşmaması; reddedilen/iptal edilen anahtar; tekrar challenge engeli; başka hesapta anahtar reddi.
6. Önce gerçek cihaz kabulü, sonra kullanıcı release kararı; yedeksiz canlı D1 değişikliği, ayrı Action/workflow ve yeni kurulum yok.
