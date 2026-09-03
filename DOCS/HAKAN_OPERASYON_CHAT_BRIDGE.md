# Hakan Emprime — KY ERP Operasyon Sohbet Köprüsü

Tarih: 04.09.2026  
Branch: `codex/hakan-operasyon-bridge-20260904`

## Amaç

Hakan Emprime operasyon sohbetinin ayrı bir veri kaynağı oluşturmak yerine KY ERP'nin canlı D1 verisini, mevcut kullanıcı oturumu / tenant / modül yetkileri üzerinden güvenli biçimde okuması ve onaylı işlemleri yazması.

Bu köprü bir LLM'ye serbest SQL yetkisi vermez. Yalnız tanımlı ve doğrulanan iş araçlarını sunar.

## Güvenlik sözleşmesi

- Auth: mevcut KY ERP `canonical-v3` Bearer session.
- Tenant: owner dışı kullanıcı için oturumdaki `mainCompanySlug` zorunlu kaynak.
- İK okuma: `IK.canView`.
- İK yazma (V1 create işlemleri): `IK.canCreate`.
- Muhasebe okuma: `MUHASEBE.canView`.
- Muhasebe yazma (V1 create işlemleri): `MUHASEBE.canCreate`.
- DENETIM rolü üst shell tarafından read-only kapsamda tutulur.
- Yazma isteklerinde `idempotencyKey` zorunludur.
- `operation_logs` hazır değilse yazma fail-closed davranır.
- İK finans hareketinde `ik_monthly_close` kilidi kontrol edilir.
- Personel/firma adı birden fazla eşleşirse otomatik seçim yapılmaz.
- Production D1 üzerinde test amaçlı write yapılmaz.

## V1 endpointleri

### Yetkinlik

`GET /api/operations/capabilities`

Kullanıcının İK ve Muhasebe read/write yetkisini ve tenant bağlamını döndürür.

### İK — personel arama

`GET /api/operations/hr/personnel?search=Zeynep%20Aslan`

### İK — dönem özeti

`GET /api/operations/hr/month-summary?person=Zeynep%20Aslan&year=2026&month=8`

Tek cevapta:

- personel kartı,
- dönem maaşı ve yol,
- tarihsel maaş sözleşmesi varsa o döneme ait sözleşme,
- bordro,
- avans var/yok,
- avans toplamı ve satırları,
- mesai,
- kesinti,
- net ödeme

döner.

Bu uç, operasyon sohbetindeki “Zeynep Aslan'ın Ağustos maaşı ve avansı var mı?” tipindeki sorunun ana read aracıdır.

### İK — avans / mesai / kesinti yazma

`POST /api/operations/hr/adjustments`

Örnek gövde:

```json
{
  "idempotencyKey": "chat-20260904-001",
  "person": "Zeynep Aslan",
  "date": "2026-09-04",
  "type": "AVANS",
  "amount": 5000,
  "paymentMethod": "Elden",
  "note": "Kullanıcı onayı ile operasyon sohbetinden"
}
```

Desteklenen tipler: `AVANS`, `MESAI`, `KESINTI`.

### Muhasebe — firma arama

`GET /api/operations/accounting/companies?search=Firma%20Adı`

### Muhasebe — cari özet / hareketler

`GET /api/operations/accounting/company-summary?company=Firma%20Adı&startDate=2026-09-01&endDate=2026-09-30`

Firma kartındaki güncel bakiyeyi ve canonical `current_account_movements` satırlarını döndürür.

### Muhasebe — tahsilat / ödeme yazma

`POST /api/operations/accounting/payments`

Örnek gövde:

```json
{
  "idempotencyKey": "chat-20260904-002",
  "company": "Örnek Firma",
  "direction": "PAYMENT_IN",
  "amount": 25000,
  "paymentMethod": "TRANSFER",
  "paymentDate": "2026-09-04",
  "description": "Tahsilat"
}
```

Yönler:

- `PAYMENT_IN` / `TAHSILAT`
- `PAYMENT_OUT` / `ODEME`

Kayıt aynı işlemde:

- firma bakiyesini,
- `current_account_movements` kaydını,
- mevcut Muhasebe ödeme JSON-store kaydını,
- `operation_logs` audit kaydını

oluşturur/günceller.

## ChatGPT bağlayıcı katmanı

Bu dosyadaki endpointler uygulama tarafındaki güvenli araç sözleşmesidir. ChatGPT tarafında bağlayıcı/MCP/App katmanı eklendiğinde serbest SQL yerine bu endpointler çağrılmalıdır.

Bağlayıcıya veritabanı şifresi, Cloudflare D1 doğrudan erişimi veya kullanıcı parolası verilmez. Kimlik doğrulama KY ERP'nin güvenli oturum/OAuth benzeri uygulama katmanından geçirilmelidir.

## Yayın durumu

Bu branch production'a deploy edilmemiştir. Kullanıcı onayı olmadan production merge/deploy yapılmaz.
