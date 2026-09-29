// @ts-nocheck
import type { Context } from "hono";

type Bindings = Cloudflare.Env & { FILE_HUB_AGENT_KEY?: string };
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const LEGACY_CANONICAL_TENANT = "mecit-hakan";
const text = (value: unknown) => value == null ? "" : String(value).trim();
export const normalizeFileHubTenant = (value: unknown) => text(value).toLocaleLowerCase("tr-TR");

export function fileHubAgentTenantOf(c: Context<AppEnv>, body: Row = {}) {
  return normalizeFileHubTenant(
    body.mainCompanySlug ||
    body.main_company_slug ||
    c.req.header("X-KYERP-Tenant-Slug") ||
    c.req.query("mainCompanySlug") ||
    c.req.query("mainCompanyId"),
  );
}

export async function hashFileHubAgentSecret(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export function generateFileHubAgentSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function verifyFileHubAgentCredential(c: Context<AppEnv>, tenantValue: unknown) {
  const tenant = normalizeFileHubTenant(tenantValue);
  const presented = text(c.req.header("X-KYERP-Agent-Key"));
  if (!tenant || !presented) return { ok: false, tenant, mode: "NONE" };

  let credential: Row | null = null;
  try {
    credential = await c.env.DB.prepare(
      `SELECT id,main_company_slug,secret_hash,is_active
         FROM file_hub_agent_credentials
        WHERE main_company_slug=? LIMIT 1`,
    ).bind(tenant).first<Row>();
  } catch {
    credential = null;
  }

  // Once a tenant-specific credential exists it is authoritative. A wrong key
  // never falls back to the old global secret.
  if (credential) {
    if (Number(credential.is_active ?? 1) === 0) return { ok: false, tenant, mode: "TENANT" };
    const actualHash = await hashFileHubAgentSecret(presented);
    const ok = safeEqual(actualHash, text(credential.secret_hash));
    if (ok) {
      try {
        await c.env.DB.prepare(
          "UPDATE file_hub_agent_credentials SET last_used_at=? WHERE id=?",
        ).bind(new Date().toISOString(), credential.id).run();
      } catch {}
    }
    return { ok, tenant, mode: "TENANT" };
  }

  // Compatibility for the already-running Hakan Emprime agent only. The old
  // global key cannot be used to select any other tenant.
  if (tenant !== LEGACY_CANONICAL_TENANT) return { ok: false, tenant, mode: "NONE" };
  const legacy = text(c.env.FILE_HUB_AGENT_KEY);
  return {
    ok: Boolean(legacy && safeEqual(legacy, presented)),
    tenant,
    mode: "LEGACY_CANONICAL",
  };
}
