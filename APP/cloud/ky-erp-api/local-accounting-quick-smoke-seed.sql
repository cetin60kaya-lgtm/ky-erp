-- KY ERP hizli muhasebe CI smoke verisi. Canliya uygulanmaz.

UPDATE companies
   SET customer_receivable_tracking=1,
       supplier_debt_tracking=0,
       payment_mode='CASH',
       current_balance=12000,
       fibe_enabled=1,
       fibe_rate=10,
       fibe_start_date='2026-08-01',
       fibe_opening_accrual=0,
       fibe_opening_paid=0
 WHERE id='company-isnet-customer';

INSERT OR REPLACE INTO current_account_movements(
  id,main_company_slug,company_id,movement_date,movement_type,source_type,document_no,
  description,debit,credit,amount,effect,balance_after,record_type,payment_method,raw,created_at,updated_at
) VALUES(
  'smoke-cari-opening','mecit-hakan','company-isnet-customer','2026-09-01','FATURA','SMOKE','SMOKE-INV-1',
  'Smoke müşteri alacağı',12000,0,12000,12000,12000,'RESMI',NULL,
  '{"transactionType":"DEBIT","recordType":"RESMI","recordScope":"OFFICIAL"}',
  '2026-09-01T09:00:00.000Z','2026-09-01T09:00:00.000Z'
);

INSERT OR REPLACE INTO vat_records(
  id,main_company_slug,company_id,firm_id,document_id,date,period_month,period_year,
  incoming_vat,outgoing_vat,carry_vat,raw,created_at,updated_at
) VALUES(
  'smoke-vat-incoming','mecit-hakan','company-isnet-customer','company-isnet-customer','smoke-doc-1','2026-09-01',9,2026,
  2000,0,0,'{}','2026-09-01T09:00:00.000Z','2026-09-01T09:00:00.000Z'
);

INSERT OR REPLACE INTO payment_control_records(
  id,main_company_id,main_company_slug,firm_id,payment_type,work_type,check_no,bank_name,due_date,
  amount,status,note,raw,created_at,updated_at,deleted_at
) VALUES(
  'smoke-check-received','mecit-hakan','mecit-hakan','company-isnet-customer','CHECK','OFFICIAL','SMOKE-CEK-1','SMOKE BANK','2026-09-03',
  1500,'PLANNED','KYERP_CHECK_META:{"note":"smoke","issueDate":"2026-09-02","accountNo":"","checkOwnership":"CUSTOMER_CHECK","checkDirection":"RECEIVED","receiptPath":""}',
  '{}','2026-09-02T10:00:00.000Z','2026-09-02T10:00:00.000Z',NULL
);
