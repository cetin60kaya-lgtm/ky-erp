// @ts-nocheck

const LIVE_WEB_ORIGINS = new Set([
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
]);

const ALLOWED_TURNSTILE_HOSTNAMES = new Set([
  "kyerp.net",
  "www.kyerp.net",
  "app.kyerp.net",
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
  return {
    enabled: Boolean(siteKey && secret),
    siteKey: siteKey || "",
  };
}

export async function verifyTurnstileForLogin(c: any, responseToken: unknown) {
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

  const form = new URLSearchParams({
    secret,
    response: token,
  });
  const ip = clientIp(c);
  if (ip) form.set("remoteip", ip);

  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch {
    return { required: true, ok: false, status: 503, code: "TURNSTILE_VERIFY_UNAVAILABLE" };
  }

  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return { required: true, ok: false, status: 503, code: "TURNSTILE_VERIFY_UNAVAILABLE" };
  }
  if (!payload?.success) {
    return {
      required: true,
      ok: false,
      status: 403,
      code: "TURNSTILE_VERIFICATION_FAILED",
      errorCodes: Array.isArray(payload?.["error-codes"]) ? payload["error-codes"].slice(0, 8) : [],
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
  };
}
