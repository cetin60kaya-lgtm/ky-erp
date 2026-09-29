type AnyRow = Record<string, any>;

const MAX_READ_IDS = 1000;
const ALLOWED_ID_PREFIXES = ["login-approval:", "session-trust:", "ebelge-issue:", "payment-due:"];

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function upper(value: unknown) {
  return text(value).toUpperCase().replace(/İ/g, "I");
}

function ownerRole(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
}

function permissionRow(current: AnyRow, moduleKey: string) {
  return (Array.isArray(current?.permissions) ? current.permissions : []).find(
    (row: AnyRow) => upper(row?.moduleKey || row?.module_key) === upper(moduleKey),
  );
}

export function hasNotificationPermission(current: AnyRow, moduleKeys: string[], flag = "canView") {
  if (ownerRole(current?.role)) return true;
  return moduleKeys.some((moduleKey) => {
    const row = permissionRow(current, moduleKey);
    if (!row) return false;
    if (flag === "canApprove") return Boolean(row.canApprove ?? row.can_approve);
    if (flag === "canCreate") return Boolean(row.canCreate ?? row.can_create);
    if (flag === "canUpdate") return Boolean(row.canUpdate ?? row.can_update);
    return Boolean(row.canView ?? row.can_view);
  });
}

export function sanitizeNotificationReadIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const raw of value) {
    const id = text(raw);
    if (!id || id.length > 220) continue;
    if (!ALLOWED_ID_PREFIXES.some((prefix) => id.startsWith(prefix))) continue;
    unique.add(id);
    if (unique.size >= MAX_READ_IDS) break;
  }
  return [...unique];
}

export const NOTIFICATION_MAX_READ_IDS = MAX_READ_IDS;
