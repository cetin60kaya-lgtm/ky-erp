// @ts-nocheck
import type { Context, Hono } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const SETTINGS_SCOPE = "ISNET_BUSINESS_SETTINGS";
const DEPARTMENT_SCOPE = "ISNET_BUSINESS_DEPARTMENT";
const CONTACT_SCOPE = "ISNET_BUSINESS_CONTACT";

const DEFAULT_SETTINGS = {
  carrier: {
    carrierName: "",
    taxNo: "",
    driverName: "",
    driverId: "",
    vehiclePlate: "",
    trailerPlate: "",
    deliveryMethod: "ELDEN_TESLIM",
    deliveryAddress: "",
  },
  mailTemplate: {
    subjectPattern: "{{MODEL}} FATURA",
    body: "Merhaba,\n\n{{MODEL}} modeline ait {{DISPATCH_NO}} numaralı irsaliye ve {{INVOICE_NO}} numaralı fatura ektedir.\n\nİyi çalışmalar.",
    attachDispatchPdf: true,
    attachInvoicePdf: true,
    attachXml: false,
  },
  nonBillableRules: {
    TEST_NUMUNESI: {
      label: "TEST NUMUNESİ",
      invoiceBehavior: "ZERO_PRICE_EXEMPT",
      exemptionCode: "",
      exemptionReason: "",
      deliveryMethod: "ELDEN_TESLIM",
    },
    BASKI_SAKATI: {
      label: "BASKI SAKATI",
      invoiceBehavior: "DO_NOT_INVOICE",
      deliveryMethod: "ELDEN_TESLIM",
    },
    KUMAS_SAKATI: {
      label: "KUMAŞ SAKATI",
      invoiceBehavior: "DO_NOT_INVOICE",
      deliveryMethod: "ELDEN_TESLIM",
    },
  },
  modelDepartmentMappings: [],
};

const text = (value: unknown) => (value == null ? "" : String(value).replace(/\s+/g, " ").trim());
const nowIso = () => new Date().toISOString();
const normalize = (value: unknown) =>
  text(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function bodyOf(c: Context<AppEnv>) {
  try {
    return objectOf(await c.req.json());
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    body.mainCompanySlug ||
      body.mainCompanyId ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

function err(code: string, message: string) {
  return { ok: false, success: false, error: { code, message } };
}

async function tableExists(c: Context<AppEnv>, table: string) {
  return Boolean(
    (
      await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1")
        .bind(table)
        .first<Row>()
    )?.name,
  );
}

async function storeGet(c: Context<AppEnv>, scope: string, fileName: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return null;
  const row = await c.env.DB.prepare(
    `SELECT id,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND file_name=?
        AND (main_company_slug=? OR main_company_slug IS NULL)
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

async function storeList(c: Context<AppEnv>, scope: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return [];
  const result = await c.env.DB.prepare(
    `SELECT id,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC,id DESC`,
  )
    .bind(scope, slug)
    .all<Row>();
  return (result.results || []).map((row) => ({
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
  }));
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string) {
  const existing = await storeGet(c, scope, fileName, slug);
  const ts = nowIso();
  const payload = {
    ...data,
    id: text(data.id || existing?.id || fileName),
    updatedAt: ts,
    createdAt: data.createdAt || existing?.createdAt || ts,
  };
  if (existing?.storeId) {
    await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?")
      .bind(JSON.stringify(payload), ts, existing.storeId)
      .run();
    return payload;
  }
  await c.env.DB.prepare(
    "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(crypto.randomUUID(), scope, slug, fileName, JSON.stringify(payload), ts, ts)
    .run();
  return payload;
}

async function storeDelete(c: Context<AppEnv>, scope: string, fileName: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return;
  await c.env.DB.prepare(
    "DELETE FROM json_store WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL)",
  )
    .bind(scope, fileName, slug)
    .run();
}

function mergeSettings(value: unknown) {
  const saved = objectOf(value);
  const rules = objectOf(saved.nonBillableRules);
  return {
    carrier: { ...DEFAULT_SETTINGS.carrier, ...objectOf(saved.carrier) },
    mailTemplate: { ...DEFAULT_SETTINGS.mailTemplate, ...objectOf(saved.mailTemplate) },
    nonBillableRules: {
      TEST_NUMUNESI: {
        ...DEFAULT_SETTINGS.nonBillableRules.TEST_NUMUNESI,
        ...objectOf(rules.TEST_NUMUNESI),
      },
      BASKI_SAKATI: {
        ...DEFAULT_SETTINGS.nonBillableRules.BASKI_SAKATI,
        ...objectOf(rules.BASKI_SAKATI),
      },
      KUMAS_SAKATI: {
        ...DEFAULT_SETTINGS.nonBillableRules.KUMAS_SAKATI,
        ...objectOf(rules.KUMAS_SAKATI),
      },
    },
    modelDepartmentMappings: Array.isArray(saved.modelDepartmentMappings)
      ? saved.modelDepartmentMappings
      : [],
    updatedAt: saved.updatedAt || null,
    updatedBy: text(saved.updatedBy || "USER"),
  };
}

async function readSettings(c: Context<AppEnv>, slug: string) {
  const row = await storeGet(c, SETTINGS_SCOPE, slug, slug);
  return mergeSettings(row || {});
}

async function writeSettings(c: Context<AppEnv>, slug: string, value: Row) {
  const next = mergeSettings({ ...value, updatedAt: nowIso(), updatedBy: text(value.updatedBy) || "USER" });
  return storePut(c, SETTINGS_SCOPE, slug, next, slug);
}

export function registerIsnetBusinessSettingsCloudRoutes(app: Hono<AppEnv>) {
  app.get("/api/isnet/business-settings", async (c) => {
    const slug = slugOf(c);
    const [settings, departments, contacts] = await Promise.all([
      readSettings(c, slug),
      storeList(c, DEPARTMENT_SCOPE, slug),
      storeList(c, CONTACT_SCOPE, slug),
    ]);
    return c.json({
      ok: true,
      success: true,
      data: {
        settings,
        departments: departments.filter((row) => row.isActive !== false),
        contacts: contacts.filter((row) => row.isActive !== false),
      },
    });
  });

  app.put("/api/isnet/business-settings", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = await readSettings(c, slug);
    const next = await writeSettings(c, slug, {
      ...current,
      carrier: body.carrier ? { ...current.carrier, ...objectOf(body.carrier) } : current.carrier,
      mailTemplate: body.mailTemplate
        ? { ...current.mailTemplate, ...objectOf(body.mailTemplate) }
        : current.mailTemplate,
      nonBillableRules: body.nonBillableRules
        ? { ...current.nonBillableRules, ...objectOf(body.nonBillableRules) }
        : current.nonBillableRules,
      modelDepartmentMappings: Array.isArray(body.modelDepartmentMappings)
        ? body.modelDepartmentMappings
        : current.modelDepartmentMappings,
      updatedBy: text(body.updatedBy) || "USER",
    });
    return c.json({ ok: true, success: true, data: next });
  });

  app.post("/api/isnet/business-settings/departments", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const departmentCode = text(body.departmentCode || body.departmentNo);
    if (!departmentCode) return c.json(err("DEPARTMENT_CODE_REQUIRED", "Departman kodu zorunludur."), 400);
    const departments = await storeList(c, DEPARTMENT_SCOPE, slug);
    const firmId = text(body.firmId || body.companyId);
    const existing = departments.find(
      (row) =>
        row.isActive !== false &&
        text(row.firmId) === firmId &&
        text(row.departmentCode) === departmentCode,
    );
    const id = text(existing?.id || existing?.fileName || body.id) || crypto.randomUUID();
    const data = await storePut(
      c,
      DEPARTMENT_SCOPE,
      id,
      {
        ...existing,
        ...body,
        id,
        mainCompanySlug: slug,
        firmId,
        firmName: text(body.firmName || body.companyName || existing?.firmName),
        departmentCode,
        departmentName: text(body.departmentName || body.department || existing?.departmentName),
        usageNote: text(body.usageNote || body.note || existing?.usageNote),
        isActive: body.isActive !== false,
      },
      slug,
    );
    return c.json({ ok: true, success: true, data }, existing ? 200 : 201);
  });

  app.patch("/api/isnet/business-settings/departments/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = text(c.req.param("id"));
    const current = await storeGet(c, DEPARTMENT_SCOPE, id, slug);
    if (!current) return c.json(err("DEPARTMENT_NOT_FOUND", "Departman kaydı bulunamadı."), 404);
    const data = await storePut(c, DEPARTMENT_SCOPE, id, { ...current, ...body, id }, slug);
    return c.json({ ok: true, success: true, data });
  });

  app.post("/api/isnet/business-settings/contacts", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const fullName = text(body.fullName || body.name);
    const email = text(body.email);
    if (!fullName || !email) return c.json(err("CONTACT_REQUIRED", "Ad soyad ve e-posta zorunludur."), 400);
    const contacts = await storeList(c, CONTACT_SCOPE, slug);
    const existing = contacts.find((row) => text(row.email).toLocaleLowerCase("tr-TR") === email.toLocaleLowerCase("tr-TR"));
    const id = text(existing?.id || existing?.fileName || body.id) || crypto.randomUUID();
    const data = await storePut(
      c,
      CONTACT_SCOPE,
      id,
      {
        ...existing,
        ...body,
        id,
        mainCompanySlug: slug,
        fullName,
        email,
        firmId: text(body.firmId || body.companyId || existing?.firmId),
        firmName: text(body.firmName || body.companyName || existing?.firmName),
        departmentCode: text(body.departmentCode || body.departmentNo || existing?.departmentCode),
        departmentName: text(body.departmentName || body.department || existing?.departmentName),
        canReceiveInvoiceMail: body.canReceiveInvoiceMail !== false,
        canReceiveDispatchMail: body.canReceiveDispatchMail !== false,
        isActive: body.isActive !== false,
      },
      slug,
    );
    return c.json({ ok: true, success: true, data }, existing ? 200 : 201);
  });

  app.patch("/api/isnet/business-settings/contacts/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = text(c.req.param("id"));
    const current = await storeGet(c, CONTACT_SCOPE, id, slug);
    if (!current) return c.json(err("CONTACT_NOT_FOUND", "Kişi kaydı bulunamadı."), 404);
    const data = await storePut(c, CONTACT_SCOPE, id, { ...current, ...body, id }, slug);
    return c.json({ ok: true, success: true, data });
  });

  app.post("/api/isnet/business-settings/model-mappings", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const departmentCode = text(body.departmentCode);
    const modelId = text(body.modelId);
    const modelName = text(body.modelName || body.modelKey);
    if (!departmentCode || (!modelId && !modelName)) {
      return c.json(err("MODEL_MAPPING_REQUIRED", "Model ve departman kodu zorunludur."), 400);
    }
    const current = await readSettings(c, slug);
    const id = text(body.id) || crypto.randomUUID();
    const mapping = {
      id,
      companyId: text(body.companyId),
      companyName: text(body.companyName),
      modelId,
      modelName,
      modelKey: normalize(modelName || modelId),
      departmentCode,
      responsibleContactId: text(body.responsibleContactId),
      active: body.active !== false,
    };
    const mappings = current.modelDepartmentMappings.filter((row: Row) => text(row.id) !== id).concat(mapping);
    const settings = await writeSettings(c, slug, { ...current, modelDepartmentMappings: mappings });
    return c.json({ ok: true, success: true, data: { mapping, settings } }, 201);
  });

  app.delete("/api/isnet/business-settings/model-mappings/:id", async (c) => {
    const slug = slugOf(c);
    const id = text(c.req.param("id"));
    const current = await readSettings(c, slug);
    const mappings = current.modelDepartmentMappings.filter((row: Row) => text(row.id) !== id);
    if (mappings.length === current.modelDepartmentMappings.length) {
      return c.json(err("MODEL_MAPPING_NOT_FOUND", "Model departman eşleşmesi bulunamadı."), 404);
    }
    const settings = await writeSettings(c, slug, { ...current, modelDepartmentMappings: mappings });
    return c.json({ ok: true, success: true, data: { id, settings } });
  });

  app.get("/api/isnet/business-settings/resolve", async (c) => {
    const slug = slugOf(c);
    const settings = await readSettings(c, slug);
    const companyId = text(c.req.query("companyId") || c.req.query("firmId"));
    const modelId = text(c.req.query("modelId"));
    const modelName = text(c.req.query("modelName") || c.req.query("modelKey"));
    const normalizedModel = normalize(modelName);
    const mappings = settings.modelDepartmentMappings.filter((row: Row) => row.active !== false);
    const mapping =
      mappings.find(
        (row: Row) =>
          modelId && text(row.modelId) === modelId &&
          (!text(row.companyId) || !companyId || text(row.companyId) === companyId),
      ) ||
      mappings.find(
        (row: Row) =>
          normalizedModel && normalize(row.modelName || row.modelKey) === normalizedModel &&
          (!text(row.companyId) || !companyId || text(row.companyId) === companyId),
      ) ||
      null;
    const departments = (await storeList(c, DEPARTMENT_SCOPE, slug)).filter((row) => row.isActive !== false);
    const contacts = (await storeList(c, CONTACT_SCOPE, slug)).filter((row) => row.isActive !== false);
    const departmentCode = text(mapping?.departmentCode);
    const responsibleContact = contacts.find((row) => text(row.id || row.fileName) === text(mapping?.responsibleContactId)) || null;
    return c.json({
      ok: true,
      success: true,
      data: {
        mapping,
        departmentCode,
        department: departments.find((row) => text(row.departmentCode) === departmentCode && (!companyId || !text(row.firmId) || text(row.firmId) === companyId)) || null,
        responsibleContact,
        contacts: contacts.filter((row) => (!companyId || !text(row.firmId) || text(row.firmId) === companyId) && (!departmentCode || text(row.departmentCode) === departmentCode)),
        settings,
      },
    });
  });
}
