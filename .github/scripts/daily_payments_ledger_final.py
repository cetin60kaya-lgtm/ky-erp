from pathlib import Path
import re

API=Path('APP/cloud/ky-erp-api/src/gunluk-operasyon-cloud.ts')
SVC=Path('APP/app/ky-erp-frontend/src/services/dailyOpsApi.js')
FE=Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
CSS=Path('APP/app/ky-erp-frontend/src/pages/modules/ik/daily-hr-workspace-final.css')
api=API.read_text(encoding='utf-8')
svc=SVC.read_text(encoding='utf-8')
fe=FE.read_text(encoding='utf-8')
css=CSS.read_text(encoding='utf-8')

# ---- API schema ----
schema_anchor='''      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_sync_state (\n        main_company_id TEXT PRIMARY KEY,\n        version TEXT NOT NULL,\n        updated_at TEXT NOT NULL\n      )`),'''
schema_insert='''      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_sync_state (\n        main_company_id TEXT PRIMARY KEY,\n        version TEXT NOT NULL,\n        updated_at TEXT NOT NULL\n      )`),\n      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_payments (\n        id TEXT PRIMARY KEY,\n        payment_no TEXT NOT NULL UNIQUE,\n        main_company_id TEXT NOT NULL,\n        employee_id TEXT NOT NULL,\n        personnel_no TEXT,\n        full_name TEXT NOT NULL,\n        qualification TEXT,\n        period_start TEXT NOT NULL,\n        period_end TEXT NOT NULL,\n        day_count INTEGER NOT NULL DEFAULT 0,\n        night_count INTEGER NOT NULL DEFAULT 0,\n        total_days INTEGER NOT NULL DEFAULT 0,\n        total_amount_cents INTEGER NOT NULL DEFAULT 0,\n        status TEXT NOT NULL DEFAULT 'PAID',\n        paid_date TEXT NOT NULL,\n        paid_at TEXT NOT NULL,\n        paid_by_user_id TEXT,\n        paid_by_label TEXT,\n        cancelled_at TEXT,\n        cancelled_by_user_id TEXT,\n        cancelled_by_label TEXT,\n        cancel_reason TEXT,\n        created_at TEXT NOT NULL,\n        updated_at TEXT NOT NULL\n      )`),\n      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_payment_items (\n        id TEXT PRIMARY KEY,\n        payment_id TEXT NOT NULL,\n        main_company_id TEXT NOT NULL,\n        attendance_id TEXT NOT NULL,\n        employee_id TEXT NOT NULL,\n        work_date TEXT NOT NULL,\n        shift TEXT NOT NULL,\n        amount_cents INTEGER NOT NULL DEFAULT 0,\n        active INTEGER NOT NULL DEFAULT 1,\n        created_at TEXT NOT NULL\n      )`),'''
if schema_anchor not in api: raise SystemExit('schema anchor missing')
api=api.replace(schema_anchor,schema_insert,1)
idx_anchor='''      c.env.DB.prepare(\n        "CREATE INDEX IF NOT EXISTS idx_daily_check_lookup ON hr_daily_attendance_check(main_company_id, work_date, shift, employee_id)",\n      ),'''
idx_insert=idx_anchor+'''\n      c.env.DB.prepare(\n        "CREATE INDEX IF NOT EXISTS idx_daily_payment_history ON hr_daily_payments(main_company_id, paid_date DESC, paid_at DESC)",\n      ),\n      c.env.DB.prepare(\n        "CREATE INDEX IF NOT EXISTS idx_daily_payment_employee ON hr_daily_payments(main_company_id, employee_id, status, paid_date DESC)",\n      ),\n      c.env.DB.prepare(\n        "CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_payment_item_active ON hr_daily_payment_items(main_company_id, attendance_id, shift) WHERE active=1",\n      ),'''
if idx_anchor not in api: raise SystemExit('index anchor missing')
api=api.replace(idx_anchor,idx_insert,1)
trigger_anchor='''      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_roster_insert\n        AFTER INSERT ON hr_daily_range_roster'''
payment_triggers='''      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_insert\n        AFTER INSERT ON hr_daily_payments\n        BEGIN\n          INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at) VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);\n        END`),\n      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_update\n        AFTER UPDATE ON hr_daily_payments\n        BEGIN\n          INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at) VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);\n        END`),\n      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_item_insert\n        AFTER INSERT ON hr_daily_payment_items\n        BEGIN\n          INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at) VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);\n        END`),\n      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_sync_payment_item_update\n        AFTER UPDATE ON hr_daily_payment_items\n        BEGIN\n          INSERT OR REPLACE INTO hr_daily_sync_state(main_company_id,version,updated_at) VALUES (NEW.main_company_id,lower(hex(randomblob(16))),CURRENT_TIMESTAMP);\n        END`),\n'''
if trigger_anchor not in api: raise SystemExit('trigger anchor missing')
api=api.replace(trigger_anchor,payment_triggers+trigger_anchor,1)

# ---- API payment functions ----
func_anchor='''async function markPaid(c: Context<AppEnv>) {'''
if func_anchor not in api: raise SystemExit('markPaid anchor missing')
new_funcs=r'''function paymentDateKey(value: unknown) {
  const direct = dateOnly(value);
  return validDate(direct) ? direct : dateOnly(nowIso());
}

async function paymentSourceRows(c: Context<AppEnv>, companyId: string, start: string, end: string, employeeId = "") {
  const result = await c.env.DB.prepare(`SELECT
      a.id AS attendance_id,a.employee_id,a.work_date,a.day_shift,a.night_shift,a.day_wage,a.night_wage,a.payment_status,
      e.personnel_no,e.full_name,e.qualification,
      COALESCE(cd.checked,0) AS day_checked,COALESCE(cn.checked,0) AS night_checked,
      EXISTS(SELECT 1 FROM hr_daily_payment_items p WHERE p.main_company_id=? AND p.attendance_id=a.id AND p.shift='day' AND p.active=1) AS day_paid_item,
      EXISTS(SELECT 1 FROM hr_daily_payment_items p WHERE p.main_company_id=? AND p.attendance_id=a.id AND p.shift='night' AND p.active=1) AS night_paid_item,
      (SELECT COUNT(*) FROM hr_daily_payment_items p WHERE p.main_company_id=? AND p.attendance_id=a.id) AS ledger_item_count
    FROM hr_daily_attendance a
    JOIN hr_daily_employees e ON e.id=a.employee_id
    LEFT JOIN hr_daily_attendance_check cd ON cd.main_company_id=e.main_company_id AND cd.employee_id=a.employee_id AND cd.work_date=a.work_date AND cd.shift='day'
    LEFT JOIN hr_daily_attendance_check cn ON cn.main_company_id=e.main_company_id AND cn.employee_id=a.employee_id AND cn.work_date=a.work_date AND cn.shift='night'
    WHERE e.main_company_id=? AND a.work_date>=? AND a.work_date<=?
      AND (?='' OR a.employee_id=?)
      AND (a.day_shift=1 OR a.night_shift=1)
    ORDER BY e.full_name COLLATE NOCASE,a.work_date,a.id`)
    .bind(companyId,companyId,companyId,companyId,start,end,employeeId,employeeId).all<Row>();
  return result.results || [];
}

function payableShifts(row: Row) {
  const legacyPaid = text(row.payment_status).toUpperCase() === 'PAID' && num(row.ledger_item_count) === 0;
  const items: Row[] = [];
  if (flag(row.day_shift) && !legacyPaid && !flag(row.day_paid_item)) items.push({ shift:'day', checked:flag(row.day_checked), amount:money(row.day_wage) });
  if (flag(row.night_shift) && !legacyPaid && !flag(row.night_paid_item)) items.push({ shift:'night', checked:flag(row.night_checked), amount:money(row.night_wage) });
  return items;
}

async function paymentPool(c: Context<AppEnv>) {
  await ensureSchema(c);
  const companyId=companyIdOf(c);
  const start=dateOnly(c.req.query('startDate') || c.req.query('start'));
  const end=dateOnly(c.req.query('endDate') || c.req.query('end') || start);
  if(!validDate(start) || !validDate(end) || end<start) return fail(c,400,'DATE_RANGE_REQUIRED','Geçerli hakediş tarih aralığı zorunludur.');
  const rows=await paymentSourceRows(c,companyId,start,end);
  const map=new Map<string,Row>();
  for(const row of rows){
    const shifts=payableShifts(row);
    if(!shifts.length) continue;
    const employeeId=text(row.employee_id);
    const current=map.get(employeeId) || { id:`pool-${employeeId}-${start}-${end}`,employeeId,personnelNo:text(row.personnel_no),name:text(row.full_name),fullName:text(row.full_name),qualification:text(row.qualification),periodStart:start,periodEnd:end,dayCount:0,nightCount:0,totalDays:0,totalAmount:0,pendingCheckCount:0,items:[] };
    for(const item of shifts){
      if(item.shift==='day') current.dayCount+=1; else current.nightCount+=1;
      current.totalDays+=1; current.totalAmount=money(num(current.totalAmount)+num(item.amount));
      if(!item.checked) current.pendingCheckCount+=1;
      current.items.push({attendanceId:text(row.attendance_id),workDate:dateOnly(row.work_date),shift:item.shift,amount:num(item.amount),checked:Boolean(item.checked)});
    }
    current.ready=current.pendingCheckCount===0;
    map.set(employeeId,current);
  }
  return okItems(c,[...map.values()],[...map.values()]);
}

async function paymentHistory(c: Context<AppEnv>) {
  await ensureSchema(c);
  const companyId=companyIdOf(c);
  const start=dateOnly(c.req.query('startDate') || c.req.query('start'));
  const end=dateOnly(c.req.query('endDate') || c.req.query('end') || start);
  const status=text(c.req.query('status')).toUpperCase();
  if(!validDate(start) || !validDate(end) || end<start) return fail(c,400,'DATE_RANGE_REQUIRED','Geçerli ödeme tarih aralığı zorunludur.');
  const result=await c.env.DB.prepare(`SELECT * FROM hr_daily_payments WHERE main_company_id=? AND paid_date>=? AND paid_date<=? AND (?='' OR status=?) ORDER BY paid_date DESC,paid_at DESC,payment_no DESC`)
    .bind(companyId,start,end,status,status).all<Row>();
  const payments=result.results || [];
  if(!payments.length) return okItems(c,[],[]);
  const ids=payments.map((row)=>text(row.id));
  const itemsResult=await c.env.DB.prepare(`SELECT * FROM hr_daily_payment_items WHERE main_company_id=? AND payment_id IN (${ids.map(()=>'?').join(',')}) ORDER BY work_date,shift`).bind(companyId,...ids).all<Row>();
  const byPayment=new Map<string,Row[]>();
  for(const item of itemsResult.results || []){ const key=text(item.payment_id); const list=byPayment.get(key)||[]; list.push({id:text(item.id),attendanceId:text(item.attendance_id),workDate:dateOnly(item.work_date),shift:text(item.shift),amount:Number(item.amount_cents||0)/100,active:flag(item.active)}); byPayment.set(key,list); }
  const rows=payments.map((row)=>({id:text(row.id),paymentId:text(row.id),paymentNo:text(row.payment_no),employeeId:text(row.employee_id),personnelNo:text(row.personnel_no),name:text(row.full_name),fullName:text(row.full_name),qualification:text(row.qualification),periodStart:dateOnly(row.period_start),periodEnd:dateOnly(row.period_end),dayCount:num(row.day_count),nightCount:num(row.night_count),totalDays:num(row.total_days),totalAmount:Number(row.total_amount_cents||0)/100,status:text(row.status),paidDate:dateOnly(row.paid_date),paidAt:text(row.paid_at),paidByUserId:text(row.paid_by_user_id),paidByLabel:text(row.paid_by_label)||'KY ERP Kullanıcısı',cancelledAt:text(row.cancelled_at),cancelledByLabel:text(row.cancelled_by_label),cancelReason:text(row.cancel_reason),items:byPayment.get(text(row.id))||[]}));
  return okItems(c,rows,rows);
}

async function createPayment(c: Context<AppEnv>) {
  await ensureSchema(c);
  const body=await bodyOf(c);
  const companyId=companyIdOf(c,body);
  const employeeId=text(body.employeeId || body.personId);
  const start=dateOnly(body.startDate || body.start);
  const end=dateOnly(body.endDate || body.end || start);
  if(!employeeId) return fail(c,400,'EMPLOYEE_REQUIRED','Personel zorunludur.');
  if(!validDate(start)||!validDate(end)||end<start) return fail(c,400,'DATE_RANGE_REQUIRED','Geçerli hakediş tarih aralığı zorunludur.');
  const sourceRows=await paymentSourceRows(c,companyId,start,end,employeeId);
  const items:Row[]=[];
  let person:Row|null=null;
  for(const row of sourceRows){
    person=person||row;
    for(const item of payableShifts(row)) items.push({attendanceId:text(row.attendance_id),workDate:dateOnly(row.work_date),shift:item.shift,amount:num(item.amount),checked:Boolean(item.checked)});
  }
  if(!items.length) return fail(c,409,'PAYMENT_NOTHING_DUE','Bu personel için ödenecek açık vardiya bulunmuyor.');
  const pending=items.filter((item)=>!item.checked);
  if(pending.length) return fail(c,409,'PAYMENT_CHECK_REQUIRED',`Ödeme öncesi ${pending.length} vardiyanın Kontrol Edildi onayı tamamlanmalıdır.`,{pending});
  const actor=await actorOf(c);
  const paidDate=paymentDateKey(body.paymentDate);
  const paidAt=nowIso();
  const countRow=await c.env.DB.prepare('SELECT COUNT(*) AS count FROM hr_daily_payments WHERE main_company_id=? AND paid_date=?').bind(companyId,paidDate).first<Row>();
  const seq=Math.max(1,num(countRow?.count)+1);
  const paymentNo=`OP-${paidDate.slice(2).replace(/-/g,'')}-${String(seq).padStart(3,'0')}`;
  const paymentId=crypto.randomUUID();
  const dayCount=items.filter((item)=>item.shift==='day').length;
  const nightCount=items.filter((item)=>item.shift==='night').length;
  const totalCents=items.reduce((sum,item)=>sum+dailyMoneyCents(item.amount),0);
  const statements:D1PreparedStatement[]=[c.env.DB.prepare(`INSERT INTO hr_daily_payments (id,payment_no,main_company_id,employee_id,personnel_no,full_name,qualification,period_start,period_end,day_count,night_count,total_days,total_amount_cents,status,paid_date,paid_at,paid_by_user_id,paid_by_label,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'PAID',?,?,?,?,?,?)`).bind(paymentId,paymentNo,companyId,employeeId,text(person?.personnel_no)||null,text(person?.full_name)||'Personel',text(person?.qualification)||null,start,end,dayCount,nightCount,items.length,totalCents,paidDate,paidAt,actor.id||null,actor.label,paidAt,paidAt)];
  for(const item of items){ statements.push(c.env.DB.prepare(`INSERT INTO hr_daily_payment_items (id,payment_id,main_company_id,attendance_id,employee_id,work_date,shift,amount_cents,active,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)`).bind(crypto.randomUUID(),paymentId,companyId,item.attendanceId,employeeId,item.workDate,item.shift,dailyMoneyCents(item.amount),paidAt)); }
  const attendanceIds=[...new Set(items.map((item)=>item.attendanceId))];
  for(const attendanceId of attendanceIds) statements.push(c.env.DB.prepare("UPDATE hr_daily_attendance SET payment_status='PAID',updated_at=? WHERE id=?").bind(paidAt,attendanceId));
  statements.push(auditStmt(c,{companyId,employeeId,workDate:start,action:'PAYMENT_CREATE',before:null,after:{paymentId,paymentNo,startDate:start,endDate:end,dayCount,nightCount,totalAmount:totalCents/100},actor,source:'KYERP_DAILY_PAYMENT_V1'}));
  try { await c.env.DB.batch(statements); } catch(error){ const msg=error instanceof Error?error.message:String(error); if(msg.includes('UNIQUE')||msg.includes('constraint')) return fail(c,409,'PAYMENT_CONFLICT','Bu vardiyalardan biri başka bir işlemde ödendi. Ödeme havuzunu yenileyin.'); throw error; }
  return ok(c,{id:paymentId,paymentId,paymentNo,employeeId,name:text(person?.full_name),periodStart:start,periodEnd:end,dayCount,nightCount,totalDays:items.length,totalAmount:totalCents/100,status:'PAID',paidDate,paidAt,paidByLabel:actor.label,items});
}

async function cancelPayment(c: Context<AppEnv>) {
  await ensureSchema(c);
  const body=await bodyOf(c);
  const companyId=companyIdOf(c,body);
  const paymentId=text(c.req.param('id') || body.paymentId);
  const reason=text(body.reason || body.note);
  if(!paymentId) return fail(c,400,'PAYMENT_REQUIRED','Ödeme kaydı zorunludur.');
  if(!reason) return fail(c,400,'CANCEL_REASON_REQUIRED','Ödeme iptal açıklaması zorunludur.');
  const payment=await c.env.DB.prepare("SELECT * FROM hr_daily_payments WHERE id=? AND main_company_id=? LIMIT 1").bind(paymentId,companyId).first<Row>();
  if(!payment) return fail(c,404,'PAYMENT_NOT_FOUND','Ödeme kaydı bulunamadı.');
  if(text(payment.status).toUpperCase()!=='PAID') return fail(c,409,'PAYMENT_ALREADY_CANCELLED','Bu ödeme zaten aktif değil.');
  const itemsResult=await c.env.DB.prepare("SELECT * FROM hr_daily_payment_items WHERE payment_id=? AND main_company_id=? AND active=1").bind(paymentId,companyId).all<Row>();
  const items=itemsResult.results||[];
  const actor=await actorOf(c); const timestamp=nowIso(); const statements:D1PreparedStatement[]=[];
  statements.push(c.env.DB.prepare(`UPDATE hr_daily_payments SET status='CANCELLED',cancelled_at=?,cancelled_by_user_id=?,cancelled_by_label=?,cancel_reason=?,updated_at=? WHERE id=? AND main_company_id=?`).bind(timestamp,actor.id||null,actor.label,reason,timestamp,paymentId,companyId));
  statements.push(c.env.DB.prepare("UPDATE hr_daily_payment_items SET active=0 WHERE payment_id=? AND main_company_id=?").bind(paymentId,companyId));
  for(const attendanceId of [...new Set(items.map((item)=>text(item.attendance_id)).filter(Boolean))]) statements.push(c.env.DB.prepare("UPDATE hr_daily_attendance SET payment_status='WAITING',updated_at=? WHERE id=?").bind(timestamp,attendanceId));
  statements.push(auditStmt(c,{companyId,employeeId:text(payment.employee_id),workDate:dateOnly(payment.period_start),action:'PAYMENT_CANCEL',before:{paymentId,paymentNo:text(payment.payment_no),status:'PAID'},after:{status:'CANCELLED',reason},actor,note:reason,source:'KYERP_DAILY_PAYMENT_V1'}));
  await c.env.DB.batch(statements);
  return ok(c,{paymentId,paymentNo:text(payment.payment_no),status:'CANCELLED',cancelReason:reason,cancelledAt:timestamp,cancelledByLabel:actor.label});
}

'''
api=api.replace(func_anchor,new_funcs+func_anchor,1)
route_anchor='''  app.post("/api/gunluk-operasyon/attendance/mark-paid", protect(markPaid));'''
route_insert=route_anchor+'''\n\n  app.get("/api/gunluk-operasyon/payments/pool", protect(paymentPool));\n  app.get("/api/gunluk-operasyon/payments/history", protect(paymentHistory));\n  app.post("/api/gunluk-operasyon/payments", protect(createPayment));\n  app.post("/api/gunluk-operasyon/payments/:id/cancel", protect(cancelPayment));'''
if route_anchor not in api: raise SystemExit('route anchor missing')
api=api.replace(route_anchor,route_insert,1)

# ---- service methods ----
svc_anchor='''export function markDailyPaid(args = {}) {\n  return apiPost(`${BASE}/attendance/mark-paid`, args).then(unwrapData);\n}'''
svc_insert=svc_anchor+'''\n\nexport function getDailyPaymentPool(args = {}, options = {}) {\n  return apiGet(`${BASE}/payments/pool${query(args)}`, freshGetOptions(options)).then(unwrapList);\n}\n\nexport function getDailyPaymentHistory(args = {}, options = {}) {\n  return apiGet(`${BASE}/payments/history${query(args)}`, freshGetOptions(options)).then(unwrapList);\n}\n\nexport function createDailyPayment(args = {}) {\n  return apiPost(`${BASE}/payments`, args).then(unwrapData);\n}\n\nexport function cancelDailyPayment(paymentId, args = {}) {\n  return apiPost(`${BASE}/payments/${encodeURIComponent(paymentId)}/cancel`, args).then(unwrapData);\n}'''
if svc_anchor not in svc: raise SystemExit('service anchor missing')
svc=svc.replace(svc_anchor,svc_insert,1)

# ---- frontend imports ----
fe=fe.replace('''  getDailyPaymentSlips,\n''','''  getDailyPaymentHistory,\n  getDailyPaymentPool,\n''',1)
fe=fe.replace('''  markDailyPaid,\n''','''  cancelDailyPayment,\n  createDailyPayment,\n''',1)

# states
state_anchor='''  const [paymentRows, setPaymentRows] = useState([]);\n  const [paymentSelectedIds, setPaymentSelectedIds] = useState(() => new Set());\n  const [paymentFilter, setPaymentFilter] = useState("all");'''
state_insert='''  const [paymentRows, setPaymentRows] = useState([]);\n  const [paymentHistoryRows, setPaymentHistoryRows] = useState([]);\n  const [paymentSelectedIds, setPaymentSelectedIds] = useState(() => new Set());\n  const [paymentTab, setPaymentTab] = useState("pool");\n  const [paymentHistoryStatus, setPaymentHistoryStatus] = useState("all");\n  const [paymentHistoryGroup, setPaymentHistoryGroup] = useState("day");'''
if state_anchor not in fe: raise SystemExit('payment states anchor missing')
fe=fe.replace(state_anchor,state_insert,1)

# load payments
load_pattern=re.compile(r'''  const loadPayments = useCallback\(async \(\) => \{.*?\n  \}, \[companyId, range\.end, range\.start, view\]\);\n  useEffect\(\(\) => \{ void loadPayments\(\); \}, \[loadPayments\]\);''',re.S)
load_repl='''  const loadPayments = useCallback(async () => {\n    if (!companyId || !["daily-payments", "daily-dashboard"].includes(view)) return;\n    setLoading(true); setError("");\n    try { const rows = await getDailyPaymentPool({ mainCompanyId: companyId, startDate: range.start, endDate: range.end }); setPaymentRows(Array.isArray(rows) ? rows : []); }\n    catch (e) { setError(e?.message || "Ödeme havuzu alınamadı."); } finally { setLoading(false); }\n  }, [companyId, range.end, range.start, view]);\n  useEffect(() => { void loadPayments(); }, [loadPayments]);\n\n  const loadPaymentHistory = useCallback(async () => {\n    if (!companyId || view !== "daily-payments") return;\n    try {\n      const rows = await getDailyPaymentHistory({ mainCompanyId: companyId, startDate: range.start, endDate: range.end, status: paymentHistoryStatus === "all" ? "" : paymentHistoryStatus.toUpperCase() });\n      setPaymentHistoryRows(Array.isArray(rows) ? rows : []);\n    } catch (e) { setError(e?.message || "Yapılan ödemeler alınamadı."); }\n  }, [companyId, paymentHistoryStatus, range.end, range.start, view]);\n  useEffect(() => { void loadPaymentHistory(); }, [loadPaymentHistory]);'''
fe,n=load_pattern.subn(load_repl,fe,count=1)
if n!=1: raise SystemExit('loadPayments pattern missing')

# derived metrics replace old paymentSettled block through paymentMetrics
metrics_pattern=re.compile(r'''  const paymentSettled = useCallback\(\(row\) => \{.*?\n  \}, \{ total: 0, paidCount: 0, waitingCount: 0, paidAmount: 0, waitingAmount: 0 \}.*?;''',re.S)
metrics_repl='''  const paymentMetrics = useMemo(() => paymentRows.reduce((sum, row) => {\n    sum.waitingCount += 1;\n    sum.waitingAmount += number(row.totalAmount);\n    sum.totalDays += number(row.totalDays ?? (number(row.dayCount) + number(row.nightCount)));\n    if (number(row.pendingCheckCount) > 0) sum.controlPending += 1;\n    return sum;\n  }, { waitingCount: 0, waitingAmount: 0, totalDays: 0, controlPending: 0 }), [paymentRows]);\n  const paymentHistoryMetrics = useMemo(() => paymentHistoryRows.reduce((sum, row) => {\n    if (String(row.status).toUpperCase() !== "PAID") return sum;\n    sum.amount += number(row.totalAmount); sum.count += 1; sum.days += number(row.totalDays); sum.people.add(String(row.employeeId)); return sum;\n  }, { amount: 0, count: 0, days: 0, people: new Set() }), [paymentHistoryRows]);\n  const paymentHistoryGroups = useMemo(() => {\n    const groups = new Map();\n    paymentHistoryRows.forEach((row) => {\n      const date = row.paidDate || String(row.paidAt || "").slice(0, 10);\n      const key = paymentHistoryGroup === "month" ? String(date).slice(0, 7) : paymentHistoryGroup === "week" ? startOfWeek(date) : date;\n      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row);\n    });\n    return [...groups.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0])));\n  }, [paymentHistoryGroup, paymentHistoryRows]);'''
fe,n=metrics_pattern.subn(metrics_repl,fe,count=1)
if n!=1: raise SystemExit('payment metrics pattern missing')

# selected rows old dependency
fe=fe.replace('''  const selectedPaymentRows = useMemo(() => paymentRows.filter((row) => paymentSelectedIds.has(String(row.employeeId || row.id || row.personnelNo || row.name || row.fullName || ""))), [paymentRows, paymentSelectedIds]);''','''  const selectedPaymentRows = useMemo(() => paymentRows.filter((row) => paymentSelectedIds.has(String(row.employeeId))), [paymentRows, paymentSelectedIds]);''',1)

# replace pay handlers
pay_pattern=re.compile(r'''  const payRow = async \(row\) => \{.*?\n  \};\n  const paySelectedRows = async \(\) => \{.*?\n  \};''',re.S)
pay_repl='''  const payRow = async (row, printAfter = false) => {\n    if (busy || number(row.pendingCheckCount) > 0) return;\n    setBusy(true); setError("");\n    try {\n      const payment = await createDailyPayment({ mainCompanyId: companyId, employeeId: row.employeeId, startDate: range.start, endDate: range.end, paymentDate: localDateKey() });\n      setNotice(`${payment?.paymentNo || "Ödeme"} · ${row.name || row.fullName} ödendi.`);\n      await Promise.all([loadPayments(), loadPaymentHistory(), loadRangeData()]);\n      if (printAfter) printPaidPaymentReceipt(payment || { ...row, periodStart: range.start, periodEnd: range.end, paidDate: localDateKey(), status: "PAID" });\n    } catch (e) { setError(e?.message || "Ödeme tamamlanamadı."); } finally { setBusy(false); }\n  };\n  const paySelectedRows = async () => {\n    const rows = selectedPaymentRows.filter((row) => number(row.pendingCheckCount) === 0);\n    if (busy || !rows.length) return;\n    setBusy(true); setError("");\n    try {\n      let completed = 0;\n      for (const row of rows) { await createDailyPayment({ mainCompanyId: companyId, employeeId: row.employeeId, startDate: range.start, endDate: range.end, paymentDate: localDateKey() }); completed += 1; }\n      setPaymentSelectedIds(new Set()); setNotice(`${completed} personelin ödemesi kaydedildi.`);\n      await Promise.all([loadPayments(), loadPaymentHistory(), loadRangeData()]);\n    } catch (e) { setError(e?.message || "Seçili ödemeler tamamlanamadı."); } finally { setBusy(false); }\n  };\n  const cancelPaymentRow = async (row) => {\n    if (busy || String(row.status).toUpperCase() !== "PAID") return;\n    const reason = window.prompt(`${row.paymentNo || "Ödeme"} iptal nedeni:`);\n    if (!reason?.trim()) return;\n    if (!window.confirm(`${row.paymentNo || "Ödeme"} iptal edilsin mi? Ödeme geçmişi silinmeyecek; hakediş tekrar ödeme havuzuna açılacak.`)) return;\n    setBusy(true); setError("");\n    try { await cancelDailyPayment(row.id || row.paymentId, { mainCompanyId: companyId, reason: reason.trim() }); setNotice(`${row.paymentNo} iptal edildi; hakediş yeniden havuza açıldı.`); await Promise.all([loadPaymentHistory(), loadPayments(), loadRangeData()]); }\n    catch (e) { setError(e?.message || "Ödeme iptal edilemedi."); } finally { setBusy(false); }\n  };\n  const paymentPreset = (mode) => {\n    const today = localDateKey(); const start = startOfWeek(today); const [year, month] = today.split("-").map(Number);\n    if (mode === "today") return setSafeRange({ start: today, end: today });\n    if (mode === "week") return setSafeRange({ start, end: addDays(start, 6) });\n    if (mode === "lastWeek") { const previous = addDays(start, -7); return setSafeRange({ start: previous, end: addDays(previous, 6) }); }\n    if (mode === "month") return setSafeRange({ start: `${year}-${pad(month)}-01`, end: localDateKey(new Date(year, month, 0, 12)) });\n    if (mode === "lastMonth") { const d = new Date(year, month - 2, 1, 12); return setSafeRange({ start: localDateKey(d), end: localDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)) }); }\n    if (mode === "year") return setSafeRange({ start: `${year}-01-01`, end: `${year}-12-31` });\n  };'''
fe,n=pay_pattern.subn(pay_repl,fe,count=1)
if n!=1: raise SystemExit('pay handler pattern missing')

# add receipt helper before actionLabel
receipt_anchor='''function actionLabel(row = {}) {'''
receipt_func=r'''function printPaidPaymentReceipt(row = {}) {
  const items = Array.isArray(row.items) ? row.items : [];
  const details = items.length ? items.map((item) => `<tr><td>${escapeHtml(dateText(item.workDate))}</td><td>${item.shift === "night" ? "Gece" : "Gündüz"}</td><td>${escapeHtml(money(item.amount))}</td></tr>`).join("") : `<tr><td colspan="3">Gündüz ${number(row.dayCount)} · Gece ${number(row.nightCount)}</td></tr>`;
  return printHtmlDocument({ title: `Ödeme Fişi ${row.paymentNo || ""}`, html: `<main class="paid-receipt"><header><h1>KY ERP PERSONEL ÖDEME FİŞİ</h1><b>${escapeHtml(row.paymentNo || "")}</b></header><section><div><span>Personel</span><strong>${escapeHtml(row.name || row.fullName || "-")}</strong></div><div><span>Hakediş Dönemi</span><strong>${escapeHtml(dateText(row.periodStart || row.startDate))} — ${escapeHtml(dateText(row.periodEnd || row.endDate))}</strong></div><div><span>Ödeme Tarihi</span><strong>${escapeHtml(dateText(row.paidDate || String(row.paidAt || "").slice(0,10)))}</strong></div><div><span>Ödeyen</span><strong>${escapeHtml(row.paidByLabel || "KY ERP Kullanıcısı")}</strong></div></section><table><thead><tr><th>Tarih</th><th>Vardiya</th><th>Tutar</th></tr></thead><tbody>${details}</tbody></table><footer><span>ÖDENDİ</span><strong>${escapeHtml(money(row.totalAmount))}</strong></footer></main>`, css: `@page{size:A4 portrait;margin:14mm}body{font-family:Arial,sans-serif;color:#111}.paid-receipt{max-width:180mm;margin:auto}.paid-receipt header{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px}.paid-receipt h1{font-size:16px;margin:0}.paid-receipt section{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}.paid-receipt section div{border:1px solid #bbb;padding:8px}.paid-receipt span{display:block;font-size:11px}.paid-receipt strong{font-size:14px}.paid-receipt table{width:100%;border-collapse:collapse}.paid-receipt th,.paid-receipt td{border:1px solid #777;padding:6px;text-align:left}.paid-receipt footer{margin-top:14px;border:2px solid #111;padding:12px;display:flex;justify-content:space-between;align-items:center}.paid-receipt footer span{font-size:18px;font-weight:900}.paid-receipt footer strong{font-size:24px}` });
}

'''
if receipt_anchor not in fe: raise SystemExit('receipt anchor missing')
fe=fe.replace(receipt_anchor,receipt_func+receipt_anchor,1)

# header title rename
fe=fe.replace(''' : "Ödeme Fişleri"}</h1>''',''' : "Ödemeler"}</h1>''',1)

# live sync daily payments load both
fe=fe.replace('''      } else if (view === "daily-payments") {\n        await loadPayments();''','''      } else if (view === "daily-payments") {\n        await Promise.all([loadPayments(), loadPaymentHistory()]);''',1)
fe=fe.replace('''  }, [activeRosterPeople, busy, checkedIds, companyId, loadEmployees, loadFocused, loadPayments, loadRangeData, loadWeekly, notes, quick, recordByEmployee, records, rosterSaved, selectedIds, view]);''','''  }, [activeRosterPeople, busy, checkedIds, companyId, loadEmployees, loadFocused, loadPaymentHistory, loadPayments, loadRangeData, loadWeekly, notes, quick, recordByEmployee, records, rosterSaved, selectedIds, view]);''',1)

# replace complete payment render
start_marker='''      {view === "daily-payments" ? '''
end_marker='''\n\n\n      {quick ?'''
start_idx=fe.find(start_marker)
end_idx=fe.find(end_marker,start_idx)
if start_idx<0 or end_idx<0: raise SystemExit('payment render boundaries missing')
new_render=r'''      {view === "daily-payments" ? <div className="gop-payments-v2">
        <div className="gop-payment-tabs"><button type="button" className={paymentTab === "pool" ? "active" : ""} onClick={() => setPaymentTab("pool")}><WalletCards size={16}/> Ödeme Havuzu <b>{paymentRows.length}</b></button><button type="button" className={paymentTab === "history" ? "active" : ""} onClick={() => setPaymentTab("history")}><ClipboardList size={16}/> Yapılan Ödemeler <b>{paymentHistoryRows.filter((row) => String(row.status).toUpperCase() === "PAID").length}</b></button></div>
        <div className="gop-toolbar-card payment-toolbar"><div className="gop-preset-buttons"><button type="button" onClick={() => paymentPreset("today")}>Bugün</button><button type="button" onClick={() => paymentPreset("week")}>Bu Hafta</button><button type="button" onClick={() => paymentPreset("lastWeek")}>Geçen Hafta</button><button type="button" onClick={() => paymentPreset("month")}>Bu Ay</button><button type="button" onClick={() => paymentPreset("lastMonth")}>Geçen Ay</button><button type="button" onClick={() => paymentPreset("year")}>Bu Yıl</button></div>{rangeControls}</div>
        {paymentTab === "pool" ? <>
          <div className="gop-payment-stats"><Stat label="Ödeme Bekleyen" value={paymentRows.length} hint={`${paymentMetrics.totalDays} vardiya`}/><Stat label="Bekleyen Tutar" value={money(paymentMetrics.waitingAmount)}/><Stat label="Kontrol Bekleyen" value={paymentMetrics.controlPending} hint="Ödeme öncesi tamamlanmalı"/><Stat label="Hakediş Dönemi" value={`${dateText(range.start)} — ${dateText(range.end)}`}/></div>
          <div className="gop-card"><div className="gop-card-head payment-head"><div><h2>Ödeme Havuzu</h2><span>Kontrolü tamamlanan hakedişleri ödeyin. Fiş önizlemek ödeme durumunu değiştirmez.</span></div><div className="gop-print-actions"><button type="button" onClick={() => setPaymentSelectedIds(new Set(paymentRows.map((row) => String(row.employeeId))))}>Tümünü Seç</button><button type="button" disabled={!paymentSelectedIds.size} onClick={() => setPaymentSelectedIds(new Set())}>Seçimi Kaldır</button><button type="button" className="primary" disabled={busy || !selectedPaymentRows.length || selectedPaymentRows.some((row) => number(row.pendingCheckCount) > 0)} onClick={paySelectedRows}><WalletCards size={15}/> Seçili Ödendi</button></div></div>
            <div className="gop-payment-ledger-table"><table><thead><tr><th>Seç</th><th>Personel</th><th>Hakediş Dönemi</th><th>Gündüz</th><th>Gece</th><th>Toplam</th><th>Ödenecek</th><th>Kontrol</th><th>İşlem</th></tr></thead><tbody>{paymentRows.length ? paymentRows.map((row) => { const key=String(row.employeeId); const picked=paymentSelectedIds.has(key); const ready=number(row.pendingCheckCount)===0; return <tr key={key} className={!ready ? "needs-control" : ""}><td><input type="checkbox" checked={picked} onChange={() => setPaymentSelectedIds((current) => { const next=new Set(current); if(next.has(key)) next.delete(key); else next.add(key); return next; })}/></td><td><strong>{row.name || row.fullName}</strong><small>{row.personnelNo || ""} · {row.qualification || "-"}</small></td><td>{dateText(row.periodStart)} — {dateText(row.periodEnd)}</td><td>{number(row.dayCount)}</td><td>{number(row.nightCount)}</td><td><b>{number(row.totalDays)}</b></td><td className="money"><strong>{money(row.totalAmount)}</strong></td><td><span className={`gop-badge ${ready ? "ok" : "waiting"}`}>{ready ? "✓ Tam" : `${number(row.pendingCheckCount)} eksik`}</span></td><td><div className="ledger-actions"><button type="button" onClick={() => printDailyPaymentSlips(range,[row])}><Printer size={14}/> Fiş Önizle</button><button type="button" className="primary" disabled={busy || !ready} onClick={() => payRow(row,false)}><WalletCards size={14}/> Ödendi Yap</button><button type="button" className="primary soft" disabled={busy || !ready} onClick={() => payRow(row,true)}><Printer size={14}/> Ödendi + Fiş</button></div></td></tr>; }) : <tr><td colSpan="9"><Empty>Bu hakediş döneminde açık ödeme yok.</Empty></td></tr>}</tbody></table></div>
          </div>
        </> : <>
          <div className="gop-payment-stats"><Stat label="Yapılan Ödeme" value={money(paymentHistoryMetrics.amount)}/><Stat label="Ödeme Adedi" value={paymentHistoryMetrics.count}/><Stat label="Personel" value={paymentHistoryMetrics.people.size}/><Stat label="Toplam Gün/Vardiya" value={paymentHistoryMetrics.days}/></div>
          <div className="gop-card"><div className="gop-card-head payment-head"><div><h2>Yapılan Ödemeler</h2><span>Ödeme tarihine göre kalıcı ödeme defteri. Hakediş dönemi ayrıca korunur.</span></div><div className="gop-payment-filter"><button type="button" className={paymentHistoryStatus === "all" ? "active" : ""} onClick={() => setPaymentHistoryStatus("all")}>Tümü</button><button type="button" className={paymentHistoryStatus === "paid" ? "active" : ""} onClick={() => setPaymentHistoryStatus("paid")}>Ödenen</button><button type="button" className={paymentHistoryStatus === "cancelled" ? "active" : ""} onClick={() => setPaymentHistoryStatus("cancelled")}>İptal</button><select value={paymentHistoryGroup} onChange={(e) => setPaymentHistoryGroup(e.target.value)}><option value="day">Günlük</option><option value="week">Haftalık</option><option value="month">Aylık</option></select></div></div>
            <div className="gop-payment-history">{paymentHistoryGroups.length ? paymentHistoryGroups.map(([group,rows]) => <section key={group}><header><strong>{paymentHistoryGroup === "month" ? group : paymentHistoryGroup === "week" ? `${dateText(group)} haftası` : dateText(group)}</strong><span>{rows.length} ödeme · {money(rows.filter((row)=>String(row.status).toUpperCase()==="PAID").reduce((sum,row)=>sum+number(row.totalAmount),0))}</span></header><div className="gop-payment-ledger-table"><table><thead><tr><th>Ödeme No</th><th>Ödeme Tarihi</th><th>Personel</th><th>Hakediş Dönemi</th><th>G</th><th>N</th><th>Toplam</th><th>Tutar</th><th>Ödeyen</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id} className={String(row.status).toUpperCase()==="CANCELLED"?"cancelled":""}><td><strong>{row.paymentNo}</strong></td><td>{dateText(row.paidDate)}<small>{dateTimeText(row.paidAt)}</small></td><td><strong>{row.name}</strong><small>{row.personnelNo || ""}</small></td><td>{dateText(row.periodStart)} — {dateText(row.periodEnd)}</td><td>{number(row.dayCount)}</td><td>{number(row.nightCount)}</td><td>{number(row.totalDays)}</td><td className="money"><strong>{money(row.totalAmount)}</strong></td><td>{row.paidByLabel || "-"}</td><td><span className={`gop-badge ${String(row.status).toUpperCase()==="PAID"?"ok":"waiting"}`}>{String(row.status).toUpperCase()==="PAID"?"Ödendi":"İptal"}</span>{row.cancelReason?<small>{row.cancelReason}</small>:null}</td><td><div className="ledger-actions"><button type="button" onClick={()=>printPaidPaymentReceipt(row)}><Printer size={14}/> Fiş</button>{String(row.status).toUpperCase()==="PAID"?<button type="button" disabled={busy} onClick={()=>cancelPaymentRow(row)}><Trash2 size={14}/> İptal</button>:null}</div></td></tr>)}</tbody></table></div></section>) : <Empty>Seçili ödeme tarihi aralığında kayıt yok.</Empty>}</div>
          </div>
        </>}
      </div> : null}'''
fe=fe[:start_idx]+new_render+fe[end_idx:]

# Dashboard payment metrics refs old fields
fe=fe.replace('paymentMetrics.paidAmount','0',10)
fe=fe.replace('paymentMetrics.paidCount','0',10)
# dashboard still waitingCount/amount valid

# CSS append clean payment styles
css += r'''

/* Günlük Operasyon / Ödemeler V2 */
.gop-payments-v2{display:grid;gap:12px}.gop-payment-tabs{display:flex;gap:8px;padding:6px;background:#fff;border:1px solid #dbe3ef;border-radius:12px}.gop-payment-tabs button{border:0;background:transparent;padding:10px 16px;border-radius:9px;font-weight:800;display:flex;align-items:center;gap:7px;color:#42526a}.gop-payment-tabs button.active{background:#edf4ff;color:#155eef;box-shadow:inset 0 0 0 1px #bfd3ff}.gop-payment-tabs b{min-width:22px;padding:2px 6px;border-radius:999px;background:#fff;text-align:center}.payment-toolbar{gap:12px;flex-wrap:wrap}.gop-payment-ledger-table{overflow:auto}.gop-payment-ledger-table table{width:100%;border-collapse:collapse;min-width:1120px;font-size:12px}.gop-payment-ledger-table th{background:#f7f9fc;color:#536176;text-align:left;padding:9px 8px;border-bottom:1px solid #dce4ee;white-space:nowrap}.gop-payment-ledger-table td{padding:9px 8px;border-bottom:1px solid #edf1f6;vertical-align:middle}.gop-payment-ledger-table td>strong,.gop-payment-ledger-table td>small{display:block}.gop-payment-ledger-table td.money strong{font-size:14px;color:#132a4a}.gop-payment-ledger-table tr.needs-control{background:#fffaf0}.gop-payment-ledger-table tr.cancelled{opacity:.67;background:#fafafa}.ledger-actions{display:flex;gap:5px;white-space:nowrap}.ledger-actions button{border:1px solid #d6dfeb;background:#fff;border-radius:7px;padding:6px 8px;font-weight:700;display:inline-flex;align-items:center;gap:4px}.ledger-actions button.primary{background:#2563eb;color:#fff;border-color:#2563eb}.ledger-actions button.soft{background:#eef4ff;color:#174ea6;border-color:#bfd3ff}.gop-payment-history{display:grid;gap:12px}.gop-payment-history>section{border:1px solid #e0e7f0;border-radius:10px;overflow:hidden}.gop-payment-history>section>header{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:#f7f9fc}.gop-payment-filter select{border:1px solid #d6dfeb;border-radius:7px;padding:7px 9px;background:#fff}.gop-preset-buttons{display:flex;gap:5px;flex-wrap:wrap}.gop-preset-buttons button{border:1px solid #d6dfeb;background:#fff;border-radius:7px;padding:7px 10px;font-weight:700}.gop-payment-stats .gop-stat{min-width:150px}
'''

# sanity checks
assert 'getDailyPaymentPool' in svc and 'createDailyPayment' in svc and 'cancelDailyPayment' in svc
assert 'CREATE TABLE IF NOT EXISTS hr_daily_payments' in api
assert 'idx_daily_payment_item_active' in api
assert 'app.post("/api/gunluk-operasyon/payments/:id/cancel"' in api
assert 'Ödeme Havuzu' in fe and 'Yapılan Ödemeler' in fe
assert 'markDailyPaid' not in fe
assert 'getDailyPaymentSlips' not in fe

API.write_text(api,encoding='utf-8')
SVC.write_text(svc,encoding='utf-8')
FE.write_text(fe,encoding='utf-8')
CSS.write_text(css,encoding='utf-8')
print('payments ledger final applied')
