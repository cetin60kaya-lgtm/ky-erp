// @ts-nocheck
import type { Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Env = { Bindings: Cloudflare.Env };
type Row = Record<string, any>;

const SCOPE = "UI_DIALOG_LAYOUT_V1";
const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const MAX_WIDTH = 1800;
const MAX_HEIGHT = 1200;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const roleCode = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const ownerRole = (value: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(roleCode(value));
const validKey = (value: string) => /^[a-z0-9][a-z0-9._-]{2,119}$/i.test(value);
const clamp = (value: unknown, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));

function parseLayout(value: unknown) {
  if (!value) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const width = Number(parsed?.width);
    const height = Number(parsed?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return {
      width: clamp(width, MIN_WIDTH, MAX_WIDTH),
      height: clamp(height, MIN_HEIGHT, MAX_HEIGHT),
    };
  } catch {
    return null;
  }
}

async function readLayout(c: any, key: string) {
  const row = await c.env.DB.prepare(
    `SELECT id,data,updated_at FROM json_store
      WHERE scope=? AND file_name=? AND main_company_slug IS NULL
      ORDER BY updated_at DESC LIMIT 1`,
  ).bind(SCOPE, key).first<Row>();
  if (!row) return null;
  return { id: text(row.id), layout: parseLayout(row.data), updatedAt: text(row.updated_at) };
}

export function registerUiDialogLayoutRoutes(app: Hono<Env>) {
  app.get("/api/ui/dialog-layouts/:key", async (c) => {
    const user = await getAuthenticatedUser(c);
    if (!user) return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum gereklidir." } }, 401);
    const key = decodeURIComponent(c.req.param("key") || "");
    if (!validKey(key)) return c.json({ ok: false, error: { code: "INVALID_DIALOG_KEY", message: "Geçersiz pencere anahtarı." } }, 400);
    const current = await readLayout(c, key);
    return c.json({ ok: true, data: { key, layout: current?.layout || null, updatedAt: current?.updatedAt || null, canPersist: ownerRole(user.role) } });
  });

  app.put("/api/ui/dialog-layouts/:key", async (c) => {
    const user = await getAuthenticatedUser(c);
    if (!user) return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum gereklidir." } }, 401);
    if (!ownerRole(user.role)) {
      return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Ortak pencere ölçüsünü yalnız uygulama sahibi değiştirebilir." } }, 403);
    }
    const key = decodeURIComponent(c.req.param("key") || "");
    if (!validKey(key)) return c.json({ ok: false, error: { code: "INVALID_DIALOG_KEY", message: "Geçersiz pencere anahtarı." } }, 400);
    const body = await c.req.json().catch(() => ({}));
    const width = Number(body?.width);
    const height = Number(body?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return c.json({ ok: false, error: { code: "INVALID_DIALOG_SIZE", message: "Pencere en ve boy bilgisi geçersiz." } }, 400);
    }
    const layout = { width: clamp(width, MIN_WIDTH, MAX_WIDTH), height: clamp(height, MIN_HEIGHT, MAX_HEIGHT) };
    const current = await readLayout(c, key);
    const now = new Date().toISOString();
    const payload = JSON.stringify(layout);
    if (current?.id) {
      await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?").bind(payload, now, current.id).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO json_store (id,scope,main_company_slug,file_name,data,created_at,updated_at)
         VALUES (?,?,NULL,?,?,?,?)`,
      ).bind(crypto.randomUUID(), SCOPE, key, payload, now, now).run();
    }
    return c.json({ ok: true, data: { key, layout, updatedAt: now, canPersist: true } });
  });
}
