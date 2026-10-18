type Row = Record<string, any>;
const str = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => str(value).toUpperCase().replace(/İ/g,"I");
const aliases = new Set(["mecit-hakan","main-mecit-hakan","mecit-hakan-gursu","hakan-baski","main-hakan","main-hakan-baski","hkn-baski"]);
export function dailyTenant(value: unknown) {
  const normalized = str(value).toLowerCase().replace(/_/g,"-").replace(/\s+/g,"-").replace(/^-+|-+$/g,"");
  return aliases.has(normalized) ? "mecit-hakan" : normalized;
}
export const isOwner = (role: unknown) => ["SUPER_ADMIN","ADMIN"].includes(upper(role));
const granted = (value: unknown) => value === true || Number(value || 0) === 1;
function permission(user: Row) {
  const list = Array.isArray(user.permissions) ? user.permissions : [];
  return list.find((item: Row) => ["IK","GUNLUK-OPERASYON","GUNLUK_OPERASYON"].includes(upper(item.moduleKey || item.module_key))) || null;
}
export function dailyAuthorized(user: Row, method: string, path: string) {
  if (["DENETIM","PERSONNEL"].includes(upper(user?.role))) return false;
  if (isOwner(user?.role)) return true;
  const p = permission(user);
  if (!p) return false;
  const canView = granted(p.canView) || granted(p.can_view);
  const canCreate = granted(p.canCreate) || granted(p.can_create);
  const canUpdate = granted(p.canUpdate) || granted(p.can_update);
  const canDelete = granted(p.canDelete) || granted(p.can_delete);
  const canApprove = granted(p.canApprove) || granted(p.can_approve);
  const m = upper(method);
  if (m === "GET" || m === "HEAD") return canView;
  if (m === "DELETE") return canDelete;
  if (m === "PATCH" || m === "PUT") return canUpdate;
  if (m !== "POST") return false;
  if (/\/employees$/.test(path)) return canCreate;
  if (/\/payments(?:\/[^/]+\/cancel)?$/.test(path) || /\/period-lock$/.test(path)) return canApprove || canUpdate;
  return canCreate || canUpdate;
}
