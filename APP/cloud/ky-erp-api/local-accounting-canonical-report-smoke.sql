-- Canonical accounting report smoke seed. Isolated CI only.
INSERT OR REPLACE INTO companies(
  id,main_company_slug,name,normalized_name,company_type,type,tax_no,is_active,
  current_balance,supplier_debt_tracking,customer_receivable_tracking,payment_mode,
  vat_tracking_enabled,expense_category,default_record_type,created_at,updated_at,deleted_at
) VALUES(
  'company-canonical-report-smoke','mecit-hakan','Canonical Rapor Test','CANONICAL RAPOR TEST',
  'BOTH','BOTH','5555555555',1,0,1,1,'OPEN_ACCOUNT',1,'Nakliye','RESMI',
  '2026-09-06T00:00:00Z','2026-09-06T00:00:00Z',NULL
);

INSERT OR REPLACE INTO accounting_documents(
  id,main_company_slug,direction,document_type,provider_type,source_type,status,record_scope,
  document_no,issue_date,currency,party_company_id,party_name,party_tax_no,
  subtotal,tax_total,discount_total,payable_total,posted_at,created_at,updated_at
) VALUES
(
  'canonical-report-income','mecit-hakan','OUTGOING','GIDEN_FATURA','MANUAL','TEST','POSTED','OFFICIAL',
  'SAT-TEST-001','2026-09-06','TRY','company-canonical-report-smoke','Canonical Rapor Test','5555555555',
  1000,180,0,1180,'2026-09-06T01:00:00Z','2026-09-06T01:00:00Z','2026-09-06T01:00:00Z'
),
(
  'canonical-report-expense','mecit-hakan','INCOMING','GELEN_FATURA','MANUAL','TEST','POSTED','OFFICIAL',
  'ALI-TEST-001','2026-09-06','TRY','company-canonical-report-smoke','Canonical Rapor Test','5555555555',
  500,90,0,590,'2026-09-06T01:05:00Z','2026-09-06T01:05:00Z','2026-09-06T01:05:00Z'
);

INSERT OR REPLACE INTO accounting_document_lines(
  id,main_company_slug,document_id,line_no,description,quantity,unit_code,unit_price,
  discount_total,tax_rate,tax_amount,line_total,match_status,match_confidence,raw_metadata,created_at,updated_at
) VALUES
(
  'canonical-report-expense-line','mecit-hakan','canonical-report-expense',1,'Nakliye hizmet bedeli',1,'ADET',500,
  0,18,90,500,'UNMATCHED',0,
  '{"routingType":"EXPENSE","expenseCategoryName":"Nakliye","expenseCategorySource":"TEST"}',
  '2026-09-06T01:05:00Z','2026-09-06T01:05:00Z'
);
