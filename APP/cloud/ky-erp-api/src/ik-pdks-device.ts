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

async function ensureSchema(c: Context<AppEnv>) {
  await c.env.DB.batch([
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_devices (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      device_label TEXT NOT NULL,
      machine_name TEXT NOT NULL DEFAULT '',
      secret_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_by_user_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT,
      last_sync_at TEXT,
      last_sync_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(main_company_id, device_label)
    )`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_device_sync_logs (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      main_company_id TEXT NOT NULL,
      received_count INTEGER NOT NULL DEFAULT 0,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
  ]);
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  const raw = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

async function isLocked(c: Context<AppEnv>, company: string, date: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!match) return false;
  try {
    const row = await c.env.DB.prepare("SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1")
      .bind(company, Number(match[1]), Number(match[2])).first<Row>();
    return Number(row?.is_locked || 0) !== 0;
  } catch { return false; }
}

async function resolveDevice(c: Context<AppEnv>) {
  await ensureSchema(c);
  const deviceId = text(c.req.header("X-KYERP-PDKS-Device"));
  const secret = text(c.req.header("X-KYERP-PDKS-Secret"));
  if (!deviceId || !secret) return null;
  const row = await c.env.DB.prepare("SELECT * FROM ik_pdks_devices WHERE id=? AND active=1 LIMIT 1").bind(deviceId).first<Row>();
  if (!row) return null;
  const actual = await sha256(secret);
  return safeEqual(actual, text(row.secret_hash)) ? row : null;
}

async function writeSyncLog(c: Context<AppEnv>, device: Row, received: number, accepted: number, rejected: number, status: string, message = "") {
  try {
    await c.env.DB.prepare(`INSERT INTO ik_pdks_device_sync_logs
      (id,device_id,main_company_id,received_count,accepted_count,rejected_count,status,message,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), text(device.id), text(device.main_company_id), received, accepted, rejected, status, message, nowIso()).run();
  } catch {}
}

export function registerIkPdksDeviceRoutes(app: Hono<AppEnv>) {
  app.post("/api/ik/personnel-control/device/enroll", async (c) => {
    await ensureSchema(c);
    const user = await getAuthenticatedUser(c);
    if (!user) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (upper(user.role) === "DENETIM" || text(user.username).toLocaleLowerCase("tr-TR") === "denetim") {
      return error(c, 403, "PDKS_AUDIT_READ_ONLY", "Denetim hesabı cihaz yetkilendiremez.");
    }
    const body = await bodyOf(c);
    const company = text(c.req.header("X-KYERP-Tenant-Slug") || body.mainCompanyId || body.mainCompanySlug || user.mainCompanySlug || user.security?.main_company_slug || DEFAULT_COMPANY).toLocaleLowerCase("tr-TR");
    const label = text(body.deviceLabel);
    const machineName = text(body.machineName);
    if (!label) return error(c, 400, "DEVICE_LABEL_REQUIRED", "Cihaz etiketi zorunludur.");

    const secretBytes = new Uint8Array(32);
    crypto.getRandomValues(secretBytes);
    const secret = base64Url(secretBytes);
    const secretHash = await sha256(secret);
    const current = await c.env.DB.prepare("SELECT id,created_at FROM ik_pdks_devices WHERE main_company_id=? AND device_label=? LIMIT 1")
      .bind(company, label).first<Row>();
    const id = text(current?.id || crypto.randomUUID());
    const stamp = nowIso();
    await c.env.DB.prepare(`INSERT INTO ik_pdks_devices
      (id,main_company_id,device_label,machine_name,secret_hash,active,created_by_user_id,created_at,updated_at,last_seen_at,last_sync_at,last_sync_count)
      VALUES(?,?,?,?,?,1,?,?,?,?,NULL,0)
      ON CONFLICT(main_company_id,device_label) DO UPDATE SET
        machine_name=excluded.machine_name,secret_hash=excluded.secret_hash,active=1,created_by_user_id=excluded.created_by_user_id,updated_at=excluded.updated_at`)
      .bind(id, company, label, machineName, secretHash, text(user.id), text(current?.created_at || stamp), stamp, stamp).run();
    return ok(c, { deviceId: id, secret, company, deviceLabel: label, machineName, enrolledAt: stamp }, 201);
  });

  app.post("/api/auth/pdks-device/heartbeat", async (c) => {
    const device = await resolveDevice(c);
    if (!device) return error(c, 401, "PDKS_DEVICE_UNAUTHORIZED", "PDKS cihaz yetkisi geçersiz.");
    await c.env.DB.prepare("UPDATE ik_pdks_devices SET last_seen_at=?,updated_at=? WHERE id=?")
      .bind(nowIso(), nowIso(), text(device.id)).run();
    return ok(c, { deviceId: text(device.id), company: text(device.main_company_id), active: true });
  });

  app.post("/api/auth/pdks-device/time-events/import", async (c) => {
    const device = await resolveDevice(c);
    if (!device) return error(c, 401, "PDKS_DEVICE_UNAUTHORIZED", "PDKS cihaz yetkisi geçersiz.");
    const body = await bodyOf(c);
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 1000) : [];
    if (!rows.length) return error(c, 400, "ROWS_REQUIRED", "Aktarılacak kart hareketi yok.");
    const company = text(device.main_company_id);

    const peopleResult = await c.env.DB.prepare(`SELECT e.id,e.full_name,e.code,s.card_no
      FROM hr_monthly_employees e
      JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
      WHERE e.main_company_id=? AND UPPER(TRIM(COALESCE(e.sgk_status,'')))='VAR' AND TRIM(COALESCE(s.card_no,''))<>''`)
      .bind(company).all<Row>();
    const people = new Map((peopleResult.results || []).map((row) => [normalizeCard(row.card_no), row]));
    const accepted: Row[] = [];
    const rejected: Row[] = [];
    const statements: any[] = [];
    const seen = new Set<string>();

    for (const source of rows) {
      const localId = text(source.localId || source.id);
      const cardNo = normalizeCard(source.cardNo);
      const workDate = normalizeDate(source.workDate || source.date);
      const eventTime = normalizeTime(source.eventTime || source.time);
      const person = people.get(cardNo);
      if (!localId || !cardNo || !workDate || !eventTime || !person) {
        rejected.push({ localId, reason: "SGK=VAR + kart/tarih/saat eşleşmedi." });
        continue;
      }
      if (await isLocked(c, company, workDate)) {
        rejected.push({ localId, reason: `Dönem kilitli: ${workDate.slice(0, 7)}.` });
        continue;
      }
      const key = `${cardNo}|${workDate}|${eventTime}`;
      if (seen.has(key)) {
        accepted.push({ localId, duplicate: true });
        continue;
      }
      seen.add(key);
      const existing = await c.env.DB.prepare(`SELECT id FROM ik_time_clock_events
        WHERE main_company_id=? AND card_no=? AND work_date=? AND event_time=? LIMIT 1`)
        .bind(company, cardNo, workDate, eventTime).first<Row>();
      if (existing?.id) {
        accepted.push({ localId, id: text(existing.id), duplicate: true });
        continue;
      }
      const id = crypto.randomUUID();
      statements.push(c.env.DB.prepare(`INSERT INTO ik_time_clock_events
        (id,main_company_id,employee_id,card_no,work_date,event_time,direction,source,note,actor_user_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, company, text(person.id), cardNo, workDate, eventTime, upper(source.direction) || "AUTO",
          `PDKS_AGENT:${text(device.device_label)}`, text(source.note || body.source), text(device.created_by_user_id), nowIso(), nowIso()));
      accepted.push({ localId, id, duplicate: false });
    }

    if (statements.length) await c.env.DB.batch(statements);
    const stamp = nowIso();
    await c.env.DB.prepare("UPDATE ik_pdks_devices SET last_seen_at=?,last_sync_at=?,last_sync_count=?,updated_at=? WHERE id=?")
      .bind(stamp, stamp, accepted.length, stamp, text(device.id)).run();
    await writeSyncLog(c, device, rows.length, accepted.length, rejected.length, "OK", "Agent D1 sync");
    return ok(c, { acceptedCount: accepted.length, rejectedCount: rejected.length, accepted, rejected });
  });
}
