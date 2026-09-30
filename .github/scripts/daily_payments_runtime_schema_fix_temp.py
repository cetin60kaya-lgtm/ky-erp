from pathlib import Path

path = Path('APP/cloud/ky-erp-api/src/gunluk-operasyon-cloud.ts')
text = path.read_text(encoding='utf-8')

blocks = [
'''      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_payments (
        id TEXT PRIMARY KEY,
        payment_no TEXT NOT NULL UNIQUE,
        main_company_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        personnel_no TEXT,
        full_name TEXT NOT NULL,
        qualification TEXT,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        day_count INTEGER NOT NULL DEFAULT 0,
        night_count INTEGER NOT NULL DEFAULT 0,
        total_days INTEGER NOT NULL DEFAULT 0,
        total_amount_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PAID',
        paid_date TEXT NOT NULL,
        paid_at TEXT NOT NULL,
        paid_by_user_id TEXT,
        paid_by_label TEXT,
        cancelled_at TEXT,
        cancelled_by_user_id TEXT,
        cancelled_by_label TEXT,
        cancel_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_payment_items (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL,
        main_company_id TEXT NOT NULL,
        attendance_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        work_date TEXT NOT NULL,
        shift TEXT NOT NULL,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )`),
''',
'''      c.env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_daily_payment_history ON hr_daily_payments(main_company_id, paid_date DESC, paid_at DESC)",
      ),
      c.env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_daily_payment_employee ON hr_daily_payments(main_company_id, employee_id, status, paid_date DESC)",
      ),
      c.env.DB.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_payment_item_active ON hr_daily_payment_items(main_company_id, attendance_id, shift) WHERE active=1",
      ),
''',
'''      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_insert
        AFTER INSERT ON hr_daily_payments
        BEGIN
          INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at) VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);
        END`),
      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_update
        AFTER UPDATE ON hr_daily_payments
        BEGIN
          INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at) VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);
        END`),
      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_item_insert
        AFTER INSERT ON hr_daily_payment_items
        BEGIN
          INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at) VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);
        END`),
      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_item_update
        AFTER UPDATE ON hr_daily_payment_items
        BEGIN
          INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at) VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);
        END`),
'''
]

for block in blocks:
    count = text.count(block)
    if count != 1:
        raise SystemExit(f'expected payment runtime DDL block once, found {count}')
    text = text.replace(block, '', 1)

marker = 'function ensureSchema(c: Context<AppEnv>) {'
comment = '// Core Günlük Operasyon bootstrap must stay payment-ledger independent.\n// Payment ledger schema is migration-owned and must not be recreated on every request.\n'
if comment not in text:
    text = text.replace(marker, comment + marker, 1)

for forbidden in [
    'CREATE TABLE IF NOT EXISTS hr_daily_payments',
    'CREATE TABLE IF NOT EXISTS hr_daily_payment_items',
    'CREATE INDEX IF NOT EXISTS idx_daily_payment_history',
    'CREATE INDEX IF NOT EXISTS idx_daily_payment_employee',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_payment_item_active',
    'CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_insert',
    'CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_update',
    'CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_item_insert',
    'CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_item_update',
]:
    if forbidden in text:
        raise SystemExit(f'payment DDL still present in runtime bootstrap: {forbidden}')

path.write_text(text, encoding='utf-8')
print('daily payment runtime schema fix applied')
