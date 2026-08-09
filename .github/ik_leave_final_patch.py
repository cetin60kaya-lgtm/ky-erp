from pathlib import Path
import subprocess

ROOT = Path('.')
FRONT = ROOT / 'APP/app/ky-erp-frontend/src/pages/modules/IkAdvancedMonthly.jsx'
CSS = ROOT / 'APP/app/ky-erp-frontend/src/pages/modules/ik.advanced.css'
API = ROOT / 'APP/app/ky-erp-frontend/src/services/ikApi.js'
CLOUD = ROOT / 'APP/cloud/ky-erp-api/src/ik-relational-cloud.ts'
TEST = ROOT / 'APP/cloud/ky-erp-api/src/ik-relational-cloud.test.ts'
MIG = ROOT / 'APP/cloud/ky-erp-api/migrations/0009_hr_leave_engine.sql'
AGENT = 'origin/agent/uretim-tek-merkez'

def agent_file(path: Path) -> str:
    return subprocess.check_output(['git','show',f'{AGENT}:{path.as_posix()}'], text=True)

def replace_once(src: str, old: str, new: str, label: str) -> str:
    if old not in src:
        raise SystemExit(f'PATCH MARKER NOT FOUND: {label}')
    return src.replace(old, new, 1)

# Start from the newest validated IK source ownership branch so payroll/person-card fixes are preserved.
for path in (FRONT, CSS, API, CLOUD, TEST):
    path.write_text(agent_file(path), encoding='utf-8')

# ------------------------- D1 annual leave engine -------------------------
cloud = CLOUD.read_text(encoding='utf-8')
leave_block = r'''
const DEFAULT_TR_OFFICIAL_HOLIDAYS_2026 = [
  "2026-01-01",
  "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22",
  "2026-04-23", "2026-05-01", "2026-05-19",
  "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30",
  "2026-07-15", "2026-08-30", "2026-10-28", "2026-10-29",
];

function addIsoDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function calculateAnnualLeaveRange(
  startDate: string,
  returnDate: string,
  countedWeekdays: number[] = [1, 2, 3, 4, 5, 6],
  excludeOfficialHolidays = true,
  officialHolidayDates: string[] = [],
) {
  const official = new Set(officialHolidayDates);
  const counted = new Set(countedWeekdays.map(Number));
  const countedDates: string[] = [];
  const excludedDates: Array<{ date: string; reason: string }> = [];
  const calendarDates: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(returnDate) || returnDate <= startDate) {
    return { startDate, returnDate, lastLeaveDate: "", calendarDays: 0, calendarDates, countedDays: 0, countedDates, excludedDates };
  }
  for (let date = startDate, guard = 0; date < returnDate && guard < 371; date = addIsoDays(date, 1), guard += 1) {
    calendarDates.push(date);
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const isHoliday = official.has(date);
    const weekdayCounted = counted.has(weekday);
    if (weekdayCounted && !(excludeOfficialHolidays && isHoliday)) {
      countedDates.push(date);
    } else {
      const reasons: string[] = [];
      if (!weekdayCounted) reasons.push(weekday === 0 ? "Pazar / haftalık tatil" : "Şirket izin sayım günü değil");
      if (excludeOfficialHolidays && isHoliday) reasons.push("Resmi tatil");
      excludedDates.push({ date, reason: reasons.join(" + ") || "Sayılmayan gün" });
    }
  }
  return {
    startDate,
    returnDate,
    lastLeaveDate: calendarDates.at(-1) || "",
    calendarDays: calendarDates.length,
    calendarDates,
    countedDays: countedDates.length,
    countedDates,
    excludedDates,
  };
}

async function leavePolicyV2(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  const row = await first(c, "SELECT * FROM ik_leave_counting_policy WHERE main_company_id=? LIMIT 1", [companyId]);
  let countedWeekdays = [1, 2, 3, 4, 5, 6];
  try {
    const parsed = JSON.parse(text(row?.counted_weekdays_json) || "[]");
    if (Array.isArray(parsed) && parsed.length) countedWeekdays = parsed.map(Number).filter((day) => day >= 0 && day <= 6);
  } catch {}
  return {
    mainCompanyId: companyId,
    countedWeekdays,
    excludeOfficialHolidays: row ? flag(row.exclude_official_holidays) : true,
    maxConcurrentDepartment: Math.max(1, number(row?.max_concurrent_department) || 1),
    updatedAt: row?.updated_at || null,
  };
}

async function officialHolidayDatesV2(c: Context<AppEnv>, companyId: string) {
  const dates = new Set<string>(DEFAULT_TR_OFFICIAL_HOLIDAYS_2026);
  try {
    const exists = await first(c, "SELECT name FROM sqlite_master WHERE type='table' AND name='json_store' LIMIT 1");
    if (exists?.name) {
      const rows = await all(c, "SELECT data FROM json_store WHERE scope='IK_OFFICIAL_HOLIDAY' AND (main_company_slug=? OR main_company_slug IS NULL)", [companyId]);
      for (const row of rows) {
        try {
          const parsed = JSON.parse(text(row.data) || "{}");
          const date = hrDateOnly(parsed?.date || parsed?.holidayDate || parsed?.workDate);
          if (date) dates.add(date);
        } catch {}
      }
    }
  } catch {}
  return [...dates];
}

async function saveAdvancedLeavePolicyV2(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const rawDays = Array.isArray(body.countedWeekdays) ? body.countedWeekdays : [1, 2, 3, 4, 5, 6];
  const countedWeekdays = [...new Set(rawDays.map(Number).filter((day) => day >= 0 && day <= 6))].sort();
  if (!countedWeekdays.length) return error(c, 400, "LEAVE_POLICY_EMPTY", "En az bir izin sayım günü seçilmelidir.");
  const excludeOfficialHolidays = body.excludeOfficialHolidays !== false;
  const maxConcurrentDepartment = Math.max(1, number(body.maxConcurrentDepartment) || 1);
  await c.env.DB.prepare(`INSERT INTO ik_leave_counting_policy
    (main_company_id,counted_weekdays_json,exclude_official_holidays,max_concurrent_department,updated_by,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(main_company_id) DO UPDATE SET
      counted_weekdays_json=excluded.counted_weekdays_json,
      exclude_official_holidays=excluded.exclude_official_holidays,
      max_concurrent_department=excluded.max_concurrent_department,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at`)
    .bind(companyId, JSON.stringify(countedWeekdays), excludeOfficialHolidays ? 1 : 0, maxConcurrentDepartment, text(body.userName) || "Sistem", nowIso()).run();
  const policy = await leavePolicyV2(c, companyId);
  await audit(c, { mainCompanyId: companyId, entityType: "IZIN_POLITIKASI", action: "UPDATE", summary: "Yıllık izin gün sayım ayarları güncellendi.", details: policy });
  return okData(c, { policy });
}

async function previewAdvancedLeaveV2(c: Context<AppEnv>, supplied?: Row) {
  const body = supplied || await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId || body.personId);
  const startDate = hrDateOnly(body.startDate || body.start);
  const returnDate = hrDateOnly(body.returnDate || body.endDate || body.end);
  if (!employeeId || !startDate || !returnDate || returnDate <= startDate) {
    return supplied ? null : error(c, 400, "LEAVE_DATE_REQUIRED", "Personel, izne çıkış ve işe dönüş tarihi zorunludur. İşe dönüş tarihi izne çıkıştan sonra olmalıdır.");
  }
  const employees = await monthlyRows(c, companyId);
  const employee = employees.find((row) => text(row.id) === employeeId);
  if (!employee) return supplied ? null : error(c, 400, "INVALID_EMPLOYEE", "Personel bulunamadı.");
  const policy = await leavePolicyV2(c, companyId);
  const officialHolidays = await officialHolidayDatesV2(c, companyId);
  const range = calculateAnnualLeaveRange(startDate, returnDate, policy.countedWeekdays, policy.excludeOfficialHolidays, officialHolidays);
  if (!range.calendarDays || range.calendarDays > 370) return supplied ? null : error(c, 400, "LEAVE_RANGE_INVALID", "İzin aralığı 1 ile 370 takvim günü arasında olmalıdır.");

  const currentId = text(body.id);
  const overlaps = await all(c, `SELECT id,employee_id,start_date,end_date,status,record_type
      FROM ik_leave_plans
      WHERE main_company_id=? AND status<>'CANCELLED' AND start_date<=? AND end_date>=? AND id<>?`,
    [companyId, range.lastLeaveDate, startDate, currentId]);
  const employeeMap = new Map(employees.map((row) => [text(row.id), row]));
  const sameDepartmentCount = overlaps.filter((row) => {
    const other = employeeMap.get(text(row.employee_id));
    return text(row.employee_id) !== employeeId && text(other?.department) && text(other?.department) === text(employee.department);
  }).length;
  const departmentLimitExceeded = sameDepartmentCount + 1 > policy.maxConcurrentDepartment;
  const conflicts = overlaps.map((row) => {
    const other = employeeMap.get(text(row.employee_id));
    const same = text(row.employee_id) === employeeId;
    const sameDepartment = Boolean(text(other?.department) && text(other?.department) === text(employee.department));
    return {
      id: text(row.id), employeeId: text(row.employee_id), fullName: text(other?.fullName) || "-", department: text(other?.department),
      startDate: hrDateOnly(row.start_date), endDate: hrDateOnly(row.end_date), status: text(row.status),
      severity: same ? "CRITICAL" : sameDepartment && departmentLimitExceeded ? "WARNING" : "INFO",
      message: same ? "Personelin aynı tarihlerde başka izin kaydı var." : sameDepartment && departmentLimitExceeded ? `${text(employee.department) || "Aynı bölüm"} için eş zamanlı izin sınırı aşılıyor.` : "Başka personelin izin planıyla tarih kesişiyor.",
    };
  });
  const marker = currentId ? `ik-leave-plan:${currentId}` : "";
  const usedRow = await first(c, `SELECT COALESCE(SUM(l.day_count),0) AS total
      FROM hr_leave_records_v2 l JOIN hr_monthly_employees e ON e.id=l.employee_id
      WHERE l.employee_id=? AND e.main_company_id=? AND UPPER(l.record_type) LIKE '%YILLIK%'
        AND (?='' OR COALESCE(l.document_path,'')<>?)`, [employeeId, companyId, marker, marker]);
  const annualRight = number(employee.annualLeaveEntitlement) + number(employee.annualLeaveCarryover);
  const annualUsed = number(usedRow?.total);
  const balanceBefore = annualRight - annualUsed;
  const balanceAfter = balanceBefore - range.countedDays;
  const data = {
    ok: true, employee, policy, officialHolidays, ...range,
    conflicts,
    hasCriticalConflict: conflicts.some((row) => row.severity === "CRITICAL"),
    hasDepartmentWarning: conflicts.some((row) => row.severity === "WARNING"),
    annualRight, annualUsed, balanceBefore, balanceAfter,
  };
  return supplied ? data : okData(c, data);
}

async function saveAdvancedLeaveRecordV2(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId || body.personId);
  const recordType = text(body.recordType || body.type) || "Yıllık izin";
  const isAnnual = upper(recordType).includes("YILLIK") || Boolean(text(body.returnDate));
  if (!isAnnual) {
    if (!(await employeeBelongsToCompany(c, employeeId, companyId))) return error(c, 400, "INVALID_EMPLOYEE", "Personel bulunamadı.");
    const startDate = hrDateOnly(body.startDate || body.start);
    const endDate = hrDateOnly(body.endDate || body.end || startDate);
    if (!startDate || !endDate || endDate < startDate) return error(c, 400, "DATE_REQUIRED", "Geçerli izin başlangıç ve bitiş tarihi zorunludur.");
    const dates = Array.isArray(body.dates) ? body.dates.map(hrDateOnly).filter(Boolean) : [];
    const diffDays = Math.max(1, Math.floor((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1);
    const dayCount = number(body.dayCount || body.days) || dates.length || diffDays;
    const id = text(body.id) || crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO hr_leave_records_v2 (id,employee_id,record_type,effect_type,start_date,end_date,day_count,document_path,note,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, employeeId, recordType, text(body.effectType || body.wageEffect) || "Kayıt", startDate, endDate, dayCount, text(body.documentPath || body.documentId), text(body.note), nowIso()).run();
    return okData(c, { id, employeeId, recordType, startDate, endDate, dayCount, status: "TAKEN" }, 201);
  }

  const preview = await previewAdvancedLeaveV2(c, body) as Row | null;
  if (!preview) return error(c, 400, "LEAVE_PREVIEW_FAILED", "Yıllık izin günleri hesaplanamadı.");
  if (preview.hasCriticalConflict) return error(c, 409, "LEAVE_CONFLICT", "Personelin seçilen tarihlerde başka yıllık izin kaydı var.");
  if (preview.hasDepartmentWarning && body.allowDepartmentConflict !== true) return error(c, 409, "DEPARTMENT_LEAVE_CONFLICT", "Aynı bölümde izin çakışması var. Yetkili onayı gerekir.");

  const statusRaw = upper(body.status || (text(preview.startDate) > new Date().toISOString().slice(0, 10) ? "PLANNED" : "APPROVED"));
  const status = ["PLANNED", "APPROVED", "TAKEN"].includes(statusRaw) ? statusRaw : "PLANNED";
  const planId = text(body.id) || crypto.randomUUID();
  const marker = `ik-leave-plan:${planId}`;
  const documentNo = text(body.documentNo || body.documentId);
  const note = text(body.note);
  const excludedDates = Array.isArray(preview.excludedDates) ? preview.excludedDates : [];
  await c.env.DB.prepare(`INSERT INTO ik_leave_plans
    (id,main_company_id,employee_id,record_type,start_date,end_date,return_date,counted_days,excluded_json,status,document_no,note,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id,record_type=excluded.record_type,start_date=excluded.start_date,end_date=excluded.end_date,return_date=excluded.return_date,counted_days=excluded.counted_days,excluded_json=excluded.excluded_json,status=excluded.status,document_no=excluded.document_no,note=excluded.note,updated_at=excluded.updated_at`)
    .bind(planId, companyId, employeeId, recordType, text(preview.startDate), text(preview.lastLeaveDate), text(preview.returnDate), number(preview.countedDays), JSON.stringify(excludedDates), status, documentNo, note, text(body.userName) || "Sistem", nowIso(), nowIso()).run();
  await c.env.DB.prepare("DELETE FROM hr_leave_records_v2 WHERE document_path=?").bind(marker).run();
  let recordId = "";
  if (status !== "PLANNED") {
    recordId = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO hr_leave_records_v2
      (id,employee_id,record_type,effect_type,start_date,end_date,day_count,document_path,note,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(recordId, employeeId, recordType, text(body.effectType || body.wageEffect) || "Ücretli", text(preview.startDate), text(preview.lastLeaveDate), number(preview.countedDays), marker, note, nowIso()).run();
  }
  await audit(c, { mainCompanyId: companyId, period: text(preview.startDate).slice(0, 7), employeeId, entityType: "IZIN", action: status === "PLANNED" ? "PLAN" : "APPROVE", summary: `${recordType}: ${number(preview.countedDays)} gün`, details: { planId, recordId, startDate: preview.startDate, lastLeaveDate: preview.lastLeaveDate, returnDate: preview.returnDate, countedDays: preview.countedDays } });
  return okData(c, { ...preview, planId, recordId, status, message: status === "PLANNED" ? "Yıllık izin planı kaydedildi." : "Yıllık izin resmi kaydı oluşturuldu." }, 201);
}

async function cancelAdvancedLeaveV2(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const id = text(body.id);
  if (!id) return error(c, 400, "ID_REQUIRED", "İzin kaydı seçilmelidir.");
  const plan = await first(c, "SELECT * FROM ik_leave_plans WHERE id=? AND main_company_id=? LIMIT 1", [id, companyId]);
  if (!plan) return error(c, 404, "NOT_FOUND", "İzin planı bulunamadı.");
  await c.env.DB.prepare("UPDATE ik_leave_plans SET status='CANCELLED',note=?,updated_at=? WHERE id=?").bind(text(body.reason || plan.note || "İptal edildi"), nowIso(), id).run();
  await c.env.DB.prepare("DELETE FROM hr_leave_records_v2 WHERE document_path=?").bind(`ik-leave-plan:${id}`).run();
  await audit(c, { mainCompanyId: companyId, period: hrDateOnly(plan.start_date).slice(0, 7), employeeId: text(plan.employee_id), entityType: "IZIN", action: "CANCEL", summary: "Yıllık izin kaydı iptal edildi.", details: { id, reason: text(body.reason) } });
  return okData(c, { id, cancelled: true, message: "İzin kaydı iptal edildi; izin bakiyesi etkisi geri alındı." });
}

async function leaveCenterV2(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const policy = await leavePolicyV2(c, companyId);
  const employees = await monthlyRows(c, companyId);
  const employeeMap = new Map(employees.map((row) => [text(row.id), row]));
  const managedRows = await all(c, "SELECT * FROM ik_leave_plans WHERE main_company_id=? ORDER BY start_date ASC", [companyId]);
  const managedPlans = managedRows.map((row) => {
    const employee = employeeMap.get(text(row.employee_id));
    let excludedDates: unknown[] = [];
    try { const parsed = JSON.parse(text(row.excluded_json) || "[]"); if (Array.isArray(parsed)) excludedDates = parsed; } catch {}
    return { id: text(row.id), employeeId: text(row.employee_id), fullName: text(employee?.fullName) || "-", code: text(employee?.code), department: text(employee?.department), title: text(employee?.title), recordType: text(row.record_type), startDate: hrDateOnly(row.start_date), endDate: hrDateOnly(row.end_date), lastLeaveDate: hrDateOnly(row.end_date), returnDate: hrDateOnly(row.return_date), countedDays: number(row.counted_days), excludedDates, status: text(row.status), documentNo: text(row.document_no), note: text(row.note), createdAt: row.created_at, updatedAt: row.updated_at, legacy: false };
  });
  const legacyRows = await all(c, `SELECT l.* FROM hr_leave_records_v2 l JOIN hr_monthly_employees e ON e.id=l.employee_id
      WHERE e.main_company_id=? AND (l.document_path IS NULL OR l.document_path NOT LIKE 'ik-leave-plan:%') ORDER BY l.start_date ASC`, [companyId]);
  const legacyPlans = legacyRows.filter((row) => upper(row.record_type).includes("YILLIK")).map((row) => {
    const employee = employeeMap.get(text(row.employee_id));
    const endDate = hrDateOnly(row.end_date);
    return { id: `legacy:${text(row.id)}`, employeeId: text(row.employee_id), fullName: text(employee?.fullName) || "-", code: text(employee?.code), department: text(employee?.department), title: text(employee?.title), recordType: text(row.record_type), startDate: hrDateOnly(row.start_date), endDate, lastLeaveDate: endDate, returnDate: addIsoDays(endDate, 1), countedDays: number(row.day_count), excludedDates: [], status: "TAKEN", documentNo: "", note: text(row.note), createdAt: row.created_at, updatedAt: row.created_at, legacy: true };
  });
  const plans = [...managedPlans, ...legacyPlans].sort((a, b) => text(a.startDate).localeCompare(text(b.startDate)));
  const active = managedPlans.filter((row) => row.status !== "CANCELLED");
  const conflicts: Row[] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i], b = active[j];
      const overlapStart = a.startDate > b.startDate ? a.startDate : b.startDate;
      const overlapEnd = a.endDate < b.endDate ? a.endDate : b.endDate;
      if (overlapStart > overlapEnd) continue;
      const sameEmployee = a.employeeId === b.employeeId;
      const sameDepartment = Boolean(a.department && a.department === b.department);
      if (!sameEmployee && !sameDepartment) continue;
      const departmentCount = sameDepartment ? active.filter((item) => item.department === a.department && item.startDate <= overlapEnd && item.endDate >= overlapStart).length : 0;
      if (sameEmployee || departmentCount > policy.maxConcurrentDepartment) conflicts.push({ id: `${a.id}:${b.id}`, severity: sameEmployee ? "CRITICAL" : "WARNING", department: a.department || b.department, startDate: overlapStart, endDate: overlapEnd, people: [a.fullName, b.fullName], message: sameEmployee ? "Aynı personelin çakışan izin kayıtları var." : `${a.department || "Aynı bölüm"} için eş zamanlı izin sınırı aşılıyor.` });
    }
  }
  return okData(c, { policy, employees, plans, conflicts });
}
'''
marker = 'async function leaveCenter(c: Context<AppEnv>) {'
if 'calculateAnnualLeaveRange' not in cloud:
    cloud = cloud.replace(marker, leave_block + '\n' + marker, 1)
cloud = replace_once(cloud, 'app.get("/api/ik/advanced/leave-center", protect(leaveCenter));', 'app.get("/api/ik/advanced/leave-center", protect(leaveCenterV2));', 'leave center route')
cloud = replace_once(cloud, 'app.post("/api/ik/advanced/leave", protect(saveLeave));', 'app.post("/api/ik/advanced/leave", protect(saveAdvancedLeaveRecordV2));', 'advanced leave route')
cloud = replace_once(cloud, 'app.post("/api/ik/advanced/leave/cancel", protect(cancelAdvancedLeave));', 'app.post("/api/ik/advanced/leave/cancel", protect(cancelAdvancedLeaveV2));', 'cancel leave route')
route_anchor = '  app.get("/api/ik/advanced/leave-center", protect(leaveCenterV2));\n'
cloud = replace_once(cloud, route_anchor, route_anchor + '  app.post("/api/ik/advanced/leave/preview", protect(previewAdvancedLeaveV2));\n  app.post("/api/ik/advanced/leave/policy", protect(saveAdvancedLeavePolicyV2));\n', 'leave preview/policy routes')
CLOUD.write_text(cloud, encoding='utf-8')

MIG.write_text('''-- KY ERP IK annual leave engine: persistent policy + managed plans.\nCREATE TABLE IF NOT EXISTS ik_leave_counting_policy (\n  main_company_id TEXT PRIMARY KEY,\n  counted_weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',\n  exclude_official_holidays INTEGER NOT NULL DEFAULT 1,\n  max_concurrent_department INTEGER NOT NULL DEFAULT 1,\n  updated_by TEXT NOT NULL DEFAULT '',\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE IF NOT EXISTS ik_leave_plans (\n  id TEXT PRIMARY KEY,\n  main_company_id TEXT NOT NULL,\n  employee_id TEXT NOT NULL,\n  record_type TEXT NOT NULL DEFAULT 'Yıllık izin',\n  start_date TEXT NOT NULL,\n  end_date TEXT NOT NULL,\n  return_date TEXT NOT NULL,\n  counted_days REAL NOT NULL DEFAULT 0,\n  excluded_json TEXT NOT NULL DEFAULT '[]',\n  status TEXT NOT NULL DEFAULT 'PLANNED',\n  document_no TEXT NOT NULL DEFAULT '',\n  note TEXT NOT NULL DEFAULT '',\n  created_by TEXT NOT NULL DEFAULT '',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE INDEX IF NOT EXISTS idx_ik_leave_plans_company_dates ON ik_leave_plans(main_company_id,start_date,end_date,status);\nCREATE INDEX IF NOT EXISTS idx_ik_leave_plans_employee_dates ON ik_leave_plans(employee_id,start_date,end_date,status);\n\nINSERT INTO ik_leave_counting_policy (main_company_id,counted_weekdays_json,exclude_official_holidays,max_concurrent_department,updated_by)\nSELECT DISTINCT main_company_id,'[1,2,3,4,5,6]',1,1,'migration-0009' FROM hr_monthly_employees\nON CONFLICT(main_company_id) DO NOTHING;\n''', encoding='utf-8')

# Pure regression test: 10 Aug leave start / 31 Aug return = 18 counted days.
test = TEST.read_text(encoding='utf-8')
test = replace_once(test, '  hrListResponse,\n} from "./ik-relational-cloud.ts";', '  hrListResponse,\n  calculateAnnualLeaveRange,\n} from "./ik-relational-cloud.ts";', 'test import')
if '10 Aug 2026' not in test:
    test += '''\n\ntest("10 Aug 2026 leave start and 31 Aug return counts exactly 18 days", () => {\n  const result = calculateAnnualLeaveRange(\n    "2026-08-10",\n    "2026-08-31",\n    [1, 2, 3, 4, 5, 6],\n    true,\n    ["2026-08-30"],\n  );\n  assert.equal(result.lastLeaveDate, "2026-08-30");\n  assert.equal(result.returnDate, "2026-08-31");\n  assert.equal(result.calendarDays, 21);\n  assert.equal(result.countedDays, 18);\n  assert.deepEqual(result.excludedDates.map((row) => row.date), ["2026-08-16", "2026-08-23", "2026-08-30"]);\n});\n'''
TEST.write_text(test, encoding='utf-8')

# ------------------------- Frontend cleanup -------------------------
front = FRONT.read_text(encoding='utf-8')
front = replace_once(front,
    '    setModalDraft({ id: plan.id, employeeId: plan.employeeId, leaveType: plan.recordType || "Yillik izin", startDate: plan.startDate, endDate: plan.endDate, status: plan.status, wageEffect: "Ucretli", payrollEffect: "Yansit", documentNo: plan.documentNo || "", note: plan.note || "" });',
    '    setModalDraft({ id: plan.id, employeeId: plan.employeeId, leaveType: plan.recordType || "Yillik izin", startDate: plan.startDate, endDate: plan.returnDate || plan.endDate, status: plan.status, wageEffect: "Ucretli", payrollEffect: "Yansit", documentNo: plan.documentNo || "", note: plan.note || "" });',
    'edit leave return date')
front = replace_once(front,
    'const preview = modal === "yillik" ? (leavePreview || await previewIkAdvancedLeave({ mainCompanyId: companyId, ...modalDraft, recordType })) : null;',
    'const preview = modal === "yillik" ? (leavePreview || await previewIkAdvancedLeave({ mainCompanyId: companyId, ...modalDraft, returnDate: modalDraft.endDate, recordType })) : null;',
    'save preview payload')
front = replace_once(front,
    '          endDate: modal === "yillik" ? modalDraft.endDate : dateKey(year, month, selectedDays[selectedDays.length - 1]),\n          recordType,',
    '          endDate: modal === "yillik" ? modalDraft.endDate : dateKey(year, month, selectedDays[selectedDays.length - 1]),\n          returnDate: modal === "yillik" ? modalDraft.endDate : undefined,\n          dayCount: modal === "yillik" ? preview?.countedDays : undefined,\n          recordType,',
    'save annual payload')
front = replace_once(front,
    '      const result = await previewIkAdvancedLeave({ mainCompanyId: companyId, ...modalDraft, recordType: modalDraft.leaveType });',
    '      const result = await previewIkAdvancedLeave({ mainCompanyId: companyId, ...modalDraft, returnDate: modalDraft.endDate, recordType: modalDraft.leaveType });',
    'manual preview payload')
front = replace_once(front, '      setPolicyDraft(result.policy);', '      setPolicyDraft(result?.policy || { countedWeekdays: [1, 2, 3, 4, 5, 6], excludeOfficialHolidays: true, maxConcurrentDepartment: 1 });', 'policy response guard')

# Automatic preview, stale-request safe. It keeps the page alive on API errors.
auto_anchor = '  const saveLeavePolicy = async () => {'
if 'leaveAutoPreviewSeq' not in front:
    state_anchor = '  const [leaveRangeStep, setLeaveRangeStep] = useState(0);'
    front = replace_once(front, state_anchor, state_anchor + '\n  const leaveAutoPreviewSeq = useRef(0);', 'preview sequence ref')
    auto_block = r'''  useEffect(() => {
    if (modal !== "yillik") return undefined;
    const employeeId = modalDraft.employeeId;
    const startDate = modalDraft.startDate;
    const returnDate = modalDraft.endDate;
    if (!employeeId || !startDate || !returnDate || returnDate <= startDate) {
      setLeavePreview(null);
      return undefined;
    }
    const seq = ++leaveAutoPreviewSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        const result = await previewIkAdvancedLeave({ mainCompanyId: companyId, ...modalDraft, returnDate, recordType: modalDraft.leaveType });
        if (leaveAutoPreviewSeq.current !== seq) return;
        setLeavePreview(result);
        setNotice("");
      } catch (error) {
        if (leaveAutoPreviewSeq.current !== seq) return;
        setLeavePreview(null);
        setNotice(error?.message || "İzin günleri hesaplanamadı. Tarihleri kontrol edip tekrar deneyin.");
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [modal, modalDraft.employeeId, modalDraft.startDate, modalDraft.endDate, modalDraft.leaveType, companyId]);

'''
    front = replace_once(front, auto_anchor, auto_block + auto_anchor, 'automatic leave preview')

# Modal wording: second date is RETURN TO WORK, not inclusive leave end.
front = replace_once(front, '<Field label="Izin bitis tarihi" half><input type="date" min={modalDraft.startDate || undefined} value={modalDraft.endDate || ""} onChange={(event) => setLeaveValue("endDate", event.target.value)} /></Field>', '<Field label="Ise donus tarihi" half><input type="date" min={modalDraft.startDate || undefined} value={modalDraft.endDate || ""} onChange={(event) => setLeaveValue("endDate", event.target.value)} /></Field>', 'return date label')
front = replace_once(front, '<button className="btn primary leave-preview-button" disabled={busy} onClick={runLeavePreview}>{busy ? "Hesaplaniyor" : "Gunleri Hesapla ve Cakisma Kontrolu Yap"}</button>', '<div className="warnline ok leave-auto-note">Personel veya tarih degistiginde izin gunu, bakiye ve cakisma kontrolu otomatik yenilenir.</div>', 'remove manual preview button')
front = replace_once(front, '<div className="preview-numbers"><div><span>Takvim gunu</span><b>{leavePreview.calendarDays}</b></div><div><span>Izinden sayilan</span><b>{leavePreview.countedDays}</b></div><div><span>Sayilmayan</span><b>{safeList(leavePreview.excludedDates).length}</b></div><div><span>Ise donus</span><b>{leavePreview.returnDate}</b></div><div><span>Yeni bakiye</span><b className={leavePreview.balanceAfter < 0 ? "danger-text" : "success-text"}>{leavePreview.balanceAfter}</b></div></div>', '<div className="preview-numbers"><div><span>Takvim gunu</span><b>{leavePreview.calendarDays}</b></div><div className="highlight"><span>Izinden sayilan</span><b>{leavePreview.countedDays}</b></div><div><span>Sayilmayan</span><b>{safeList(leavePreview.excludedDates).length}</b></div><div><span>Son izin gunu</span><b>{leavePreview.lastLeaveDate || leavePreview.endDate}</b></div><div className="return"><span>Ise donus</span><b>{leavePreview.returnDate}</b></div><div><span>Yeni bakiye</span><b className={leavePreview.balanceAfter < 0 ? "danger-text" : "success-text"}>{leavePreview.balanceAfter}</b></div></div>', 'preview summary')

# Calendar: return day is green and excluded from leave; counted/excluded days are visually distinct.
cal_start = front.index('    return <div className="leave-range-calendar">', front.index('function LeaveRangeCalendar'))
cal_end = front.index('\n  }\n\n  function groupEmployeeIds', cal_start)
cal_return = r'''    return <div className="leave-range-calendar">
      <div className="leave-calendar-head"><div><b>Takvimden Izin ve Ise Donus Tarihini Sec</b><span>{leaveRangeStep === 0 ? "Ilk tiklama izne cikis tarihini secer." : "Simdi ise donus tarihini secin."}</span></div><div className="group"><button className="btn" onClick={() => moveMonth(-1)}>Onceki</button><strong>{MONTHS[calendarMonth - 1]} {calendarYear}</strong><button className="btn" onClick={() => moveMonth(1)}>Sonraki</button></div></div>
      <div className="leave-calendar-weekdays">{["Pzt", "Sal", "Car", "Per", "Cum", "Cmt", "Paz"].map((item) => <b key={item}>{item}</b>)}</div>
      <div className="leave-calendar-days">{Array.from({ length: leading - 1 }, (_, index) => <span className="blank" key={`blank-${index}`} />)}{Array.from({ length: count }, (_, index) => {
        const date = `${leaveCalendarMonth}-${String(index + 1).padStart(2, "0")}`;
        const inRange = modalDraft.startDate && modalDraft.endDate && date >= modalDraft.startDate && date < modalDraft.endDate;
        const isStart = date === modalDraft.startDate;
        const isReturn = date === modalDraft.endDate;
        const counted = safeList(leavePreview?.countedDates).includes(date);
        const excludedRow = safeList(leavePreview?.excludedDates).find((item) => item.date === date);
        const isOfficial = Boolean(excludedRow && upper(excludedRow.reason).includes("RESMI"));
        const dayPlans = monthPlans.filter((item) => item.startDate <= date && item.endDate >= date);
        return <button type="button" key={date} title={isReturn ? "Ise donus" : excludedRow?.reason || (counted ? "Izinden sayilir" : "")} className={`${inRange ? "in-range" : ""} ${counted ? "counted-day" : ""} ${excludedRow ? "excluded-day" : ""} ${isOfficial ? "official-day" : ""} ${isStart ? "range-start" : ""} ${isReturn ? "return-day" : ""} ${date === new Date().toISOString().slice(0, 10) ? "today" : ""}`} onClick={() => chooseDate(date)}><b>{index + 1}</b><span>{isReturn ? <i className="return-label">Donus</i> : excludedRow ? <i className="excluded-label">{isOfficial ? "Tatil" : "Sayilmaz"}</i> : dayPlans.slice(0, 1).map((item) => <i key={item.id} title={`${item.fullName} ${item.startDate}-${item.endDate}`}>{item.fullName.split(" ")[0]}</i>)}</span></button>;
      })}</div>
      <div className="leave-calendar-legend"><span><i className="selected" /> Izinden sayilan</span><span><i className="not-counted" /> Sayilmayan</span><span><i className="return-legend" /> Ise donus</span><span><i className="occupied" /> Kayitli izin</span><b>{modalDraft.startDate || "Izne cikis secilmedi"} → {modalDraft.endDate || "Ise donus secilmedi"}</b></div>
    </div>;'''
front = front[:cal_start] + cal_return + front[cal_end:]

# One navigation row instead of duplicate annual/registry tab rows.
old_tabs = '<div className="ik-section-tabs"><button className={leaveView === "annual" ? "active" : ""} onClick={() => setLeaveView("annual")}>Yillik Izin Sicili</button><button className={leaveView === "other" ? "active" : ""} onClick={() => setLeaveView("other")}>Rapor ve Diger Izinler</button></div>'
new_tabs = '<div className="ik-section-tabs leave-main-tabs"><button className={leaveView === "annual" && annualView === "control" ? "active" : ""} onClick={() => { setLeaveView("annual"); setAnnualView("control"); }}>Genel Bakis</button><button className={leaveView === "annual" && annualView === "calendar" ? "active" : ""} onClick={() => { setLeaveView("annual"); setAnnualView("calendar"); }}>Yillik Izin</button><button className={leaveView === "other" ? "active" : ""} onClick={() => setLeaveView("other")}>Rapor / Diger Izin</button><button className={leaveView === "annual" && annualView === "registry" ? "active" : ""} onClick={() => { setLeaveView("annual"); setAnnualView("registry"); }}>Izin Sicili</button><button className={leaveView === "annual" && annualView === "policy" ? "active" : ""} onClick={() => { setLeaveView("annual"); setAnnualView("policy"); }}>Ayarlar</button></div>'
front = replace_once(front, old_tabs, new_tabs, 'single leave navigation')
old_subtabs = '<div className="annual-subtabs"><button className={annualView === "control" ? "active" : ""} onClick={() => setAnnualView("control")}>Genel Kontrol</button><button className={annualView === "calendar" ? "active" : ""} onClick={() => setAnnualView("calendar")}>Yillik Plan ve Takvim</button><button className={annualView === "registry" ? "active" : ""} onClick={() => setAnnualView("registry")}>Izin Sicili</button><button className={annualView === "policy" ? "active" : ""} onClick={() => setAnnualView("policy")}>Gun Sayim Ayarlari</button></div>'
front = replace_once(front, old_subtabs, '', 'remove duplicate leave subtabs')
# Registry wording matches new semantics.
front = front.replace('<th>Baslangic</th><th>Bitis</th><th>Donus</th>', '<th>Izne Cikis</th><th>Son Izin Gunu</th><th>Ise Donus</th>')
FRONT.write_text(front, encoding='utf-8')

# Visual finish for clean leave calendar and single nav.
css = CSS.read_text(encoding='utf-8')
style_marker = '/* IK_LEAVE_FINAL_V2 */'
if style_marker not in css:
    css += r'''

/* IK_LEAVE_FINAL_V2 */
.ik-html .leave-main-tabs { overflow-x:auto; scrollbar-width:thin; }
.ik-html .leave-main-tabs button { flex:0 0 auto; min-width:128px; }
.modal-bg .preview-numbers .highlight { border-color:#93c5fd; background:#eff6ff; }
.modal-bg .preview-numbers .highlight b { color:#1d4ed8; font-size:20px; }
.modal-bg .preview-numbers .return { border-color:#86efac; background:#f0fdf4; }
.modal-bg .preview-numbers .return b { color:#15803d; }
.modal-bg .leave-auto-note { margin-top:10px; }
.modal-bg .leave-calendar-days button.counted-day { background:#eaf2ff; border-color:#8fb6f6; }
.modal-bg .leave-calendar-days button.excluded-day { background:#f4f6f8; border-color:#d7dee8; color:#7b8796; }
.modal-bg .leave-calendar-days button.official-day { background:repeating-linear-gradient(135deg,#fff7ed,#fff7ed 6px,#ffedd5 6px,#ffedd5 12px); border-color:#fdba74; color:#9a3412; }
.modal-bg .leave-calendar-days button.return-day { background:#dcfce7 !important; border:2px solid #22c55e !important; color:#166534; box-shadow:inset 0 0 0 1px #86efac; }
.modal-bg .leave-calendar-days button.range-start { box-shadow:inset 0 0 0 2px #2563eb; }
.modal-bg .leave-calendar-days .excluded-label { color:#64748b; font-style:normal; font-size:8px; }
.modal-bg .leave-calendar-days .return-label { color:#15803d; font-style:normal; font-weight:900; font-size:8px; }
.modal-bg .leave-calendar-legend .not-counted { background:#cbd5e1; }
.modal-bg .leave-calendar-legend .return-legend { background:#22c55e; }
@media (max-width:1100px){.ik-html .leave-main-tabs{flex-wrap:nowrap}.modal-bg .leave-modal-layout{grid-template-columns:1fr}.modal-bg .leave-preview-panel{position:static}}
'''
CSS.write_text(css, encoding='utf-8')

print('IK annual leave final patch prepared successfully.')
