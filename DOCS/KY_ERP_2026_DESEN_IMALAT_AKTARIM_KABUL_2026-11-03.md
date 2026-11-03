# KY ERP — 2026 Desen Havuzu ve İmalat Excel aktarma kaydı

**Tarih:** 03.11.2026  
**Kapsam:** Sadece 2026 kaynak satırları; eski yılların verisi, Excel dosyası ve Drive klasörleri değiştirilmez.

## Gerçek canlı D1 sonuçları (mecit-hakan)

- Aktarımdan önce 346 görselli Desen Havuzu / model ana kartı vardı.
- Eksik 377 model ana kartı ile 377 `DESEN_WORKFLOW_MODEL` kaydı eklendi. Görseli olmayan modellerde `MODEL_INFO_MISSING`, `previewStatus=UPLOAD_REQUIRED` ve boş `files` korunur; hayalî görsel atanmaz.
- Toplam 723 model ve 723 workflow kaydı canlı sorguyla doğrulandı.
- İlk 409 + ek 1.142 = **1.551** 2026 `production_records` kaydı canlıya işlendi.
- **1.551** `model_production_links` kaydı doğrulandı, kopuk model bağlantısı **0**.
- Excel'in 2026 ve model adı olan 1.563 satırından **10** hatalı adet/sakat kaydı ve **2** birebir kaynak mükerreri içeri aktarılmadı.
- Yeniden çalıştırma dry-run sonucu: **0** yeni model, **0** yeni imalat, 1.551 zaten içe alınmış kayıt.
- Canlı D1 değişikliğinden önce Google Drive yedek alanında ayrı SQL export oluşturuldu.

## Drive / File Hub

- Fiziksel kaynak `Hakan Emp/görsel/2026` ve `Hakan Emp/modeller` yerinde kaldı.
- Firma için `DESEN / MODEL_SOURCE → modeller` bağlantısı, mevcut `Google Drive · Hakan Emp` servisinde **read=1, write=0, sync=1** olarak eklendi.
- `DESEN / MODEL_IMAGE → görsel/2026` bağı korundu.
- File Hub tam tarama henüz bitmedi. Dosya varlığı/thumbnail ve PSD/PDF/AI önizleme dönüşümü ayrı kanıt bekler; bunlar tamamlanmış sayılamaz.

## Tekrar kullanılabilir aktarma araçları

- `APP/cloud/ky-erp-api/scripts/bootstrap-2026-models-xlsm.mjs`: yalnız 2026 model kayıtlarını oluşturur; --apply olmadan salt okunurdur, tenant ve isteğe bağlı müşteri bilgisi parametrelidir.
- `APP/cloud/ky-erp-api/scripts/import-manufacturing-xlsm.mjs`: yalnız geçerli 2026 imalat satırlarını mevcut model UUID'lerine bağlar; satırdan deterministic SHA-256 kimliği türetir, mükerrerleri atlar, görsel beklenmesine izin veren açık `--allow-missing-preview` bayrağı vardır.
- Her iki scriptte canlı yazma için birlikte `--apply --confirm-tenant <tenant>` zorunludur.
- Wrangler `--file` ilerleme çıktısı JSON değildir; batch sonucunda bağlantı sayısı D1 sorgusuyla doğrulanır.

## Açık kalanlar

1. Drive `modeller` klasörünün indekslenmesi ve gerçek kaynak PSD/AI/PDF ilişkilerinin modelle doğrulanması.
2. Önizleme dönüştürme altyapısı; mümkün olmayan dosyada "Görsel Yüklenecek" gösterimi.
3. 10 hatalı Excel miktar satırının insan kontrolü; 2 mükerrerin aktarılmaması doğru davranıştır.
4. Mobil gerçek oturum/PSD-PDF önizleme kabulü ve Cloudflare yayın SHA doğrulaması ayrı yapılır.

**Güvenlik:** Gerçek Excel içeriği, çalışan bilgileri, sırlar, Drive tokenları ve SQL yedeği GitHub'a aktarılmadı.
