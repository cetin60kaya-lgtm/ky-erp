import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const SCOPES = {
  job: "BOYAHANE_JOB",
  jobColor: "BOYAHANE_JOB_COLOR",
  color: "BOYAHANE_REGISTERED_COLOR",
  recipe: "BOYAHANE_RECIPE",
  production: "BOYAHANE_PRODUCTION",
  log: "BOYAHANE_WORKFLOW_LOG",
  lot: "BOYAHANE_LOT",
  movement: "BOYAHANE_STOCK_MOVEMENT",
  expense: "BOYAHANE_EXPENSE",
} as const;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const nowIso = () => new Date().toISOString();
const normalize = (value: unknown) =>
  upper(value)
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
    c.req.header("X-KYERP-Tenant-Slug") ||
      body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

async function storeList(
  c: Context<AppEnv>,
  scope: string,
  slug: string,
): Promise<Row[]> {
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
): Promise<Row | null> {
  const row = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC
      LIMIT 1`,
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
): Promise<Row> {
  const existing = await storeGet(c, scope, fileName, slug);
  const timestamp = nowIso();
  const payload = { ...data, updatedAt: timestamp };
  if (existing?.storeId) {
    await c.env.DB.prepare(
      `UPDATE json_store
          SET data = ?, updated_at = ?
        WHERE id = ?
          AND (main_company_slug = ? OR main_company_slug IS NULL)`,
    )
      .bind(JSON.stringify(payload), timestamp, existing.storeId, slug)
      .run();
    return { ...payload, storeId: existing.storeId, fileName };
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      scope,
      slug || null,
      fileName,
      JSON.stringify(payload),
      timestamp,
      timestamp,
    )
    .run();
  return { ...payload, storeId: id, fileName };
}

async function storeDelete(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  slug: string,
) {
  await c.env.DB.prepare(
    `DELETE FROM json_store
      WHERE scope = ?
        AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)`,
  )
    .bind(scope, fileName, slug)
    .run();
}

async function logAction(
  c: Context<AppEnv>,
  slug: string,
  entityType: string,
  entityId: string,
  action: string,
  description: string,
  data: Row = {},
) {
  const id = crypto.randomUUID();
  return storePut(
    c,
    SCOPES.log,
    id,
    {
      id,
      mainCompanySlug: slug,
      module: "BOYAHANE",
      entityType,
      entityId,
      action,
      actionType: action,
      description,
      actor: text(data.actor || "KY ERP"),
      oldValue: data.oldValue,
      newValue: data.newValue,
      createdAt: nowIso(),
    },
    slug,
  );
}

function normalizedJobStatus(value: unknown) {
  const status = upper(value);
  return ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED", "WAITING"].includes(
    status,
  )
    ? status
    : "WAITING";
}

function normalizedColorStatus(value: unknown) {
  const status = upper(value);
  return ["WAITING", "DRAFT", "PREPARING", "COMPLETED", "CANCELLED"].includes(
    status,
  )
    ? status
    : "WAITING";
}

async function jobView(c: Context<AppEnv>, job: Row, slug: string): Promise<Row> {
  const colors = (await storeList(c, SCOPES.jobColor, slug))
    .filter((row) => text(row.jobId || row.dyehouseModelId) === text(job.id))
    .sort((a, b) => text(a.createdAt).localeCompare(text(b.createdAt)));
  const prepared = colors.filter((row) => row.status === "COMPLETED").length;
  return {
    ...job,
    id: text(job.id || job.fileName),
    status: normalizedJobStatus(job.status),
    colors: colors.map((row) => ({
      ...row,
      status: normalizedColorStatus(row.status),
    })),
    preparedColorCount: prepared,
    pendingColorCount: colors.filter(
      (row) => !["COMPLETED", "CANCELLED"].includes(upper(row.status)),
    ).length,
    plannedPaintKg: colors.reduce((sum, row) => sum + num(row.plannedKg), 0),
    channelCount: num(job.channelCount || job.totalChannelCount),
    uniqueColorCount: num(job.uniqueColorCount || colors.length),
    moldCount: num(job.moldCount || job.totalMoldCount),
  };
}

function recipeLines(value: unknown) {
  return (Array.isArray(value) ? value : []).map((line: Row, index) => ({
    id: text(line.id || `line-${index + 1}`),
    inventoryId: text(line.inventoryId || line.productId),
    productId: text(line.productId || line.inventoryId),
    productName: text(line.productName),
    referenceGram: num(
      line.referenceGram ?? line.trialTotalGr ?? line.totalGr,
    ),
    totalGr: num(line.totalGr ?? line.referenceGram),
    trialTotalGr: num(line.trialTotalGr ?? line.referenceGram),
    lotId: text(line.lotId),
  }));
}

function recipeSignature(lines: Row[]) {
  return JSON.stringify(
    lines
      .map((line) => ({
        productId: text(line.productId || line.inventoryId),
        referenceGram: Number(num(line.referenceGram).toFixed(4)),
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  );
}

function recipeView(row: Row): Row {
  const lines = recipeLines(row.lines);
  return {
    ...row,
    id: text(row.id || row.fileName),
    version: text(row.version || "V1"),
    status: text(row.status || "ACTIVE"),
    dyeType: text(row.dyeType || row.paintType || "SUBAZLI"),
    paintType: text(row.paintType || row.dyeType || "SUBAZLI"),
    lines,
    totalGr: lines.reduce((sum, line) => sum + num(line.referenceGram), 0),
  };
}

export function registerBoyahaneWorkflowRoutes(app: Hono<AppEnv>) {
  app.get("/api/boyahane/jobs", async (c) => {
    const slug = slugOf(c);
    const status = upper(c.req.query("status"));
    const jobs = await Promise.all(
      (await storeList(c, SCOPES.job, slug)).map((row) => jobView(c, row, slug)),
    );
    return c.json({
      ok: true,
      success: true,
      data: status ? jobs.filter((row) => row.status === status) : jobs,
    });
  });

  app.get("/api/boyahane/jobs/:id", async (c) => {
    const slug = slugOf(c);
    const job = await storeGet(c, SCOPES.job, c.req.param("id"), slug);
    if (!job) return c.json(errorBody("NOT_FOUND", "Boyahane işi bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: await jobView(c, job, slug) });
  });

  app.patch("/api/boyahane/jobs/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = c.req.param("id");
    const current = await storeGet(c, SCOPES.job, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Boyahane işi bulunamadı."), 404);
    const updated = await storePut(
      c,
      SCOPES.job,
      id,
      {
        ...current,
        ...body,
        id,
        status:
          body.status === undefined
            ? normalizedJobStatus(current.status)
            : normalizedJobStatus(body.status),
        priority: upper(body.priority || current.priority || "NORMAL"),
        plannedQuantity:
          body.plannedQuantity === undefined
            ? num(current.plannedQuantity)
            : num(body.plannedQuantity),
      },
      slug,
    );
    await logAction(c, slug, "DYEHOUSE_JOB", id, "JOB_UPDATED", "Boyahane işi güncellendi.", {
      oldValue: current,
      newValue: updated,
    });
    return c.json({ ok: true, success: true, data: await jobView(c, updated, slug) });
  });

  app.post("/api/boyahane/jobs/:id/start", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = c.req.param("id");
    const current = await storeGet(c, SCOPES.job, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Boyahane işi bulunamadı."), 404);
    const jobs = await storeList(c, SCOPES.job, slug);
    const active = jobs.find(
      (row) => row.id !== id && normalizedJobStatus(row.status) === "ACTIVE",
    );
    if (active && body.force !== true) {
      return c.json(
        errorBody(
          "ACTIVE_JOB_EXISTS",
          `Önce ${active.modelName || "aktif"} işini beklemeye alın veya geçişi onaylayın.`,
          { activeJobId: active.id },
        ),
        409,
      );
    }
    if (active) {
      await storePut(c, SCOPES.job, text(active.id), { ...active, status: "PAUSED" }, slug);
    }
    const updated = await storePut(
      c,
      SCOPES.job,
      id,
      {
        ...current,
        status: "ACTIVE",
        startedAt: current.startedAt || nowIso(),
      },
      slug,
    );
    await logAction(c, slug, "DYEHOUSE_JOB", id, "JOB_STARTED", "Boyahane işi başlatıldı.");
    return c.json({ ok: true, success: true, data: await jobView(c, updated, slug) });
  });

  app.post("/api/boyahane/jobs/:id/complete", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = c.req.param("id");
    const current = await storeGet(c, SCOPES.job, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Boyahane işi bulunamadı."), 404);
    const colors = (await storeList(c, SCOPES.jobColor, slug)).filter(
      (row) => text(row.jobId || row.dyehouseModelId) === id,
    );
    if (
      !colors.length ||
      colors.some(
        (row) => !["COMPLETED", "CANCELLED"].includes(normalizedColorStatus(row.status)),
      )
    ) {
      return c.json(
        errorBody(
          "COLORS_NOT_COMPLETED",
          "Tüm model renkleri tamamlanmadan iş kapatılamaz.",
        ),
        409,
      );
    }
    const updated = await storePut(
      c,
      SCOPES.job,
      id,
      { ...current, status: "COMPLETED", completedAt: nowIso() },
      slug,
    );
    await logAction(c, slug, "DYEHOUSE_JOB", id, "MODEL_COMPLETED", "Modelin Boyahane işi tamamlandı.");
    return c.json({ ok: true, success: true, data: await jobView(c, updated, slug) });
  });

  app.get("/api/boyahane/jobs/:id/colors", async (c) => {
    const slug = slugOf(c);
    const data = (await storeList(c, SCOPES.jobColor, slug)).filter(
      (row) => text(row.jobId || row.dyehouseModelId) === c.req.param("id"),
    );
    return c.json({ ok: true, success: true, data });
  });

  app.post("/api/boyahane/jobs/:id/colors", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const jobId = c.req.param("id");
    const job = await storeGet(c, SCOPES.job, jobId, slug);
    if (!job) return c.json(errorBody("NOT_FOUND", "Boyahane işi bulunamadı."), 404);
    const registered = body.registeredColorId
      ? await storeGet(c, SCOPES.color, text(body.registeredColorId), slug)
      : null;
    const colorName = text(registered?.colorName || body.colorName);
    if (!colorName) {
      return c.json(errorBody("COLOR_NAME_REQUIRED", "Renk adı zorunludur."), 400);
    }
    const id = crypto.randomUUID();
    const row = await storePut(
      c,
      SCOPES.jobColor,
      id,
      {
        id,
        jobId,
        dyehouseModelId: jobId,
        registeredColorId: registered?.id || body.registeredColorId || null,
        sourceChannelKey: `manual:${Date.now()}`,
        colorName,
        pantone: text(registered?.pantone || body.pantone),
        paintType: text(registered?.dyeType || body.paintType || "SUBAZLI"),
        recipeId: body.recipeId || null,
        printRegion: text(body.printRegion || job.printRegion),
        plannedKg: num(body.plannedKg),
        status: "WAITING",
        createdAt: nowIso(),
      },
      slug,
    );
    await logAction(c, slug, "DYEHOUSE_COLOR", id, "COLOR_ADDED", `${colorName} işe eklendi.`);
    return c.json({ ok: true, success: true, data: row }, 201);
  });

  app.patch("/api/boyahane/job-colors/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = c.req.param("id");
    const current = await storeGet(c, SCOPES.jobColor, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Model rengi bulunamadı."), 404);
    const updated = await storePut(
      c,
      SCOPES.jobColor,
      id,
      {
        ...current,
        ...body,
        id,
        status:
          body.status === undefined
            ? normalizedColorStatus(current.status)
            : normalizedColorStatus(body.status),
      },
      slug,
    );
    await logAction(c, slug, "DYEHOUSE_COLOR", id, "COLOR_UPDATED", "Model rengi güncellendi.");
    return c.json({ ok: true, success: true, data: updated });
  });

  app.delete("/api/boyahane/job-colors/:id", async (c) => {
    const slug = slugOf(c);
    const id = c.req.param("id");
    const current = await storeGet(c, SCOPES.jobColor, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Model rengi bulunamadı."), 404);
    const production = (await storeList(c, SCOPES.production, slug)).find(
      (row) => text(row.jobColorId) === id,
    );
    if (production) {
      return c.json(
        errorBody(
          "COLOR_HAS_PRODUCTION",
          "Üretim kaydı bulunan renk silinemez; iptal durumuna alınmalıdır.",
        ),
        409,
      );
    }
    await storeDelete(c, SCOPES.jobColor, id, slug);
    await logAction(c, slug, "DYEHOUSE_COLOR", id, "COLOR_DELETED", "Üretim yapılmamış renk işten çıkarıldı.");
    return c.json({ ok: true, success: true, data: { id, deleted: true } });
  });

  app.get("/api/boyahane/registered-colors", async (c) => {
    const slug = slugOf(c);
    const q = normalize(c.req.query("q"));
    const colors = await storeList(c, SCOPES.color, slug);
    const recipes = await storeList(c, SCOPES.recipe, slug);
    const data = colors
      .filter((row) => row.isActive !== false)
      .filter((row) => !q || normalize(`${row.colorName} ${row.pantone} ${row.dyeType}`).includes(q))
      .map((row) => ({
        ...row,
        id: text(row.id || row.fileName),
        paintTypes: [
          ...new Set(
            recipes
              .filter((recipe) => text(recipe.registeredColorId) === text(row.id))
              .map((recipe) => text(recipe.dyeType || recipe.paintType))
              .filter(Boolean),
          ),
        ],
        recipeCount: recipes.filter(
          (recipe) => text(recipe.registeredColorId) === text(row.id),
        ).length,
      }));
    return c.json({ ok: true, success: true, data });
  });

  app.get("/api/boyahane/registered-colors/:id", async (c) => {
    const slug = slugOf(c);
    const row = await storeGet(c, SCOPES.color, c.req.param("id"), slug);
    if (!row) return c.json(errorBody("NOT_FOUND", "Kayıtlı renk bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: row });
  });

  app.post("/api/boyahane/registered-colors", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const pantone = text(body.pantone);
    const colorName = text(body.colorName);
    if (!pantone || !colorName) {
      return c.json(
        errorBody("COLOR_FIELDS_REQUIRED", "Renk adı ve Pantone zorunludur."),
        400,
      );
    }
    const existing = (await storeList(c, SCOPES.color, slug)).find(
      (row) => normalize(row.pantone) === normalize(pantone),
    );
    if (existing) {
      return c.json(
        errorBody("COLOR_EXISTS", "Bu Pantone için kayıtlı renk zaten var.", {
          colorId: existing.id,
        }),
        409,
      );
    }
    const id = crypto.randomUUID();
    const row = await storePut(
      c,
      SCOPES.color,
      id,
      {
        id,
        pantone,
        colorName,
        dyeType: text(body.paintType || body.dyeType || "SUBAZLI"),
        status: "ACTIVE",
        isActive: true,
        createdAt: nowIso(),
      },
      slug,
    );
    await logAction(c, slug, "REGISTERED_COLOR", id, "COLOR_CREATED", `${colorName} renk kartı oluşturuldu.`);
    return c.json({ ok: true, success: true, data: row }, 201);
  });

  app.get("/api/boyahane/registered-colors/:id/recipes", async (c) => {
    const slug = slugOf(c);
    const data = (await storeList(c, SCOPES.recipe, slug))
      .filter((row) => text(row.registeredColorId) === c.req.param("id"))
      .map(recipeView)
      .sort((a, b) => num(b.versionNumber) - num(a.versionNumber));
    return c.json({ ok: true, success: true, data });
  });

  app.post("/api/boyahane/registered-colors/:id/recipes/compare", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const colorId = c.req.param("id");
    const lines = recipeLines(body.lines);
    const dyeType = text(body.paintType || body.dyeType || "SUBAZLI");
    const recipes = (await storeList(c, SCOPES.recipe, slug))
      .filter(
        (row) =>
          text(row.registeredColorId) === colorId &&
          normalize(row.dyeType || row.paintType) === normalize(dyeType),
      )
      .map(recipeView);
    const signature = recipeSignature(lines);
    const exact = recipes.find((row) => recipeSignature(row.lines) === signature);
    const current = recipes.find((row) => row.status === "ACTIVE") || recipes[0] || null;
    return c.json({
      ok: true,
      success: true,
      data: {
        exactMatch: Boolean(exact),
        recipe: exact || current,
        submittedLines: lines,
        differences: exact
          ? []
          : current
            ? ["Ürün veya gramaj dağılımı mevcut reçeteden farklı."]
            : ["Bu boya türünde kayıtlı reçete bulunmuyor."],
      },
    });
  });

  app.post("/api/boyahane/registered-colors/:id/recipes/new-version", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const colorId = c.req.param("id");
    const color = await storeGet(c, SCOPES.color, colorId, slug);
    if (!color) return c.json(errorBody("NOT_FOUND", "Kayıtlı renk bulunamadı."), 404);
    const lines = recipeLines(body.lines);
    if (!lines.length || lines.some((line) => !line.productId || line.referenceGram <= 0)) {
      return c.json(
        errorBody(
          "INVALID_RECIPE_LINES",
          "Reçetede onaylı ürün ve sıfırdan büyük gramaj zorunludur.",
        ),
        400,
      );
    }
    const existing = (await storeList(c, SCOPES.recipe, slug)).filter(
      (row) => text(row.registeredColorId) === colorId,
    );
    const versionNumber =
      existing.reduce((max, row) => Math.max(max, num(row.versionNumber)), 0) + 1;
    for (const row of existing.filter((item) => item.status === "ACTIVE")) {
      await storePut(c, SCOPES.recipe, text(row.id), { ...row, status: "ARCHIVED" }, slug);
    }
    const id = crypto.randomUUID();
    const recipe = await storePut(
      c,
      SCOPES.recipe,
      id,
      {
        id,
        registeredColorId: colorId,
        colorName: color.colorName,
        pantone: color.pantone,
        versionNumber,
        version: `V${versionNumber}`,
        dyeType: text(body.paintType || body.dyeType || color.dyeType || "SUBAZLI"),
        paintType: text(body.paintType || body.dyeType || color.dyeType || "SUBAZLI"),
        status: "ACTIVE",
        lines,
        createdAt: nowIso(),
      },
      slug,
    );
    await logAction(c, slug, "DYE_RECIPE", id, "RECIPE_VERSION_CREATED", `${color.colorName} için V${versionNumber} reçetesi oluşturuldu.`);
    return c.json({ ok: true, success: true, data: recipeView(recipe) }, 201);
  });

  app.patch("/api/boyahane/workflow/recipes/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = c.req.param("id");
    const current = await storeGet(c, SCOPES.recipe, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Reçete bulunamadı."), 404);
    const lines = body.lines === undefined ? recipeLines(current.lines) : recipeLines(body.lines);
    if (!lines.length || lines.some((line) => !line.productId || line.referenceGram <= 0)) {
      return c.json(errorBody("INVALID_RECIPE_LINES", "Reçete satırları eksik."), 400);
    }
    const updated = await storePut(c, SCOPES.recipe, id, { ...current, ...body, id, lines }, slug);
    await logAction(c, slug, "DYE_RECIPE", id, "RECIPE_UPDATED", "Reçete güncellendi.");
    return c.json({ ok: true, success: true, data: recipeView(updated) });
  });

  app.post("/api/boyahane/productions", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const requestId = text(body.requestId);
    if (!requestId) {
      return c.json(errorBody("REQUEST_ID_REQUIRED", "Tekrarlı üretimi önlemek için requestId zorunludur."), 400);
    }
    const duplicate = (await storeList(c, SCOPES.production, slug)).find(
      (row) => text(row.requestId) === requestId,
    );
    if (duplicate) {
      return c.json({ ok: true, success: true, data: { ...duplicate, idempotent: true } });
    }
    const job = await storeGet(c, SCOPES.job, text(body.jobId), slug);
    const jobColor = await storeGet(c, SCOPES.jobColor, text(body.jobColorId), slug);
    if (!job || !jobColor) {
      return c.json(errorBody("JOB_OR_COLOR_NOT_FOUND", "Boyahane işi veya renk kaydı bulunamadı."), 404);
    }
    const multiplier = num(body.multiplier || 1);
    if (multiplier <= 0) {
      return c.json(errorBody("INVALID_MULTIPLIER", "Çarpan sıfırdan büyük olmalıdır."), 400);
    }
    const lines = recipeLines(body.lines);
    if (!lines.length) {
      return c.json(errorBody("PRODUCTION_LINES_REQUIRED", "Üretim reçetesi boş olamaz."), 400);
    }
    const lots = await storeList(c, SCOPES.lot, slug);
    const consumptions: Row[] = [];
    const validation: string[] = [];
    for (const [index, line] of lines.entries()) {
      const lot = lots.find((row) => text(row.id || row.fileName) === line.lotId);
      const requiredKg = (num(line.referenceGram) * multiplier) / 1000;
      const remainingKg = num(lot?.remainingKg ?? lot?.remainingQuantity ?? lot?.quantity);
      if (!line.productId) validation.push(`${index + 1}. satır: ürün seçilmedi.`);
      if (!lot) validation.push(`${index + 1}. satır: lot bulunamadı.`);
      else if (text(lot.productId || lot.inventoryId) !== line.productId) {
        validation.push(`${index + 1}. satır: lot seçilen ürüne ait değil.`);
      } else if (!/AVAILABLE|ACTIVE/.test(upper(lot.status))) {
        validation.push(`${index + 1}. satır: lot kullanıma açık değil.`);
      } else if (requiredKg <= 0 || requiredKg > remainingKg) {
        validation.push(
          `${index + 1}. satır: stok yetersiz. Gerekli ${requiredKg.toFixed(3)} KG, kalan ${remainingKg.toFixed(3)} KG.`,
        );
      }
      consumptions.push({ line, lot, requiredKg, remainingKg });
    }
    if (validation.length) {
      return c.json(
        errorBody("PRODUCTION_VALIDATION_FAILED", "Üretim ve stok kontrolü başarısız.", validation),
        409,
      );
    }

    const productionId = crypto.randomUUID();
    const items: Row[] = [];
    let totalCost = 0;
    for (const consumption of consumptions) {
      const nextRemaining = consumption.remainingKg - consumption.requiredKg;
      const lot = consumption.lot as Row;
      const entryKg = num(lot.entryKg || lot.quantity);
      await storePut(
        c,
        SCOPES.lot,
        text(lot.id || lot.fileName),
        {
          ...lot,
          remainingKg: nextRemaining,
          remainingQuantity: nextRemaining,
          usedKg: Math.max(0, entryKg - nextRemaining),
          status: nextRemaining <= 0 ? "DEPLETED" : "AVAILABLE",
        },
        slug,
      );
      const movementId = crypto.randomUUID();
      await storePut(
        c,
        SCOPES.movement,
        movementId,
        {
          id: movementId,
          lotId: text(lot.id || lot.fileName),
          productId: consumption.line.productId,
          type: "OUT",
          quantity: consumption.requiredKg,
          unit: lot.unit || "KG",
          recipeId: body.recipeId || null,
          productionId,
          note: `${job.modelName || "Model"} · ${jobColor.colorName || "Renk"} üretim sarfı`,
          createdAt: nowIso(),
        },
        slug,
      );
      const cost = consumption.requiredKg * num(lot.unitCost);
      totalCost += cost;
      items.push({
        id: crypto.randomUUID(),
        productId: consumption.line.productId,
        productNameSnapshot: consumption.line.productName,
        lotId: text(lot.id || lot.fileName),
        lotNoSnapshot: lot.lotNo,
        referenceGram: consumption.line.referenceGram,
        consumedKg: consumption.requiredKg,
        unitCost: num(lot.unitCost),
        totalCost: cost,
      });
    }

    const production = await storePut(
      c,
      SCOPES.production,
      productionId,
      {
        id: productionId,
        requestId,
        jobId: job.id,
        jobColorId: jobColor.id,
        colorId: body.colorId || jobColor.registeredColorId || null,
        recipeId: body.recipeId || jobColor.recipeId || null,
        modelName: job.modelName,
        companyName: body.companyName || job.companyName,
        orderNo: body.orderNo || job.orderNo,
        colorName: body.colorName || jobColor.colorName,
        pantoneSnapshot: body.pantone || jobColor.pantone,
        paintTypeSnapshot: body.paintType || jobColor.paintType,
        version: body.version || "V1",
        multiplier,
        jobType: body.jobType || "PRODUCTION",
        totalReferenceGr: lines.reduce((sum, line) => sum + num(line.referenceGram), 0),
        totalPreparedKg: items.reduce((sum, item) => sum + num(item.consumedKg), 0),
        totalCost,
        items,
        createdAt: nowIso(),
      },
      slug,
    );

    await storePut(
      c,
      SCOPES.jobColor,
      text(jobColor.id),
      {
        ...jobColor,
        registeredColorId: body.colorId || jobColor.registeredColorId || null,
        recipeId: body.recipeId || jobColor.recipeId || null,
        paintType: body.paintType || jobColor.paintType,
        status: "COMPLETED",
        completedAt: nowIso(),
        preparedKg: production.totalPreparedKg,
      },
      slug,
    );

    const expenseId = crypto.randomUUID();
    await storePut(
      c,
      SCOPES.expense,
      expenseId,
      {
        id: expenseId,
        productionId,
        jobId: job.id,
        modelName: job.modelName,
        companyName: body.companyName || job.companyName,
        orderNo: body.orderNo || job.orderNo,
        description: `${job.modelName || "Model"} Boyahane boya/kimyasal sarfı`,
        amount: totalCost,
        expenseDate: nowIso().slice(0, 10),
        source: "BOYAHANE_PRODUCTION",
        createdAt: nowIso(),
      },
      slug,
    );

    await logAction(
      c,
      slug,
      "DYE_PRODUCTION",
      productionId,
      "PRODUCTION_CREATED",
      `${job.modelName || "Model"} · ${jobColor.colorName || "Renk"} hazırlandı; stok düşümü ve gider kaydı oluşturuldu.`,
    );

    const colors = (await storeList(c, SCOPES.jobColor, slug)).filter(
      (row) => text(row.jobId || row.dyehouseModelId) === text(job.id),
    );
    const nextColor = colors.find(
      (row) => text(row.id) !== text(jobColor.id) && normalizedColorStatus(row.status) !== "COMPLETED",
    );
    return c.json({
      ok: true,
      success: true,
      data: { ...production, nextColorId: nextColor?.id || null },
    }, 201);
  });

  app.get("/api/boyahane/productions", async (c) => {
    const slug = slugOf(c);
    const data = await storeList(c, SCOPES.production, slug);
    return c.json({ ok: true, success: true, data });
  });

  app.get("/api/boyahane/productions/:id", async (c) => {
    const slug = slugOf(c);
    const row = await storeGet(c, SCOPES.production, c.req.param("id"), slug);
    if (!row) return c.json(errorBody("NOT_FOUND", "Boyahane üretimi bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: row });
  });

  app.get("/api/boyahane/workflow/logs", async (c) => {
    const slug = slugOf(c);
    const entityId = text(c.req.query("entityId"));
    const data = (await storeList(c, SCOPES.log, slug))
      .filter((row) => !entityId || text(row.entityId) === entityId)
      .slice(0, 500);
    return c.json({ ok: true, success: true, data });
  });

  app.get("/api/boyahane/workflow/reports", async (c) => {
    const slug = slugOf(c);
    const [rawJobs, productions, lots, expenses] = await Promise.all([
      storeList(c, SCOPES.job, slug),
      storeList(c, SCOPES.production, slug),
      storeList(c, SCOPES.lot, slug),
      storeList(c, SCOPES.expense, slug),
    ]);
    const jobs = await Promise.all(rawJobs.map((row) => jobView(c, row, slug)));
    const today = nowIso().slice(0, 10);
    const summary = {
      activeJobs: jobs.filter((row) => row.status === "ACTIVE").length,
      waitingJobs: jobs.filter((row) => ["WAITING", "PAUSED"].includes(row.status)).length,
      completedToday: jobs.filter(
        (row) => row.status === "COMPLETED" && text(row.completedAt).startsWith(today),
      ).length,
      pendingColors: jobs.reduce((sum, row) => sum + num(row.pendingColorCount), 0),
      preparedKgToday: productions
        .filter((row) => text(row.createdAt).startsWith(today))
        .reduce((sum, row) => sum + num(row.totalPreparedKg), 0),
      totalPreparedKg: productions.reduce(
        (sum, row) => sum + num(row.totalPreparedKg),
        0,
      ),
      totalStockKg: lots.reduce(
        (sum, row) => sum + num(row.remainingKg ?? row.remainingQuantity),
        0,
      ),
      totalExpense: expenses.reduce((sum, row) => sum + num(row.amount), 0),
    };
    return c.json({
      ok: true,
      success: true,
      data: { summary, jobs, productions, expenses, lots },
    });
  });
}
