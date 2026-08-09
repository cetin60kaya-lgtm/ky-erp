import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const SETTINGS_SCOPE = "DESEN_FOLDER_SETTINGS";

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const nowIso = () => new Date().toISOString();

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

function safeName(value: unknown) {
  return text(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function defaults(slug: string) {
  return {
    storageMode: "R2",
    incomingFolder: `R2/desen/inbox/${slug}`,
    modelsFolder: `R2/desen/models/${slug}`,
    processedFolder: `R2/desen/processed/${slug}`,
    errorFolder: `R2/desen/error/${slug}`,
    archiveFolder: `R2/desen/archive/${slug}`,
  };
}

async function getSettings(c: Context<AppEnv>, slug: string): Promise<Row> {
  const row = await c.env.DB.prepare(
    `SELECT id, data FROM json_store
      WHERE scope = ?
        AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC
      LIMIT 1`,
  )
    .bind(SETTINGS_SCOPE, slug, slug)
    .first<Row>();
  return { ...defaults(slug), ...objectOf(row?.data), storageMode: "R2" };
}

async function saveSettings(c: Context<AppEnv>, slug: string, body: Row) {
  const current = await getSettings(c, slug);
  const now = nowIso();
  const settings = {
    ...current,
    ...body,
    ...defaults(slug),
    storageMode: "R2",
    updatedAt: now,
  };
  const existing = await c.env.DB.prepare(
    `SELECT id FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      LIMIT 1`,
  )
    .bind(SETTINGS_SCOPE, slug, slug)
    .first<Row>();
  if (existing?.id) {
    await c.env.DB.prepare(
      "UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?",
    )
      .bind(JSON.stringify(settings), now, existing.id)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO json_store
        (id, scope, main_company_slug, file_name, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        SETTINGS_SCOPE,
        slug,
        slug,
        JSON.stringify(settings),
        now,
        now,
      )
      .run();
  }
  return settings;
}

async function storageStatus(c: Context<AppEnv>, slug: string) {
  const bucket = c.env.FILES as any;
  const prefix = `desen/inbox/${slug}/`;
  const listed = await bucket.list({ prefix, limit: 1000 });
  const objects = Array.isArray(listed?.objects) ? listed.objects : [];
  return {
    ok: true,
    connected: true,
    storageMode: "R2",
    pendingFileCount: objects.filter((row: Row) => !text(row.key).endsWith("/"))
      .length,
    totalBytes: objects.reduce((sum: number, row: Row) => sum + Number(row.size || 0), 0),
    settings: await getSettings(c, slug),
    capabilities: {
      upload: true,
      scan: true,
      openLocalFolder: false,
      persistentCloudStorage: true,
    },
  };
}

function filesFromForm(form: Record<string, any>) {
  const candidates = [form.files, form.file]
    .flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []))
    .filter((value) => value instanceof File);
  return candidates as File[];
}

export function registerDesenStorageRoutes(app: Hono<AppEnv>) {
  app.get("/api/desen/folder-settings", async (c) => {
    return c.json({ ok: true, success: true, data: await storageStatus(c, slugOf(c)) });
  });

  app.post("/api/desen/folder-settings/test", async (c) => {
    const body = await bodyOf(c);
    return c.json({ ok: true, success: true, data: await storageStatus(c, slugOf(c, body)) });
  });

  app.put("/api/desen/folder-settings", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    await saveSettings(c, slug, body);
    return c.json({ ok: true, success: true, data: await storageStatus(c, slug) });
  });

  app.post("/api/desen/folder-settings/open", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    return c.json({
      ok: true,
      success: true,
      data: {
        opened: false,
        storageMode: "R2",
        path: `R2/desen/inbox/${slug}`,
        message:
          "Canlı sistem R2 bulut alanı kullanır. Görselleri Gelen Desenler ekranındaki Yükle düğmesiyle ekleyin.",
      },
    });
  });

  app.post("/api/desen/workflow/inbox/upload", async (c) => {
    const form = (await c.req.parseBody({ all: true })) as Record<string, any>;
    const slug = text(form.mainCompanySlug || form.mainCompanyId || "mecit-hakan");
    const files = filesFromForm(form);
    if (!files.length) {
      return c.json(
        {
          ok: false,
          success: false,
          error: { code: "FILES_REQUIRED", message: "En az bir desen görseli seçin." },
        },
        400,
      );
    }
    const allowed = /\.(png|jpe?g|webp|gif|pdf|psd|tiff?|bmp)$/i;
    const created: Row[] = [];
    const rejected: Row[] = [];
    for (const file of files) {
      if (!allowed.test(file.name)) {
        rejected.push({ fileName: file.name, reason: "Desteklenmeyen dosya türü" });
        continue;
      }
      const id = crypto.randomUUID();
      const storageKey = `desen/inbox/${slug}/${Date.now()}-${id.slice(0, 8)}-${safeName(file.name)}`;
      await c.env.FILES.put(storageKey, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
        customMetadata: {
          originalName: file.name,
          relativePath: text(form.relativePath),
          uploadedAt: nowIso(),
          source: text(form.source || "KY_ERP_UPLOAD"),
        },
      });
      created.push({
        id,
        fileName: file.name,
        storageKey,
        size: file.size,
        contentType: file.type,
      });
    }
    return c.json(
      {
        ok: rejected.length === 0,
        success: rejected.length === 0,
        data: {
          uploaded: created.length,
          rejected: rejected.length,
          files: created,
          errors: rejected,
        },
      },
      created.length ? 201 : 400,
    );
  });

  app.get("/api/desen/import/folder-status", async (c) => {
    return c.json({ ok: true, success: true, data: await storageStatus(c, slugOf(c)) });
  });

  app.post("/api/desen/import/folder-scan", async (c) => {
    const body = await bodyOf(c);
    return c.json({ ok: true, success: true, data: await storageStatus(c, slugOf(c, body)) });
  });

  app.post("/api/desen/import/open-folder", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    return c.json({
      ok: true,
      success: true,
      data: {
        opened: false,
        storageMode: "R2",
        path: `R2/desen/inbox/${slug}`,
        message:
          "Canlı sistemde yerel klasör açılamaz. Gelen Desenler ekranından R2 alanına yükleme yapın.",
      },
    });
  });

  app.get("/api/desen/havuz/storage-durum", async (c) => {
    return c.json({ ok: true, success: true, data: await storageStatus(c, slugOf(c)) });
  });
}
