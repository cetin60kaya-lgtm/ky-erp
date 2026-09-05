import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRateLimitRules,
  buildCacheBypassRule,
  buildManagedObserveRules,
  rateLimitCapacityCheck,
  discoverZone,
  createClient,
} from "./kyerp-pro-security.mjs";

test("Pro plan icin tam iki auth rate-limit kurali uretilir", () => {
  const rules = buildRateLimitRules();
  assert.equal(rules.length, 2);
  assert.equal(rules[0].ref, "kyerp_login_rate_limit_v1");
  assert.equal(rules[1].ref, "kyerp_auth_sensitive_rate_limit_v1");

  for (const rule of rules) {
    assert.deepEqual(rule.ratelimit.characteristics, [
      "cf.colo.id",
      "ip.src",
    ]);
    assert.equal(rule.ratelimit.period, 60);
    assert.equal(rule.action, "block");
  }
});

test("MFA ve recovery ayni ikinci kuralda birlesir", () => {
  const rule = buildRateLimitRules()[1];
  assert.match(rule.expression, /\/api\/auth\/mfa\//);
  assert.match(rule.expression, /\/api\/auth\/recovery/);
});

test("API cache kurali tum api host API yollarini bypass eder", () => {
  const rule = buildCacheBypassRule();
  assert.equal(rule.action_parameters.cache, false);
  assert.match(rule.expression, /api\.kyerp\.net/);
  assert.match(rule.expression, /\/api\//);
});

test("Managed WAF observe kurallari log override kullanir", () => {
  const rules = buildManagedObserveRules();
  assert.equal(rules.length, 2);
  for (const rule of rules) {
    assert.equal(rule.action_parameters.overrides.action, "log");
  }
});

test("Pro rate-limit kapasitesi iki kuralla sinirlanir", () => {
  const desired = buildRateLimitRules();

  assert.equal(rateLimitCapacityCheck([], desired).ok, true);
  assert.equal(
    rateLimitCapacityCheck([{ ref: "foreign_rule" }], desired).ok,
    false,
  );
  assert.equal(
    rateLimitCapacityCheck(
      [{ ref: "kyerp_login_rate_limit_v1" }],
      desired,
    ).ok,
    true,
  );
});

test("Zone discovery aktif exact zone secimini yapar", async () => {
  const mock = {
    request: async () => [
      {
        id: "z1",
        name: "kyerp.net",
        account: { id: "a1" },
        plan: { name: "Pro" },
      },
    ],
  };

  const zone = await discoverZone(mock, "kyerp.net");

  assert.equal(zone.zoneId, "z1");
  assert.equal(zone.accountId, "a1");
  assert.equal(zone.plan, "Pro");
});

test("Client bearer tokeni headerda kullanir", async () => {
  let seen;
  const client = createClient(
    "secret-token",
    async (url, init) => {
      seen = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: { status: "active" },
        }),
      };
    },
  );

  const result = await client.request(
    "GET",
    "/user/tokens/verify",
  );

  assert.equal(result.status, "active");
  assert.equal(
    seen.init.headers.Authorization,
    "Bearer secret-token",
  );
});
