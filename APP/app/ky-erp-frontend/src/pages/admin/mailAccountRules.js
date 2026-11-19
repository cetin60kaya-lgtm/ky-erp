// Saf kurallar: canlı provider kabiliyeti ile hesap kayıt durumunu karıştırma.
export const mailProviderReady = (provider) =>
  Boolean(provider?.configured && provider?.adapterReady);

export function mailAccountReadiness(account = {}, provider = null) {
  const flags = account.readiness || {};
  const approved = Boolean(flags.companyApproved ?? String(account.approval_status || "").toUpperCase() === "APPROVED");
  const oauth = Boolean(flags.oauthConnected ?? account.provider_connected);
  const sync = Boolean(flags.syncHealthy);
  const configured = mailProviderReady(provider);
  const enabled = Number(flags.enabledFolders || 0);
  const completed = Number(flags.completedFolders || 0);
  const active = String(account.status || "").toUpperCase() === "ACTIVE";
  return {
    approved, oauth, sync, configured, enabled, completed,
    ready: approved && oauth && sync && configured && active,
  };
}

export function accountMatchesFilter(account = {}, filter = "") {
  const normalized = (value) => String(value || "").trim().toLocaleLowerCase("tr-TR");
  return normalized([
    account.display_name, account.email_address, account.department_code, account.provider_type,
  ].join(" ")).includes(normalized(filter));
}
