// @ts-nocheck
import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const nowIso = () => new Date().toISOString();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");

function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Row)
      : {};
  } catch {
    return {};
  }
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
    const payload = await c.req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Row)
      : {};
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

async function tableExists(c: Context<AppEnv>, table: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  )
    .bind(table)
    .first<Row>();
  return Boolean(row?.name);
}

async function storeList(c: Context<AppEnv>, scope: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return [];
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  )
    .bind(scope, slug)
    .all<Row>();
  return (result.results || []).map((row) => ({
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  }));
}

async function storeGet(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  slug: string,
) {
  if (!(await tableExists(c, "json_store"))) return null;
  const row = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(scope, fileName, slug)
    .first<Row>();
  if (!row) return null;
  return {
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  };
}

async function storePut(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  data: Row,
  slug: string,
) {
  const existing = await storeGet(c, scope, fileName, slug);
  const timestamp = nowIso();
  const payload = { ...data, id: text(data.id || fileName), updatedAt: timestamp };
  if (existing?.storeId) {
    await c.env.DB.prepare(
      "UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?",
    )
      .bind(JSON.stringify(payload), timestamp, existing.storeId)
      .run();
    return { ...payload, storeId: existing.storeId, fileName };
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, scope, slug || null, fileName, JSON.stringify(payload), timestamp, timestamp)
    .run();
  return { ...payload, storeId: id, fileName };
}

async function storeDelete(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  slug: string,
) {
  if (!(await tableExists(c, "json_store"))) return;
  await c.env.DB.prepare(
    `DELETE FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)`,
  )
    .bind(scope, fileName, slug)
    .run();
}

function periodOf(c: Context<AppEnv>, body: Row = {}) {
  const year = text(body.year || c.req.query("year"));
  const month = text(body.month || c.req.query("month"));
  const date = text(body.date || c.req.query("date"));
  return { year, month, date };
}

function matchesPeriod(row: Row, period: Row) {
  if (period.year && text(row.year) && text(row.year) !== period.year) return false;
  if (period.month && text(row.month) && text(row.month) !== period.month) return false;
  if (period.date && text(row.date) && text(row.date).slice(0, 10) !== period.date.slice(0, 10)) {
    return false;
  }
  return true;
}

function ikScope(pathname: string) {
  const path = pathname.toLowerCase();
  if (/resmi[-_/]?tatil|official[-_/]?holiday/.test(path)) return "IK_OFFICIAL_HOLIDAY";
  if (/skill|beceri|yetenek/.test(path)) return "IK_SKILL";
  if (/sozlesme|contract/.test(path)) return "IK_MONTHLY_CONTRACT";
  if (/evrak|document/.test(path)) return "IK_MONTHLY_DOCUMENT";
  if (/izin|leave/.test(path)) return "IK_MONTHLY_LEAVE";
  if (/mesai|avans|kesinti|adjustment|overtime/.test(path)) return "IK_MONTHLY_ADJUSTMENT";
  if (/gun[-_/]?kayit|daily[-_/]?record|gunluk[-_/]?durum/.test(path)) return "IK_DAILY_RECORD";
  if (/gunluk[-_/]?personel[-_/]?liste|daily[-_/]?personnel[-_/]?list/.test(path)) {
    return "IK_DAILY_PERSONNEL_LIST";
  }
  if (/gunluk|daily/.test(path)) return "IK_DAILY_PERSONNEL";
  if (/log/.test(path)) return "IK_LOG";
  if (/bordro|payroll/.test(path)) return "IK_PAYROLL";
  return "IK_MONTHLY_PERSONNEL";
}

function actionTail(pathname: string) {
  return pathname.split("/").filter(Boolean).at(-1) || "";
}

function likelyRecordId(pathname: string) {
  const tail = actionTail(pathname);
  if (
    !tail ||
    /^(ik|personel|aylik|gunluk|liste|durum|mesai|avans|kesinti|izin|evrak|sozlesme|loglar|skills|resmi-tatiller|upload|apply|excel|export)$/i.test(
      tail,
    )
  ) {
    return "";
  }
  return decodeURIComponent(tail);
}

async function handleIkGet(c: Context<AppEnv>) {
  const slug = slugOf(c);
  const scope = ikScope(c.req.path);
  const id = likelyRecordId(c.req.path);
  if (id) {
    const row = await storeGet(c, scope, id, slug);
    if (!row) return c.json(errorBody("NOT_FOUND", "İK kaydı bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: row });
  }
  const period = periodOf(c);
  const rows = (await storeList(c, scope, slug)).filter((row) => matchesPeriod(row, period));
  return c.json({ ok: true, success: true, data: rows, items: rows });
}

async function handleIkWrite(c: Context<AppEnv>) {
  const slug = slugOf(c);
  const scope = ikScope(c.req.path);
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.parseBody({ all: true });
    const values = Object.values(form).flatMap((value) =>
      Array.isArray(value) ? value : [value],
    );
    const files = values.filter((value) => value instanceof File) as File[];
    if (!files.length) {
      return c.json(errorBody("FILE_REQUIRED", "Yüklenecek İK dosyası bulunamadı."), 400);
    }
    const uploaded: Row[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const key = `ik/uploads/${slug}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      await c.env.FILES.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });
      uploaded.push({ id, fileName: file.name, storageKey: key, size: file.size });
    }
    const uploadId = crypto.randomUUID();
    await storePut(
      c,
      "IK_UPLOAD",
      uploadId,
      { id: uploadId, scope, files: uploaded, createdAt: nowIso() },
      slug,
    );
    return c.json({
      ok: true,
      success: true,
      data: {
        uploadId,
        uploadedCount: uploaded.length,
        files: uploaded,
        parsedRows: [],
        requiresReview: true,
        message:
          "Dosya güvenli R2 alanına yüklendi. Satırlar uygulamada önizlenip onaylandıktan sonra kayıt edilir.",
      },
    }, 201);
  }

  const body = await bodyOf(c);
  const period = periodOf(c, body);
  const bulkRows = Array.isArray(body.rows)
    ? body.rows
    : Array.isArray(body.items)
      ? body.items
      : [];
  if (/apply|toplu|bulk/.test(c.req.path.toLowerCase()) && bulkRows.length) {
    const saved: Row[] = [];
    for (const source of bulkRows) {
      const id = text(source.id || crypto.randomUUID());
      saved.push(
        await storePut(
          c,
          scope,
          id,
          { ...source, ...period, id, source: source.source || "BULK_IMPORT" },
          slug,
        ),
      );
    }
    return c.json({
      ok: true,
      success: true,
      data: { savedCount: saved.length, rows: saved },
    });
  }

  const pathId = likelyRecordId(c.req.path);
  const id = text(pathId || body.id || crypto.randomUUID());
  const current = pathId ? await storeGet(c, scope, pathId, slug) : null;
  const row = await storePut(
    c,
    scope,
    id,
    {
      ...current,
      ...body,
      ...period,
      id,
      createdAt: current?.createdAt || body.createdAt || nowIso(),
    },
    slug,
  );
  await storePut(
    c,
    "IK_LOG",
    crypto.randomUUID(),
    {
      id: crypto.randomUUID(),
      entityId: id,
      entityScope: scope,
      action: current ? "UPDATED" : "CREATED",
      description: current ? "İK kaydı güncellendi." : "İK kaydı oluşturuldu.",
      createdAt: nowIso(),
    },
    slug,
  );
  return c.json({ ok: true, success: true, data: row }, current ? 200 : 201);
}

async function handleIkDelete(c: Context<AppEnv>) {
  const slug = slugOf(c);
  const scope = ikScope(c.req.path);
  const id = likelyRecordId(c.req.path);
  if (!id) return c.json(errorBody("ID_REQUIRED", "Silinecek İK kaydı seçilmedi."), 400);
  const current = await storeGet(c, scope, id, slug);
  if (!current) return c.json(errorBody("NOT_FOUND", "İK kaydı bulunamadı."), 404);
  await storeDelete(c, scope, id, slug);
  return c.json({ ok: true, success: true, data: { id, deleted: true } });
}

async function companyRows(c: Context<AppEnv>) {
  if (!(await tableExists(c, "companies"))) return [];
  const result = await c.env.DB.prepare(
    "SELECT * FROM companies ORDER BY COALESCE(name, company_name) ASC LIMIT 5000",
  ).all<Row>();
  return result.results || [];
}

async function handleAdminMainCompanies(c: Context<AppEnv>) {
  const method = c.req.method;
  if (method === "GET") {
    const rows = (await companyRows(c))
      .filter((row) => /MAIN|ANA/.test(upper(row.company_type || row.type)) || row.is_main_company === 1)
      .map((row) => ({
        id: text(row.id),
        name: text(row.name || row.company_name),
        slug: text(row.slug || row.main_company_slug),
        note: text(row.note),
        isActive: row.is_active !== 0 && row.isActive !== false,
        updatedAt: row.updated_at,
      }));
    const fallbackSlugs = [
      ...new Set((await companyRows(c)).map((row) => text(row.main_company_slug)).filter(Boolean)),
    ];
    if (!rows.length) {
      rows.push(
        ...fallbackSlugs.map((slug) => ({
          id: slug,
          name: slug === "mecit-hakan" ? "Mecit Hakan" : slug,
          slug,
          isActive: true,
        })),
      );
    }
    return c.json({ ok: true, success: true, data: rows, items: rows });
  }
  const body = await bodyOf(c);
  const slug = text(body.slug || body.mainCompanySlug);
  if (!text(body.name) || !slug) {
    return c.json(errorBody("FIELDS_REQUIRED", "Ana firma adı ve slug zorunludur."), 400);
  }
  const id = text(body.id || crypto.randomUUID());
  const row = await storePut(
    c,
    "ADMIN_MAIN_COMPANY",
    id,
    { ...body, id, slug, isActive: body.isActive !== false, createdAt: nowIso() },
    slug,
  );
  return c.json({ ok: true, success: true, data: row }, 201);
}

function adminScope(pathname: string) {
  const path = pathname.toLowerCase();
  if (/company-alias|firma-esle/.test(path)) return "ADMIN_COMPANY_ALIAS";
  if (/product-alias|urun-esle/.test(path)) return "ADMIN_PRODUCT_ALIAS";
  if (/email|eposta/.test(path)) return "ADMIN_EMAIL_CONTACT";
  if (/kdv/.test(path)) return "ADMIN_VAT_LINK";
  if (/backup|yedek/.test(path)) return "ADMIN_BACKUP_STATE";
  if (/log/.test(path)) return "ADMIN_LOG";
  if (/user|kullanici/.test(path)) return "ADMIN_USER";
  if (/folder|klasor|dosya/.test(path)) return "ADMIN_FILE_SETTING";
  return "ADMIN_SETTING";
}

async function handleAdminGeneric(c: Context<AppEnv>) {
  const method = c.req.method;
  const body = method === "GET" || method === "DELETE" ? {} : await bodyOf(c);
  const slug = slugOf(c, body);
  const scope = adminScope(c.req.path);
  const id = likelyRecordId(c.req.path);
  if (method === "GET") {
    if (id) {
      const row = await storeGet(c, scope, id, slug);
      if (!row) return c.json(errorBody("NOT_FOUND", "Yönetim kaydı bulunamadı."), 404);
      return c.json({ ok: true, success: true, data: row });
    }
    const rows = await storeList(c, scope, slug);
    return c.json({ ok: true, success: true, data: rows, items: rows });
  }
  if (method === "DELETE") {
    if (!id) return c.json(errorBody("ID_REQUIRED", "Silinecek kayıt seçilmedi."), 400);
    await storeDelete(c, scope, id, slug);
    return c.json({ ok: true, success: true, data: { id, deleted: true } });
  }
  const recordId = text(id || body.id || crypto.randomUUID());
  const current = id ? await storeGet(c, scope, id, slug) : null;
  const row = await storePut(
    c,
    scope,
    recordId,
    { ...current, ...body, id: recordId, createdAt: current?.createdAt || nowIso() },
    slug,
  );
  return c.json({ ok: true, success: true, data: row }, current ? 200 : 201);
}

export function registerIkAdminCloudRoutes(app: Hono<AppEnv>) {
  app.all("/api/ik/*", async (c) => {
    if (c.req.method === "GET") return handleIkGet(c);
    if (c.req.method === "DELETE") return handleIkDelete(c);
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) return handleIkWrite(c);
    return c.json(errorBody("METHOD_NOT_ALLOWED", "İK işlemi desteklenmiyor."), 405);
  });

  app.all("/api/admin/main-companies", handleAdminMainCompanies);
  app.all("/api/admin/main-companies/:id", async (c) => {
    if (c.req.method === "GET") return handleAdminMainCompanies(c);
    return handleAdminGeneric(c);
  });
  app.all("/api/admin/*", handleAdminGeneric);
}
