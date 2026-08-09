import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const MODEL_SCOPE = "DESEN_WORKFLOW_MODEL";
const BRIDGE_SCOPE = "DESEN_BRIDGE_STATUS";
const PREVIEW_MAX_BYTES = 2_500_000;
const THUMB_MAX_BYTES = 600_000;
const ONLINE_WINDOW_MS = 120_000;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nowIso = () => new Date().toISOString();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const normalize = (value: unknown) =>
  upper(value)
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
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

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

function errorBody(code: string, message: string, details?: unknown) {
  return {
    ok: false,
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

function safeName(value: unknown) {
  return text(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function areaName(code: string) {
  return ({
    FRONT: "Ön",
    BACK: "Arka",
    NECK: "Ense",
    NECK_LABEL: "Ense Etiket",
    LEFT_SLEEVE: "Sol Kol",
    RIGHT_SLEEVE: "Sağ Kol",
    LEFT_LEG: "Sol Paça",
    RIGHT_LEG: "Sağ Paça",
    POCKET: "Cep",
  } as Record<string, string>)[code] || "Ön";
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

async function modelRows(c: Context<AppEnv>, slug: string): Promise<Row[]> {
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  )
    .bind(MODEL_SCOPE, slug)
    .all<Row>();
  return (result.results || []).map((row) => ({
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  }));
}

async function saveModel(c: Context<AppEnv>, slug: string, model: Row): Promise<Row> {
  const timestamp = nowIso();
  const payload = {
    ...model,
    id: text(model.id),
    updatedAt: timestamp,
    createdAt: text(model.createdAt || timestamp),
  };
  const existing = await c.env.DB.prepare(
    `SELECT id FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      LIMIT 1`,
  )
    .bind(MODEL_SCOPE, payload.id, slug)
    .first<Row>();

  if (existing?.id) {
    await c.env.DB.prepare("UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(payload), timestamp, existing.id)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO json_store
        (id, scope, main_company_slug, file_name, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        MODEL_SCOPE,
        slug,
        payload.id,
        JSON.stringify(payload),
        timestamp,
        timestamp,
      )
      .run();
  }
  return payload;
}

async function saveBridgeStatus(c: Context<AppEnv>, slug: string, deviceName: string, data: Row) {
  const fileName = safeName(deviceName || "windows") || "windows";
  const timestamp = nowIso();
  const payload = {
    deviceName: fileName,
    ...data,
    lastSeenAt: timestamp,
    updatedAt: timestamp,
  };
  const existing = await c.env.DB.prepare(
    `SELECT id, data FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      LIMIT 1`,
  )
    .bind(BRIDGE_SCOPE, fileName, slug)
    .first<Row>();
  const merged = { ...objectOf(existing?.data), ...payload };
  if (existing?.id) {
    await c.env.DB.prepare("UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(merged), timestamp, existing.id)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO json_store
        (id, scope, main_company_slug, file_name, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        BRIDGE_SCOPE,
        slug,
        fileName,
        JSON.stringify(merged),
        timestamp,
        timestamp,
      )
      .run();
  }
  return merged;
}

async function bridgeStatuses(c: Context<AppEnv>, slug: string) {
  const result = await c.env.DB.prepare(
    `SELECT file_name, data, updated_at
       FROM json_store
      WHERE scope = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC`,
  )
    .bind(BRIDGE_SCOPE, slug)
    .all<Row>();
  const now = Date.now();
  const devices = (result.results || []).map((row) => {
    const payload = objectOf(row.data);
    const lastSeenAt = text(payload.lastSeenAt || row.updated_at);
    const lastSeenMs = Date.parse(lastSeenAt);
    return {
      ...payload,
      deviceName: text(payload.deviceName || row.file_name),
      lastSeenAt,
      online: Number.isFinite(lastSeenMs) && now - lastSeenMs <= ONLINE_WINDOW_MS,
    };
  });
  return {
    online: devices.some((row) => row.online),
    deviceCount: devices.length,
    onlineDeviceCount: devices.filter((row) => row.online).length,
    latest: devices[0] || null,
    devices,
  };
}

async function requireUser(c: Context<AppEnv>) {
  const user = await getAuthenticatedUser(c);
  if (!user) return null;
  const role = upper(user.role);
  const permission = Array.isArray(user.permissions)
    ? user.permissions.find((row: Row) => upper(row.moduleKey) === "DESEN")
    : null;
  if (role !== "ADMIN" && !permission?.canCreate && !permission?.canUpdate) return null;
  return user;
}

function formFile(form: Record<string, any>, name: string) {
  const candidate = form[name];
  if (candidate instanceof File) return candidate;
  if (Array.isArray(candidate)) return candidate.find((row) => row instanceof File) || null;
  return null;
}

function buildOperation(code: string, name: string, sequence: number) {
  return {
    id: crypto.randomUUID(),
    printAreaCode: code,
    printAreaName: name,
    sequence,
    moldType: "UNDEFINED",
    placementStatus: "WAITING",
    dyehouseStatus: "WAITING",
    productionReady: false,
    channels: [],
    colorGroups: [],
  };
}

async function deleteR2File(c: Context<AppEnv>, file: Row) {
  const keys = [text(file.storageKey), text(file.thumbnailStorageKey)].filter(Boolean);
  await Promise.all(keys.map((key) => c.env.FILES.delete(key).catch(() => {})));
}

export function registerDesenBridgeRoutes(app: Hono<AppEnv>) {
  app.get("/api/desen/bridge/status", async (c) => {
    const data = await bridgeStatuses(c, slugOf(c));
    return c.json({ ok: true, success: true, data });
  });

  app.post("/api/desen/bridge/heartbeat", async (c) => {
    const user = await requireUser(c);
    if (!user) return c.json(errorBody("UNAUTHORIZED", "Desen köprüsü için yetkili oturum gerekli."), 401);
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const deviceName = text(body.deviceName || "windows");
    const data = await saveBridgeStatus(c, slug, deviceName, {
      rootName: text(body.rootName),
      version: text(body.version || "2.0"),
      startedAt: text(body.startedAt),
      lastSyncAt: text(body.lastSyncAt),
      lastModelName: text(body.lastModelName),
      lastModelId: text(body.lastModelId),
      userId: text(user.id),
      username: text(user.username),
    });
    return c.json({ ok: true, success: true, data });
  });

  app.post("/api/desen/bridge/ingest", async (c) => {
    const user = await requireUser(c);
    if (!user) return c.json(errorBody("UNAUTHORIZED", "Desen köprüsü için yetkili oturum gerekli."), 401);

    const form = (await c.req.parseBody({ all: true })) as Record<string, any>;
    const slug = text(form.mainCompanySlug || form.mainCompanyId || "mecit-hakan");
    const modelName = text(form.modelName);
    const preview = formFile(form, "preview");
    const thumbnail = formFile(form, "thumbnail");
    const sourceSha256 = text(form.sourceSha256).toLowerCase();
    const sourceOriginalName = text(form.sourceOriginalName);
    const sourceRelativePath = text(form.sourceRelativePath);
    const sourceLocalSize = num(form.sourceLocalSize);
    const sourceModifiedAt = text(form.sourceModifiedAt);
    const printAreaCode = upper(form.printAreaCode || "FRONT") || "FRONT";
    const printAreaName = text(form.printAreaName || areaName(printAreaCode));

    if (!modelName) return c.json(errorBody("MODEL_NAME_REQUIRED", "Dosya adından model adı çıkarılamadı."), 400);
    if (!preview || !thumbnail) {
      return c.json(errorBody("WEB_IMAGES_REQUIRED", "Preview ve thumbnail WebP dosyaları zorunludur."), 400);
    }
    if (preview.type !== "image/webp" || thumbnail.type !== "image/webp") {
      return c.json(errorBody("WEBP_REQUIRED", "Canlı depoya yalnız WebP preview ve thumbnail kabul edilir."), 415);
    }
    if (preview.size > PREVIEW_MAX_BYTES || thumbnail.size > THUMB_MAX_BYTES) {
      return c.json(
        errorBody("WEB_IMAGE_TOO_LARGE", "Canlı desen görselleri boyut sınırını aşıyor.", {
          previewMaxBytes: PREVIEW_MAX_BYTES,
          thumbnailMaxBytes: THUMB_MAX_BYTES,
        }),
        413,
      );
    }

    const rows = await modelRows(c, slug);
    let current = rows.find(
      (row) => normalize(row.modelName || row.modelCode) === normalize(modelName) && upper(row.status) !== "ARCHIVE",
    );
    const created = !current;
    if (!current) {
      current = {
        id: crypto.randomUUID(),
        modelName,
        modelCode: modelName,
        companyId: "",
        companyName: "",
        status: "NEW_ARRIVAL",
        sourceType: "UXP_FOLDER_BRIDGE",
        operations: [],
        files: [],
        metadata: {},
        createdAt: nowIso(),
      };
    }

    const files = Array.isArray(current.files) ? current.files : [];
    const duplicate = sourceSha256
      ? files.find((row: Row) => text(row.sourceSha256).toLowerCase() === sourceSha256)
      : null;
    if (duplicate) {
      const status = await saveBridgeStatus(c, slug, text(c.req.header("X-KYERP-Device") || "windows"), {
        version: "2.0",
        lastSyncAt: nowIso(),
        lastModelName: current.modelName,
        lastModelId: current.id,
        username: text(user.username),
      });
      return c.json({
        ok: true,
        success: true,
        data: {
          duplicate: true,
          created: false,
          modelId: current.id,
          modelName: current.modelName,
          fileId: duplicate.id,
          bridge: status,
        },
      });
    }

    const fileId = crypto.randomUUID();
    const rootKey = `desen/models/${slug}/${current.id}/live`;
    const previewKey = `${rootKey}/${fileId}.webp`;
    const thumbKey = `${rootKey}/${fileId}-thumb.webp`;
    const metadata = {
      modelId: text(current.id),
      modelName: safeName(modelName),
      printAreaCode,
      source: "UXP_FOLDER_BRIDGE",
      sourceOriginalName: safeName(sourceOriginalName),
      sourceSha256: sourceSha256.slice(0, 64),
      uploadedAt: nowIso(),
    };

    await c.env.FILES.put(previewKey, preview.stream(), {
      httpMetadata: { contentType: "image/webp" },
      customMetadata: metadata,
    });
    try {
      await c.env.FILES.put(thumbKey, thumbnail.stream(), {
        httpMetadata: { contentType: "image/webp" },
        customMetadata: { ...metadata, variant: "thumbnail" },
      });
    } catch (error) {
      await c.env.FILES.delete(previewKey).catch(() => {});
      throw error;
    }

    const newFile: Row = {
      id: fileId,
      fileName: `${safeName(modelName)}.webp`,
      storageKey: previewKey,
      thumbnailStorageKey: thumbKey,
      thumbnailUrl: `/api/desen/bridge/files/${encodeURIComponent(fileId)}/thumb`,
      role: "MODEL_IMAGE",
      printAreaCode,
      contentType: "image/webp",
      size: preview.size,
      thumbnailSize: thumbnail.size,
      bridgeManaged: true,
      sourceSha256,
      sourceOriginalName,
      sourceRelativePath,
      sourceLocalSize,
      sourceModifiedAt,
      uploadedBy: text(user.username),
      createdAt: nowIso(),
    };

    const revised = files.map((row: Row) =>
      text(row.printAreaCode || "FRONT") === printAreaCode && text(row.role) === "MODEL_IMAGE"
        ? { ...row, role: "REVISION_IMAGE" }
        : row,
    );
    const areaRevisions = revised
      .filter(
        (row: Row) =>
          row.bridgeManaged === true &&
          text(row.printAreaCode || "FRONT") === printAreaCode &&
          text(row.role) === "REVISION_IMAGE",
      )
      .sort((a: Row, b: Row) => text(b.createdAt).localeCompare(text(a.createdAt)));
    const keepRevisionIds = new Set(areaRevisions.slice(0, 2).map((row: Row) => text(row.id)));
    const dropped = revised.filter(
      (row: Row) =>
        row.bridgeManaged === true &&
        text(row.printAreaCode || "FRONT") === printAreaCode &&
        text(row.role) === "REVISION_IMAGE" &&
        !keepRevisionIds.has(text(row.id)),
    );
    const retained = revised.filter((row: Row) => !dropped.includes(row));

    const operations = Array.isArray(current.operations) ? [...current.operations] : [];
    if (!operations.some((row: Row) => text(row.printAreaCode) === printAreaCode)) {
      operations.push(buildOperation(printAreaCode, printAreaName, operations.length + 1));
    }

    const saved = await saveModel(c, slug, {
      ...current,
      id: current.id,
      modelName: text(current.modelName || modelName),
      modelCode: text(current.modelCode || modelName),
      status: text(current.status || "NEW_ARRIVAL"),
      sourceType: text(current.sourceType || "UXP_FOLDER_BRIDGE"),
      operations,
      files: [newFile, ...retained],
      metadata: {
        ...objectOf(current.metadata),
        bridge: {
          enabled: true,
          lastSourceOriginalName: sourceOriginalName,
          lastSourceRelativePath: sourceRelativePath,
          lastSourceSha256: sourceSha256,
          lastSyncAt: nowIso(),
          liveStoragePolicy: "WEBP_PREVIEW_THUMB_ONLY",
          previewMaxPx: 1600,
          thumbnailMaxPx: 420,
          retainedRevisionsPerArea: 2,
        },
      },
    });

    await Promise.all(dropped.map((row: Row) => deleteR2File(c, row)));
    const status = await saveBridgeStatus(c, slug, text(c.req.header("X-KYERP-Device") || "windows"), {
      version: "2.0",
      lastSyncAt: nowIso(),
      lastModelName: saved.modelName,
      lastModelId: saved.id,
      username: text(user.username),
    });

    return c.json(
      {
        ok: true,
        success: true,
        data: {
          duplicate: false,
          created,
          modelId: saved.id,
          modelName: saved.modelName,
          fileId,
          previewBytes: preview.size,
          thumbnailBytes: thumbnail.size,
          removedOldRevisionCount: dropped.length,
          bridge: status,
        },
      },
      created ? 201 : 200,
    );
  });

  app.get("/api/desen/bridge/files/:id/thumb", async (c) => {
    const slug = slugOf(c);
    const rows = await modelRows(c, slug);
    let file: Row | null = null;
    for (const model of rows) {
      file = (Array.isArray(model.files) ? model.files : []).find(
        (row: Row) => text(row.id) === c.req.param("id"),
      ) || null;
      if (file) break;
    }
    const key = text(file?.thumbnailStorageKey || file?.storageKey);
    if (!key) return c.json(errorBody("NOT_FOUND", "Desen küçük görseli bulunamadı."), 404);
    const object = await c.env.FILES.get(key);
    if (!object) return c.json(errorBody("NOT_FOUND", "R2 küçük görseli bulunamadı."), 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=86400");
    return new Response(object.body, { headers });
  });
}
