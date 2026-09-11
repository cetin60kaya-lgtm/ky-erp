// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const DEFAULT_COMPANY = "mecit-hakan";
const INITIAL_VERSION = "2026-09-11-fpclock-card-map-v1";
const INITIAL_MAPPINGS = [
  ["00001", "ADEM YAZER"],
  ["00002", "AHMET KURT"],
  ["00003", "AYŞE ÖKSÜZ"],
  ["00004", "ÇETİN KAYA"],
  ["00006", "ERSİN YAVAŞ"],
  ["00008", "FEHMİ ÖZKARA"],
  ["00011", "ÖZCAN YILDIZ"],
  ["00013", "CUMA ÖZKURT"],
  ["00039", "FADİME TÜRKYILMAZ"],
  ["00047", "MURAT AYDIN"],
  ["00048", "ALİ AKKAYA"],
  ["00049", "MURAT MİNANZ"],
  ["00050", "HALİL İBRAHİM ÇAĞLAR"],
  ["00056", "İRFAN KAMALI"],
  ["00057", "ZEYNEP ARSLAN"],
  ["00059", "HAYRİ ŞENGÜL"],
] as const;

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const nowIso = () => new Date().toISOString();

function normalizeName(value: unknown) {
  return upper(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ|I|ı/g, "I")
    .replace(/Ç/g, "C")
    .replace(/Ğ/g, "G")
    .replace(/Ö/g, "O")
    .replace(/Ş/g, "S")
    .replace(/Ü/g, "U")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCard(value: unknown) {
  const digits = text(value).replace(/\D+/g, "");
  if (!digits || digits.length > 12) return "";
  return digits.length <= 5 ? digits.padStart(5, "0") : digits;
}

function ok(c: Context<AppEnv>, data: unknown, status = 200) {
  return c.json({ ok: true, success: true, data }, status as any);
}
function fail(c: Context<AppEnv>, status: number, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status as any);
}
async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  } catch { return {}; }
}
function companyOf(c: Context<AppEnv>, user: Row, body: Row = {}) {
  return text(
    (c as any).get?.("pdksCompany") ||
    c.req.header("X-KYERP-Tenant-Slug") ||
    c.req.query("mainCompanyId") || c.req.query("mainCompanySlug") ||
    body.mainCompanyId || body.mainCompanySlug ||
    user?.mainCompanySlug || user?.security?.main_company_slug || DEFAULT_COMPANY,
  ).toLocaleLowerCase("tr-TR");
}

async function ensureSchema(c: Context<AppEnv>) {
  await c.env.DB.batch([
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_card_mapping_migrations(
      main_company_id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      applied_by TEXT NOT NULL DEFAULT '',
      applied_at TEXT NOT NULL
    )`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_card_mapping_audit(
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      personnel_code TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL DEFAULT '',
      old_card_no TEXT NOT NULL DEFAULT '',
      new_card_no TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'PDKS_CARD_MAP',
      actor_user_id TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
  ]);
}

async function peopleRows(c: Context<AppEnv>, company: string) {
  const result = await c.env.DB.prepare(`SELECT
      e.id,
      e.code AS personnelCode,
      e.full_name AS fullName,
      e.department,
      e.title,
      e.status,
      COALESCE(s.card_no,'') AS cardNo,
      COALESCE(s.card_source,'') AS cardSource,
      COALESCE(s.active_passive,e.status,'AKTIF') AS activePassive
    FROM hr_monthly_employees e
    LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
    WHERE e.main_company_id=?
    ORDER BY e.full_name COLLATE NOCASE`)
    .bind(company).all<Row>();
  return result.results || [];
}

async function saveMapping(c: Context<AppEnv>, company: string, user: Row, employee: Row, cardNo: string, source: string) {
  const oldCard = normalizeCard(employee.cardNo);
  const stamp = nowIso();
  const employeeId = text(employee.id);

  const conflict = await c.env.DB.prepare(`SELECT s.employee_id AS employeeId,e.full_name AS fullName,e.code AS personnelCode
      FROM ik_person_card_settings s
      LEFT JOIN hr_monthly_employees e ON e.id=s.employee_id AND e.main_company_id=s.main_company_id
      WHERE s.main_company_id=? AND s.card_no=? AND s.employee_id<>? LIMIT 1`)
    .bind(company, cardNo, employeeId).first<Row>();
  if (conflict) {
    return {
      oldCard, cardNo,
      conflict: { employeeId: text(conflict.employeeId), fullName: text(conflict.fullName), personnelCode: text(conflict.personnelCode) },
    };
  }

  await c.env.DB.prepare(`INSERT INTO ik_person_card_settings(employee_id,main_company_id,card_no,card_source,updated_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(employee_id) DO UPDATE SET
      main_company_id=excluded.main_company_id,
      card_no=excluded.card_no,
      card_source=excluded.card_source,
      updated_at=excluded.updated_at`)
    .bind(employeeId, company, cardNo, source, stamp).run();

  await c.env.DB.prepare(`INSERT INTO ik_pdks_card_mapping_audit(
      id,main_company_id,employee_id,personnel_code,full_name,old_card_no,new_card_no,source,actor_user_id,actor_name,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      crypto.randomUUID(), company, employeeId, text(employee.personnelCode), text(employee.fullName),
      oldCard, cardNo, source, text(user.id), text(user.fullName || user.name || user.username), stamp,
    ).run();
  return { oldCard, cardNo, conflict: null };
}

export function registerIkPdksCardMappingRoutes(app: Hono<AppEnv>) {
  app.get("/api/ik/personnel-control/card-mappings", async (c) => {
    await ensureSchema(c);
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    const company = companyOf(c, user);
    const rows = await peopleRows(c, company);
    const migration = await c.env.DB.prepare("SELECT version,details_json AS detailsJson,applied_at AS appliedAt FROM ik_pdks_card_mapping_migrations WHERE main_company_id=? LIMIT 1")
      .bind(company).first<Row>();
    return ok(c, { rows, initialVersion: INITIAL_VERSION, initialApplied: text(migration?.version) === INITIAL_VERSION, migration });
  });

  app.post("/api/ik/personnel-control/card-mappings/:employeeId", async (c) => {
    await ensureSchema(c);
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    const body = await bodyOf(c);
    const company = companyOf(c, user, body);
    const employeeId = text(c.req.param("employeeId"));
    const cardNo = normalizeCard(body.cardNo);
    if (!cardNo) return fail(c, 400, "PDKS_CARD_REQUIRED", "Terminal kart numarası 1-12 haneli sayı olmalıdır.");
    const employee = await c.env.DB.prepare(`SELECT e.id,e.code AS personnelCode,e.full_name AS fullName,s.card_no AS cardNo
      FROM hr_monthly_employees e
      LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
      WHERE e.main_company_id=? AND e.id=? LIMIT 1`)
      .bind(company, employeeId).first<Row>();
    if (!employee) return fail(c, 404, "PDKS_PERSON_NOT_FOUND", "Personel bulunamadı.");
    const result = await saveMapping(c, company, user, employee, cardNo, "FP_CLOCK_DIRECT");
    if (result.conflict) {
      return fail(c, 409, "PDKS_CARD_ALREADY_ASSIGNED", `Terminal kartı ${cardNo}, ${result.conflict.fullName || result.conflict.personnelCode || result.conflict.employeeId} personeline zaten bağlı.`);
    }
    return ok(c, { employeeId, personnelCode: text(employee.personnelCode), fullName: text(employee.fullName), ...result, updatedAt: nowIso() });
  });

  app.post("/api/ik/personnel-control/card-mappings/apply-initial", async (c) => {
    await ensureSchema(c);
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    const body = await bodyOf(c);
    const company = companyOf(c, user, body);
    const current = await c.env.DB.prepare("SELECT version,details_json AS detailsJson,applied_at AS appliedAt FROM ik_pdks_card_mapping_migrations WHERE main_company_id=? LIMIT 1")
      .bind(company).first<Row>();
    if (text(current?.version) === INITIAL_VERSION) {
      let details: any = {};
      try { details = JSON.parse(text(current?.detailsJson) || "{}"); } catch {}
      return ok(c, { alreadyApplied: true, version: INITIAL_VERSION, ...details, appliedAt: current?.appliedAt });
    }

    const people = await peopleRows(c, company);
    const byName = new Map(people.map((row) => [normalizeName(row.fullName), row]));
    const applied: Row[] = [];
    const missing: Row[] = [];
    const conflicts: Row[] = [];
    for (const [cardNo, fullName] of INITIAL_MAPPINGS) {
      const employee = byName.get(normalizeName(fullName));
      if (!employee) {
        missing.push({ cardNo, fullName });
        continue;
      }
      const result = await saveMapping(c, company, user, employee, cardNo, "FP_CLOCK_DIRECT_INITIAL");
      if (result.conflict) {
        conflicts.push({ cardNo, fullName, employeeId: employee.id, conflict: result.conflict });
        continue;
      }
      applied.push({ employeeId: employee.id, personnelCode: employee.personnelCode, fullName: employee.fullName, cardNo, oldCard: result.oldCard });
    }

    const details = { applied, missing, conflicts, requestedCount: INITIAL_MAPPINGS.length, appliedCount: applied.length, missingCount: missing.length, conflictCount: conflicts.length };
    const stamp = nowIso();
    await c.env.DB.prepare(`INSERT INTO ik_pdks_card_mapping_migrations(main_company_id,version,details_json,applied_by,applied_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(main_company_id) DO UPDATE SET version=excluded.version,details_json=excluded.details_json,applied_by=excluded.applied_by,applied_at=excluded.applied_at`)
      .bind(company, INITIAL_VERSION, JSON.stringify(details), text(user.id), stamp).run();
    return ok(c, { alreadyApplied: false, version: INITIAL_VERSION, ...details, appliedAt: stamp });
  });
}
