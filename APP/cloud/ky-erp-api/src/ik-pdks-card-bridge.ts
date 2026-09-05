// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const DEFAULT_COMPANY = "mecit-hakan";
const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const nowIso = () => new Date().toISOString();

function ok(c: Context<AppEnv>, data: unknown, status = 200) {
  return c.json({ ok: true, success: true, data }, status as any);
}
function error(c: Context<AppEnv>, status: number, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status as any);
}

async function auth(c: Context<AppEnv>, body: Row = {}) {
  const user = await getAuthenticatedUser(c);
  if (!user) return null;
  const company = text(
    c.req.header("X-KYERP-Tenant-Slug") || body.mainCompanyId || body.mainCompanySlug ||
    c.req.query("mainCompanyId") || c.req.query("mainCompanySlug") ||
    user.mainCompanySlug || user.security?.main_company_slug || DEFAULT_COMPANY,
  ).toLocaleLowerCase("tr-TR");
  let audit = upper(user.role) === "DENETIM" || text(user.username).toLocaleLowerCase("tr-TR") === "denetim";
  if (!audit) {
    try {
      const row = await c.env.DB.prepare("SELECT scope FROM ik_user_hr_scope WHERE user_id=? AND main_company_id=? LIMIT 1")
        .bind(user.id, company).first<Row>();
      audit = upper(row?.scope) === "AUDIT";
    } catch {}
  }
  return { user, company, audit };
}

function normalizeCard(value: unknown) {
  const digits = text(value).replace(/\D+/g, "");
  if (!digits || digits.length > 12) return "";
  return digits.length <= 5 ? digits.padStart(5, "0") : digits;
}

function normalizeTime(value: unknown) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text(value));
  if (!match) return "";
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : "";
}

function normalizeDate(value: unknown) {
  const raw = text(value);
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{2})[.\/-](\d{2})[.\/-](\d{4})$/.exec(raw);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = /^(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (match) return `20${match[3]}-${match[2]}-${match[1]}`;
  return "";
}

function parseLine(line: string, index: number) {
  const clean = line.trim();
  if (!clean) return null;
  const tokens = clean.includes(",") || clean.includes(";")
    ? clean.split(/[;,]/).map((item) => item.trim()).filter(Boolean)
    : clean.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  if (tokens.length < 3) return { localId: `line-${index + 1}`, rawLine: clean, warning: "Satır formatı tanınmadı." };
  const cardNo = normalizeCard(tokens[0]);
  let workDate = "";
  let eventTime = "";
  for (const token of tokens.slice(1)) {
    if (!workDate) workDate = normalizeDate(token);
    if (!eventTime) eventTime = normalizeTime(token);
  }
  if (!cardNo || !workDate || !eventTime) {
    return { localId: `line-${index + 1}`, rawLine: clean, cardNo, workDate, eventTime, warning: "Kart/tarih/saat çözümlenemedi." };
  }
  return { localId: `line-${index + 1}`, rawLine: clean, cardNo, workDate, eventTime, direction: "AUTO", warning: "" };
}

async function locked(c: Context<AppEnv>, company: string, date: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!match) return false;
  try {
    const row = await c.env.DB.prepare("SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1")
      .bind(company, Number(match[1]), Number(match[2])).first<Row>();
    return Number(row?.is_locked || 0) !== 0;
  } catch { return false; }
}

async function peopleByCard(c: Context<AppEnv>, company: string) {
  const result = await c.env.DB.prepare(`SELECT e.id,e.code,e.full_name,e.sgk_status,s.card_no
    FROM hr_monthly_employees e JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
    WHERE e.main_company_id=? AND UPPER(TRIM(COALESCE(s.active_passive,e.status,'AKTIF'))) NOT LIKE '%PAS%'
      AND TRIM(COALESCE(s.card_no,''))<>''`)
    .bind(company).all<Row>();
  return new Map((result.results || []).map((row) => [normalizeCard(row.card_no), row]));
}

async function preview(c: Context<AppEnv>) {
  const context = await auth(c);
  if (!context) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
  if (context.audit) return error(c, 403, "PDKS_AUDIT_READ_ONLY", "Denetim hesabı kart dosyası işleyemez.");
  const form = await c.req.parseBody({ all: true });
  const values = Object.values(form).flatMap((value) => Array.isArray(value) ? value : [value]);
  const file = values.find((value) => value instanceof File) as File | undefined;
  if (!file) return error(c, 400, "FILE_REQUIRED", "Kart dosyası seçin.");
  const name = file.name.toLocaleLowerCase("tr-TR");
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return error(c, 415, "PDKS_TEXT_CARD_FILE_REQUIRED", "PDKS Bilgi Aktar için Hedef/TNF TXT, CSV veya DAT dosyası kullanın. Excel dosyasını İK Excel aktarım ekranından işleyin.");
  }
  if (file.size > 10 * 1024 * 1024) return error(c, 413, "FILE_TOO_LARGE", "Kart dosyası 10 MB sınırını aşıyor.");
  const raw = (await file.text()).replace(/^\uFEFF/, "");
  const parsed = raw.split(/\r?\n/).map(parseLine).filter(Boolean) as Row[];
  const cards = await peopleByCard(c, context.company);
  const rows = parsed.map((row) => {
    const person = cards.get(normalizeCard(row.cardNo));
    const warning = text(row.warning) || (!person ? "Aktif kartlı personel eşleşmedi." : "");
    return {
      ...row,
      employeeId: text(person?.id),
      fullName: text(person?.full_name),
      personnelCode: text(person?.code),
      warning,
      valid: Boolean(person && !warning),
    };
  });
  const validCount = rows.filter((row) => row.valid).length;
  return ok(c, { importId: crypto.randomUUID(), fileName: file.name, rowCount: rows.length, validCount, warningCount: rows.length - validCount, rows, items: rows });
}

async function confirm(c: Context<AppEnv>) {
  let body: Row = {};
  try {
    const parsed = await c.req.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Row : {};
  } catch {}
  const context = await auth(c, body);
  if (!context) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
  if (context.audit) return error(c, 403, "PDKS_AUDIT_READ_ONLY", "Denetim hesabı kart dosyası işleyemez.");
  const rows = Array.isArray(body.rows) ? body.rows : Array.isArray(body.items) ? body.items : [];
  if (!rows.length) return error(c, 400, "ROWS_REQUIRED", "Onaylanacak kart satırı yok.");
  const cards = await peopleByCard(c, context.company);
  const accepted: Row[] = [];
  const rejected: Row[] = [];
  const statements: any[] = [];
  const seen = new Set<string>();
  for (const source of rows) {
    const cardNo = normalizeCard(source.cardNo);
    const workDate = normalizeDate(source.workDate || source.date);
    const eventTime = normalizeTime(source.eventTime || source.time);
    const person = cards.get(cardNo);
    const localId = text(source.localId || source.id);
    if (!cardNo || !workDate || !eventTime || !person) {
      rejected.push({ localId, cardNo, workDate, eventTime, reason: "Kartlı personel/tarih/saat eşleşmedi." });
      continue;
    }
    if (await locked(c, context.company, workDate)) {
      rejected.push({ localId, cardNo, workDate, eventTime, reason: `Dönem kilitli: ${workDate.slice(0, 7)}.` });
      continue;
    }
    const key = `${cardNo}|${workDate}|${eventTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = crypto.randomUUID();
    statements.push(c.env.DB.prepare(`INSERT OR IGNORE INTO ik_time_clock_events
      (id,main_company_id,employee_id,card_no,work_date,event_time,direction,source,note,actor_user_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, context.company, text(person.id), cardNo, workDate, eventTime, upper(source.direction) || "AUTO",
        "KYERP_WEB_PDKS_FILE", `Kart dosyası: ${text(body.fileName || body.importId)}`, context.user.id, nowIso(), nowIso()));
    accepted.push({ localId, id, employeeId: text(person.id), cardNo, workDate, eventTime });
  }
  if (statements.length) await c.env.DB.batch(statements);
  return ok(c, { acceptedCount: accepted.length, rejectedCount: rejected.length, accepted, rejected });
}

export function registerIkPdksCardBridgeRoutes(app: Hono<AppEnv>) {
  // Eski UI fonksiyon adlarıyla uyumluluk; veri hedefi yalnız canonical D1 kart tablosudur.
  app.post("/api/ik/advanced/card/preview", preview);
  app.post("/api/ik/advanced/card/confirm", confirm);
}
