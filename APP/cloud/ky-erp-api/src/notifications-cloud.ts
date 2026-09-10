// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud.ts";
import { hasNotificationPermission, NOTIFICATION_MAX_READ_IDS, sanitizeNotificationReadIds } from "./notifications-core.ts";

const READ_SCOPE = "SYSTEM_NOTIFICATIONS_READ_V1";
const SECURITY_GRANT_SCOPE = "AUTH_SECURITY_CAPABILITY_GRANT";
const SECURITY_PREF_SCOPE = "AUTH_SECURITY_NOTIFICATION_PREF";
const MAX_READ_IDS = NOTIFICATION_MAX_READ_IDS;

type AnyRow = Record<string, any>;

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function upper(value: unknown) {
  return text(value).toUpperCase().replace(/İ/g, "I");
}

function ownerRole(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}

function companyAdminRole(role: unknown) {
  return upper(role) === "COMPANY_ADMIN";
}

function objectOf(value: unknown): AnyRow {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRow;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function tableExists(c: any, tableName: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  ).bind(tableName).first<AnyRow>();
  return Boolean(row?.name);
}

function stateId(current: AnyRow, tenant: string) {
  return `system-notification-read:${tenant}:${text(current?.id)}`;
}

async function readState(c: any, current: AnyRow, tenant: string) {
  if (!(await tableExists(c, "json_store"))) return new Set<string>();
  const row = await c.env.DB.prepare(
    "SELECT data FROM json_store WHERE id=? LIMIT 1",
  ).bind(stateId(current, tenant)).first<AnyRow>();
  if (!row?.data) return new Set<string>();
  try {
    const payload = JSON.parse(text(row.data));
    return new Set(sanitizeNotificationReadIds(payload?.readIds));
  } catch {
    return new Set<string>();
  }
}

async function writeState(c: any, current: AnyRow, tenant: string, ids: string[]) {
  if (!(await tableExists(c, "json_store"))) return false;
  const timestamp = new Date().toISOString();
  const id = stateId(current, tenant);
  const data = JSON.stringify({ readIds: ids.slice(-MAX_READ_IDS), updatedAt: timestamp });
  await c.env.DB.prepare(
    `INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       scope=excluded.scope,
       main_company_slug=excluded.main_company_slug,
       file_name=excluded.file_name,
       data=excluded.data,
       updated_at=excluded.updated_at`,
  ).bind(id, READ_SCOPE, tenant, text(current.id), data, timestamp, timestamp).run();
  return true;
}

function requestedTenant(c: any, current: AnyRow) {
  const requested = text(c.req.query("mainCompanySlug") || c.req.header("X-KYERP-Tenant-Slug"));
  const own = text(current?.mainCompanySlug || current?.security?.main_company_slug);
  if (ownerRole(current?.role)) return requested || own;
  if (requested && own && requested !== own) return "";
  return own;
}

async function hasDelegatedLoginApproval(c: any, current: AnyRow, tenant: string) {
  if (!tenant || !(await tableExists(c, "json_store"))) return false;
  const row = await c.env.DB.prepare(
    `SELECT data FROM json_store
      WHERE scope=? AND main_company_slug=? AND file_name=?
      ORDER BY updated_at DESC,id DESC LIMIT 1`,
  ).bind(SECURITY_GRANT_SCOPE, tenant, `${tenant}:${text(current.id)}`).first<AnyRow>();
  if (!row?.data) return false;
  const grant = objectOf(row.data);
  if (grant.isActive === false) return false;
  const capabilities = Array.isArray(grant.capabilities) ? grant.capabilities.map(upper) : [];
  return capabilities.includes("LOGIN_APPROVE");
}

async function securityNotificationEnabled(c: any, current: AnyRow, key: string, fallback = true) {
  if (!(await tableExists(c, "json_store"))) return fallback;
  const row = await c.env.DB.prepare(
    `SELECT data FROM json_store WHERE scope=? AND file_name=? ORDER BY updated_at DESC,id DESC LIMIT 1`,
  ).bind(SECURITY_PREF_SCOPE, text(current.id)).first<AnyRow>();
  if (!row?.data) return fallback;
  const payload = objectOf(row.data);
  const preferences = objectOf(payload.preferences);
  return preferences[key] === undefined ? fallback : Boolean(preferences[key]);
}

function toIso(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw;
}

function dateOnly(value: unknown) {
  const raw = text(value);
  return raw ? raw.slice(0, 10) : "";
}

function notificationSort(a: AnyRow, b: AnyRow) {
  const severity = { critical: 3, warning: 2, info: 1 };
  const severityDiff = (severity[b.severity] || 0) - (severity[a.severity] || 0);
  if (severityDiff) return severityDiff;
  return Date.parse(b.createdAt || "0") - Date.parse(a.createdAt || "0");
}

async function collectLoginApprovals(c: any, current: AnyRow, tenant: string) {
  const delegated = !ownerRole(current?.role) && !companyAdminRole(current?.role)
    ? await hasDelegatedLoginApproval(c, current, tenant)
    : false;
  const canApprove = ownerRole(current?.role) || companyAdminRole(current?.role) || delegated;
  if (!canApprove || !(await tableExists(c, "auth_login_approvals"))) return [];
  if (!(await securityNotificationEnabled(c, current, "companyLoginRequests", true))) return [];

  const now = new Date().toISOString();
  const result = ownerRole(current?.role)
    ? await c.env.DB.prepare(
        `SELECT a.id,a.user_id,a.main_company_slug,a.device_label,a.ip_address,a.requested_at,a.expires_at,
                COALESCE(NULLIF(TRIM(u.full_name),''),u.username,'Kullanıcı') AS user_name
           FROM auth_login_approvals a
           LEFT JOIN auth_users u ON u.id=a.user_id
          WHERE UPPER(COALESCE(a.status,''))='PENDING'
            AND a.expires_at>?
          ORDER BY a.requested_at DESC
          LIMIT 30`,
      ).bind(now).all<AnyRow>()
    : await c.env.DB.prepare(
        `SELECT a.id,a.user_id,a.main_company_slug,a.device_label,a.ip_address,a.requested_at,a.expires_at,
                COALESCE(NULLIF(TRIM(u.full_name),''),u.username,'Kullanıcı') AS user_name
           FROM auth_login_approvals a
           LEFT JOIN auth_users u ON u.id=a.user_id
           LEFT JOIN auth_user_security us ON us.user_id=a.user_id
          WHERE UPPER(COALESCE(a.status,''))='PENDING'
            AND a.expires_at>?
            AND COALESCE(NULLIF(TRIM(a.main_company_slug),''),?)=?
            AND UPPER(COALESCE(NULLIF(TRIM(us.role_override),''),NULLIF(TRIM(u.platform_role),''),NULLIF(TRIM(u.role),''),'VIEWER')) NOT IN ('SUPER_ADMIN','ADMIN')
          ORDER BY a.requested_at DESC
          LIMIT 12`,
      ).bind(now, tenant, tenant).all<AnyRow>();

  return (result.results || []).map((row: AnyRow) => ({
    id: `login-approval:${text(row.id)}`,
    category: "SECURITY",
    severity: "warning",
    title: "Bekleyen giriş onayı",
    detail: [ownerRole(current?.role) ? text(row.main_company_slug) : "", text(row.user_name), text(row.device_label) || "Yeni cihaz"].filter(Boolean).join(" · "),
    createdAt: toIso(row.requested_at),
    route: ownerRole(current?.role)
      ? { moduleKey: "admin", tabKey: "uygulama-sahibi" }
      : { moduleKey: "admin", tabKey: "kullanicilar" },
    meta: {
      approvalId: text(row.id),
      actionable: true,
      securityCenter: true,
      userId: text(row.user_id),
      mainCompanySlug: text(row.main_company_slug),
      expiresAt: toIso(row.expires_at),
    },
  }));
}

async function collectMailApprovals(c: any, current: AnyRow, tenant: string) {
  if (
    !(ownerRole(current?.role) || companyAdminRole(current?.role)) ||
    !(await tableExists(c, "mail_approval_requests")) ||
    !(await tableExists(c, "mail_accounts"))
  ) return [];

  const result = ownerRole(current?.role)
    ? await c.env.DB.prepare(
        `SELECT r.id,r.main_company_slug,r.created_at,r.request_type,
                a.email_address,a.display_name,a.provider_type,a.account_type,a.department_code
           FROM mail_approval_requests r
           JOIN mail_accounts a ON a.id=r.target_id AND a.main_company_slug=r.main_company_slug
          WHERE UPPER(COALESCE(r.status,''))='PENDING'
          ORDER BY r.created_at DESC
          LIMIT 30`,
      ).all<AnyRow>()
    : await c.env.DB.prepare(
        `SELECT r.id,r.main_company_slug,r.created_at,r.request_type,
                a.email_address,a.display_name,a.provider_type,a.account_type,a.department_code
           FROM mail_approval_requests r
           JOIN mail_accounts a ON a.id=r.target_id AND a.main_company_slug=r.main_company_slug
          WHERE UPPER(COALESCE(r.status,''))='PENDING'
            AND r.main_company_slug=?
          ORDER BY r.created_at DESC
          LIMIT 20`,
      ).bind(tenant).all<AnyRow>();

  return (result.results || []).map((row: AnyRow) => ({
    id: `mail-approval:${text(row.id)}`,
    category: "APPROVAL",
    severity: "warning",
    title: "Mail hesabı firma sahibi / Süper Yönetici onayı bekliyor",
    detail: [
      ownerRole(current?.role) ? text(row.main_company_slug) : "",
      text(row.display_name) || text(row.email_address),
      text(row.provider_type),
      text(row.department_code),
    ].filter(Boolean).join(" · "),
    createdAt: toIso(row.created_at),
    route: { moduleKey: "depolama", tabKey: "depolama-mail" },
    meta: { requestId: text(row.id), mainCompanySlug: text(row.main_company_slug), emailAddress: text(row.email_address) },
  }));
}

async function collectEBelgeIssues(c: any, current: AnyRow, tenant: string) {
  if (
    !hasNotificationPermission(current, ["ISNET", "BELGE_ISLEM", "MUHASEBE"]) ||
    !(await tableExists(c, "accounting_documents")) ||
    !(await tableExists(c, "accounting_document_issues"))
  ) return [];

  const result = await c.env.DB.prepare(
    `SELECT d.id AS document_id,d.document_no,d.party_name,d.document_type,d.updated_at,
            COUNT(i.id) AS issue_count,
            SUM(CASE WHEN UPPER(COALESCE(i.severity,'')) IN ('ERROR','CRITICAL') THEN 1 ELSE 0 END) AS critical_count,
            MAX(i.created_at) AS latest_issue_at
       FROM accounting_documents d
       JOIN accounting_document_issues i
         ON i.document_id=d.id AND i.main_company_slug=d.main_company_slug
      WHERE d.main_company_slug=?
        AND d.deleted_at IS NULL
        AND COALESCE(i.is_resolved,0)=0
      GROUP BY d.id,d.document_no,d.party_name,d.document_type,d.updated_at
      ORDER BY critical_count DESC,latest_issue_at DESC
      LIMIT 12`,
  ).bind(tenant).all<AnyRow>();

  return (result.results || []).map((row: AnyRow) => {
    const issueCount = Number(row.issue_count || 0);
    const criticalCount = Number(row.critical_count || 0);
    const stamp = toIso(row.latest_issue_at || row.updated_at);
    return {
      id: `ebelge-issue:${text(row.document_id)}:${issueCount}:${stamp}`,
      category: "E_BELGE",
      severity: criticalCount > 0 ? "critical" : "warning",
      title: `${text(row.document_no) || "Belge"} inceleme bekliyor`,
      detail: [issueCount ? `${issueCount} açık sorun` : "İnceleme gerekli", text(row.party_name)].filter(Boolean).join(" · "),
      createdAt: stamp,
      route: { moduleKey: "isnet", tabKey: "e-belge-onay-sorunlar" },
      meta: { documentId: text(row.document_id), documentType: text(row.document_type), issueCount },
    };
  });
}

async function collectPaymentReminders(c: any, current: AnyRow, tenant: string) {
  if (
    !hasNotificationPermission(current, ["MUHASEBE", "CEK_ODEME"]) ||
    !(await tableExists(c, "accounting_payment_plans"))
  ) return [];

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const result = await c.env.DB.prepare(
    `SELECT id,counterparty_name,amount,currency,planned_date,due_date,status,priority,reminder_at,updated_at
       FROM accounting_payment_plans
      WHERE main_company_slug=?
        AND cancelled_at IS NULL
        AND UPPER(COALESCE(status,'')) NOT IN ('PAID','CANCELLED')
        AND (
          UPPER(COALESCE(status,'')) IN ('DUE','OVERDUE')
          OR (COALESCE(NULLIF(TRIM(due_date),''),NULLIF(TRIM(planned_date),'')) IS NOT NULL
              AND SUBSTR(COALESCE(NULLIF(TRIM(due_date),''),NULLIF(TRIM(planned_date),'')),1,10)<=?)
          OR (COALESCE(reminder_enabled,0)=1 AND reminder_at IS NOT NULL AND reminder_at<=?)
        )
      ORDER BY COALESCE(NULLIF(TRIM(due_date),''),NULLIF(TRIM(planned_date),''),updated_at) ASC
      LIMIT 12`,
  ).bind(tenant, today, now).all<AnyRow>();

  return (result.results || []).map((row: AnyRow) => {
    const dueAt = dateOnly(row.due_date || row.planned_date);
    const overdue = upper(row.status) === "OVERDUE" || Boolean(dueAt && dueAt < today);
    const amount = Number(row.amount || 0);
    return {
      id: `payment-due:${text(row.id)}:${dueAt || text(row.status)}`,
      category: "PAYMENT",
      severity: overdue ? "critical" : "warning",
      title: overdue ? "Ödeme vadesi geçti" : "Ödeme zamanı geldi",
      detail: [text(row.counterparty_name), amount ? `${amount.toLocaleString("tr-TR")} ${text(row.currency) || "TRY"}` : "", dueAt].filter(Boolean).join(" · "),
      createdAt: toIso(row.reminder_at || row.due_date || row.planned_date || row.updated_at),
      route: { moduleKey: "muhasebe", tabKey: "cek-odeme" },
      meta: { paymentPlanId: text(row.id), dueAt, status: text(row.status), priority: text(row.priority) },
    };
  });
}

async function collectNotifications(c: any, current: AnyRow, tenant: string) {
  const items: AnyRow[] = [];
  const sourceErrors: string[] = [];

  for (const [source, collector] of [
    ["SECURITY", collectLoginApprovals],
    ["APPROVAL", collectMailApprovals],
    ["E_BELGE", collectEBelgeIssues],
    ["PAYMENT", collectPaymentReminders],
  ] as const) {
    try {
      items.push(...await collector(c, current, tenant));
    } catch (error) {
      sourceErrors.push(source);
      console.error(JSON.stringify({
        level: "error",
        phase: "NOTIFICATION_SOURCE",
        source,
        requestId: text(c.get?.("requestId")) || "unknown",
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return { items: items.sort(notificationSort).slice(0, 30), sourceErrors };
}

export function registerNotificationRoutes(app: any) {
  app.get("/api/notifications", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum gereklidir." } }, 401);
    const tenant = requestedTenant(c, current);
    if (!tenant) return c.json({ ok: false, error: { code: "TENANT_FORBIDDEN", message: "Bu firma bildirimlerine erişim yetkiniz yok." } }, 403);

    const [{ items, sourceErrors }, readIds] = await Promise.all([
      collectNotifications(c, current, tenant),
      readState(c, current, tenant),
    ]);
    const data = items.map((item) => ({ ...item, unread: !readIds.has(item.id) }));
    return c.json({
      ok: true,
      data: {
        items: data,
        unreadCount: data.filter((item) => item.unread).length,
        totalCount: data.length,
        partial: sourceErrors.length > 0,
        sourceErrors,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  app.post("/api/notifications/read", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum gereklidir." } }, 401);
    const tenant = requestedTenant(c, current);
    if (!tenant) return c.json({ ok: false, error: { code: "TENANT_FORBIDDEN", message: "Bu firma bildirimlerine erişim yetkiniz yok." } }, 403);

    let body: AnyRow = {};
    try { body = await c.req.json(); } catch { body = {}; }
    const incoming = sanitizeNotificationReadIds(body.ids);
    if (!incoming.length) return c.json({ ok: true, data: { readCount: 0 } });

    const existing = await readState(c, current, tenant);
    for (const id of incoming) existing.add(id);
    const merged = [...existing].slice(-MAX_READ_IDS);
    await writeState(c, current, tenant, merged);
    return c.json({ ok: true, data: { readCount: incoming.length } });
  });
}
