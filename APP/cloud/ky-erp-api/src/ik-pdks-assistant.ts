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
const trFold = (value: unknown) => text(value).toLocaleLowerCase("tr-TR").replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c");

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  } catch { return {}; }
}

function ok(c: Context<AppEnv>, data: unknown, status = 200) {
  return c.json({ ok: true, success: true, data }, status as any);
}
function error(c: Context<AppEnv>, status: number, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status as any);
}

function istanbulToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = parts.find((x) => x.type === "year")?.value || "";
  const m = parts.find((x) => x.type === "month")?.value || "";
  const d = parts.find((x) => x.type === "day")?.value || "";
  return `${y}-${m}-${d}`;
}

function dateFromCommand(command: string) {
  const raw = text(command);
  let match = raw.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/);
  if (match) return `${match[3]}-${String(Number(match[2])).padStart(2,"0")}-${String(Number(match[1])).padStart(2,"0")}`;
  match = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (match) return match[0];
  const today = istanbulToday();
  const folded = trFold(raw);
  if (folded.includes("dun")) {
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0,10);
  }
  if (folded.includes("yarin")) {
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0,10);
  }
  return today;
}

function timeFromCommand(command: string) {
  const match = text(command).match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  return match ? `${String(Number(match[1])).padStart(2,"0")}:${match[2]}` : "";
}

async function periodLocked(c: Context<AppEnv>, company: string, date: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!match) throw new Error("INVALID_PDKS_PERIOD_DATE");
  const row = await c.env.DB.prepare("SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1")
    .bind(company, Number(match[1]), Number(match[2])).first<Row>();
  return Number(row?.is_locked || 0) !== 0;
}

async function writeAudit(c: Context<AppEnv>, company: string, employeeId: string, period: string, actionType: string, payload: unknown, reason: string, userName: string) {
  try {
    await c.env.DB.prepare(`INSERT INTO ik_audit_logs
      (id,main_company_id,employee_id,period,action_type,source_screen,old_json,new_json,reason,user_name,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), company, employeeId, period, actionType, "KY_PDKS_ASSISTANT", "{}", JSON.stringify(payload || {}), reason, userName, nowIso()).run();
  } catch {}
}

export function registerIkPdksAssistantRoutes(app: Hono<AppEnv>) {
  app.post("/api/ik/personnel-control/assistant/command", async (c) => {
    const user = await getAuthenticatedUser(c);
    if (!user) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (upper(user.role) === "DENETIM" || text(user.username).toLocaleLowerCase("tr-TR") === "denetim") {
      return error(c, 403, "PDKS_AUDIT_READ_ONLY", "Denetim hesabı asistan ile kayıt değiştiremez.");
    }
    const body = await bodyOf(c);
    const command = text(body.command);
    if (!command) return error(c, 400, "COMMAND_REQUIRED", "Asistan komutu boş olamaz.");
    const folded = trFold(command);
    const financeTerms = ["avans","bordro","maas","banka","elden","kesinti","icra","haciz","fibe"];
    if (financeTerms.some((term) => folded.includes(term))) {
      return error(c, 422, "PDKS_FINANCE_NOT_ALLOWED", "Finans ve bordro işlemleri PDKS'den yapılamaz. İK İşlem Merkezi'ni kullanın.");
    }
    const company = text(c.req.header("X-KYERP-Tenant-Slug") || body.mainCompanyId || body.mainCompanySlug || user.mainCompanySlug || user.security?.main_company_slug || DEFAULT_COMPANY).toLocaleLowerCase("tr-TR");

    const result = await c.env.DB.prepare(`SELECT e.id,e.code,e.full_name,e.department,s.card_no
      FROM hr_monthly_employees e
      JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
      WHERE e.main_company_id=?
        AND UPPER(COALESCE(s.active_passive,e.status,'AKTIF')) NOT LIKE '%PAS%'
        AND TRIM(COALESCE(s.card_no,''))<>''
      ORDER BY LENGTH(e.full_name) DESC`).bind(company).all<Row>();
    const people = result.results || [];
    const person = people.find((row) => folded.includes(trFold(row.full_name)))
      || people.find((row) => text(row.code) && folded.includes(trFold(row.code)));
    if (!person) return error(c, 404, "PDKS_PERSON_NOT_FOUND", "Komuttaki aktif kartlı personel bulunamadı. Ad soyadı tam yazın.");

    const date = dateFromCommand(command);
    const time = timeFromCommand(command);
    const commit = body.commit === true;

    let locked = false;
    try {
      locked = await periodLocked(c, company, date);
    } catch {
      return error(c, 503, "PDKS_PERIOD_LOCK_CHECK_FAILED", "Dönem kilidi doğrulanamadı. Güvenlik nedeniyle işlem uygulanmadı; tekrar deneyin.");
    }
    if (locked) return error(c, 409, "PDKS_PERIOD_LOCKED", `Dönem kilitli: ${date.slice(0,7)}.`);

    let action = "";
    let summary = "";
    const payload: Row = { employeeId: text(person.id), fullName: text(person.full_name), personnelCode: text(person.code), date };

    if ((folded.includes("gelmedi") || folded.includes("yok yaz") || folded.includes("devamsiz")) && !folded.includes("gec geldi")) {
      action = "ABSENT";
      summary = `${text(person.full_name)} · ${date} · KART_YOK`;
      if (commit) {
        await c.env.DB.prepare(`INSERT INTO ik_attendance_day_overrides
          (id,main_company_id,employee_id,work_date,status,manual_in,manual_out,late_minutes,early_minutes,overtime_minutes,missing_punch,note,actor_user_id,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(main_company_id,employee_id,work_date) DO UPDATE SET status='KART_YOK',manual_in=NULL,manual_out=NULL,late_minutes=0,early_minutes=0,overtime_minutes=0,missing_punch=0,note=excluded.note,actor_user_id=excluded.actor_user_id,updated_at=excluded.updated_at`)
          .bind(crypto.randomUUID(), company, text(person.id), date, "KART_YOK", null, null, 0, 0, 0, 0, "PDKS Asistan: bugün yok", text(user.id), nowIso(), nowIso()).run();
      }
    } else if ((folded.includes("geldi") || folded.includes("giris")) && time) {
      action = "ARRIVAL";
      payload.time = time;
      summary = `${text(person.full_name)} · ${date} ${time} giriş`;
      if (commit) {
        const cardNo = text(person.card_no);
        const existing = await c.env.DB.prepare("SELECT id FROM ik_time_clock_events WHERE main_company_id=? AND card_no=? AND work_date=? AND event_time=? LIMIT 1")
          .bind(company, cardNo, date, time).first<Row>();
        if (!existing?.id) {
          await c.env.DB.prepare(`INSERT INTO ik_time_clock_events
            (id,main_company_id,employee_id,card_no,work_date,event_time,direction,source,note,actor_user_id,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
            .bind(crypto.randomUUID(), company, text(person.id), cardNo, date, time, "IN", "KYERP_PDKS_ASSISTANT", "Asistan giriş kaydı", text(user.id), nowIso(), nowIso()).run();
        }
      }
    } else if ((folded.includes("cikis") || folded.includes("cikti")) && time) {
      action = "DEPARTURE";
      payload.time = time;
      summary = `${text(person.full_name)} · ${date} ${time} çıkış`;
      if (commit) {
        const cardNo = text(person.card_no);
        const existing = await c.env.DB.prepare("SELECT id FROM ik_time_clock_events WHERE main_company_id=? AND card_no=? AND work_date=? AND event_time=? LIMIT 1")
          .bind(company, cardNo, date, time).first<Row>();
        if (!existing?.id) {
          await c.env.DB.prepare(`INSERT INTO ik_time_clock_events
            (id,main_company_id,employee_id,card_no,work_date,event_time,direction,source,note,actor_user_id,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
            .bind(crypto.randomUUID(), company, text(person.id), cardNo, date, time, "OUT", "KYERP_PDKS_ASSISTANT", "Asistan çıkış kaydı", text(user.id), nowIso(), nowIso()).run();
        }
      }
    } else {
      return error(c, 422, "PDKS_ASSISTANT_COMMAND_UNCLEAR", "Komut anlaşılamadı. Örnek: 'Ali bugün 08:42 geldi', 'Ali bugün gelmedi yok yaz', 'Ali bugün 18:55 çıkış yaptı'.");
    }

    if (commit) {
      await writeAudit(c, company, text(person.id), date.slice(0,7), `PDKS_ASSISTANT_${action}`, payload, command, text(user.username));
    }
    return ok(c, { action, summary, preview: !commit, committed: commit, payload });
  });
}
