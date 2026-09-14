// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud.ts";
import { canUseAiPlatform } from "./ai-platform-access.ts";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const CHAT_ACCESS_SCOPE = "KYERP_CHAT_ACCESS";
const CHAT_AUDIT_SCOPE = "KYERP_CHAT_AUDIT";
const text = (v: unknown) => v === undefined || v === null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toUpperCase().replace(/İ/g, "I");
const nowIso = () => new Date().toISOString();

function isOwner(user: Row) {
  return ["ADMIN", "SUPER_ADMIN"].includes(upper(user?.role));
}

function permission(user: Row, moduleKey: string) {
  if (isOwner(user)) return { canView: true, canCreate: true, canUpdate: true, canDelete: true, canApprove: true };
  const key = upper(moduleKey);
  const row = (Array.isArray(user?.permissions) ? user.permissions : []).find((p: Row) => upper(p.moduleKey || p.module_key) === key);
  return {
    canView: Boolean(row?.canView ?? row?.can_view),
    canCreate: Boolean(row?.canCreate ?? row?.can_create),
    canUpdate: Boolean(row?.canUpdate ?? row?.can_update),
    canDelete: Boolean(row?.canDelete ?? row?.can_delete),
    canApprove: Boolean(row?.canApprove ?? row?.can_approve),
  };
}

function moduleFor(message: string) {
  const q = upper(message);
  if (/(AVANS|MAAS|MAAŞ|BORDRO|MESAI|MESAİ|KESINTI|KESİNTİ|YILLIK IZIN|YILLIK İZİN|PERSONEL)/.test(q)) return "IK";
  if (/(PDKS|KART BASTI|KART BAS|GELMEDI|GELMEDİ|GIRIS|GİRİŞ|CIKIS|ÇIKIŞ|DEVAMSIZ)/.test(q)) return "PDKS";
  if (/(FATURA|IRSALIYE|İRSALİYE|CARI|CARİ|TAHSILAT|TAHSİLAT|ODEME|ÖDEME|KDV|MUHASEBE|CEK|ÇEK)/.test(q)) return "MUHASEBE";
  if (/(E-BELGE|EBELGE|ISNET|İŞNET|E-FATURA|E-IRSALIYE|E-İRSALİYE)/.test(q)) return "ISNET";
  if (/(LOT|BOYA|BOYAHANE|RECETE|REÇETE|RENK|KIMYASAL|KİMYASAL)/.test(q)) return "BOYAHANE";
  if (/(DESEN|KALIP|YERLESIM|YERLEŞİM|PANTONE)/.test(q)) return "DESEN";
  if (/(URETIM|ÜRETİM|IMALAT|İMALAT|MAKINE|MAKİNE|VARDIYA|VARDİYA|MODEL)/.test(q)) return "IMALAT";
  if (/(MAIL|E-POSTA|EPOSTA|GELEN KUTUSU|TASLAK)/.test(q)) return "MAIL";
  if (/(DENETIM|DENETİM|CAPA|SEDEX|DISNEY|UYGUNLUK|EVRAK SURE|EVRAK SÜRE)/.test(q)) return "COMPLIANCE";
  if (/(DOSYA|DRIVE|ONEDRIVE|DEPOLAMA|SENKRON)/.test(q)) return "STORAGE_ADMIN";
  if (/(KULLANICI|YETKI|YETKİ|OTURUM|GUVENLIK|GÜVENLİK|FIRMA AYAR)/.test(q)) return "ADMIN";
  return "ASISTAN";
}

function actionFor(message: string) {
  const q = upper(message);
  const write = /(EKLE|YAZ|KAYDET|OLUSTUR|OLUŞTUR|DUZELT|DÜZELT|GUNCELLE|GÜNCELLE|SIL|SİL|GONDER|GÖNDER|ONAYLA|KAPAT|AC|AÇ|ATA|DUS|DÜŞ)/.test(q);
  const destructive = /(SIL|SİL|IPTAL|İPTAL|RESTORE|GERI YUKLE|GERİ YÜKLE|KAPAT|REVOKE)/.test(q);
  const approve = /(ONAYLA|GONDER|GÖNDER|KES|RESMI|RESMİ|E-FATURA|E-IRSALIYE|E-İRSALİYE)/.test(q);
  return { mode: write ? "WRITE" : "READ", destructive, approve };
}

async function accessPolicy(c: Context<AppEnv>, user: Row) {
  const userId = text(user?.id);
  const email = text(user?.email).toLocaleLowerCase("tr-TR");
  let stored: Row = {};
  try {
    const row = await c.env.DB.prepare(
      `SELECT data FROM json_store WHERE scope=? AND file_name=? ORDER BY updated_at DESC LIMIT 1`,
    ).bind(CHAT_ACCESS_SCOPE, userId).first<Row>();
    if (row?.data) stored = JSON.parse(text(row.data) || "{}");
  } catch {}
  const emailVerified = Boolean(user?.emailVerified || user?.security?.email_verified);
  const enabled = stored.enabled === undefined ? Boolean(email && emailVerified) : Boolean(stored.enabled);
  return {
    enabled,
    readEnabled: stored.readEnabled === undefined ? true : Boolean(stored.readEnabled),
    writeEnabled: stored.writeEnabled === undefined ? true : Boolean(stored.writeEnabled),
    approveEnabled: stored.approveEnabled === undefined ? isOwner(user) : Boolean(stored.approveEnabled),
    email,
    emailVerified,
    userId,
    mainCompanySlug: text(user?.mainCompanySlug || user?.security?.main_company_slug),
    role: text(user?.role),
    updatedAt: text(stored.updatedAt),
  };
}

async function putPolicy(c: Context<AppEnv>, user: Row, value: Row) {
  const policy = await accessPolicy(c, user);
  const ts = nowIso();
  const next = {
    enabled: value.enabled === undefined ? policy.enabled : Boolean(value.enabled),
    readEnabled: value.readEnabled === undefined ? policy.readEnabled : Boolean(value.readEnabled),
    writeEnabled: value.writeEnabled === undefined ? policy.writeEnabled : Boolean(value.writeEnabled),
    approveEnabled: value.approveEnabled === undefined ? policy.approveEnabled : Boolean(value.approveEnabled),
    email: policy.email,
    userId: policy.userId,
    mainCompanySlug: policy.mainCompanySlug,
    updatedAt: ts,
  };
  await c.env.DB.prepare(`DELETE FROM json_store WHERE scope=? AND file_name=?`).bind(CHAT_ACCESS_SCOPE, policy.userId).run();
  await c.env.DB.prepare(
    `INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,
  ).bind(crypto.randomUUID(), CHAT_ACCESS_SCOPE, policy.mainCompanySlug, policy.userId, JSON.stringify(next), ts, ts).run();
  return next;
}

async function audit(c: Context<AppEnv>, user: Row, action: string, detail: Row) {
  const ts = nowIso();
  try {
    await c.env.DB.prepare(
      `INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      CHAT_AUDIT_SCOPE,
      text(user?.mainCompanySlug || user?.security?.main_company_slug),
      `${text(user?.id)}-${Date.now()}`,
      JSON.stringify({ actorUserId: text(user?.id), actorEmail: text(user?.email), action, ...detail }),
      ts,
      ts,
    ).run();
  } catch {}
}

export function resolveCommandPolicy(user: Row, message: string, policy: Row) {
  const moduleKey = moduleFor(message);
  const action = actionFor(message);
  const p = permission(user, moduleKey === "ASISTAN" ? "ASISTAN" : moduleKey);
  const allowed = policy.enabled
    && (action.mode === "READ" ? policy.readEnabled && p.canView : policy.writeEnabled && (p.canCreate || p.canUpdate))
    && (!action.destructive || p.canDelete)
    && (!action.approve || (policy.approveEnabled && p.canApprove));
  let reason = "";
  if (!policy.enabled) reason = "CHAT_ACCESS_DISABLED";
  else if (action.mode === "READ" && !policy.readEnabled) reason = "CHAT_READ_DISABLED";
  else if (action.mode === "WRITE" && !policy.writeEnabled) reason = "CHAT_WRITE_DISABLED";
  else if (!p.canView && action.mode === "READ") reason = "MODULE_READ_FORBIDDEN";
  else if (!(p.canCreate || p.canUpdate) && action.mode === "WRITE") reason = "MODULE_WRITE_FORBIDDEN";
  else if (action.destructive && !p.canDelete) reason = "MODULE_DELETE_FORBIDDEN";
  else if (action.approve && (!policy.approveEnabled || !p.canApprove)) reason = "MODULE_APPROVE_FORBIDDEN";
  return {
    allowed,
    reason,
    moduleKey,
    mode: action.mode,
    destructive: action.destructive,
    requiresConfirmation: action.mode === "WRITE",
    requiresStrongConfirmation: action.destructive || action.approve,
    permission: p,
  };
}

export async function chatAccessFor(c: Context<AppEnv>, user: Row) {
  return accessPolicy(c, user);
}

export function registerErpCommandGatewayRoutes(app: Hono<AppEnv>) {
  app.get("/api/ai/command/identity", async (c) => {
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum gerekli." } }, 401);
    const policy = await accessPolicy(c, user);
    return c.json({
      ok: true,
      success: true,
      identity: {
        userId: text(user.id),
        email: text(user.email),
        emailVerified: Boolean(user.emailVerified || user?.security?.email_verified),
        fullName: text(user.fullName),
        role: text(user.role),
        mainCompanySlug: text(user.mainCompanySlug),
        permissions: user.permissions || [],
      },
      chatAccess: policy,
      security: {
        authoritySource: "KY_ERP_SESSION",
        emailIsLookupOnly: true,
        sharedConversationDoesNotTransferAuthority: true,
        permissionsReevaluatedOnEveryCommand: true,
      },
    });
  });

  app.put("/api/ai/command/access", async (c) => {
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum gerekli." } }, 401);
    let body: Row = {};
    try { body = await c.req.json(); } catch {}
    if (!text(user.email) || !Boolean(user.emailVerified || user?.security?.email_verified)) {
      return c.json({ ok: false, error: { code: "VERIFIED_EMAIL_REQUIRED", message: "Chat erişimi için ERP hesabında doğrulanmış e-posta gereklidir." } }, 409);
    }
    const policy = await putPolicy(c, user, body);
    await audit(c, user, "CHAT_ACCESS_UPDATED", { policy });
    return c.json({ ok: true, success: true, chatAccess: policy });
  });

  app.post("/api/ai/command/preview", async (c) => {
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum gerekli." } }, 401);
    let body: Row = {};
    try { body = await c.req.json(); } catch {}
    const message = text(body.message);
    if (!message) return c.json({ ok: false, error: { code: "MESSAGE_REQUIRED", message: "Komut boş olamaz." } }, 400);
    const policy = await accessPolicy(c, user);
    const resolved = resolveCommandPolicy(user, message, policy);
    const platform = upper(c.req.header("X-KYERP-AI-Platform"));
    if (platform) {
      const capability = resolved.mode === "READ" ? "read" : resolved.requiresStrongConfirmation ? "approve" : "write";
      const platformGate = await canUseAiPlatform(c, user, platform, capability);
      if (!platformGate.allowed) return c.json({ ok: false, error: { code: platformGate.code, message: "Bu AI platformu için gerekli KY ERP yetkisi açık değil." }, command: resolved }, 403);
    }
    await audit(c, user, "COMMAND_PREVIEW", { message, platform: platform || "KY_ERP", resolved });
    if (!resolved.allowed) {
      return c.json({ ok: false, error: { code: resolved.reason || "COMMAND_FORBIDDEN", message: "Bu komut için KY ERP yetkiniz bulunmuyor." }, command: resolved }, 403);
    }
    return c.json({
      ok: true,
      success: true,
      command: {
        ...resolved,
        actor: { userId: text(user.id), email: text(user.email), role: text(user.role), mainCompanySlug: text(user.mainCompanySlug) },
        message,
      },
    });
  });
}
