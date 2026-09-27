# KY ERP — File Hub + Muhasebe Production Öncesi Release Kaydı

Tarih: 01.09.2026

## Release tabanı

Güncel production source branch: `codex/model-uretim-kontrol-merkezi-final`.

File Hub / yeni Muhasebe geliştirme branch'i: `codex/file-hub-multistorage-v1`.

Production dalında File Hub geliştirmesinden sonra PDKS ve İşNet için yeni migrationlar oluştuğu için File Hub/Muhasebe migration numaraları production zinciriyle çakışmayacak biçimde yeniden numaralandırılmıştır.

Production üzerinde korunacak mevcut sıra:
- `0025_pdks_single_data_masters.sql`
- `0026_pdks_operation_core.sql`
- `0026_pdks_operations_readiness.sql`
- `0027_isnet_tenant_scope_backfill.sql`

File Hub + yeni Muhasebe hedefli sıra:
- `0028_file_hub_multistorage.sql`
- `0029_file_hub_outgoing_team_links.sql`
- `0030_file_hub_provider_defaults.sql`
- `0031_file_hub_primary_location_failover.sql`
- `0032_accounting_document_core.sql`
- `0033_accounting_intelligence_profiles.sql`
- `0034_accounting_document_archive_queue.sql`

## Production öncesi zorunlu kapılar

1. Worker dependency/security/typecheck/unit/auth testleri temiz olmalı.
2. Worker dry-run build temiz olmalı.
3. Windows File Agent ve accounting archive worker syntax kontrolü temiz olmalı.
4. Frontend lint/test/build temiz olmalı.
5. 0028–0034 migrationları izole yerel D1 üzerinde sıralı uygulanmalı ve gerekli tablo/trigger audit'i geçmeli.
6. Production branch tracked working tree temiz ve local SHA = origin SHA olmalı.
7. Production secret isimleri mevcut olmalı: `FILE_HUB_AGENT_KEY`, `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`, `RESEND_API_KEY`.
8. Remote D1'e ilk write öncesi tam `wrangler d1 export` yedeği alınmalı.
9. Generic `wrangler d1 migrations apply` çalıştırılmamalı; yalnız 0028–0034 explicit `wrangler d1 execute --file` ile uygulanmalı.
10. Migration sonrası gerekli File Hub/Muhasebe tablo ve triggerları remote D1'de audit edilmeden Worker/Pages deploy başlamamalı.
11. Worker/Pages deploy sonrası API health, app login/auth, Muhasebe Belge Havuzu, File Hub, İşNet tenant, Resend capability ve browser smoke doğrulanmalı.

## Veri politikası

Canlıda aktif yeni Muhasebe çekirdeği henüz kullanılmadığı için yeni accounting tabloları additive olarak kurulacaktır. Buna rağmen mevcut KY ERP'nin diğer modül verileri korunur; production D1 reset veya genel temizleme yapılmaz.

## Secret politikası

Gerçek key/token/endpoint değerleri repoya, chat'e veya plaintext config'e yazılmaz. Production secret kurulumu `wrangler secret put` gibi güvenli yöntemle yapılır.

## Yayın durumu

Canlıya alma onayı 01.09.2026 tarihinde verildi. Bu kayıt güncel production SHA ile son PR merge/CI doğrulamasını yeniden tetiklemek ve yalnız yeşil sonuçtan sonra hedefli D1 + Worker + Pages yayınına geçmek için güncellenmiştir. D1 reset/genel migration zinciri kullanılmayacaktır.
