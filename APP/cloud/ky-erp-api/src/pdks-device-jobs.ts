import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerPdksWebChangeFeed } from "./pdks-web-change-feed";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const nowIso = () => new Date().toISOString();
const ok = (c: Context<AppEnv>, data: unknown, status = 200) => c.json({ ok: true, data }, status as any);
const fail = (c: Context<AppEnv>, status: number, code: string, message: string) => c.json({ ok: false, error: { code, message } }, status as any);

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Row : {};
  } catch {
    return {};
  }
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

async function ensureSchema(c: Context<AppEnv>) {
  await c.env.DB.batch([
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_device_jobs (
      id TEXT PRIMARY KEY,main_company_id TEXT NOT NULL,device_id TEXT NOT NULL,command TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'PENDING',result_json TEXT,
      requested_by_user_id TEXT NOT NULL DEFAULT '',requested_at TEXT NOT NULL,started_at TEXT,finished_at TEXT,updated_at TEXT NOT NULL)`),
    c.env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ik_pdks_device_jobs_device_status ON ik_pdks_device_jobs(device_id,status,requested_at)`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_sync_events (
      id TEXT PRIMARY KEY,idempotency_key TEXT NOT NULL UNIQUE,main_company_id TEXT NOT NULL,device_id TEXT,
      entity_type TEXT NOT NULL,entity_id TEXT NOT NULL DEFAULT '',operation TEXT NOT NULL,source TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',occurred_at TEXT NOT NULL,received_at TEXT NOT NULL)`),
    c.env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ik_pdks_sync_events_company_cursor ON ik_pdks_sync_events(main_company_id,received_at,id)`),
  ]);
}

function companyOf(c: Context<AppEnv>, user: Row) {
  return text(c.req.header("X-KYERP-Tenant-Slug") || c.req.query("mainCompanyId") || c.req.query("mainCompanySlug") || user.mainCompanySlug || user.security?.main_company_slug || "mecit-hakan").toLocaleLowerCase("tr-TR");
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

export function registerPdksDeviceJobRoutes(app: Hono<AppEnv>) {
  registerPdksWebChangeFeed(app);

  // Ayrı endpoint geriye dönük/test amaçlı tutulur. Web ana listesi pdks-web-change-feed
  // tarafından aynı güvenlik zincirindeki /people route'unda scoped edilir.
  app.get("/api/ik/personnel-control/pdks-people", async (c) => {
    await ensureSchema(c);
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    const company = companyOf(c, user);
    const result = await c.env.DB.prepare(`SELECT
      e.id,e.code,e.full_name,e.department,e.title,e.work_type,e.sgk_status,e.status,e.hire_date,
      e.salary,e.road_allowance,e.bank_payment_type,e.bank_amount,e.cash_amount,e.overtime_hourly_base,
      e.annual_leave_entitlement,e.annual_leave_carryover,e.note,e.created_at,e.updated_at,
      s.card_no,s.identity_no,s.exit_date,s.active_passive,s.phone,s.payment_type,s.sgk_follow,s.personel_kodu
      FROM hr_monthly_employees e
      JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
      WHERE e.main_company_id=?
        AND TRIM(COALESCE(s.card_no,''))<>''
        AND COALESCE(s.sgk_follow,1)<>0
        AND UPPER(COALESCE(e.sgk_status,'VAR'))<>'YOK'
      ORDER BY CASE WHEN UPPER(COALESCE(s.active_passive,e.status,'Aktif'))='AKTIF' THEN 0 ELSE 1 END,
               COALESCE(NULLIF(TRIM(s.personel_kodu),''),NULLIF(TRIM(s.card_no),''),e.code),e.full_name`)
      .bind(company).all<Row>();
    const rows = (result.results || []).map((row) => ({
      id: text(row.id),
      personnelCode: text(row.personel_kodu) || text(row.card_no) || text(row.code),
      fullName: text(row.full_name),
      department: text(row.department),
      title: text(row.title),
      workType: text(row.work_type) || "Aylık",
      sgkStatus: "VAR",
      status: text(row.active_passive) || text(row.status) || "Aktif",
      startDate: text(row.hire_date).slice(0, 10),
      exitDate: text(row.exit_date).slice(0, 10),
      cardNo: text(row.card_no),
      activePassive: text(row.active_passive) || text(row.status) || "Aktif",
      phone: text(row.phone),
      identityNo: text(row.identity_no),
      salary: Number(row.salary || 0),
      roadAllowance: Number(row.road_allowance || 0),
      paymentChannel: text(row.bank_payment_type),
      bankAmount: Number(row.bank_amount || 0),
      cashAmount: Number(row.cash_amount || 0),
      overtimeBaseHours: Number(row.overtime_hourly_base || 225),
      annualLeaveEntitlement: Number(row.annual_leave_entitlement || 0),
      annualLeaveCarryover: Number(row.annual_leave_carryover || 0),
      note: text(row.note),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    return ok(c, rows);
  });

  app.get("/api/ik/personnel-control/device-jobs", async (c) => {
    await ensureSchema(c);
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    const company = companyOf(c, user);
    const deviceId = text(c.req.query("deviceId"));
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") || 50)));
    const sql = `SELECT j.id,j.device_id AS deviceId,j.command,j.status,j.result_json AS resultJson,
      j.requested_at AS requestedAt,j.started_at AS startedAt,j.finished_at AS finishedAt,j.updated_at AS updatedAt,
      d.device_label AS deviceLabel FROM ik_pdks_device_jobs j
      LEFT JOIN ik_pdks_devices d ON d.id=j.device_id AND d.main_company_id=j.main_company_id
      WHERE j.main_company_id=? ${deviceId ? "AND j.device_id=?" : ""} ORDER BY j.requested_at DESC LIMIT ?`;
    const stmt = c.env.DB.prepare(sql);
    const result = deviceId ? await stmt.bind(company, deviceId, limit).all<Row>() : await stmt.bind(company, limit).all<Row>();
    return ok(c, result.results || []);
  });

  app.post("/api/ik/personnel-control/devices/:id/jobs", async (c) => {
    await ensureSchema(c);
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (["DENETIM"].includes(upper(user.role))) return fail(c, 403, "PDKS_AUDIT_READ_ONLY", "Denetim hesabı terminal komutu gönderemez.");
    const company = companyOf(c, user);
    const deviceId = text(c.req.param("id"));
    const device = await c.env.DB.prepare("SELECT id FROM ik_pdks_devices WHERE id=? AND main_company_id=? AND active=1 LIMIT 1").bind(deviceId, company).first<Row>();
    if (!device) return fail(c, 404, "PDKS_DEVICE_NOT_FOUND", "Aktif PDKS cihazı bulunamadı.");
    const body = await bodyOf(c);
    const command = upper(body.command || "SYNC_TERMINAL");
    if (command !== "SYNC_TERMINAL") return fail(c, 400, "PDKS_JOB_COMMAND_INVALID", "Desteklenen komut: SYNC_TERMINAL.");
    const existing = await c.env.DB.prepare("SELECT id,status FROM ik_pdks_device_jobs WHERE device_id=? AND command=? AND status IN ('PENDING','RUNNING') ORDER BY requested_at DESC LIMIT 1").bind(deviceId, command).first<Row>();
    if (existing) return ok(c, { id: text(existing.id), deviceId, command, status: text(existing.status), deduplicated: true }, 202);
    const id = crypto.randomUUID();
    const stamp = nowIso();
    await c.env.DB.prepare(`INSERT INTO ik_pdks_device_jobs(id,main_company_id,device_id,command,payload_json,status,requested_by_user_id,requested_at,updated_at)
      VALUES(?,?,?,?,?,'PENDING',?,?,?)`).bind(id, company, deviceId, command, JSON.stringify(body.payload || {}), text(user.id), stamp, stamp).run();
    return ok(c, { id, deviceId, command, status: "PENDING", requestedAt: stamp }, 202);
  });

  app.get("/api/auth/pdks-device/jobs/next", async (c) => {
    const device = await resolveDevice(c);
    if (!device) return fail(c, 401, "PDKS_DEVICE_UNAUTHORIZED", "PDKS cihaz yetkisi geçersiz.");
    const row = await c.env.DB.prepare(`SELECT id,command,payload_json,requested_at FROM ik_pdks_device_jobs
      WHERE device_id=? AND main_company_id=? AND status='PENDING' ORDER BY requested_at LIMIT 1`).bind(text(device.id), text(device.main_company_id)).first<Row>();
    if (!row) return ok(c, null);
    const stamp = nowIso();
    const changed = await c.env.DB.prepare("UPDATE ik_pdks_device_jobs SET status='RUNNING',started_at=COALESCE(started_at,?),updated_at=? WHERE id=? AND status='PENDING'").bind(stamp, stamp, text(row.id)).run();
    if (Number((changed as any)?.meta?.changes || 0) < 1) return ok(c, null);
    let payload: unknown = {};
    try { payload = JSON.parse(text(row.payload_json) || "{}"); } catch {}
    return ok(c, { id: text(row.id), command: text(row.command), payload, requestedAt: row.requested_at, startedAt: stamp });
  });

  app.post("/api/auth/pdks-device/jobs/:id/result", async (c) => {
    const device = await resolveDevice(c);
    if (!device) return fail(c, 401, "PDKS_DEVICE_UNAUTHORIZED", "PDKS cihaz yetkisi geçersiz.");
    const id = text(c.req.param("id"));
    const body = await bodyOf(c);
    const success = body.ok === true || upper(body.status) === "SUCCESS" || upper(body.status) === "OK";
    const stamp = nowIso();
    const current = await c.env.DB.prepare("SELECT id FROM ik_pdks_device_jobs WHERE id=? AND device_id=? AND main_company_id=? LIMIT 1").bind(id, text(device.id), text(device.main_company_id)).first<Row>();
    if (!current) return fail(c, 404, "PDKS_JOB_NOT_FOUND", "PDKS işi bulunamadı.");
    await c.env.DB.prepare("UPDATE ik_pdks_device_jobs SET status=?,result_json=?,finished_at=?,updated_at=? WHERE id=?")
      .bind(success ? "SUCCESS" : "ERROR", JSON.stringify(body), stamp, stamp, id).run();
    return ok(c, { id, status: success ? "SUCCESS" : "ERROR", finishedAt: stamp });
  });

  app.post("/api/auth/pdks-device/bootstrap/personnel", async (c) => {
    const device = await resolveDevice(c);
    if (!device) return fail(c, 401, "PDKS_DEVICE_UNAUTHORIZED", "PDKS cihaz yetkisi geçersiz.");
    const body = await bodyOf(c);
    const allRecords = Array.isArray(body.records) ? body.records as Row[] : [];
    if (!allRecords.length) return fail(c, 400, "PDKS_PERSONNEL_REQUIRED", "Personel snapshot boş olamaz.");
    if (allRecords.length > 500) return fail(c, 400, "PDKS_PERSONNEL_LIMIT", "Personel snapshot sınırı 500 kayıttır.");

    // Desktop KIMLIK havuzu PDKS'nin canonical tarihsel personel havuzudur.
    // Açıkça SGK=YOK gelen kayıt emniyet için alınmaz; İK Aylık kayıtları snapshot'a eklenmez.
    // Mevcut İK kayıtları asla silinmez/arşivlenmez ve eşleşen kartın İK alanları ezilmez.
    const records = allRecords.filter((row) => upper(row.sgkStatus || "VAR") !== "YOK");
    const company = text(device.main_company_id);
    const current = (await c.env.DB.prepare(`SELECT e.id,e.code,e.full_name,e.status,e.sgk_status,
      s.card_no,s.personel_kodu,s.active_passive FROM hr_monthly_employees e
      LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
      WHERE e.main_company_id=?`).bind(company).all<Row>()).results || [];
    const normalizeName = (value: unknown) => text(value).replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
    const byPdksCode = new Map<string, Row>();
    const byHrCode = new Map<string, Row>();
    const byName = new Map<string, Row[]>();
    for (const row of current) {
      const pdksCode = text(row.personel_kodu) || text(row.card_no);
      if (pdksCode) byPdksCode.set(pdksCode, row);
      if (text(row.code)) byHrCode.set(text(row.code), row);
      const key = normalizeName(row.full_name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(row);
    }

    const used = new Set<string>();
    const stamp = nowIso();
    let created = 0;
    let updated = 0;
    let reused = 0;
    let skippedNonSgk = allRecords.length - records.length;
    let skippedInvalid = 0;

    for (const source of records) {
      const code = text(source.code || source.cardNo);
      const fullName = text(source.fullName).replace(/\s+/g, " ").trim();
      if (!/^\d{5}$/.test(code) || !fullName) {
        skippedInvalid++;
        continue;
      }

      let row = byPdksCode.get(code);
      let matchKind = row ? "PDKS" : "";
      if (!row) {
        row = byHrCode.get(code);
        if (row) matchKind = "CODE";
      }
      if (!row) {
        const candidates = (byName.get(normalizeName(fullName)) || [])
          .filter((candidate) => !used.has(text(candidate.id)) && upper(candidate.sgk_status || "VAR") !== "YOK");
        if (candidates.length === 1) {
          row = candidates[0];
          matchKind = "NAME";
          reused++;
        }
      }

      const id = text(row?.id) || crypto.randomUUID();
      const exists = Boolean(row);
      const status = text(source.exitDate) ? "Pasif" : "Aktif";

      if (!exists) {
        await c.env.DB.prepare(`INSERT INTO hr_monthly_employees
          (id,main_company_id,code,full_name,department,title,work_type,sgk_status,status,hire_date,salary,road_allowance,bank_payment_type,bank_amount,cash_amount,overtime_hourly_base,annual_leave_entitlement,annual_leave_carryover,note,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, company, code, fullName, text(source.department) || null, text(source.title) || null, "Aylık", "VAR", status,
            text(source.startDate) || null, Number(source.salary || 0), 0, null, 0, 0, 225, 14, 0, "PDKS Desktop canonical", stamp, stamp).run();
        created++;
      } else {
        // PDKS/Card eşleşmesi açık ise SGK kapsamı canonical PDKS tarafına göre VAR olur.
        // İsimle yeniden kullanılan İK kaydının diğer ana alanları korunur.
        if (matchKind === "PDKS" || matchKind === "CODE") {
          await c.env.DB.prepare("UPDATE hr_monthly_employees SET sgk_status='VAR',updated_at=? WHERE id=? AND main_company_id=?")
            .bind(stamp, id, company).run();
        }
        updated++;
      }

      await c.env.DB.prepare(`INSERT INTO ik_person_card_settings(employee_id,main_company_id,card_no,exit_date,active_passive,sgk_follow,personel_kodu,updated_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET
        card_no=excluded.card_no,exit_date=excluded.exit_date,active_passive=excluded.active_passive,
        sgk_follow=1,personel_kodu=excluded.personel_kodu,updated_at=excluded.updated_at`)
        .bind(id, company, code, text(source.exitDate) || null, status, 1, code, stamp).run();
      used.add(id);
    }

    return ok(c, {
      received: allRecords.length,
      acceptedSgk: records.length,
      skippedNonSgk,
      skippedInvalid,
      created,
      updated,
      reused,
      archived: 0,
      nonDestructive: true,
      pdksCanonical: true,
      updatedAt: stamp,
    });
  });

  app.get("/api/auth/pdks-device/sync-events/pull", async (c) => {
    const device = await resolveDevice(c);
    if (!device) return fail(c, 401, "PDKS_DEVICE_UNAUTHORIZED", "PDKS cihaz yetkisi geçersiz.");
    const cursor = text(c.req.query("cursor"));
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") || 100)));
    const result = cursor
      ? await c.env.DB.prepare(`SELECT id,idempotency_key AS idempotencyKey,entity_type AS entityType,entity_id AS entityId,operation,source,payload_json AS payloadJson,occurred_at AS occurredAt,received_at AS receivedAt FROM ik_pdks_sync_events WHERE main_company_id=? AND source IN ('WEB','TABLET') AND (received_at>? OR (received_at=? AND id>?)) ORDER BY received_at,id LIMIT ?`).bind(text(device.main_company_id), cursor.split("|")[0] || cursor, cursor.split("|")[0] || cursor, cursor.split("|")[1] || "", limit).all<Row>()
      : await c.env.DB.prepare(`SELECT id,idempotency_key AS idempotencyKey,entity_type AS entityType,entity_id AS entityId,operation,source,payload_json AS payloadJson,occurred_at AS occurredAt,received_at AS receivedAt FROM ik_pdks_sync_events WHERE main_company_id=? AND source IN ('WEB','TABLET') ORDER BY received_at,id LIMIT ?`).bind(text(device.main_company_id), limit).all<Row>();
    const rows = result.results || [];
    const last = rows.length ? rows[rows.length - 1] : null;
    return ok(c, { changes: rows, cursor: last ? `${text(last.receivedAt)}|${text(last.id)}` : cursor });
  });

  app.post("/api/auth/pdks-device/sync-events/push", async (c) => {
    const device = await resolveDevice(c);
    if (!device) return fail(c, 401, "PDKS_DEVICE_UNAUTHORIZED", "PDKS cihaz yetkisi geçersiz.");
    const body = await bodyOf(c);
    const id = text(body.id) || crypto.randomUUID();
    const idempotencyKey = text(body.idempotencyKey || c.req.header("Idempotency-Key"));
    const entityType = upper(body.entityType);
    const operation = upper(body.operation);
    if (!idempotencyKey || !entityType || !operation) return fail(c, 400, "PDKS_SYNC_EVENT_INVALID", "Senkron olayı alanları eksik.");
    const receivedAt = nowIso();
    await c.env.DB.prepare(`INSERT OR IGNORE INTO ik_pdks_sync_events
      (id,idempotency_key,main_company_id,device_id,entity_type,entity_id,operation,source,payload_json,occurred_at,received_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id, idempotencyKey, text(device.main_company_id), text(device.id), entityType, text(body.entityId), operation, "DESKTOP", typeof body.payloadJson === "string" ? body.payloadJson : JSON.stringify(body.payloadJson || {}), text(body.occurredAtUtc) || receivedAt, receivedAt).run();
    return ok(c, { accepted: true, id, receivedAt }, 202);
  });
}
