import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(here, name), "utf8");
const publicFile = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/public/owner-security", name), "utf8");

const guard = source("owner-security-device-guard.ts");
const entry = source("main-entry-security.ts");
const app = publicFile("app.js");
const html = publicFile("index.html");
const manifest = publicFile("manifest.webmanifest");
const worker = publicFile("sw.js");

test("owner app requests are protected by canonical owner and signed KY security device", () => {
  assert.match(entry, /X-KYERP-Owner-App/);
  assert.match(entry, /requireOwnerSecurityApp/);
  assert.match(entry, /X-KYERP-Push-Device/);
  assert.match(entry, /X-KYERP-Security-Signature/);
  assert.match(guard, /async function canonicalOwner/);
  assert.match(guard, /ORDER BY u\.created_at ASC,u\.id ASC LIMIT 1/);
  assert.match(guard, /deviceTokenHash/);
  assert.match(guard, /decisionPublicKeyJwk/);
  assert.match(guard, /KYERP-DEVICE-AUTH-V1/);
  assert.match(guard, /CANONICAL_OWNER_ONLY/);
});

test("owner PWA reuses existing security device and ERP owner session", () => {
  assert.match(app, /kyerp-security-app-v1/);
  assert.match(app, /kyerp_auth_token/);
  assert.match(app, /X-KYERP-Owner-App/);
  assert.match(app, /X-KYERP-Push-Token/);
  assert.match(app, /KYERP-DEVICE-AUTH-V1/);
  assert.match(app, /KYERP-DECISION-V1/);
  assert.match(app, /SECURITY_ACTION/);
  assert.match(app, /localUnlockCredentialId/);
  assert.match(app, /new URL\(`\$\{API_BASE\}\$\{path\}`\)\.pathname/);
});

test("owner PWA exposes system security operations and company delegate controls", () => {
  assert.match(html, /Firma Güvenlik Yetkilileri/);
  assert.match(html, /Sadece Ben Kalayım/);
  assert.match(html, /Giriş Onayı/);
  assert.match(html, /Oturum Onayı/);
  assert.match(html, /Güvenlik Geçmişi/);
  assert.match(app, /SECURITY_CAPABILITY_SET/);
  assert.match(app, /SESSION_TRUST_APPROVE/);
  assert.match(app, /SESSION_TRUST_REJECT/);
  assert.match(app, /SESSION_CLOSE/);
  assert.match(app, /SESSION_SUSPICIOUS/);
  assert.match(app, /operation:"ONLY_ME"/);
});

test("session trust remains review mode rather than a hidden second login gate", () => {
  assert.match(html, /ikinci giriş kilidi değil, güvenlik incelemesidir/);
  assert.match(app, /REVIEW_ONLY/);
});

test("owner app is an isolated installable PWA and does not steal security push events", () => {
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.start_url, "/owner-security/");
  assert.equal(parsed.scope, "/owner-security/");
  assert.equal(parsed.display, "standalone");
  assert.match(worker, /ky-owner-security-v1-20260911/);
  assert.doesNotMatch(worker, /addEventListener\("push"/);
});
