import { canonicalCompanySlug, resolveCompanyIdentity } from "./companyIdentity.js";

export function maySwitchCompany(role) {
  return ["SUPER_ADMIN", "ADMIN"].includes(String(role || "").trim().toUpperCase());
}

export function companyForRestrictedUser(user) {
  if (!user || maySwitchCompany(user.role)) return null;
  const slug = canonicalCompanySlug(user.mainCompanySlug || user.main_company_slug || "");
  if (!slug) return null;
  const identity = resolveCompanyIdentity({ slug });
  return {
    id: identity.mainCompanyId,
    slug,
    name: slug === "kyerp-test" ? "KY ERP TEST" : slug === "mecit-hakan" ? "Hakan Emprime" : String(user.mainCompanyName || user.main_company_name || slug),
    isActive: true,
  };
}

export function permittedCompanySelection(user, allCompanies, selected) {
  if (user && !maySwitchCompany(user.role)) {
    const only = companyForRestrictedUser(user);
    return { companies: only ? [only] : [], active: only, locked: true };
  }
  const companies = Array.isArray(allCompanies) ? allCompanies : [];
  const current = canonicalCompanySlug(selected);
  return { companies, active: companies.find(c => canonicalCompanySlug(c.slug) === current) || companies[0] || null, locked: false };
}
