export function legacyAuthPath(path) {
  const normalized = String(path || "");
  if (normalized === "/auth/login") return "/auth/v2/login";
  if (normalized === "/auth/mfa/verify") return "/auth/v2/mfa/verify";
  if (normalized === "/auth/recovery-code") return "/auth/v2/recovery-code";
  if (normalized === "/auth/owner-recovery/start") return "/auth/v2/owner-recovery/start";
  if (normalized === "/auth/owner-recovery/verify") return "/auth/v2/owner-recovery/verify";
  if (normalized.startsWith("/auth/approval/")) {
    return normalized.replace("/auth/approval/", "/auth/v2/approval/");
  }
  return "";
}

export function shouldTryLegacyAuth(status, payload) {
  const code = String(payload?.error?.code || payload?.code || "").toUpperCase();
  if (status === 405) return true;
  if (status === 404) return !code || code === "NOT_FOUND";
  return false;
}
