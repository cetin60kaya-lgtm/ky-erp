# KY PDKS Android/iOS çalışma alanı

Bu dizin **Capacitor 8 paketleme yapılandırmasıdır**; APK/IPA değildir.

Kaynak tek: `APP/app/ky-erp-frontend` React KY PDKS Unified.
Bağlantı: gerçek oturumlu `https://app.kyerp.net/pdks/workspace` ve yetkili `api.kyerp.net` API'si.
İşlemler: Windows Agent üzerinden kanıt/onay sonrasında; yerel cep telefonu terminal RAW kanıtını değiştiremez.

Yerel hazırlık:
```bash
cd APP/pdks-unified/mobile
npm install
npm run build:web
npx cap add android
npx cap add ios
npx cap sync
```

Android için Android Studio/SDK, iOS için Xcode ve macOS gerekir. Native projeler bu çalışma sırasında oluşturulup imzalanmadığı sürece "mobil hazır" denilemez.

**Güvenlik:** biyometri/GPS talebi açık yetki, izin, KVKK ve işletmenin iş kuralı olmadan açılmayacaktır. Offline kuyruk yalnız onaylı talebi saklayabilir; fiziksel terminal olayı uyduramaz. Mobil cihazın cihaz yetkisi, personel maaşını görüntüleme yetkisi değildir.
