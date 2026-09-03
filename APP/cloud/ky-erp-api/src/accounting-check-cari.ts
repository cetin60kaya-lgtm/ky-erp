import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100;
const nowIso = () => new Date().toISOString();

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      body.mainCompanyId ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      c.req.header("X-KYERP-Tenant-Slug") ||
      "mecit-hakan",
  );
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const payload = await c.req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Row : {};
  } catch {
    return {};
  }
}

function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, success: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}

async function tableExists(c: Context<AppEnv>, table: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  ).bind(table).first<Row>();
  return Boolean(row?.name);
}

async function tableColumns(c: Context<AppEnv>, table: string) {
  if (!(await tableExists(c, table))) return new Set<string>();
  const result = await c.env.DB.prepare(`PRAGMA table_info(\"${table.replace(/\"/g, "\"\"")}\")`).all<Row>();
  return new Set((result.results || []).map((row) => text(row.name)));
}

function jsonObject(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Row : {};
  } catch {
    return {};
  }
}

function checkMeta(note: unknown) {
  const value = text(note);
  const prefix = "KYERP_CHECK_META:";
  if (!value.startsWith(prefix)) return {} as Row;
  return jsonObject(value.slice(prefix.length));
}

async function findCheck(c: Context<AppEnv>, slug: string, checkId: string) {
  if (await tableExists(c, "payment_control_records")) {
    const cols = await tableColumns(c, "payment_control_records");
    let tenantClause = "";
    const tenantBindings: string[] = [];
    if (cols.has("main_company_slug") && cols.has("main_company_id")) {
      tenantClause = "AND (main_company_slug=? OR main_company_id=?)";
      tenantBindings.push(slug, slug);
    } else if (cols.has("main_company_slug")) {
      tenantClause = "AND main_company_slug=?";
      tenantBindings.push(slug);
    } else if (cols.has("main_company_id")) {
      tenantClause = "AND main_company_id=?";
      tenantBindings.push(slug);
    }
    const row = await c.env.DB.prepare(
      `SELECT * FROM payment_control_records WHERE id=? ${tenantClause} LIMIT 1`,
    ).bind(checkId, ...tenantBindings).first<Row>();
    if (row) {
      const meta = { ...checkMeta(row.note), ...jsonObject(row.raw) };
      return {
        table: "payment_control_records",
        row,
        companyId: text(row.firm_id || row.company_id),
        amount: money(row.amount),
        workType: upper(row.work_type || row.official_type) || "OFFICIAL",
        direction: upper(meta.checkDirection || meta.check_direction),
        checkNo: text(row.check_no),
        bankName: text(row.bank_name),
      };
    }
  }

  if (await tableExists(c, "checks")) {
    const cols = await tableColumns(c, "checks");
    const tenantClause = cols.has("main_company_slug") ? "AND main_company_slug=?" : "";
    const row = await c.env.DB.prepare(
      `SELECT * FROM checks WHERE id=? ${tenantClause} LIMIT 1`,
    ).bind(checkId, ...(tenantClause ? [slug] : [])).first<Row>();
    if (row) {
      const meta = { ...checkMeta(row.note), ...jsonObject(row.raw) };
      return {
        table: "checks",
        row,
        companyId: text(row.company_id || row.firm_id),
        amount: money(row.amount),
        workType: upper(row.work_type || row.official_type) || "OFFICIAL",
        direction: upper(meta.checkDirection || meta.check_direction),
        checkNo: text(row.check_no),
        bankName: text(row.bank_name),
      };
    }
  }
  return null;
}

async function insertDynamic(c: Context<AppEnv>, table: string, data: Row) {
  const columns = await tableColumns(c, table);
  const entries = Object.entries(data).filter(([key, value]) => columns.has(key) && value !== undefined);
  if (!entries.length) return;
  const sql = `INSERT INTO ${table} (${entries.map(([key]) => `\"${key}\"`).join(",")}) VALUES (${entries.map(() => "?").join(",")})`;
  await c.env.DB.prepare(sql).bind(...entries.map(([, value]) => {
    if (value === null || value === undefined) return null;
    return typeof value === "object" ? JSON.stringify(value) : value;
  })).run();
}

async function updateDynamic(c: Context<AppEnv>, table: string, id: string, slug: string, data: Row) {
  const columns = await tableColumns(c, table);
  const entries = Object.entries(data).filter(([key, value]) => columns.has(key) && value !== undefined);
  if (!entries.length) return;
  let tenantClause = "";
  const tenantBindings: string[] = [];
  if (columns.has("main_company_slug") && columns.has("main_company_id")) {
    tenantClause = " AND (main_company_slug=? OR main_company_id=?)";
    tenantBindings.push(slug, slug);
  } else if (columns.has("main_company_slug")) {
    tenantClause = " AND main_company_slug=?";
    tenantBindings.push(slug);
  } else if (columns.has("main_company_id")) {
    tenantClause = " AND main_company_id=?";
    tenantBindings.push(slug);
  }
  const sql = `UPDATE ${table} SET ${entries.map(([key]) => `\"${key}\"=?`).join(",")} WHERE id=?${tenantClause}`;
  await c.env.DB.prepare(sql).bind(
    ...entries.map(([, value]) => value === null || value === undefined ? null : typeof value === "object" ? JSON.stringify(value) : value),
    id,
    ...tenantBindings,
  ).run();
}

async function balanceOf(c: Context<AppEnv>, slug: string, companyId: string) {
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(COALESCE(effect,0)),0) AS balance
       FROM current_account_movements
      WHERE main_company_slug=? AND company_id=?`,
  ).bind(slug, companyId).first<Row>();
  return money(row?.balance);
}

async function settlementOf(c: Context<AppEnv>, slug: string, checkId: string) {
  if (!(await tableExists(c, "accounting_check_settlements"))) return null;
  return c.env.DB.prepare(
    `SELECT * FROM accounting_check_settlements
      WHERE main_company_slug=? AND check_id=? LIMIT 1`,
  ).bind(slug, checkId).first<Row>();
}

async function ensureSettlement(c: Context<AppEnv>, input: {
  slug: string;
  checkId: string;
  companyId: string;
  direction: string;
  amount: number;
  workType: string;
  note: string;
  actor: string;
}) {
  const existing = await settlementOf(c, input.slug, input.checkId);
  if (existing) return existing;
  const timestamp = nowIso();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO accounting_check_settlements(
       id,main_company_slug,check_id,company_id,check_direction,check_amount,work_type,
       cari_apply_stage,cari_movement_id,settlement_date,status,note,created_by,created_at,updated_at
     ) VALUES(?,?,?,?,?,?,?,'NONE',NULL,NULL,'OPEN',?,?,?,?)`,
  ).bind(
    id,
    input.slug,
    input.checkId,
    input.companyId,
    input.direction,
    input.amount,
    input.workType,
    input.note || null,
    input.actor || null,
    timestamp,
    timestamp,
  ).run();
  return settlementOf(c, input.slug, input.checkId);
}

async function applyCari(c: Context<AppEnv>, input: {
  slug: string;
  checkId: string;
  companyId: string;
  amount: number;
  direction: string;
  stage: string;
  workType: string;
  checkNo: string;
  bankName: string;
  actor: string;
  note: string;
  movementDate: string;
}) {
  const company = await c.env.DB.prepare(
    `SELECT * FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1`,
  ).bind(input.companyId, input.slug).first<Row>();
  if (!company) throw Object.assign(new Error("Firma kartı bulunamadı."), { code: "COMPANY_NOT_FOUND" });

  const direction = input.direction === "RECEIVED" ? "RECEIVED" : "GIVEN";
  if (direction === "RECEIVED" && Number(company.customer_receivable_tracking || 0) !== 1) {
    throw Object.assign(new Error("Bu firmada müşteri alacağı cari takibi açık değil."), { code: "RECEIVABLE_TRACKING_DISABLED" });
  }
  if (direction === "GIVEN" && Number(company.supplier_debt_tracking || 0) !== 1) {
    throw Object.assign(new Error("Bu firmada tedarikçi borcu cari takibi açık değil."), { code: "PAYABLE_TRACKING_DISABLED" });
  }

  const currentSettlement = await settlementOf(c, input.slug, input.checkId);
  if (text(currentSettlement?.cari_movement_id)) {
    return { movementId: text(currentSettlement?.cari_movement_id), balanceAfter: await balanceOf(c, input.slug, input.companyId), idempotent: true };
  }

  const transactionType = direction === "RECEIVED" ? "COLLECTION" : "PAYMENT";
  const movementType = direction === "RECEIVED" ? "TAHSILAT" : "ODEME";
  const effect = direction === "RECEIVED" ? -Math.abs(input.amount) : Math.abs(input.amount);
  const previousBalance = await balanceOf(c, input.slug, input.companyId);
  const movementId = crypto.randomUUID();
  const timestamp = nowIso();
  const balanceAfter = money(previousBalance + effect);
  const recordType = upper(input.workType) === "OFFICIAL" ? "RESMI" : "GAYRI_RESMI";
  const description = `Çek ${input.stage === "ENTRY" ? "girişi" : "mahsup"}: ${input.checkNo || input.checkId}${input.bankName ? ` / ${input.bankName}` : ""}`;
  const movementDate = /^\d{4}-\d{2}-\d{2}$/.test(input.movementDate) ? input.movementDate : timestamp.slice(0, 10);

  await insertDynamic(c, "current_account_movements", {
    id: movementId,
    main_company_slug: input.slug,
    company_id: input.companyId,
    movement_date: movementDate,
    movement_type: movementType,
    source_type: "CHECK",
    document_no: input.checkNo || input.checkId,
    description,
    debit: transactionType === "PAYMENT" ? input.amount : 0,
    credit: transactionType === "COLLECTION" ? input.amount : 0,
    amount: input.amount,
    effect,
    balance_after: balanceAfter,
    record_type: recordType,
    payment_method: "CHECK",
    raw: {
      transactionType,
      recordType,
      recordScope: recordType === "RESMI" ? "OFFICIAL" : "INTERNAL",
      paymentMethod: "CHECK",
      checkId: input.checkId,
      applyStage: input.stage,
      actor: input.actor || "USER",
    },
    created_at: timestamp,
    updated_at: timestamp,
  });

  const finalBalance = await balanceOf(c, input.slug, input.companyId);
  await c.env.DB.prepare(
    `UPDATE companies SET current_balance=?,updated_at=? WHERE id=? AND main_company_slug=?`,
  ).bind(finalBalance, timestamp, input.companyId, input.slug).run();
  await c.env.DB.prepare(
    `UPDATE accounting_check_settlements
        SET cari_apply_stage=?,cari_movement_id=?,updated_at=?
      WHERE main_company_slug=? AND check_id=?`,
  ).bind(input.stage, movementId, timestamp, input.slug, input.checkId).run();

  return { movementId, balanceAfter: finalBalance, idempotent: false };
}

export function registerAccountingCheckCariRoutes(app: Hono<AppEnv>) {
  app.post("/api/muhasebe/hizli-cari/cek/:checkId/mahsup", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const checkId = text(c.req.param("checkId"));
    const check = await findCheck(c, slug, checkId);
    if (!check) return c.json(errorBody("CHECK_NOT_FOUND", "Çek kaydı bulunamadı."), 404);

    const direction = upper(body.checkDirection || check.direction);
    if (!["RECEIVED", "GIVEN"].includes(direction)) {
      return c.json(errorBody("CHECK_DIRECTION_REQUIRED", "Çekin alınan mı verilen mi olduğu belirtilmelidir."), 400);
    }
    const companyId = text(body.companyId || check.companyId);
    if (!companyId) return c.json(errorBody("COMPANY_REQUIRED", "Çek için firma bağlantısı bulunamadı."), 400);
    const amount = money(body.amount || check.amount);
    if (!(amount > 0)) return c.json(errorBody("AMOUNT_REQUIRED", "Çek tutarı sıfırdan büyük olmalıdır."), 400);
    const stage = upper(body.stage || "ENTRY") === "SETTLEMENT" ? "SETTLEMENT" : "ENTRY";
    const workType = upper(body.workType || check.workType) || "OFFICIAL";
    const actor = text(body.actor || body.createdBy || "USER");
    const note = text(body.note);
    const movementDate = text(body.date || body.movementDate || body.issueDate) || nowIso().slice(0, 10);

    await ensureSettlement(c, { slug, checkId, companyId, direction, amount, workType, note, actor });
    try {
      const posting = await applyCari(c, {
        slug,
        checkId,
        companyId,
        amount,
        direction,
        stage,
        workType,
        checkNo: check.checkNo,
        bankName: check.bankName,
        actor,
        note,
        movementDate,
      });
      if (stage === "SETTLEMENT") {
        const timestamp = nowIso();
        await c.env.DB.prepare(
          `UPDATE accounting_check_settlements
              SET status='SETTLED',settlement_date=?,updated_at=?
            WHERE main_company_slug=? AND check_id=?`,
        ).bind(timestamp.slice(0, 10), timestamp, slug, checkId).run();
        await updateDynamic(c, check.table, checkId, slug, { status: "PAID", updated_at: timestamp });
      }
      return c.json({ ok: true, success: true, data: { checkId, companyId, direction, amount, stage, ...posting } });
    } catch (error: any) {
      return c.json(errorBody(error?.code || "CHECK_CARI_FAILED", error?.message || "Çek cari mahsup işlemi yapılamadı."), 409);
    }
  });

  app.post("/api/muhasebe/hizli-cari/cek/:checkId/kapat", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const checkId = text(c.req.param("checkId"));
    const check = await findCheck(c, slug, checkId);
    if (!check) return c.json(errorBody("CHECK_NOT_FOUND", "Çek kaydı bulunamadı."), 404);

    const direction = upper(body.checkDirection || check.direction);
    if (!["RECEIVED", "GIVEN"].includes(direction)) {
      return c.json(errorBody("CHECK_DIRECTION_REQUIRED", "Çekin alınan mı verilen mi olduğu belirtilmelidir."), 400);
    }
    const companyId = text(body.companyId || check.companyId);
    if (!companyId) return c.json(errorBody("COMPANY_REQUIRED", "Çek için firma bağlantısı bulunamadı."), 400);
    const amount = money(body.amount || check.amount);
    if (!(amount > 0)) return c.json(errorBody("AMOUNT_REQUIRED", "Çek tutarı sıfırdan büyük olmalıdır."), 400);
    const workType = upper(body.workType || check.workType) || "OFFICIAL";
    const actor = text(body.actor || body.createdBy || "USER");
    const movementDate = text(body.date || body.movementDate) || nowIso().slice(0, 10);
    await ensureSettlement(c, { slug, checkId, companyId, direction, amount, workType, note: text(body.note), actor });

    const existing = await settlementOf(c, slug, checkId);
    const timestamp = nowIso();
    if (text(existing?.cari_movement_id)) {
      await c.env.DB.prepare(
        `UPDATE accounting_check_settlements
            SET status='SETTLED',settlement_date=?,updated_at=?
          WHERE main_company_slug=? AND check_id=?`,
      ).bind(timestamp.slice(0, 10), timestamp, slug, checkId).run();
      await updateDynamic(c, check.table, checkId, slug, { status: "PAID", updated_at: timestamp });
      return c.json({ ok: true, success: true, data: { checkId, companyId, idempotent: true, cariMovementId: text(existing.cari_movement_id) } });
    }

    try {
      const posting = await applyCari(c, {
        slug,
        checkId,
        companyId,
        amount,
        direction,
        stage: "SETTLEMENT",
        workType,
        checkNo: check.checkNo,
        bankName: check.bankName,
        actor,
        note: text(body.note),
        movementDate,
      });
      await c.env.DB.prepare(
        `UPDATE accounting_check_settlements
            SET status='SETTLED',settlement_date=?,updated_at=?
          WHERE main_company_slug=? AND check_id=?`,
      ).bind(timestamp.slice(0, 10), timestamp, slug, checkId).run();
      await updateDynamic(c, check.table, checkId, slug, { status: "PAID", updated_at: timestamp });
      return c.json({ ok: true, success: true, data: { checkId, companyId, ...posting } });
    } catch (error: any) {
      return c.json(errorBody(error?.code || "CHECK_CLOSE_FAILED", error?.message || "Çek kapatılamadı."), 409);
    }
  });
}
