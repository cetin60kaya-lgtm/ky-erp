// @ts-nocheck
import type { Context, Hono } from "hono";
import { registerAccountingDocumentCoreRoutes } from "./accounting-document-core";
import { registerAccountingOperationRoutes } from "./accounting-operations";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const SCOPE = "ISNET_INTAKE";
const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nowIso = () => new Date().toISOString();
const normalize = (value: unknown) =>
  text(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row;
  }
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

async function columns(c: Context<AppEnv>, table: string) {
  if (!(await tableExists(c, table))) return new Set<string>();
  const result = await c.env.DB.prepare(`PRAGMA table_info("${table}")`).all<Row>();
  return new Set((result.results || []).map((row) => text(row.name)));
}

async function existingIntake(
  c: Context<AppEnv>,
  documentId: string,
  slug: string,
) {
  if (!(await tableExists(c, "json_store"))) return null;
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ? AND main_company_slug = ?
      ORDER BY updated_at DESC, id DESC`,
  )
    .bind(SCOPE, slug)
    .all<Row>();
  for (const row of result.results || []) {
    const payload = objectOf(row.data);
    if (text(payload.documentId) !== documentId) continue;
    return {
      ...payload,
      id: text(payload.id || row.file_name),
      fileName: text(row.file_name),
      storeId: text(row.id),
    };
  }
  return null;
}

async function saveIntake(
  c: Context<AppEnv>,
  intakeId: string,
  payload: Row,
  slug: string,
) {
  const timestamp = nowIso();
  const existing = await c.env.DB.prepare(
    `SELECT id FROM json_store
      WHERE scope = ? AND main_company_slug = ? AND file_name = ?
      LIMIT 1`,
  )
    .bind(SCOPE, slug, intakeId)
    .first<Row>();
  const data = {
    ...payload,
    id: intakeId,
    createdAt: payload.createdAt || timestamp,
    updatedAt: timestamp,
  };
  if (existing?.id) {
    await c.env.DB.prepare(
      "UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?",
    )
      .bind(JSON.stringify(data), timestamp, existing.id)
      .run();
    return { ...data, fileName: intakeId, storeId: text(existing.id) };
  }
  const storeId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      storeId,
      SCOPE,
      slug,
      intakeId,
      JSON.stringify(data),
      timestamp,
      timestamp,
    )
    .run();
  return { ...data, fileName: intakeId, storeId };
}

async function updateDocumentMetadata(
  c: Context<AppEnv>,
  documentId: string,
  slug: string,
  patch: Row,
) {
  const cols = await columns(c, "documents");
  if (!cols.has("metadata")) return;
  const row = await c.env.DB.prepare(
    `SELECT metadata, raw FROM documents
      WHERE id = ?${cols.has("main_company_slug") ? " AND main_company_slug = ?" : ""}
      LIMIT 1`,
  )
    .bind(...(cols.has("main_company_slug") ? [documentId, slug] : [documentId]))
    .first<Row>();
  if (!row) return;
  const metadata = { ...objectOf(row.raw), ...objectOf(row.metadata), ...patch };
  const values: unknown[] = [JSON.stringify(metadata)];
  const sets = ["metadata = ?"];
  if (cols.has("updated_at")) {
    sets.push("updated_at = ?");
    values.push(nowIso());
  }
  values.push(documentId);
  if (cols.has("main_company_slug")) values.push(slug);
  await c.env.DB.prepare(
    `UPDATE documents SET ${sets.join(", ")}
      WHERE id = ?${cols.has("main_company_slug") ? " AND main_company_slug = ?" : ""}`,
  )
    .bind(...values)
    .run();
}

export function registerIsnetIntakeCompatRoutes(app: Hono<AppEnv>) {
  // İşNet artık tek veri çekirdeği değildir. Manuel XML/PDF/görsel ve gelecekteki
  // diğer provider'lar da aynı canonical belge havuzuna düşer.
  registerAccountingDocumentCoreRoutes(app);
  registerAccountingOperationRoutes(app);

  app.post("/api/isnet/incoming-dispatches/:id/import", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const documentId = decodeURIComponent(c.req.param("id"));

    if (!(await tableExists(c, "documents"))) {
      return c.json(errorBody("DOCUMENT_TABLE_MISSING", "Belge tablosu bulunamadı."), 503);
    }

    const documentColumns = await columns(c, "documents");
    const document = await c.env.DB.prepare(
      `SELECT * FROM documents
        WHERE id = ?${documentColumns.has("main_company_slug") ? " AND main_company_slug = ?" : ""}
        LIMIT 1`,
    )
      .bind(...(documentColumns.has("main_company_slug") ? [documentId, slug] : [documentId]))
      .first<Row>();

    if (!document) {
      return c.json(errorBody("NOT_FOUND", "Gelen irsaliye bulunamadı."), 404);
    }

    const metadata = { ...objectOf(document.raw), ...objectOf(document.metadata) };
    const documentType = normalize(
      `${document.document_type} ${document.target_type} ${document.detected_type} ${metadata.documentKind}`,
    );
    if (!/IRSALIYE|DISPATCH|DESPATCH/.test(documentType)) {
      return c.json(errorBody("NOT_DISPATCH", "Seçilen belge irsaliye değil."), 409);
    }

    const current = await existingIntake(c, documentId, slug);
    if (current) {
      return c.json({
        ok: true,
        success: true,
        data: {
          message: `${text(document.document_no || documentId)} daha önce işleme alındı.`,
          intake: current,
          files: {
            pdf: Boolean(metadata.pdfKey || metadata.pdfR2Key || document.pdf_key),
            xml: Boolean(metadata.xmlKey || metadata.xmlR2Key || document.xml_key),
          },
        },
      });
    }

    const itemColumns = await columns(c, "invoice_items");
    const itemValues: unknown[] = [documentId];
    let itemWhere = "document_id = ?";
    if (itemColumns.has("main_company_slug")) {
      itemWhere += " AND main_company_slug = ?";
      itemValues.push(slug);
    }
    if (itemColumns.has("deleted_at")) itemWhere += " AND deleted_at IS NULL";
    const orderColumn = itemColumns.has("line_no") ? "line_no" : "id";
    const itemResult = await c.env.DB.prepare(
      `SELECT * FROM invoice_items WHERE ${itemWhere}
        ORDER BY ${orderColumn} ASC LIMIT 1000`,
    )
      .bind(...itemValues)
      .all<Row>();

    const lines = (itemResult.results || []).map((row, index) => {
      const raw = objectOf(row.raw);
      return {
        id: text(row.id || `${documentId}-${index + 1}`),
        lineNo: num(row.line_no || index + 1),
        rawName: text(row.product_name || row.description),
        description: text(row.description || row.product_name),
        productCode: text(row.product_code || row.code),
        quantity: num(row.quantity),
        unit: text(row.unit || "ADET"),
        orderNo: text(row.order_no || raw.orderNo),
        color: text(row.color || raw.color),
        region: text(row.region || row.print_area || raw.region),
        modelGuess: text(row.model_name || raw.modelName || metadata.modelName),
      };
    });

    const companyType = normalize(metadata.companyType || document.company_type);
    const modelApplicable = !/SUPPLIER|TEDARIKCI/.test(companyType);
    const intakeId = crypto.randomUUID();
    const intake = await saveIntake(
      c,
      intakeId,
      {
        documentId,
        documentNo: text(document.document_no || documentId),
        issuerName: text(
          document.company_name ||
            document.supplier_name ||
            document.customer_name ||
            metadata.companyName ||
            metadata.partnerName,
        ),
        companyId: text(document.company_id || metadata.companyId),
        modelGuess: text(metadata.modelName || lines[0]?.modelGuess),
        modelId: text(metadata.modelId),
        status: modelApplicable && !metadata.modelId
          ? "MODEL_WAITING"
          : modelApplicable
            ? "MODEL_ASSIGNED"
            : "MODEL_NOT_APPLICABLE",
        lines,
      },
      slug,
    );

    await updateDocumentMetadata(c, documentId, slug, { intakeId });

    return c.json(
      {
        ok: true,
        success: true,
        data: {
          message: `${intake.documentNo} işleme alındı.`,
          intake,
          files: {
            pdf: Boolean(metadata.pdfKey || metadata.pdfR2Key || document.pdf_key),
            xml: Boolean(metadata.xmlKey || metadata.xmlR2Key || document.xml_key),
          },
        },
      },
      201,
    );
  });
}
