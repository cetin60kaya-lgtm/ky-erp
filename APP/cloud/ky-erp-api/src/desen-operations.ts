import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const MODEL_SCOPE = "DESEN_WORKFLOW_MODEL";

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

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
    c.req.header("X-KYERP-Tenant-Slug") ||
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

async function models(c: Context<AppEnv>, slug: string): Promise<Row[]> {
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data
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
  }));
}

async function saveModel(c: Context<AppEnv>, slug: string, model: Row) {
  const now = new Date().toISOString();
  const fileName = text(model.id || model.fileName);
  if (!fileName) throw new Error("Model kimliği bulunamadı.");
  const existing = await c.env.DB.prepare(
    `SELECT id FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      LIMIT 1`,
  )
    .bind(MODEL_SCOPE, fileName, slug)
    .first<Row>();
  if (!existing?.id) throw new Error("Desen modeli bulunamadı.");
  const payload = { ...model, id: fileName, updatedAt: now };
  await c.env.DB.prepare(
    "UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?",
  )
    .bind(JSON.stringify(payload), now, existing.id)
    .run();
  return payload;
}

async function findOperation(
  c: Context<AppEnv>,
  slug: string,
  operationId: string,
) {
  for (const model of await models(c, slug)) {
    const operations = Array.isArray(model.operations) ? model.operations : [];
    const operationIndex = operations.findIndex(
      (operation: Row) => text(operation.id) === operationId,
    );
    if (operationIndex >= 0) {
      return { model, operations, operationIndex, operation: operations[operationIndex] };
    }
  }
  return null;
}

async function findChannel(
  c: Context<AppEnv>,
  slug: string,
  channelId: string,
) {
  for (const model of await models(c, slug)) {
    const operations = Array.isArray(model.operations) ? model.operations : [];
    for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
      const channels = Array.isArray(operations[operationIndex].channels)
        ? operations[operationIndex].channels
        : [];
      const channelIndex = channels.findIndex(
        (channel: Row) => text(channel.id) === channelId,
      );
      if (channelIndex >= 0) {
        return {
          model,
          operations,
          operationIndex,
          operation: operations[operationIndex],
          channels,
          channelIndex,
          channel: channels[channelIndex],
        };
      }
    }
  }
  return null;
}

async function findGroup(c: Context<AppEnv>, slug: string, groupId: string) {
  for (const model of await models(c, slug)) {
    const operations = Array.isArray(model.operations) ? model.operations : [];
    for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
      const groups = Array.isArray(operations[operationIndex].colorGroups)
        ? operations[operationIndex].colorGroups
        : [];
      const groupIndex = groups.findIndex(
        (group: Row) => text(group.id) === groupId,
      );
      if (groupIndex >= 0) {
        return {
          model,
          operations,
          operationIndex,
          operation: operations[operationIndex],
          groups,
          groupIndex,
          group: groups[groupIndex],
        };
      }
    }
  }
  return null;
}

function operationTotals(operation: Row) {
  const channels = (Array.isArray(operation.channels) ? operation.channels : []).filter(
    (channel: Row) => channel.included !== false,
  );
  const groups = Array.isArray(operation.colorGroups) ? operation.colorGroups : [];
  const groupKeys = new Set(
    channels
      .map((channel: Row) =>
        text(channel.colorGroupId || channel.groupKey || channel.colorCode),
      )
      .filter(Boolean),
  );
  groups.forEach((group: Row) => {
    const key = text(group.id || group.groupKey || group.colorCode);
    if (key) groupKeys.add(key);
  });
  const registered = new Set(
    [
      ...channels.map((channel: Row) => text(channel.registeredColorId)),
      ...groups.map((group: Row) => text(group.registeredColorId)),
    ].filter(Boolean),
  );
  return {
    operationId: text(operation.id),
    printAreaCode: text(operation.printAreaCode),
    printAreaName: text(operation.printAreaName),
    channelCount: channels.length,
    moldCount: channels.reduce(
      (sum: number, channel: Row) => sum + Math.max(1, num(channel.moldCount || 1)),
      0,
    ),
    uniqueColorCount: groupKeys.size,
    registeredColorCount: registered.size,
    unresolvedColorCount: Math.max(0, groupKeys.size - registered.size),
    placementStatus: text(operation.placementStatus || "WAITING"),
    dyehouseStatus: text(operation.dyehouseStatus || "WAITING"),
    productionReady:
      text(operation.placementStatus) === "READY" &&
      Math.max(0, groupKeys.size - registered.size) === 0,
  };
}

export function registerDesenOperationRoutes(app: Hono<AppEnv>) {
  app.post(
    "/api/desen/workflow/operations/:operationId/channels/reorder",
    async (c) => {
      const body = await bodyOf(c);
      const slug = slugOf(c, body);
      const found = await findOperation(c, slug, c.req.param("operationId"));
      if (!found) {
        return c.json(errorBody("NOT_FOUND", "Baskı bölgesi bulunamadı."), 404);
      }
      const channelIds = Array.isArray(body.channelIds)
        ? body.channelIds.map(text).filter(Boolean)
        : [];
      const channels = Array.isArray(found.operation.channels)
        ? found.operation.channels
        : [];
      if (
        channelIds.length !== channels.length ||
        new Set(channelIds).size !== channels.length ||
        channels.some((channel: Row) => !channelIds.includes(text(channel.id)))
      ) {
        return c.json(
          errorBody(
            "INVALID_CHANNEL_ORDER",
            "Kanal sıralaması mevcut kanalların tamamını bir kez içermelidir.",
          ),
          400,
        );
      }
      const byId = new Map<string, Row>(
        channels.map((channel: Row) => [text(channel.id), channel]),
      );
      const ordered: Row[] = channelIds.map((id: string, index: number) => ({
        ...(byId.get(id) || {}),
        sequence: index + 1,
      }));
      const operations = [...found.operations];
      operations[found.operationIndex] = {
        ...found.operation,
        channels: ordered,
      };
      const data = await saveModel(c, slug, { ...found.model, operations });
      return c.json({ ok: true, success: true, data });
    },
  );

  app.delete("/api/desen/workflow/channels/:channelId", async (c) => {
    const slug = slugOf(c);
    const found = await findChannel(c, slug, c.req.param("channelId"));
    if (!found) return c.json(errorBody("NOT_FOUND", "Kanal bulunamadı."), 404);
    if (text(found.operation.dyehouseStatus) === "COMPLETED") {
      return c.json(
        errorBody(
          "CHANNEL_LOCKED",
          "Boyahane işlemi tamamlanmış kanal silinemez; hariç bırakılmalıdır.",
        ),
        409,
      );
    }
    const channels = found.channels
      .filter((_channel: Row, index: number) => index !== found.channelIndex)
      .map((channel: Row, index: number) => ({ ...channel, sequence: index + 1 }));
    const operations = [...found.operations];
    operations[found.operationIndex] = { ...found.operation, channels };
    const data = await saveModel(c, slug, { ...found.model, operations });
    return c.json({ ok: true, success: true, data });
  });

  app.put("/api/desen/workflow/color-groups/:groupId", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const found = await findGroup(c, slug, c.req.param("groupId"));
    if (!found) {
      return c.json(errorBody("NOT_FOUND", "Renk grubu bulunamadı."), 404);
    }
    const groups = [...found.groups];
    groups[found.groupIndex] = {
      ...found.group,
      ...body,
      id: found.group.id,
      groupKey: text(body.groupKey || found.group.groupKey || found.group.id),
      displayName: text(
        body.displayName ||
          found.group.displayName ||
          body.groupKey ||
          found.group.groupKey,
      ),
      moldCount: Math.max(1, num(body.moldCount ?? found.group.moldCount ?? 1)),
    };
    const operations = [...found.operations];
    operations[found.operationIndex] = { ...found.operation, colorGroups: groups };
    const data = await saveModel(c, slug, { ...found.model, operations });
    return c.json({ ok: true, success: true, data });
  });

  app.get(
    "/api/desen/workflow/operations/:operationId/totals",
    async (c) => {
      const slug = slugOf(c);
      const found = await findOperation(c, slug, c.req.param("operationId"));
      if (!found) {
        return c.json(errorBody("NOT_FOUND", "Baskı bölgesi bulunamadı."), 404);
      }
      return c.json({
        ok: true,
        success: true,
        data: operationTotals(found.operation),
      });
    },
  );
}
