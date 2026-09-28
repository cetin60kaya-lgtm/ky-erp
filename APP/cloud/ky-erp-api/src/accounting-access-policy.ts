type Row = Record<string, any>;
const code = (value: unknown) => String(value ?? "").trim().toUpperCase();
const granted = (value: unknown) => value === true || value === 1 || value === "1";

export function accountingAccess(user: Row, method: string, path: string) {
  if (["SUPER_ADMIN", "ADMIN"].includes(code(user.role))) return true;
  const permission = (Array.isArray(user.permissions) ? user.permissions : []).find((row: Row) => code(row.moduleKey || row.module_key) === "MUHASEBE");
  const can = (name: string) => granted(permission?.[`can${name}`] ?? permission?.[`can_${name.toLowerCase()}`]);
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return can("View") || (!permission && ["MUHASEBE", "ACCOUNTING"].includes(code(user.role)));
  if (!can("View")) return false;
  if (method === "DELETE") return can("Delete");
  if (/\/(finalize|approve|reject|send|close|reopen)$/.test(path)) return can("Approve");
  if (["PATCH", "PUT"].includes(method)) return can("Update");
  return can("Create");
}

export function accountingTenantCandidates(query: string, header: string, body: Row) {
  const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
  return [...new Set([query, header, body.mainCompanySlug || body.main_company_slug || body.mainCompanyId].map(normalize).filter(Boolean))];
}
