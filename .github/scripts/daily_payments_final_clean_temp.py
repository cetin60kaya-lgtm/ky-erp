from pathlib import Path

BRANCH = 'codex/model-uretim-kontrol-merkezi-final'
API = Path('APP/cloud/ky-erp-api/src/gunluk-operasyon-cloud.ts')
FE = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
REG = Path('APP/app/ky-erp-frontend/src/app/moduleRegistry.js')
MIG = Path('APP/cloud/ky-erp-api/migrations/0056_hr_daily_payment_ledger.sql')

api = API.read_text(encoding='utf-8')
fe = FE.read_text(encoding='utf-8')
reg = REG.read_text(encoding='utf-8')

# 1) Canonical employee number source: hr_daily_employee_meta.
old_select = '      e.personnel_no,e.full_name,e.qualification,\n'
new_select = '      m.personnel_no,e.full_name,e.qualification,\n'
if api.count(old_select) != 1:
    raise SystemExit(f'payment personnel select anchor expected once, found {api.count(old_select)}')
api = api.replace(old_select, new_select, 1)

old_join = '''    FROM hr_daily_attendance a
    JOIN hr_daily_employees e ON e.id=a.employee_id
    LEFT JOIN hr_daily_attendance_check cd'''
new_join = '''    FROM hr_daily_attendance a
    JOIN hr_daily_employees e ON e.id=a.employee_id
    LEFT JOIN hr_daily_employee_meta m ON m.employee_id=e.id
    LEFT JOIN hr_daily_attendance_check cd'''
if api.count(old_join) != 1:
    raise SystemExit(f'payment employee meta join anchor expected once, found {api.count(old_join)}')
api = api.replace(old_join, new_join, 1)

# 2) One payment write path only. Keep legacy route for old clients, but route it to the ledger.
mark_start = api.find('async function markPaid(c: Context<AppEnv>) {')
sync_start = api.find('\nasync function syncState(c: Context<AppEnv>) {', mark_start)
if mark_start < 0 or sync_start < 0:
    raise SystemExit('legacy markPaid block not found')
api = api[:mark_start] + '''async function markPaid(c: Context<AppEnv>) {
  // Backward-compatible endpoint: all payments must be recorded in the canonical ledger.
  return createPayment(c);
}
''' + api[sync_start:]

# 3) Payment failure must not take the Daily Operations dashboard down.
state_anchor = '  const [paymentRows, setPaymentRows] = useState([]);\n'
if state_anchor not in fe:
    raise SystemExit('paymentRows state anchor not found')
if 'paymentLoadError' not in fe:
    fe = fe.replace(state_anchor, state_anchor + '  const [paymentLoadError, setPaymentLoadError] = useState("");\n', 1)

old_loader = '''  const loadPayments = useCallback(async () => {
    if (!companyId || !["daily-payments", "daily-dashboard"].includes(view)) return;
    setLoading(true); setError("");
    try { const rows = await getDailyPaymentPool({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }); setPaymentRows(Array.isArray(rows) ? rows : []); }
    catch (e) { setError(e?.message || "Ödeme havuzu alınamadı."); } finally { setLoading(false); }
  }, [companyId, range.end, range.start, view]);'''
new_loader = '''  const loadPayments = useCallback(async () => {
    if (!companyId || !["daily-payments", "daily-dashboard"].includes(view)) return;
    setLoading(true); setPaymentLoadError("");
    if (view === "daily-payments") setError("");
    try {
      const rows = await getDailyPaymentPool({ mainCompanyId: companyId, startDate: range.start, endDate: range.end });
      setPaymentRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      const message = e?.message || "Ödeme havuzu alınamadı.";
      setPaymentRows([]);
      setPaymentLoadError(message);
      if (view === "daily-payments") setError(message);
    } finally { setLoading(false); }
  }, [companyId, range.end, range.start, view]);'''
if old_loader not in fe:
    raise SystemExit('payment loader anchor not found')
fe = fe.replace(old_loader, new_loader, 1)

old_warning = '    if (paymentMetrics.waitingCount) rows.push(`${paymentMetrics.waitingCount} personelin ödemesi bekliyor.`);\n'
new_warning = old_warning + '    if (paymentLoadError) rows.push("Ödeme verisi şu anda alınamadı; diğer günlük operasyon verileri etkilenmedi.");\n'
if old_warning not in fe:
    raise SystemExit('dashboard payment warning anchor not found')
fe = fe.replace(old_warning, new_warning, 1)
old_deps = '  }, [attendance.length, dashboardZeroWage, paymentMetrics.waitingCount, periodLocked, weeklyPending]);'
new_deps = '  }, [attendance.length, dashboardZeroWage, paymentLoadError, paymentMetrics.waitingCount, periodLocked, weeklyPending]);'
if old_deps not in fe:
    raise SystemExit('dashboard warning dependency anchor not found')
fe = fe.replace(old_deps, new_deps, 1)

# 4) Corporate navigation name.
old_menu = '["daily-payments", "Ödeme Fişleri", "odemeler"]'
new_menu = '["daily-payments", "Ödemeler", "odemeler"]'
if old_menu in reg:
    reg = reg.replace(old_menu, new_menu, 1)
elif new_menu not in reg:
    raise SystemExit('daily payments menu entry not found')

migration = '''-- KY ERP Günlük Operasyon - canonical payment ledger
-- Runtime request bootstrap must not own this schema.

CREATE TABLE IF NOT EXISTS hr_daily_payments (
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
);

CREATE TABLE IF NOT EXISTS hr_daily_payment_items (
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
);

CREATE INDEX IF NOT EXISTS idx_daily_payment_history
  ON hr_daily_payments(main_company_id, paid_date DESC, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_payment_employee
  ON hr_daily_payments(main_company_id, employee_id, status, paid_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_payment_item_active
  ON hr_daily_payment_items(main_company_id, attendance_id, shift) WHERE active=1;

CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_insert
AFTER INSERT ON hr_daily_payments
BEGIN
  INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at)
  VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);
END;

CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_update
AFTER UPDATE ON hr_daily_payments
BEGIN
  INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at)
  VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);
END;

CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_item_insert
AFTER INSERT ON hr_daily_payment_items
BEGIN
  INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at)
  VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);
END;

CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_item_update
AFTER UPDATE ON hr_daily_payment_items
BEGIN
  INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at)
  VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);
END;
'''

# Final source invariants.
if 'e.personnel_no,e.full_name,e.qualification' in api:
    raise SystemExit('invalid employee personnel_no reference remains')
if 'LEFT JOIN hr_daily_employee_meta m ON m.employee_id=e.id' not in api:
    raise SystemExit('employee meta join missing')
if 'return createPayment(c);' not in api[api.find('async function markPaid'):api.find('async function syncState')]:
    raise SystemExit('legacy payment route still bypasses ledger')
if '["daily-payments", "Ödemeler", "odemeler"]' not in reg:
    raise SystemExit('payments navigation label not finalized')

API.write_text(api, encoding='utf-8')
FE.write_text(fe, encoding='utf-8')
REG.write_text(reg, encoding='utf-8')
MIG.write_text(migration, encoding='utf-8')
print('clean daily payment finalization applied')
