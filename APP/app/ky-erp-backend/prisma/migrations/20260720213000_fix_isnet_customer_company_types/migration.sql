-- Gerçek müşteri kartlarının ticari unvan varyantlarını veri silmeden düzeltir.
UPDATE "companies"
SET "company_type" = 'CUSTOMER'
WHERE upper("name") LIKE 'TAHA GİYİM%'
   OR upper("name") LIKE 'REN FASHİON%'
   OR upper("name") LIKE 'REN FASHION%'
   OR upper("name") LIKE 'MİND TEKSTİL%'
   OR upper("name") LIKE 'MIND TEKSTİL%';
