# Muhasebe — Cari bakiye kaynağı ve oturum düşmesi: kontrollü kabul

**Tarih:** 22.11.2026. **Kapsam:** canonical Worker ve Chrome muhasebe ekranı.
**Durum:** Kod incelemesi + kısıtlı hesaplama düzeltmesi feature dalında. Canlı D1 mutabakatı ve kullanıcı oturumlu kabulü yapılmadı.

## Doğrulananlar

- 22 Kasım kullanıcı ekranlarında yönetim özeti ve Firmalar/Cari aynı 50.000 TL toplam alacağı gösteriyor. Bu, şirketler tablosunun `current_balance` alanlarından hesaplanıyor; frontend'de sabit 50.000 TL yok.
- 14 firma kartı görüldü; hangi kartta bu bakiye bulunduğu ve gerçek kaynak hareketi canlı D1'de henüz kanıtlanmadı.
- Yönetim özetinde gelen faturalar ve çıkan faturalar dönemsel toplam; cari bakiye yalnız onaylı hareket/başlangıç borcu/alacağı ile değişmeli. Belge havuzundaki bekleyen tutar otomatik muhasebeleştirilmez.
- Orijinal PDF'nin `blob:https://kyerp.net/...` ile yeni sekmede açılıp Chrome yazdırma önizlemesinde 1 sayfa görülmesi beklenen davranış. Fiziksel baskı kabul edilmedi; kullanıcı ekranı PDF açma/yazdırma önizlemesi PASS.
- Kullanıcı 22 Kasım saat ~21:11 TRT'de muhasebede gezinirken yeniden girişe düştü; `PR #644` generic iş API'si 401 hata düzeltmesi bu vakayı tamamen çözmüş sayılmaz.
- X üzerinde var olan CLI denetiminde Wrangler bulundu, fakat mevcut CLI yetkisi yoktu (whoami çıkış kodu 1). Yeni token, oturum/cookie, ZIP veya ayrı kurulum istenmedi.

## Bu dalın kod düzeltmesi

`accounting-current-write.ts`: yeni yetkili cari hareketi kaydında `companies.current_balance` artık açılış bakiyesi + aynı ana firmaya ait `SUM(effect)` üzerinden, kuruşa yuvarlanarak hesaplanır. Önceden yalnız `SUM(effect)` kullanılması, açılış bakiyesi olan kartın ilk yeni hareketinde açılış tutarını yok sayıyordu.

**Bu değişiklik geçmiş cari kartlarını otomatik düzeltmez**. Mevcut 50.000 TL'nin meşruiyeti bilinmeden canlı D1 yazma yapılmayacak. Ödeme, mahsup, resmi e-Belge onayı, migration ve toplu hesap güncellemesi yok.

## D1 read-only mutabakat — yetkili bağlantı sağlandığında

Aşağıdaki mantık firma scope ile çalıştırılacak. Gerçek müşteri/vergi/kişi bilgileri GitHub, issue ve sohbet kayıtlarına çıkarılmayacak.

```sql
WITH movements AS (
  SELECT main_company_slug, company_id,
         ROUND(SUM(COALESCE(effect, COALESCE(debit,0)-COALESCE(credit,0))),2) AS movement_net,
         COUNT(*) AS movement_count
    FROM current_account_movements
   WHERE main_company_slug = ?
   GROUP BY main_company_slug, company_id
)
SELECT c.id, c.name,
       ROUND(COALESCE(c.opening_balance,0),2) AS opening_balance,
       COALESCE(m.movement_count,0) AS movement_count,
       COALESCE(m.movement_net,0) AS movement_net,
       ROUND(COALESCE(c.current_balance,0),2) AS stored_balance,
       ROUND(COALESCE(c.opening_balance,0)+COALESCE(m.movement_net,0),2) AS expected_balance,
       ROUND(COALESCE(c.current_balance,0)-
             (COALESCE(c.opening_balance,0)+COALESCE(m.movement_net,0)),2) AS discrepancy
  FROM companies c
  LEFT JOIN movements m ON m.main_company_slug=c.main_company_slug AND m.company_id=c.id
 WHERE c.main_company_slug=? AND c.deleted_at IS NULL
 ORDER BY ABS(discrepancy) DESC, ABS(stored_balance) DESC;
```

`?` tenant parametresi yetkili bağlantıda her iki yerde aynı ana firmaya bağlanmalı. Özetler `companies`, `current_account_movements`, cari açılış bakiyesi ve hesaplanan net bakiyeyle tek tek eşleştirilmeli.

**Karar kapısı:** Sıfır hareket ve sıfır açılışa rağmen 50.000 TL saklıysa veri tutarsızlığı vardır; tarihi kaynağı ve audit incelenmeden UPDATE yapılmaz. Açılış 50.000 TL veya belgelenmiş cari hareketler 50.000 TL ise gerçek alacak olarak korunur.

## Oturum düşmesi — neden ayrıştırma

- `/api/auth/me` gerçekten 401 mi? İlgili giriş tokenı ile oturumun geçerlilik süresi aşılmış, aktif oturum iptal edilmiş veya sunucuda oturum doğrulaması başarısız olmuş olabilir. Gerçek sebep iddia edilmez.
- Normal iş API'si `401 UNAUTHORIZED` yanıtında global oturumun silinmemesi PR #644 ile kodlandı; bu kuralı kaldırma.
- `auth_sessions` tablolarının yalnız güncel/expired/revoked sayıları ve `auth_security_audit` olay türleri, yetkili/salt-okunur/kimliksiz özet olarak incelenmeli. Token, şifre, hash, IP, TCKN, VKN ve kişisel bilgiler dışarı çıkarılmaz.
- Gerçek session revocation, geçersiz token ve MFA kontrolü atlanamaz. Düşme sebebi bulunmadan "kalıcı oturum" gerekçesiyle süresiz yetki açılmaz.

## Kabul sırası

1. Yeni feature dalındaki unit/contract testi, Worker typecheck ve build — Actions kota tasarrufuyla gereksiz workflow başlatmadan.
2. Canlı D1, yukarıdaki SQL ile salt-okunur cari köken/açılış/movement/discrepancy denetimi.
3. Cari hareketlerinden kaynaklanan gerçek bir uyuşmazlık varsa belge bazlı mutabakat, geri dönüş/yedek ve ayrı canlı onay.
4. Aynı Chrome içinde Muhasebe Yönetim Özeti → Firmalar & Cari → Alış/Tedarikçi → e-Belge/Belge Havuzu → PDF yeni sekmede → ERP sekmesine dönüş; `/auth/me` ve kullanıcı oturumunu kontrol et.
5. 63 kontrol / 16 sevk eşleştirme sayacının güncelini ve belge başına gerçek `issue_code` listesini oku; yalnız gerekli `EXPENSE` irsaliye muafiyetini uygula.
6. File Hub ve İşNet bağlarında UUID+VKN+belge no+tarih/tür/yön tekil arşiv bağlantısını incele; tekrar toplu içe aktarım yapma.

**Yayın sınırı:** Bu feature dalı production merge/deploy, D1 düzeltmesi veya oturum kabulü değildir. Kullanıcıdan canlıya alma onayı ve gerçek veri kanıtı olmadan yayın yapılmayacak.
