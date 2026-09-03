// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const DEFAULT_COMPANY = "mecit-hakan";
const HR_COMPANY_ALIASES = new Set([
  "mecit-hakan",
  "main-mecit-hakan",
  "mecit-hakan-gursu",
  "hakan-baski",
  "main-hakan",
  "main-hakan-baski",
  "hkn-baski",
]);

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) =>
  text(value).toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
const number = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nowIso = () => new Date().toISOString();

export function normalizeOperationsText(value: unknown) {
  return upper(value)
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalOperationsCompany(value: unknown) {
  const normalized = text(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized || HR_COMPANY_ALIASES.has(normalized)) return DEFAULT_COMPANY;
  return normalized;
}

function ownerRole(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}

export function operationsPermission(
  user: Row,
  moduleKey: "IK" | "MUHASEBE",
  mode: "read" | "write",
) {
  if (ownerRole(user?.role)) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const row = permissions.find(
    (item: Row) =>
      upper(item?.moduleKey || item?.module_key) === upper(moduleKey),
  );
  if (!row) return false;
  if (mode === "read") return Boolean(row.canView ?? row.can_view);
  return Boolean(row.canCreate ?? row.can_create);
}

export function validateOperationsPeriod(yearValue: unknown, monthValue: unknown) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

export function normalizeAdjustmentType(value: unknown) {
  const normalized = normalizeOperationsText(value);
  if (normalized.includes("AVANS")) return "Avans";
  if (normalized.includes("MESAI")) return "Mesai";
  if (
    normalized.includes("KESINTI") ||
    normalized.includes("KESİNTİ") ||
    normalized.includes("ICRA") ||
    normalized.includes("HACIZ")
  ) {
    return "Ozel kesinti";
  }
  return "";
}

function normalizePaymentDirection(value: unknown) {
  const normalized = normalizeOperationsText(value);
  if (
    normalized.includes("TAHSIL") ||
    normalized.includes("GELEN") ||
    normalized.includes("INCOMING") ||
    normalized.includes("PAYMENT IN") ||
    normalized === "IN"
  ) {
    return "PAYMENT_IN";
  }
  if (
    normalized.includes("ODEME") ||
    normalized.includes("GIDEN") ||
    normalized.includes("OUTGOING") ||
    normalized.includes("PAYMENT OUT") ||
    normalized === "OUT"
  ) {
    return "PAYMENT_OUT";
  }
  return "";
}

function errorBody(code: string, message: string, details?: unknown) {
  return {
    ok: false,
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const payload: unknown = await c.req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Row)
      : {};
  } catch {
    return {};
  }
}

async function tableExists(c: Context<AppEnv>, table: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  )
    .bind(table)
    .first<Row>();
  return Boolean(row?.name);
}

function requestedCompany(c: Context<AppEnv>, body: Row = {}) {
  const value =
    body.mainCompanySlug ||
    body.main_company_slug ||
    body.mainCompanyId ||
    c.req.header("X-KYERP-Tenant-Slug") ||
    c.req.query("mainCompanySlug") ||
    c.req.query("mainCompanyId");
  return text(value) ? canonicalOperationsCompany(value) : "";
}

async function authorize(
  c: Context<AppEnv>,
  moduleKey: "IK" | "MUHASEBE",
  mode: "read" | "write",
  body: Row = {},
) {
  const user = (await getAuthenticatedUser(c)) as Row | null;
  if (!user) {
    return {
      response: c.json(
        errorBody("UNAUTHORIZED", "Geçerli KY ERP oturumu zorunludur."),
        401,
      ),
    };
  }
  if (!operationsPermission(user, moduleKey, mode)) {
    return {
      response: c.json(
        errorBody(
          "FORBIDDEN",
          `${moduleKey} ${mode === "write" ? "kayıt" : "görüntüleme"} yetkiniz yok.`,
        ),
        403,
      ),
    };
  }

  const ownCompany = canonicalOperationsCompany(
    user.mainCompanySlug || user.main_company_slug || DEFAULT_COMPANY,
  );
  const requested = requestedCompany(c, body) || ownCompany;
  if (!ownerRole(user.role) && requested !== ownCompany) {
    return {
      response: c.json(
        errorBody(
          "MAIN_COMPANY_FORBIDDEN",
          "Başka ana firmanın verisine erişim yetkiniz yok.",
        ),
        403,
      ),
    };
  }
  return {
    user,
    companySlug: ownerRole(user.role) ? requested : ownCompany,
  };
}

function clampLimit(value: unknown, fallback = 25, max = 100) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function mapEmployee(row: Row) {
  return {
    id: text(row.id),
    code: text(row.code),
    fullName: text(row.full_name),
    department: text(row.department),
    title: text(row.title),
    workType: text(row.work_type) || "Aylık",
    sgkStatus: text(row.sgk_status) || "VAR",
    status: text(row.status) || "ACTIVE",
    salary: number(row.salary),
    roadAllowance: number(row.road_allowance),
    bankAmount: number(row.bank_amount),
    cashAmount: number(row.cash_amount),
  };
}

async function employeeSearch(
  c: Context<AppEnv>,
  companyId: string,
  search: string,
  limit = 25,
) {
  const query = `%${text(search)}%`;
  const result = await c.env.DB.prepare(
    `SELECT id,code,full_name,department,title,work_type,sgk_status,status,
            salary,road_allowance,bank_amount,cash_amount
       FROM hr_monthly_employees
      WHERE main_company_id=?
        AND (?='' OR LOWER(COALESCE(full_name,'')) LIKE LOWER(?) OR LOWER(COALESCE(code,'')) LIKE LOWER(?))
      ORDER BY CASE WHEN LOWER(COALESCE(full_name,''))=LOWER(?) THEN 0 ELSE 1 END,
               full_name COLLATE NOCASE
      LIMIT ?`,
  )
    .bind(companyId, text(search), query, query, text(search), limit)
    .all<Row>();
  return (result.results || []).map(mapEmployee);
}

async function resolveEmployee(
  c: Context<AppEnv>,
  companyId: string,
  idOrName: string,
) {
  const value = text(idOrName);
  if (!value) return { error: "PERSONNEL_REQUIRED" as const, matches: [] };

  const byId = await c.env.DB.prepare(
    `SELECT id,code,full_name,department,title,work_type,sgk_status,status,
            salary,road_allowance,bank_amount,cash_amount
       FROM hr_monthly_employees
      WHERE main_company_id=? AND id=? LIMIT 1`,
  )
    .bind(companyId, value)
    .first<Row>();
  if (byId) return { employee: mapEmployee(byId), matches: [mapEmployee(byId)] };

  const matches = await employeeSearch(c, companyId, value, 20);
  const normalized = normalizeOperationsText(value);
  const exact = matches.filter(
    (row) =>
      normalizeOperationsText(row.fullName) === normalized ||
      normalizeOperationsText(row.code) === normalized,
  );
  const resolved = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
  if (resolved) return { employee: resolved, matches };
  return {
    error: matches.length ? ("PERSONNEL_AMBIGUOUS" as const) : ("PERSONNEL_NOT_FOUND" as const),
    matches,
  };
}

async function periodLocked(
  c: Context<AppEnv>,
  companyId: string,
  year: number,
  month: number,
) {
  if (!(await tableExists(c, "ik_monthly_close"))) return false;
  const row = await c.env.DB.prepare(
    `SELECT is_locked FROM ik_monthly_close
      WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1`,
  )
    .bind(companyId, year, month)
    .first<Row>();
  return Boolean(number(row?.is_locked));
}

async function operationAlreadyProcessed(
  c: Context<AppEnv>,
  operationId: string,
  companySlug: string,
) {
  if (!(await tableExists(c, "operation_logs"))) return null;
  return c.env.DB.prepare(
    `SELECT id,module,entity_type,entity_id,action,new_value_json,created_by,created_at
       FROM operation_logs
      WHERE id=? AND main_company_slug=? LIMIT 1`,
  )
    .bind(operationId, companySlug)
    .first<Row>();
}

function requireIdempotency(body: Row) {
  const key = text(body.idempotencyKey || body.requestKey || body.actionId);
  if (!key || key.length < 8 || key.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(key)) {
    return "";
  }
  return key;
}

function periodBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const next = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, next };
}

async function hrMonthSummary(
  c: Context<AppEnv>,
  companyId: string,
  employee: Row,
  year: number,
  month: number,
) {
  const { start, next } = periodBounds(year, month);
  const [payroll, adjustmentResult, contract] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM hr_payrolls_v2
        WHERE main_company_id=? AND year=? AND month=? AND employee_id=? LIMIT 1`,
    )
      .bind(companyId, year, month, employee.id)
      .first<Row>(),
    c.env.DB.prepare(
      `SELECT id,employee_id,date,adjustment_type,hour_or_day,amount,payment_method,
              payroll_effect,note,status,created_at
         FROM hr_monthly_adjustments_v2
        WHERE employee_id=? AND date>=? AND date<?
        ORDER BY date,id`,
    )
      .bind(employee.id, start, next)
      .all<Row>(),
    c.env.DB.prepare(
      `SELECT id,salary,road_allowance,bank_payment_type,bank_amount,cash_amount,
              contract_type,contract_start,contract_end,effective_date,note,created_at
         FROM hr_salary_contracts
        WHERE employee_id=? AND effective_date<?
          AND (contract_end IS NULL OR contract_end='' OR contract_end>=?)
        ORDER BY effective_date DESC,created_at DESC LIMIT 1`,
    )
      .bind(employee.id, next, start)
      .first<Row>(),
  ]);

  const adjustments = (adjustmentResult.results || []).map((row) => ({
    id: text(row.id),
    date: text(row.date).slice(0, 10),
    type: text(row.adjustment_type),
    hourOrDay: number(row.hour_or_day),
    amount: number(row.amount),
    paymentMethod: text(row.payment_method),
    payrollEffect: text(row.payroll_effect),
    note: text(row.note),
    status: text(row.status),
  }));

  const advanceRows = adjustments.filter((row) =>
    normalizeOperationsText(row.type).includes("AVANS"),
  );
  const overtimeRows = adjustments.filter((row) =>
    normalizeOperationsText(row.type).includes("MESAI"),
  );
  const deductionRows = adjustments.filter((row) => {
    const type = normalizeOperationsText(row.type);
    return type.includes("KESINTI") || type.includes("ICRA") || type.includes("HACIZ");
  });
  const sum = (rows: Row[]) => rows.reduce((total, row) => total + number(row.amount), 0);

  const salary = contract ? number(contract.salary) : number(employee.salary);
  const road = contract ? number(contract.road_allowance) : number(employee.roadAllowance);
  const adjustmentAdvance = sum(advanceRows);
  const payrollAdvance = payroll ? number(payroll.advance_amount) : null;
  const overtime = payroll ? number(payroll.overtime_amount) : sum(overtimeRows);
  const deduction = payroll ? number(payroll.deduction_amount) : sum(deductionRows);
  const premium = payroll ? number(payroll.premium_amount) : 0;
  const total = payroll
    ? number(payroll.total_amount)
    : Math.max(salary + road + overtime + premium - adjustmentAdvance - deduction, 0);

  return {
    period: { year, month, key: `${year}-${String(month).padStart(2, "0")}` },
    employee,
    salary: {
      base: salary,
      roadAllowance: road,
      source: contract ? "SALARY_CONTRACT" : "PERSONNEL_CARD",
      contractId: contract ? text(contract.id) : null,
    },
    advance: {
      hasAdvance: adjustmentAdvance > 0 || number(payrollAdvance) > 0,
      adjustmentTotal: adjustmentAdvance,
      payrollTotal: payrollAdvance,
      rows: advanceRows,
    },
    overtime: { total: overtime, rows: overtimeRows },
    deductions: { total: deduction, rows: deductionRows },
    premium,
    netPayment: total,
    payroll: payroll
      ? {
          id: text(payroll.id),
          salary: number(payroll.salary),
          roadAllowance: number(payroll.road_allowance),
          overtimeAmount: number(payroll.overtime_amount),
          premiumAmount: number(payroll.premium_amount),
          deductionAmount: number(payroll.deduction_amount),
          advanceAmount: number(payroll.advance_amount),
          bankAmount: number(payroll.bank_amount),
          cashAmount: number(payroll.cash_amount),
          totalAmount: number(payroll.total_amount),
          status: text(payroll.status),
        }
      : null,
    adjustments,
  };
}

function mapCompany(row: Row) {
  return {
    id: text(row.id),
    name: text(row.name),
    companyType: text(row.company_type || row.type),
    taxNo: text(row.tax_no),
    currentBalance: number(row.current_balance),
    openingBalance: number(row.opening_balance),
    isActive: row.is_active !== 0 && row.is_active !== false,
    note: text(row.note),
  };
}

async function companySearch(
  c: Context<AppEnv>,
  companySlug: string,
  search: string,
  limit = 25,
) {
  const query = `%${text(search)}%`;
  const result = await c.env.DB.prepare(
    `SELECT id,name,company_type,type,tax_no,current_balance,opening_balance,is_active,note
       FROM companies
      WHERE main_company_slug=? AND deleted_at IS NULL
        AND (?='' OR LOWER(COALESCE(name,'')) LIKE LOWER(?) OR COALESCE(tax_no,'') LIKE ?)
      ORDER BY CASE WHEN LOWER(COALESCE(name,''))=LOWER(?) THEN 0 ELSE 1 END,
               name COLLATE NOCASE
      LIMIT ?`,
  )
    .bind(companySlug, text(search), query, query, text(search), limit)
    .all<Row>();
  return (result.results || []).map(mapCompany);
}

async function resolveCompany(
  c: Context<AppEnv>,
  companySlug: string,
  idOrName: string,
) {
  const value = text(idOrName);
  if (!value) return { error: "COMPANY_REQUIRED" as const, matches: [] };

  const byId = await c.env.DB.prepare(
    `SELECT id,name,company_type,type,tax_no,current_balance,opening_balance,is_active,note
       FROM companies
      WHERE main_company_slug=? AND deleted_at IS NULL AND id=? LIMIT 1`,
  )
    .bind(companySlug, value)
    .first<Row>();
  if (byId) return { company: mapCompany(byId), matches: [mapCompany(byId)] };

  const matches = await companySearch(c, companySlug, value, 20);
  const normalized = normalizeOperationsText(value);
  const exact = matches.filter((row) => normalizeOperationsText(row.name) === normalized);
  const resolved = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
  if (resolved) return { company: resolved, matches };
  return {
    error: matches.length ? ("COMPANY_AMBIGUOUS" as const) : ("COMPANY_NOT_FOUND" as const),
    matches,
  };
}

async function accountingLedger(
  c: Context<AppEnv>,
  companySlug: string,
  companyId: string,
  startDate = "",
  endDate = "",
  limit = 100,
) {
  const result = await c.env.DB.prepare(
    `SELECT id,movement_date,movement_type,source_type,document_no,document_id,
            description,debit,credit,amount,effect,balance_after,created_at
       FROM current_account_movements
      WHERE main_company_slug=? AND company_id=?
        AND (?='' OR movement_date>=?)
        AND (?='' OR movement_date<=?)
      ORDER BY movement_date DESC,id DESC
      LIMIT ?`,
  )
    .bind(companySlug, companyId, startDate, startDate, endDate, endDate, limit)
    .all<Row>();
  return (result.results || []).map((row) => ({
    id: text(row.id),
    date: text(row.movement_date).slice(0, 10),
    type: text(row.movement_type),
    sourceType: text(row.source_type),
    documentNo: text(row.document_no),
    description: text(row.description),
    debit: number(row.debit),
    credit: number(row.credit),
    amount: number(row.amount),
    effect: number(row.effect),
    balanceAfter: number(row.balance_after),
    createdAt: row.created_at,
  }));
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function registerOperationsBridgeRoutes(app: Hono<AppEnv>) {
  app.get("/api/operations/capabilities", async (c) => {
    const auth = await authorize(c, "IK", "read");
    if ("response" in auth) {
      const user = (await getAuthenticatedUser(c)) as Row | null;
      if (!user) return auth.response;
      return c.json({
        ok: true,
        success: true,
        data: {
          hr: {
            read: operationsPermission(user, "IK", "read"),
            write: operationsPermission(user, "IK", "write"),
          },
          accounting: {
            read: operationsPermission(user, "MUHASEBE", "read"),
            write: operationsPermission(user, "MUHASEBE", "write"),
          },
          tenant: canonicalOperationsCompany(user.mainCompanySlug),
          writesRequireIdempotencyKey: true,
        },
      });
    }
    const user = auth.user;
    return c.json({
      ok: true,
      success: true,
      data: {
        hr: {
          read: operationsPermission(user, "IK", "read"),
          write: operationsPermission(user, "IK", "write"),
        },
        accounting: {
          read: operationsPermission(user, "MUHASEBE", "read"),
          write: operationsPermission(user, "MUHASEBE", "write"),
        },
        tenant: auth.companySlug,
        writesRequireIdempotencyKey: true,
      },
    });
  });

  app.get("/api/operations/hr/personnel", async (c) => {
    const auth = await authorize(c, "IK", "read");
    if ("response" in auth) return auth.response;
    const search = text(c.req.query("search") || c.req.query("q"));
    const data = await employeeSearch(
      c,
      canonicalOperationsCompany(auth.companySlug),
      search,
      clampLimit(c.req.query("limit")),
    );
    return c.json({ ok: true, success: true, data, items: data });
  });

  app.get("/api/operations/hr/month-summary", async (c) => {
    const auth = await authorize(c, "IK", "read");
    if ("response" in auth) return auth.response;
    const period = validateOperationsPeriod(c.req.query("year"), c.req.query("month"));
    if (!period) {
      return c.json(errorBody("INVALID_PERIOD", "Yıl ve ay geçerli olmalıdır."), 400);
    }
    const person = text(
      c.req.query("employeeId") ||
        c.req.query("personnelId") ||
        c.req.query("person") ||
        c.req.query("name"),
    );
    const resolved = await resolveEmployee(
      c,
      canonicalOperationsCompany(auth.companySlug),
      person,
    );
    if (!resolved.employee) {
      return c.json(
        errorBody(
          resolved.error || "PERSONNEL_NOT_FOUND",
          resolved.error === "PERSONNEL_AMBIGUOUS"
            ? "Personel adı birden fazla kayıtla eşleşti; kayıt seçilmelidir."
            : "Personel bulunamadı.",
          { matches: resolved.matches },
        ),
        resolved.error === "PERSONNEL_AMBIGUOUS" ? 409 : 404,
      );
    }
    const data = await hrMonthSummary(
      c,
      canonicalOperationsCompany(auth.companySlug),
      resolved.employee,
      period.year,
      period.month,
    );
    return c.json({ ok: true, success: true, data });
  });

  app.post("/api/operations/hr/adjustments", async (c) => {
    const body = await bodyOf(c);
    const auth = await authorize(c, "IK", "write", body);
    if ("response" in auth) return auth.response;

    const idempotencyKey = requireIdempotency(body);
    if (!idempotencyKey) {
      return c.json(
        errorBody(
          "IDEMPOTENCY_KEY_REQUIRED",
          "Tekrarlı kayıt riskini önlemek için en az 8 karakterli idempotencyKey zorunludur.",
        ),
        400,
      );
    }
    if (!(await tableExists(c, "operation_logs"))) {
      return c.json(
        errorBody("AUDIT_NOT_READY", "İşlem günlüğü hazır değil; güvenli yazma kapalı."),
        503,
      );
    }
    const operationId = `operations:hr:${auth.companySlug}:${idempotencyKey}`;
    const prior = await operationAlreadyProcessed(c, operationId, auth.companySlug);
    if (prior) {
      return c.json({
        ok: true,
        success: true,
        duplicatePrevented: true,
        data: {
          operationId: prior.id,
          entityId: prior.entity_id,
          action: prior.action,
          createdAt: prior.created_at,
        },
      });
    }

    const employeeValue = text(
      body.employeeId || body.personnelId || body.person || body.name,
    );
    const resolved = await resolveEmployee(
      c,
      canonicalOperationsCompany(auth.companySlug),
      employeeValue,
    );
    if (!resolved.employee) {
      return c.json(
        errorBody(
          resolved.error || "PERSONNEL_NOT_FOUND",
          resolved.error === "PERSONNEL_AMBIGUOUS"
            ? "Personel adı birden fazla kayıtla eşleşti; kayıt seçilmelidir."
            : "Personel bulunamadı.",
          { matches: resolved.matches },
        ),
        resolved.error === "PERSONNEL_AMBIGUOUS" ? 409 : 404,
      );
    }

    const date = text(body.date || nowIso().slice(0, 10));
    if (!validDate(date)) {
      return c.json(errorBody("INVALID_DATE", "Tarih YYYY-AA-GG formatında olmalıdır."), 400);
    }
    const period = validateOperationsPeriod(date.slice(0, 4), date.slice(5, 7));
    if (!period) {
      return c.json(errorBody("INVALID_PERIOD", "İşlem dönemi geçersiz."), 400);
    }
    const companyId = canonicalOperationsCompany(auth.companySlug);
    if (await periodLocked(c, companyId, period.year, period.month)) {
      return c.json(
        errorBody("PERIOD_LOCKED", `${period.key} İK dönemi kilitli; kayıt yapılamaz.`),
        409,
      );
    }

    const adjustmentType = normalizeAdjustmentType(
      body.adjustmentType || body.type,
    );
    if (!adjustmentType) {
      return c.json(
        errorBody("INVALID_ADJUSTMENT_TYPE", "İşlem tipi AVANS, MESAI veya KESINTI olmalıdır."),
        400,
      );
    }
    const amount = number(body.amount);
    const hourOrDay = number(body.hourOrDay || body.hours);
    if (amount <= 0 && hourOrDay <= 0) {
      return c.json(
        errorBody("AMOUNT_REQUIRED", "Tutar veya süre sıfırdan büyük olmalıdır."),
        400,
      );
    }

    const paymentMethod =
      text(body.paymentMethod) || (adjustmentType === "Mesai" ? "Bordro" : "Elden");
    const payrollEffect =
      adjustmentType === "Mesai" ? "Bordroya ekle" : "Bordrodan düş";
    const note = text(body.note || body.reason);
    const status = text(body.status) || "APPROVED";
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    const newValue = {
      id,
      employeeId: resolved.employee.id,
      employeeName: resolved.employee.fullName,
      date,
      adjustmentType,
      hourOrDay,
      amount,
      paymentMethod,
      payrollEffect,
      note,
      status,
      source: "OPERATIONS_BRIDGE",
    };

    const statements: any[] = [
      c.env.DB.prepare(
        `INSERT INTO hr_monthly_adjustments_v2
          (id,employee_id,date,adjustment_type,hour_or_day,amount,payment_method,
           payroll_effect,note,status,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        id,
        resolved.employee.id,
        date,
        adjustmentType,
        hourOrDay,
        amount,
        paymentMethod,
        payrollEffect,
        note || null,
        status,
        timestamp,
      ),
    ];

    if (await tableExists(c, "hr_monthly_audit_logs")) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO hr_monthly_audit_logs
            (id,main_company_id,period,employee_id,entity_type,action,summary,details_json,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        ).bind(
          crypto.randomUUID(),
          companyId,
          period.key,
          resolved.employee.id,
          "MESAI_AVANS_KESINTI",
          "CREATE",
          `${resolved.employee.fullName}: ${adjustmentType} kaydı oluşturuldu.`,
          JSON.stringify(newValue),
          timestamp,
        ),
      );
    }

    if (await tableExists(c, "ik_audit_logs")) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO ik_audit_logs
            (id,main_company_id,employee_id,period,action_type,source_screen,old_json,new_json,reason,user_name,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          crypto.randomUUID(),
          companyId,
          resolved.employee.id,
          period.key,
          "CREATE_ADJUSTMENT",
          "OPERATIONS_BRIDGE",
          "{}",
          JSON.stringify(newValue),
          note,
          text(auth.user.fullName || auth.user.username),
          timestamp,
        ),
      );
    }

    if (await tableExists(c, "operation_logs")) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO operation_logs
            (id,main_company_slug,module,entity_type,entity_id,action,old_value_json,new_value_json,created_by,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          operationId,
          auth.companySlug,
          "IK",
          "HR_MONTHLY_ADJUSTMENT",
          id,
          "CREATE",
          null,
          JSON.stringify(newValue),
          text(auth.user.id || auth.user.username),
          timestamp,
        ),
      );
    }

    await c.env.DB.batch(statements);
    const saved = await c.env.DB.prepare(
      `SELECT id,employee_id,date,adjustment_type,hour_or_day,amount,payment_method,
              payroll_effect,note,status,created_at
         FROM hr_monthly_adjustments_v2 WHERE id=? LIMIT 1`,
    )
      .bind(id)
      .first<Row>();

    return c.json(
      {
        ok: true,
        success: true,
        data: {
          operationId,
          adjustment: saved || newValue,
          employee: resolved.employee,
          period: period.key,
        },
      },
      201,
    );
  });

  app.get("/api/operations/accounting/companies", async (c) => {
    const auth = await authorize(c, "MUHASEBE", "read");
    if ("response" in auth) return auth.response;
    const search = text(c.req.query("search") || c.req.query("q"));
    const data = await companySearch(
      c,
      auth.companySlug,
      search,
      clampLimit(c.req.query("limit")),
    );
    return c.json({ ok: true, success: true, data, items: data });
  });

  app.get("/api/operations/accounting/company-summary", async (c) => {
    const auth = await authorize(c, "MUHASEBE", "read");
    if ("response" in auth) return auth.response;
    const companyValue = text(
      c.req.query("companyId") || c.req.query("company") || c.req.query("name"),
    );
    const resolved = await resolveCompany(c, auth.companySlug, companyValue);
    if (!resolved.company) {
      return c.json(
        errorBody(
          resolved.error || "COMPANY_NOT_FOUND",
          resolved.error === "COMPANY_AMBIGUOUS"
            ? "Firma adı birden fazla kayıtla eşleşti; firma seçilmelidir."
            : "Firma bulunamadı.",
          { matches: resolved.matches },
        ),
        resolved.error === "COMPANY_AMBIGUOUS" ? 409 : 404,
      );
    }
    const startDate = text(c.req.query("startDate"));
    const endDate = text(c.req.query("endDate"));
    if ((startDate && !validDate(startDate)) || (endDate && !validDate(endDate))) {
      return c.json(errorBody("INVALID_DATE", "Tarih YYYY-AA-GG formatında olmalıdır."), 400);
    }
    const movements = await accountingLedger(
      c,
      auth.companySlug,
      resolved.company.id,
      startDate,
      endDate,
      clampLimit(c.req.query("limit"), 100, 500),
    );
    const fresh = await c.env.DB.prepare(
      `SELECT id,name,company_type,type,tax_no,current_balance,opening_balance,is_active,note
         FROM companies WHERE main_company_slug=? AND id=? AND deleted_at IS NULL LIMIT 1`,
    )
      .bind(auth.companySlug, resolved.company.id)
      .first<Row>();
    return c.json({
      ok: true,
      success: true,
      data: {
        company: fresh ? mapCompany(fresh) : resolved.company,
        movements,
      },
    });
  });

  app.post("/api/operations/accounting/payments", async (c) => {
    const body = await bodyOf(c);
    const auth = await authorize(c, "MUHASEBE", "write", body);
    if ("response" in auth) return auth.response;

    const idempotencyKey = requireIdempotency(body);
    if (!idempotencyKey) {
      return c.json(
        errorBody(
          "IDEMPOTENCY_KEY_REQUIRED",
          "Tekrarlı kayıt riskini önlemek için en az 8 karakterli idempotencyKey zorunludur.",
        ),
        400,
      );
    }
    if (!(await tableExists(c, "operation_logs"))) {
      return c.json(
        errorBody("AUDIT_NOT_READY", "İşlem günlüğü hazır değil; güvenli yazma kapalı."),
        503,
      );
    }
    const operationId = `operations:accounting:${auth.companySlug}:${idempotencyKey}`;
    const prior = await operationAlreadyProcessed(c, operationId, auth.companySlug);
    if (prior) {
      return c.json({
        ok: true,
        success: true,
        duplicatePrevented: true,
        data: {
          operationId: prior.id,
          entityId: prior.entity_id,
          action: prior.action,
          createdAt: prior.created_at,
        },
      });
    }

    const companyValue = text(body.companyId || body.firmId || body.company || body.name);
    const resolved = await resolveCompany(c, auth.companySlug, companyValue);
    if (!resolved.company) {
      return c.json(
        errorBody(
          resolved.error || "COMPANY_NOT_FOUND",
          resolved.error === "COMPANY_AMBIGUOUS"
            ? "Firma adı birden fazla kayıtla eşleşti; firma seçilmelidir."
            : "Firma bulunamadı.",
          { matches: resolved.matches },
        ),
        resolved.error === "COMPANY_AMBIGUOUS" ? 409 : 404,
      );
    }

    const amount = number(body.amount);
    if (amount <= 0) {
      return c.json(errorBody("INVALID_AMOUNT", "Ödeme tutarı sıfırdan büyük olmalıdır."), 400);
    }
    const direction = normalizePaymentDirection(
      body.direction || body.transactionDirection || body.type,
    );
    if (!direction) {
      return c.json(
        errorBody(
          "INVALID_DIRECTION",
          "Yön PAYMENT_IN/TAHSILAT veya PAYMENT_OUT/ODEME olmalıdır.",
        ),
        400,
      );
    }
    const paymentDate = text(body.paymentDate || body.date || nowIso().slice(0, 10));
    if (!validDate(paymentDate)) {
      return c.json(errorBody("INVALID_DATE", "Tarih YYYY-AA-GG formatında olmalıdır."), 400);
    }

    const incoming = direction === "PAYMENT_IN";
    const effect = incoming ? amount : -amount;
    const paymentId = crypto.randomUUID();
    const movementId = crypto.randomUUID();
    const timestamp = nowIso();
    const payment = {
      id: paymentId,
      firmId: resolved.company.id,
      companyId: resolved.company.id,
      companyName: resolved.company.name,
      transactionDirection: direction,
      paymentMethod: text(body.paymentMethod) || "TRANSFER",
      paymentDate,
      amount,
      description: text(body.description || body.note),
      bankName: text(body.bankName),
      source: "OPERATIONS_BRIDGE",
      createdAt: timestamp,
    };

    const statements: any[] = [
      c.env.DB.prepare(
        `UPDATE companies
            SET current_balance=COALESCE(current_balance,0)+?,updated_at=?
          WHERE id=? AND main_company_slug=? AND deleted_at IS NULL`,
      ).bind(effect, timestamp, resolved.company.id, auth.companySlug),
      c.env.DB.prepare(
        `INSERT INTO current_account_movements
          (id,main_company_slug,company_id,movement_date,movement_type,source_type,
           document_no,description,debit,credit,amount,effect,balance_after,raw,created_at,updated_at)
         SELECT ?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(current_balance,0),?,?,?
           FROM companies
          WHERE id=? AND main_company_slug=? AND deleted_at IS NULL`,
      ).bind(
        movementId,
        auth.companySlug,
        resolved.company.id,
        paymentDate,
        incoming ? "TAHSILAT" : "ODEME",
        "OPERATIONS_BRIDGE",
        paymentId,
        payment.description || (incoming ? "Tahsilat" : "Ödeme"),
        incoming ? amount : 0,
        incoming ? 0 : amount,
        amount,
        effect,
        JSON.stringify(payment),
        timestamp,
        timestamp,
        resolved.company.id,
        auth.companySlug,
      ),
    ];

    if (await tableExists(c, "json_store")) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO json_store
            (id,scope,main_company_slug,file_name,data,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?)`,
        ).bind(
          crypto.randomUUID(),
          "MUHASEBE_PAYMENT",
          auth.companySlug,
          paymentId,
          JSON.stringify(payment),
          timestamp,
          timestamp,
        ),
      );
    }

    if (await tableExists(c, "operation_logs")) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO operation_logs
            (id,main_company_slug,module,entity_type,entity_id,action,old_value_json,new_value_json,created_by,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          operationId,
          auth.companySlug,
          "MUHASEBE",
          "PAYMENT",
          paymentId,
          incoming ? "TAHSILAT" : "ODEME",
          JSON.stringify({ currentBalance: resolved.company.currentBalance }),
          JSON.stringify({
            ...payment,
            expectedBalanceAfter: number(resolved.company.currentBalance) + effect,
          }),
          text(auth.user.id || auth.user.username),
          timestamp,
        ),
      );
    }

    await c.env.DB.batch(statements);

    const [freshCompany, movement] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id,name,company_type,type,tax_no,current_balance,opening_balance,is_active,note
           FROM companies WHERE main_company_slug=? AND id=? AND deleted_at IS NULL LIMIT 1`,
      )
        .bind(auth.companySlug, resolved.company.id)
        .first<Row>(),
      c.env.DB.prepare(
        `SELECT id,movement_date,movement_type,source_type,document_no,description,
                debit,credit,amount,effect,balance_after,created_at
           FROM current_account_movements
          WHERE id=? AND main_company_slug=? LIMIT 1`,
      )
        .bind(movementId, auth.companySlug)
        .first<Row>(),
    ]);

    return c.json(
      {
        ok: true,
        success: true,
        data: {
          operationId,
          payment,
          company: freshCompany ? mapCompany(freshCompany) : resolved.company,
          movement,
        },
      },
      201,
    );
  });
}
