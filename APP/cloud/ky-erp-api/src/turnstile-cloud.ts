// @ts-nocheck

const LIVE_WEB_ORIGINS = new Set([
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://security.kyerp.net",
]);

const ALLOWED_TURNSTILE_HOSTNAMES = new Set([
  "kyerp.net",
  "www.kyerp.net",
  "security.kyerp.net",
]);

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function clientIp(c: any) {
  return text(
    c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0],
  );
}

export function turnstileRequiredForOrigin(origin: unknown) {
  return LIVE_WEB_ORIGINS.has(text(origin));
}

export function turnstileHostnameAllowed(hostname: unknown) {
  const value = text(hostname).toLowerCase();
  return Boolean(value && ALLOWED_TURNSTILE_HOSTNAMES.has(value));
}

export function turnstilePublicConfig(c: any) {
  const siteKey = text(c.env.TURNSTILE_SITE_KEY);
  const secret = text(c.env.TURNSTILE_SECRET_KEY);
  const origin = text(c.req.header("Origin"));
  const required = turnstileRequiredForOrigin(origin);
  return {
    enabled: Boolean(required && siteKey && secret),
    siteKey: required ? (siteKey || "") : "",
    required,
  };
}

export async function verifyTurnstileForLogin(c: any, responseToken: unknown, fetcher = fetch) {
  const origin = text(c.req.header("Origin"));
  const required = turnstileRequiredForOrigin(origin);
  if (!required) {
    return { required: false, ok: true, status: 200, code: "TURNSTILE_NOT_REQUIRED" };
  }

  const secret = text(c.env.TURNSTILE_SECRET_KEY);
  const siteKey = text(c.env.TURNSTILE_SITE_KEY);
  if (!secret || !siteKey) {
    return { required: true, ok: false, status: 503, code: "TURNSTILE_NOT_CONFIGURED" };
  }

  const token = text(responseToken);
  if (!token) {
    return { required: true, ok: false, status: 403, code: "TURNSTILE_TOKEN_REQUIRED" };
  }

  if (token.length > 2048) return { required: true, ok: false, status: 403, code: "TURNSTILE_VERIFICATION_FAILED" };
  const form = new URLSearchParams({
    secret,
    response: token,
    idempotency_key: crypto.randomUUID(),
  });
  const ip = clientIp(c);
  if (ip) form.set("remoteip", ip);

  // Retry only Siteverify transport/provider failures, never the whole login.
  // Reuse this request's idempotency UUID so Cloudflare can safely replay its result.
  let payload: any = {};
  const knownCodes = new Set(["missing-input-secret","invalid-input-secret","missing-input-response","invalid-input-response","bad-request","timeout-or-duplicate","internal-error"]);
  let errorCodes: string[] = [];
  let attempts = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    attempts = attempt + 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    let temporary = false;
    try {
      const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(), signal: controller.signal,
      });
      if (!response.ok) temporary = response.status >= 500 || response.status === 429;
      else {
        payload = await response.json();
        if (typeof payload?.success !== "boolean") temporary = true;
        errorCodes = Array.isArray(payload?.["error-codes"]) ? payload["error-codes"].filter((code: unknown) => knownCodes.has(String(code))).slice(0, 8) : [];
        if (!payload?.success && errorCodes.includes("internal-error")) temporary = true;
        if (!temporary) break;
      }
      if (!response.ok && !temporary) return { required: true, ok: false, status: 503, code: "TURNSTILE_VERIFY_UNAVAILABLE", attempts };
    } catch { temporary = true; }
    finally { clearTimeout(timer); }
    if (temporary && attempt === 1) return { required: true, ok: false, status: 503, code: "TURNSTILE_VERIFY_UNAVAILABLE", errorCodes, attempts };
  }
  if (!payload?.success) {
    const invalidConfig = errorCodes.some(code => ["missing-input-secret","invalid-input-secret","bad-request"].includes(code));
    return {
      required: true, ok: false, status: invalidConfig ? 503 : 403,
      code: invalidConfig ? "TURNSTILE_NOT_CONFIGURED" : errorCodes.includes("timeout-or-duplicate") ? "TURNSTILE_TOKEN_EXPIRED" : "TURNSTILE_VERIFICATION_FAILED",
      errorCodes, attempts,
    };
  }
  if (!turnstileHostnameAllowed(payload?.hostname)) {
    return {
      required: true,
      ok: false,
      status: 403,
      code: "TURNSTILE_HOSTNAME_MISMATCH",
    };
  }

  return {
    required: true,
    ok: true,
    status: 200,
    code: "TURNSTILE_VERIFIED",
    hostname: text(payload.hostname).toLowerCase(),
    attempts,
  };
}
