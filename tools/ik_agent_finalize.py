from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    text = text.replace(old, new, 1)


def sub_once(pattern: str, replacement: str, label: str):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")


replace_once(
    "    cashAmount: number(row.cash_amount),\n    overtimeBaseHours:",
    "    cashAmount: number(row.cash_amount),\n    extraPaymentLabel: text(row.extra_payment_label) || \"Ek Ödeme / Prim\",\n    extraPaymentAmount: number(row.extra_payment_amount),\n    garnishmentActive: flag(row.garnishment_active) || number(row.garnishment_amount) > 0,\n    garnishmentAmount: number(row.garnishment_amount),\n    garnishmentNote: text(row.garnishment_note),\n    overtimeBaseHours:",
    "mapMonthly extra fields",
)

replace_once(
    "    premiumAmount: number(row.premium_amount),\n    deductionAmount:",
    "    premiumAmount: number(row.premium_amount),\n    garnishmentAmount: number(row.garnishment_amount),\n    deductionAmount:",
    "mapPayroll garnishment",
)

old_monthly_rows = '''async function monthlyRows(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  return (
    await all(
      c,
      `SELECT * FROM hr_monthly_employees
        WHERE main_company_id = ?
        ORDER BY code COLLATE NOCASE ASC, full_name COLLATE NOCASE ASC`,
      [companyId],
    )
  ).map(mapMonthly);
}'''
new_monthly_rows = '''async function monthlyRows(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  return (
    await all(
      c,
      `SELECT e.*,
              s.extra_payment_label,
              s.extra_payment_amount,
              s.garnishment_active,
              s.garnishment_amount,
              s.garnishment_note
         FROM hr_monthly_employees e
         LEFT JOIN ik_person_card_settings s
           ON s.employee_id = e.id AND s.main_company_id = e.main_company_id
        WHERE e.main_company_id = ?
        ORDER BY e.code COLLATE NOCASE ASC, e.full_name COLLATE NOCASE ASC`,
      [companyId],
    )
  ).map(mapMonthly);
}'''
replace_once(old_monthly_rows, new_monthly_rows, "monthlyRows join settings")

advanced_payroll = '''async function advancedPayroll(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const year = number(c.req.query("year")) || new Date().getFullYear();
  const month = number(c.req.query("month")) || new Date().getMonth() + 1;
  const employees = await monthlyRows(c, companyId);
  const saved = await payrollRows(c, companyId);
  const byEmployee = new Map(saved.filter((row) => number(row.year) === year && number(row.month) === month).map((row) => [text(row.employeeId), row]));
  const lines = employees.map((employee) => {
    const row = byEmployee.get(text(employee.id));
    const extra = number(employee.extraPaymentAmount);
    const garnishment = employee.garnishmentActive === true || number(employee.garnishmentAmount) > 0 ? number(employee.garnishmentAmount) : 0;
    const baseNet = Math.max(number(employee.salary) + number(employee.roadAllowance) + extra - garnishment, 0);
    const bankPlan = Math.max(number(employee.bankAmount) - garnishment, 0);
    const systemBank = Math.min(baseNet, bankPlan);
    const systemCash = Math.max(baseNet - systemBank, 0);
    const final = row ? {
      salaryPay: row.salary,
      roadPay: row.roadAllowance,
      overtimeAmount: row.overtimeAmount,
      premiumAmount: row.premiumAmount,
      garnishmentAmount: row.garnishmentAmount,
      deductionAmount: row.deductionAmount,
      advanceAmount: row.advanceAmount,
      bank: row.bankAmount,
      cash: row.cashAmount,
      total: row.totalAmount,
    } : {
      salaryPay: number(employee.salary),
      roadPay: number(employee.roadAllowance),
      overtimeAmount: 0,
      premiumAmount: extra,
      garnishmentAmount: garnishment,
      deductionAmount: 0,
      advanceAmount: 0,
      bank: systemBank,
      cash: systemCash,
      total: baseNet,
    };
    return { employeeId: employee.id, code: employee.code, fullName: employee.fullName, department: employee.department, system: final, final, status: row?.status || "SYSTEM" };
  });
  const totals = lines.reduce((sum, row) => ({ bank: sum.bank + number(row.final.bank), cash: sum.cash + number(row.final.cash), total: sum.total + number(row.final.total) }), { bank: 0, cash: 0, total: 0 });
  return okData(c, { year, month, policy: { roadByActualPresence: true, defaultOvertimeBase: 225, advanceFirstFromCash: true, garnishmentReducesBank: true }, lines, totals });
}'''
sub_once(r'async function advancedPayroll\(c: Context<AppEnv>\) \{.*?\n\}\n\nasync function savePersonCard', advanced_payroll + "\n\nasync function savePersonCard", "advancedPayroll")

save_person_card = '''async function savePersonCard(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(c.req.param("employeeId"));
  if (!(await employeeBelongsToCompany(c, employeeId, companyId))) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const cardNo = text(body.cardNo);
  if (cardNo) {
    const duplicate = await first(c, "SELECT employee_id FROM ik_person_card_settings WHERE main_company_id=? AND card_no=? AND employee_id<>?", [companyId, cardNo, employeeId]);
    if (duplicate) return error(c, 409, "DUPLICATE_CARD", "Bu kart numarası başka bir personele bağlı.");
  }
  await c.env.DB.prepare(
    `INSERT INTO ik_person_card_settings (
       employee_id,main_company_id,card_no,identity_no,payroll_included,card_source,personel_kodu,exit_date,
       active_passive,work_type,sgk_follow,payment_type,note,phone,extra_payment_label,extra_payment_amount,
       garnishment_active,garnishment_amount,garnishment_note,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(employee_id) DO UPDATE SET
       main_company_id=excluded.main_company_id,
       card_no=excluded.card_no,
       identity_no=excluded.identity_no,
       payroll_included=excluded.payroll_included,
       card_source=excluded.card_source,
       personel_kodu=excluded.personel_kodu,
       exit_date=excluded.exit_date,
       active_passive=excluded.active_passive,
       work_type=excluded.work_type,
       sgk_follow=excluded.sgk_follow,
       payment_type=excluded.payment_type,
       note=excluded.note,
       phone=excluded.phone,
       extra_payment_label=excluded.extra_payment_label,
       extra_payment_amount=excluded.extra_payment_amount,
       garnishment_active=excluded.garnishment_active,
       garnishment_amount=excluded.garnishment_amount,
       garnishment_note=excluded.garnishment_note,
       updated_at=excluded.updated_at`,
  ).bind(
    employeeId,
    companyId,
    cardNo,
    text(body.identityNo),
    body.payrollIncluded === false ? 0 : 1,
    text(body.cardSource) || "TNF",
    text(body.personelKodu || body.code),
    hrDateOnly(body.exitDate) || null,
    text(body.activePassive || body.status) || "AKTIF",
    text(body.workType) || "AYLIK",
    body.sgkFollow === null ? 2 : body.sgkFollow === false ? 0 : 1,
    text(body.paymentType) || "BANKA_ELDEN",
    text(body.note),
    text(body.phone),
    text(body.extraPaymentLabel) || "Ek Ödeme / Prim",
    number(body.extraPaymentAmount),
    body.garnishmentActive === true && number(body.garnishmentAmount) > 0 ? 1 : 0,
    body.garnishmentActive === true ? number(body.garnishmentAmount) : 0,
    text(body.garnishmentNote),
    nowIso(),
  ).run();
  const current = await first(c, "SELECT * FROM hr_monthly_employees WHERE id=?", [employeeId]);
  if (current) await updateMonthlyEmployeeFromCard(c, employeeId, companyId, body, current);
  return okData(c, { employeeId, saved: true });
}'''
sub_once(r'async function savePersonCard\(c: Context<AppEnv>\) \{.*?\n\}\n\nasync function updateMonthlyEmployeeFromCard', save_person_card + "\n\nasync function updateMonthlyEmployeeFromCard", "savePersonCard")

payroll_override = '''async function saveAdvancedPayrollOverride(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId || body.personId);
  const year = number(body.year) || new Date().getFullYear();
  const month = number(body.month) || new Date().getMonth() + 1;
  const override = body.override && typeof body.override === "object" && !Array.isArray(body.override) ? body.override as Row : {};
  const employee = await first(c, `SELECT e.*, s.extra_payment_amount, s.garnishment_active, s.garnishment_amount FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id WHERE e.id=? AND e.main_company_id=?`, [employeeId, companyId]);
  if (!employee) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const existing = await first(c, "SELECT * FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=? AND employee_id=?", [companyId, year, month, employeeId]);
  const salary = number(override.salaryPay ?? existing?.salary ?? employee.salary);
  const road = number(override.roadPay ?? existing?.road_allowance ?? employee.road_allowance);
  const overtime = number(override.overtimeAmount ?? existing?.overtime_amount);
  const premium = number(override.premiumAmount ?? existing?.premium_amount ?? employee.extra_payment_amount);
  const deduction = number(override.deductionAmount ?? existing?.deduction_amount);
  const advance = number(override.advanceAmount ?? existing?.advance_amount);
  const garnishment = number(override.garnishmentAmount ?? existing?.garnishment_amount ?? employee.garnishment_amount);
  const calculatedTotal = Math.max(salary + road + overtime + premium - deduction - advance - garnishment, 0);
  const plannedBank = Math.max(number(employee.bank_amount) - garnishment, 0);
  const bank = override.bank !== undefined ? number(override.bank) : Math.min(calculatedTotal, plannedBank);
  const cash = override.cash !== undefined ? number(override.cash) : Math.max(calculatedTotal - bank, 0);
  const total = override.total !== undefined ? number(override.total) : calculatedTotal;
  const timestamp = nowIso();
  const id = text(existing?.id) || crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO hr_payrolls_v2 (id,main_company_id,year,month,employee_id,salary,road_allowance,overtime_amount,premium_amount,garnishment_amount,deduction_amount,advance_amount,bank_amount,cash_amount,total_amount,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_id,year,month,employee_id) DO UPDATE SET salary=excluded.salary,road_allowance=excluded.road_allowance,overtime_amount=excluded.overtime_amount,premium_amount=excluded.premium_amount,garnishment_amount=excluded.garnishment_amount,deduction_amount=excluded.deduction_amount,advance_amount=excluded.advance_amount,bank_amount=excluded.bank_amount,cash_amount=excluded.cash_amount,total_amount=excluded.total_amount,status=excluded.status,updated_at=excluded.updated_at`).bind(id, companyId, year, month, employeeId, salary, road, overtime, premium, garnishment, deduction, advance, bank, cash, total, "OVERRIDE", text(existing?.created_at) || timestamp, timestamp).run();
  const saved = await first(c, "SELECT * FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=? AND employee_id=?", [companyId, year, month, employeeId]);
  await audit(c, { mainCompanyId: companyId, period: `${year}-${String(month).padStart(2, "0")}`, employeeId, entityType: "BORDRO", action: "OVERRIDE", summary: "Bordro ödeme planı güncellendi.", details: { reason: text(body.reason), premiumAmount: premium, garnishmentAmount: garnishment, bank, cash, total } });
  return okData(c, mapPayroll(saved || { id, main_company_id: companyId, year, month, employee_id: employeeId, salary, road_allowance: road, overtime_amount: overtime, premium_amount: premium, garnishment_amount: garnishment, deduction_amount: deduction, advance_amount: advance, bank_amount: bank, cash_amount: cash, total_amount: total, status: "OVERRIDE" }));
}'''
replace_once(
    "async function auditLogs(c: Context<AppEnv>) {",
    payroll_override + "\n\nasync function auditLogs(c: Context<AppEnv>) {",
    "insert payroll override",
)

replace_once(
    '  app.get("/api/ik/advanced/payroll", protect(advancedPayroll));',
    '  app.get("/api/ik/advanced/payroll", protect(advancedPayroll));\n  app.post("/api/ik/advanced/payroll/override", protect(saveAdvancedPayrollOverride));',
    "register payroll override",
)

path.write_text(text, encoding="utf-8")

checks = [
    "extra_payment_label",
    "garnishment_amount",
    "garnishmentReducesBank",
    "/api/ik/advanced/payroll/override",
    "saveAdvancedPayrollOverride",
]
updated = path.read_text(encoding="utf-8")
missing = [item for item in checks if item not in updated]
if missing:
    raise SystemExit("missing final markers: " + ", ".join(missing))
print("Relational IK finalized")
