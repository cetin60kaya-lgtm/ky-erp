// A saved company ID is a preference, never an access grant.
// Portal company list is the authority on every new login.
export function selectAuthorizedIsnetCompany(companies, preferredId = "") {
  if (!Array.isArray(companies)) return null;
  const authorized = companies.filter(c => c && String(c.id || "").trim() && String(c.name || "").trim() && c.hasRole !== false);
  if (authorized.length === 1) return authorized[0];
  if (!preferredId) return null;
  const matches = authorized.filter(c => String(c.id) === String(preferredId));
  return matches.length === 1 ? matches[0] : null;
}

export function requireAuthorizedIsnetCompany(companies, id, name) {
  if (!Array.isArray(companies)) return false;
  return companies.filter(c => c && c.hasRole !== false &&
    String(c.id) === String(id) && String(c.name) === String(name)).length === 1;
}
