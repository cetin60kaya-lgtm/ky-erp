import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./system-sentinel-cloud.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

test("System Sentinel stores additive state in existing json_store without runtime DDL", () => {
  assert.match(source, /const DEVICE_SCOPE = "system_sentinel_device"/);
  assert.match(source, /INSERT INTO json_store/);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
});

test("only SUPER_ADMIN can manage Sentinel grants and enrollment", () => {
  assert.match(source, /function isOwner\(role: unknown\)[^{]*\{[^}]*SUPER_ADMIN/);
  assert.doesNotMatch(source, /\["SUPER_ADMIN",\s*"ADMIN"\]/);
  assert.match(source, /Uzak erişim yetkisini yalnız Süper Yönetici verebilir/);
});

test("agent authentication uses per-device hashed token and never returns its hash", () => {
  assert.match(source, /X-KYERP-Agent-Id/);
  assert.match(source, /X-KYERP-Agent-Token/);
  assert.match(source, /agentTokenHash: await sha256\(agentToken\)/);
  assert.match(source, /const \{ agentTokenHash, \.\.\.safe \} = device/);
  assert.match(source, /safeEqual\(incoming, text\(device\.agentTokenHash\)\)/);
});

test("remote actions are allowlisted and Wake-on-LAN is routed through an online Wake Bridge", () => {
  assert.match(source, /const AGENT_COMMANDS = new Set/);
  assert.match(source, /capabilities\?\.includes\("WAKE_BRIDGE"\)/);
  assert.match(source, /macAddress: targetMac/);
  assert.match(source, /REMOTE_ADAPTER_NOT_READY/);
  assert.match(source, /safeHttpsUrl\(device\.remoteAccess\?\.launchUrl\)/);
});

test("one-time grants are consumed and critical power operations require explicit confirmation", () => {
  assert.match(source, /mode\) !== "ONE_TIME"/);
  assert.match(source, /usedAt: nowIso\(\)/);
  assert.match(source, /CRITICAL_ACTIONS/);
  assert.match(source, /confirmation\) !== `\$\{action\}:\$\{deviceId\}`/);
});

test("main shell registers Sentinel and only exempts authenticated agent routes from user session middleware", () => {
  assert.match(main, /registerSystemSentinelRoutes/);
  assert.match(main, /path\.startsWith\("\/api\/system-agent\/"\)/);
  assert.match(main, /X-KYERP-Agent-Id/);
  assert.match(main, /X-KYERP-Agent-Token/);
});
