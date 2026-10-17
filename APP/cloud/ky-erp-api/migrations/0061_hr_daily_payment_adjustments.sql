-- Günlük Operasyon / Hakediş: tarih aralığına bağlı ek ödeme ve kesinti defteri.
-- Bütün tutarlar kuruş cinsinden ve imzalı iş türünden ayrıdır. Günlük giriş tabloları değişmez.
CREATE TABLE IF NOT EXISTS hr_daily_payment_adjustments (
 id TEXT PRIMARY KEY,
 main_company_id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 period_start TEXT NOT NULL,
 period_end TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('ADD','DEDUCT')),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 300),
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0 AND amount_cents <= 100000000),
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','VOID')),
 settled_payment_id TEXT,
 actor_user_id TEXT,
 actor_label TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 voided_at TEXT,
 voided_by_user_id TEXT,
 voided_by_label TEXT,
 void_reason TEXT,
 FOREIGN KEY(employee_id) REFERENCES hr_daily_employees(id)
);
CREATE INDEX IF NOT EXISTS idx_daily_adjustments_period
 ON hr_daily_payment_adjustments(main_company_id,period_start,period_end,employee_id,status);
CREATE INDEX IF NOT EXISTS idx_daily_adjustments_payment
 ON hr_daily_payment_adjustments(main_company_id,settled_payment_id);
CREATE TABLE IF NOT EXISTS hr_daily_payment_adjustment_snapshots (
 id TEXT PRIMARY KEY,
 main_company_id TEXT NOT NULL,
 payment_id TEXT NOT NULL,
 adjustment_id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('ADD','DEDUCT')),
 reason TEXT NOT NULL,
 amount_cents INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(payment_id,adjustment_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_adjustment_snapshots_payment
 ON hr_daily_payment_adjustment_snapshots(main_company_id,payment_id);
CREATE TRIGGER IF NOT EXISTS trg_daily_adjustment_snapshot_no_update
 BEFORE UPDATE ON hr_daily_payment_adjustment_snapshots
 BEGIN SELECT RAISE(ABORT,'payment adjustment snapshot is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_daily_adjustment_snapshot_no_delete
 BEFORE DELETE ON hr_daily_payment_adjustment_snapshots
 BEGIN SELECT RAISE(ABORT,'payment adjustment snapshot is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_daily_adjustment_sync_insert
 AFTER INSERT ON hr_daily_payment_adjustments
 BEGIN INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at)
 VALUES(NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP); END;
CREATE TRIGGER IF NOT EXISTS trg_daily_adjustment_sync_update
 AFTER UPDATE ON hr_daily_payment_adjustments
 BEGIN INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at)
 VALUES(NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP); END;
CREATE TRIGGER IF NOT EXISTS trg_daily_adjustment_sync_snapshot
 AFTER INSERT ON hr_daily_payment_adjustment_snapshots
 BEGIN INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at)
 VALUES(NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP); END;

-- Eşzamanlı iki PC işlemi: ön okuma sonrasında ödeme/iptal durumu değişse bile işlem durdur.
CREATE TRIGGER IF NOT EXISTS trg_daily_adjustment_prevent_after_paid
BEFORE INSERT ON hr_daily_payment_adjustments
WHEN EXISTS (SELECT 1 FROM hr_daily_payments p
  WHERE p.main_company_id=NEW.main_company_id AND p.employee_id=NEW.employee_id
    AND p.period_start=NEW.period_start AND p.period_end=NEW.period_end AND p.status='PAID')
BEGIN SELECT RAISE(ABORT,'adjustment period already paid'); END;
CREATE TRIGGER IF NOT EXISTS trg_daily_adjustment_prevent_void_settled
BEFORE UPDATE OF status ON hr_daily_payment_adjustments
WHEN NEW.status='VOID' AND (OLD.status!='ACTIVE' OR OLD.settled_payment_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'adjustment already void or settled'); END;
CREATE TRIGGER IF NOT EXISTS trg_daily_adjustment_prevent_double_settlement
BEFORE UPDATE OF settled_payment_id ON hr_daily_payment_adjustments
WHEN NEW.settled_payment_id IS NOT NULL AND OLD.settled_payment_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'adjustment already settled'); END;
