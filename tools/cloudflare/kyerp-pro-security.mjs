#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const API_BASE = "https://api.cloudflare.com/client/v4";
const CLOUDFLARE_MANAGED_RULESET_ID = "efb7b8c949ac4650a09736fc376e9aee";
const OWASP_CORE_RULESET_ID = "4814384a9e5d4991b9815dcfc25d2f1f";
const PRO_RATE_LIMIT_RULE_CAP = 2;

function argValue(name, fallback = "") {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

export function buildRateLimitRules() {
  const jsonResponse = {
    response: {
      status_code: 429,
      content_type: "application/json",
      content: JSON.stringify({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Cok fazla istek. Lutfen kisa bir sure sonra tekrar deneyin.",
        },
      }),
    },
  };

  return [
    {
      ref: "kyerp_login_rate_limit_v1",
      description: "KY ERP login brute-force korumasi",
      expression:
        '(http.host eq "api.kyerp.net" and http.request.uri.path eq "/api/auth/login")',
      action: "block",
      action_parameters: jsonResponse,
      ratelimit: {
        characteristics: ["cf.colo.id", "ip.src"],
        period: 60,
        requests_per_period: 10,
        mitigation_timeout: 60,
      },
      enabled: true,
    },
    {
      ref: "kyerp_auth_sensitive_rate_limit_v1",
      description: "KY ERP MFA ve recovery brute-force korumasi",
      expression:
        '(http.host eq "api.kyerp.net" and (starts_with(http.request.uri.path, "/api/auth/mfa/") or starts_with(http.request.uri.path, "/api/auth/recovery")))',
      action: "block",
      action_parameters: jsonResponse,
      ratelimit: {
        characteristics: ["cf.colo.id", "ip.src"],
        period: 60,
        requests_per_period: 6,
        mitigation_timeout: 60,
      },
      enabled: true,
    },
  ];
}

export function buildCacheBypassRule() {
  return {
    ref: "kyerp_api_cache_bypass_v1",
    description: "KY ERP API cevaplarini edge cache disinda tut",
    expression:
      '(http.host eq "api.kyerp.net" and starts_with(http.request.uri.path, "/api/"))',
    action: "set_cache_settings",
    action_parameters: { cache: false },
    enabled: true,
  };
}

export function buildManagedObserveRules() {
  const make = (ref, description, id) => ({
    ref,
    description,
    expression: "true",
    action: "execute",
    action_parameters: {
      id,
      overrides: { action: "log" },
    },
    enabled: true,
  });

  return [
    make(
      "kyerp_cloudflare_managed_observe_v1",
      "KY ERP Cloudflare Managed WAF - observe/log",
      CLOUDFLARE_MANAGED_RULESET_ID,
    ),
    make(
      "kyerp_owasp_observe_v1",
      "KY ERP OWASP Core WAF - observe/log",
      OWASP_CORE_RULESET_ID,
    ),
  ];
}

function isOurRef(rule, refs) {
  return refs.has(String(rule?.ref || ""));
}

export function rateLimitCapacityCheck(
  existingRules = [],
  desiredRules = buildRateLimitRules(),
) {
  const desiredRefs = new Set(desiredRules.map((r) => r.ref));
  const existingOther = existingRules.filter(
    (r) => !isOurRef(r, desiredRefs),
  );
  const existingOurs = new Set(
    existingRules
      .filter((r) => isOurRef(r, desiredRefs))
      .map((r) => r.ref),
  );
  const missing = desiredRules.filter((r) => !existingOurs.has(r.ref));
  const projected = existingOther.length + existingOurs.size + missing.length;

  return {
    ok: projected <= PRO_RATE_LIMIT_RULE_CAP,
    existingOther: existingOther.length,
    existingOurs: existingOurs.size,
    missing: missing.length,
    projected,
    cap: PRO_RATE_LIMIT_RULE_CAP,
  };
}

export function createClient(token, fetchImpl = globalThis.fetch) {
  if (!token) throw new Error("CLOUDFLARE_MANAGEMENT_TOKEN eksik.");
  if (typeof fetchImpl !== "function") throw new Error("fetch kullanilamiyor.");

  async function request(
    method,
    path,
    body,
    { allow404 = false } = {},
  ) {
    const res = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (allow404 && res.status === 404) return null;

    if (!res.ok || payload?.success === false) {
      const details = Array.isArray(payload?.errors)
        ? payload.errors.map((e) => e.message || e.code).join("; ")
        : "";
      throw new Error(
        `Cloudflare API ${method} ${path} -> HTTP ${res.status}${details ? `: ${details}` : ""}`,
      );
    }

    return payload?.result ?? payload;
  }

  return { request };
}

export async function discoverZone(client, zoneName) {
  const result = await client.request(
    "GET",
    `/zones?name=${encodeURIComponent(zoneName)}&status=active&per_page=50`,
  );
  const rows = Array.isArray(result) ? result : [];
  const exact = rows.find(
    (z) => String(z.name).toLowerCase() === zoneName.toLowerCase(),
  );

  if (!exact) throw new Error(`Aktif zone bulunamadi: ${zoneName}`);
  if (!exact.account?.id) {
    throw new Error(`Zone account bilgisi eksik: ${zoneName}`);
  }

  return {
    zoneId: exact.id,
    accountId: exact.account.id,
    zoneName: exact.name,
    plan: exact.plan?.name || exact.plan?.legacy_id || "",
  };
}

async function getEntrypoint(client, zoneId, phase) {
  return client.request(
    "GET",
    `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`,
    undefined,
    { allow404: true },
  );
}

async function createEntrypoint(
  client,
  zoneId,
  phase,
  description,
  rules,
) {
  return client.request("POST", `/zones/${zoneId}/rulesets`, {
    name: `KY ERP ${phase}`,
    description,
    kind: "zone",
    phase,
    rules,
  });
}

async function addRule(client, zoneId, rulesetId, rule) {
  return client.request(
    "POST",
    `/zones/${zoneId}/rulesets/${rulesetId}/rules`,
    rule,
  );
}

async function patchRule(
  client,
  zoneId,
  rulesetId,
  ruleId,
  rule,
) {
  return client.request(
    "PATCH",
    `/zones/${zoneId}/rulesets/${rulesetId}/rules/${ruleId}`,
    rule,
  );
}

function managedRuleById(entry, id) {
  return (entry?.rules || []).find(
    (r) =>
      r?.action === "execute" &&
      r?.action_parameters?.id === id,
  );
}

export async function ensureManagedWafObserve(
  client,
  zoneId,
  logger = console.log,
) {
  const phase = "http_request_firewall_managed";
  const desired = buildManagedObserveRules();
  const entry = await getEntrypoint(client, zoneId, phase);

  if (!entry) {
    const created = await createEntrypoint(
      client,
      zoneId,
      phase,
      "KY ERP managed WAF observe/log giris kurallari",
      desired,
    );
    logger(`WAF observe giris ruleset olusturuldu: ${created.id}`);
    return { created: true, added: desired.length, preserved: 0 };
  }

  let added = 0;
  let preserved = 0;

  for (const wanted of desired) {
    const found = managedRuleById(
      entry,
      wanted.action_parameters.id,
    );

    if (!found) {
      await addRule(client, zoneId, entry.id, wanted);
      added += 1;
      continue;
    }

    const currentOverride =
      found?.action_parameters?.overrides?.action;

    // Mevcut default/enforce kuralini observe/log seviyesine dusurme.
    if (!currentOverride || currentOverride !== "log") {
      logger(
        `WAF kural mevcut ve observe'dan daha guclu; dokunulmadi: ${found.ref || found.id}`,
      );
      preserved += 1;
      continue;
    }

    if (found.enabled === false) {
      await patchRule(
        client,
        zoneId,
        entry.id,
        found.id,
        {
          ref: found.ref || wanted.ref,
          description: found.description || wanted.description,
          expression: found.expression || "true",
          action: "execute",
          action_parameters: found.action_parameters,
          enabled: true,
        },
      );
    }

    preserved += 1;
  }

  return { created: false, added, preserved };
}

export async function ensureApiCacheBypass(
  client,
  zoneId,
  logger = console.log,
) {
  const phase = "http_request_cache_settings";
  const desired = buildCacheBypassRule();
  const entry = await getEntrypoint(client, zoneId, phase);

  if (!entry) {
    const created = await createEntrypoint(
      client,
      zoneId,
      phase,
      "KY ERP cache guvenlik kurallari",
      [desired],
    );
    logger(`Cache ruleset olusturuldu: ${created.id}`);
    return { created: true, added: 1 };
  }

  const found = (entry.rules || []).find(
    (r) => r.ref === desired.ref,
  );

  if (!found) {
    await addRule(client, zoneId, entry.id, desired);
    return { created: false, added: 1 };
  }

  return { created: false, added: 0 };
}

export async function ensureRateLimits(
  client,
  zoneId,
  logger = console.log,
) {
  const phase = "http_ratelimit";
  const desired = buildRateLimitRules();
  const entry = await getEntrypoint(client, zoneId, phase);
  const existingRules = entry?.rules || [];
  const capacity = rateLimitCapacityCheck(
    existingRules,
    desired,
  );

  if (!capacity.ok) {
    throw new Error(
      `Cloudflare Pro rate-limit kapasitesi asiliyor. mevcut-diger=${capacity.existingOther}, mevcut-KYERP=${capacity.existingOurs}, eklenecek=${capacity.missing}, projected=${capacity.projected}, cap=${capacity.cap}. Once mevcut kurallar incelenmeli.`,
    );
  }

  if (!entry) {
    const created = await createEntrypoint(
      client,
      zoneId,
      phase,
      "KY ERP Pro auth rate limits",
      desired,
    );
    logger(`Rate-limit ruleset olusturuldu: ${created.id}`);
    return {
      created: true,
      added: desired.length,
      updated: 0,
    };
  }

  let added = 0;
  let updated = 0;

  for (const wanted of desired) {
    const found = (entry.rules || []).find(
      (r) => r.ref === wanted.ref,
    );

    if (!found) {
      await addRule(client, zoneId, entry.id, wanted);
      added += 1;
    } else {
      await patchRule(
        client,
        zoneId,
        entry.id,
        found.id,
        wanted,
      );
      updated += 1;
    }
  }

  return { created: false, added, updated };
}

export async function auditState(client, zoneId) {
  const phases = [
    "http_request_firewall_managed",
    "http_ratelimit",
    "http_request_cache_settings",
  ];
  const entries = {};

  for (const phase of phases) {
    entries[phase] = await getEntrypoint(
      client,
      zoneId,
      phase,
    );
  }

  const managed =
    entries.http_request_firewall_managed;
  const rate = entries.http_ratelimit;
  const cache = entries.http_request_cache_settings;

  return {
    managedWaf: {
      rulesetId: managed?.id || null,
      ruleCount: managed?.rules?.length || 0,
      cloudflareManaged: Boolean(
        managedRuleById(
          managed,
          CLOUDFLARE_MANAGED_RULESET_ID,
        ),
      ),
      owasp: Boolean(
        managedRuleById(managed, OWASP_CORE_RULESET_ID),
      ),
    },
    rateLimit: {
      rulesetId: rate?.id || null,
      ruleCount: rate?.rules?.length || 0,
      capacity: rateLimitCapacityCheck(rate?.rules || []),
      refs: (rate?.rules || []).map(
        (r) => r.ref || r.id,
      ),
    },
    cache: {
      rulesetId: cache?.id || null,
      ruleCount: cache?.rules?.length || 0,
      apiBypass: Boolean(
        (cache?.rules || []).find(
          (r) => r.ref === "kyerp_api_cache_bypass_v1",
        ),
      ),
    },
  };
}

async function main() {
  const mode = argValue("mode", "audit").toLowerCase();
  const zoneName = argValue("zone", "kyerp.net");

  if (!["audit", "observe", "enforce"].includes(mode)) {
    throw new Error(
      "Mode audit, observe veya enforce olmalidir.",
    );
  }

  const token =
    process.env.CLOUDFLARE_MANAGEMENT_TOKEN || "";
  const client = createClient(token);

  const verify = await client.request(
    "GET",
    "/user/tokens/verify",
  );

  if (
    verify?.status &&
    String(verify.status).toLowerCase() !== "active"
  ) {
    throw new Error(`Token aktif degil: ${verify.status}`);
  }

  const zone = await discoverZone(client, zoneName);

  console.log(`Zone: ${zone.zoneName}`);
  console.log(`Plan: ${zone.plan || "bilinmiyor"}`);
  console.log(`Zone ID: ${zone.zoneId}`);
  console.log(`Account ID: ${zone.accountId}`);

  const before = await auditState(
    client,
    zone.zoneId,
  );

  console.log("Mevcut durum:");
  console.log(JSON.stringify(before, null, 2));

  if (mode === "observe" || mode === "enforce") {
    console.log(
      "WAF observe/log kurulumu kontrol ediliyor...",
    );
    console.log(
      await ensureManagedWafObserve(
        client,
        zone.zoneId,
      ),
    );

    console.log(
      "API cache bypass kurulumu kontrol ediliyor...",
    );
    console.log(
      await ensureApiCacheBypass(
        client,
        zone.zoneId,
      ),
    );
  }

  if (mode === "enforce") {
    console.log(
      "Pro auth rate-limit kurallari uygulanacak...",
    );
    console.log(
      await ensureRateLimits(client, zone.zoneId),
    );
  }

  const after = await auditState(
    client,
    zone.zoneId,
  );

  console.log("Son durum:");
  console.log(JSON.stringify(after, null, 2));
}

const isDirect =
  Boolean(process.argv[1]) &&
  pathToFileURL(resolve(process.argv[1])).href ===
    import.meta.url;

if (isDirect) {
  main().catch((error) => {
    console.error(`HATA: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
