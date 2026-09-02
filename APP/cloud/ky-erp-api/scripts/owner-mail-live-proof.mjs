import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const entryPath = resolve("src/main-entry.ts");
const original = readFileSync(entryPath, "utf8");
const marker = "  async fetch(request: Request, env: Cloudflare.Env, executionCtx: ExecutionContext) {";
const token = randomBytes(32).toString("hex");
const apiBase = "https://api.kyerp.net";

console.log(`::add-mask::${token}`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${String(result.stderr || "").slice(0, 500)}`);
  return String(result.stdout || "");
}

function assertResendBinding() {
  const raw = capture("npx", ["wrangler", "secret", "list", "--config", "wrangler.jsonc", "--format", "json"]);
  const list = JSON.parse(raw || "[]");
  if (!Array.isArray(list) || !list.some((item) => item?.name === "RESEND_API_KEY")) throw new Error("RESEND_API_KEY is not present in the live Worker secret bindings");
  console.log("RESEND_API_KEY live Worker secret binding verified.");
}

const wait = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function interceptBlock(secretToken) {
  return `${marker}
    const proofUrl = new URL(request.url);
    if (proofUrl.pathname === "/api/__kyerp-owner-mail-live-proof" && request.method.toUpperCase() === "POST") {
      if (request.headers.get("X-KYERP-Live-Proof") !== ${JSON.stringify(secretToken)}) return securityErrorResponse(request, "PROOF_FORBIDDEN", "Live proof token gerekli.", 403);
      const owner = await env.DB.prepare(\`SELECT s.email AS email FROM auth_users u JOIN auth_user_security s ON s.user_id=u.id WHERE UPPER(TRIM(COALESCE(s.role_override,u.role,''))) IN ('SUPER_ADMIN','ADMIN') AND COALESCE(s.email_verified,0)=1 AND TRIM(COALESCE(s.email,''))<>'' ORDER BY CASE WHEN UPPER(TRIM(COALESCE(s.role_override,u.role,'')))='SUPER_ADMIN' THEN 0 ELSE 1 END LIMIT 1\`).first<any>();
      const destination = String(owner?.email || "").trim();
      if (!destination) return securityErrorResponse(request, "OWNER_EMAIL_NOT_FOUND", "Dogrulanmis uygulama sahibi e-postasi bulunamadi.", 404);
      const key = String((env as any).RESEND_API_KEY || "").trim();
      if (!key) return securityErrorResponse(request, "RESEND_BINDING_MISSING", "Resend binding eksik.", 503);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "KY ERP <admin@kyerp.net>",
          to: [destination],
          subject: "KY ERP Canli Mail Teslim Testi",
          text: "KY ERP production e-posta teslim altyapisi canli olarak dogrulandi. Bu mesaj otomatik canli kabul testidir; herhangi bir islem yapmaniz gerekmez.",
        }),
      });
      let payload: any = {};
      try { payload = await response.json(); } catch {}
      if (!response.ok) return securityErrorResponse(request, "RESEND_SEND_FAILED", String(payload?.message || "Resend gonderimi basarisiz."), 503);
      const messageId = String(payload?.id || payload?.messageId || "").trim();
      if (!messageId) return securityErrorResponse(request, "RESEND_MESSAGE_ID_MISSING", "Resend kabul kimligi donmedi.", 503);
      const parts = destination.split("@");
      const masked = String(parts[0] || "").slice(0, 1) + "***@" + String(parts[1] || "");
      return Response.json({ ok: true, data: { provider: "RESEND", messageId, sender: "KY ERP <admin@kyerp.net>", recipient: masked } });
    }
    if (proofUrl.pathname.startsWith("/api/__kyerp-owner-mail-live-proof/") && request.method.toUpperCase() === "GET") {
      if (request.headers.get("X-KYERP-Live-Proof") !== ${JSON.stringify(secretToken)}) return securityErrorResponse(request, "PROOF_FORBIDDEN", "Live proof token gerekli.", 403);
      const key = String((env as any).RESEND_API_KEY || "").trim();
      if (!key) return securityErrorResponse(request, "RESEND_BINDING_MISSING", "Resend binding eksik.", 503);
      const messageId = decodeURIComponent(proofUrl.pathname.slice("/api/__kyerp-owner-mail-live-proof/".length));
      const response = await fetch("https://api.resend.com/emails/" + encodeURIComponent(messageId), {
        method: "GET",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      });
      let payload: any = {};
      try { payload = await response.json(); } catch {}
      if (!response.ok) return securityErrorResponse(request, "RESEND_STATUS_FAILED", String(payload?.message || "Resend durum sorgusu basarisiz."), 503);
      const event = String(payload?.last_event || payload?.lastEvent || payload?.status || "unknown").toLowerCase();
      return Response.json({ ok: true, data: { provider: "RESEND", messageId: String(payload?.id || messageId), event } });
    }`;
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch {}
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  return payload;
}

async function waitForProofVersion() {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const response = await fetch(`${apiBase}/api/__kyerp-owner-mail-live-proof`, { method: "POST" });
    if (response.status === 403) {
      console.log(`Temporary entrypoint proof is active (${attempt}/12).`);
      return;
    }
    console.log(`Waiting for temporary Worker propagation ${attempt}/12; HTTP ${response.status}`);
    await wait(2500);
  }
  throw new Error("temporary proof Worker did not become active");
}

async function waitForCanonicalVersion() {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const response = await fetch(`${apiBase}/api/__kyerp-owner-mail-live-proof`, { method: "POST" });
    if ([401, 404].includes(response.status)) {
      console.log(`Canonical Worker is active; proof endpoint absent, HTTP ${response.status} (${attempt}/12).`);
      return;
    }
    console.log(`Waiting for canonical Worker propagation ${attempt}/12; HTTP ${response.status}`);
    await wait(2500);
  }
  throw new Error("canonical Worker did not become active after cleanup");
}

let deliveryEvent = "";
let recipient = "";
let proofCompleted = false;
let cleanupCompleted = false;
let primaryError = null;
let cleanupError = null;

try {
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN missing");
  if (!original.includes(marker)) throw new Error("main-entry fetch marker missing");
  assertResendBinding();

  const temporary = original.replace(marker, interceptBlock(token));
  writeFileSync(entryPath, temporary, "utf8");
  if (!readFileSync(entryPath, "utf8").includes("/api/__kyerp-owner-mail-live-proof")) throw new Error("temporary entrypoint proof was not inserted");

  console.log("Deploying temporary token-gated proof at the real Worker entrypoint...");
  run("npx", ["wrangler", "deploy", "--config", "wrangler.jsonc"]);
  assertResendBinding();
  await waitForProofVersion();

  const sendPayload = await jsonFetch(`${apiBase}/api/__kyerp-owner-mail-live-proof`, {
    method: "POST",
    headers: { "X-KYERP-Live-Proof": token, "Content-Type": "application/json" },
  });
  const messageId = String(sendPayload?.data?.messageId || "");
  recipient = String(sendPayload?.data?.recipient || "");
  if (!messageId) throw new Error(`Resend message id missing: ${JSON.stringify(sendPayload)}`);
  console.log(`::add-mask::${messageId}`);
  console.log(`Resend accepted the real owner test message; recipient=${recipient}`);

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const statusPayload = await jsonFetch(`${apiBase}/api/__kyerp-owner-mail-live-proof/${encodeURIComponent(messageId)}`, {
      headers: { "X-KYERP-Live-Proof": token },
    });
    deliveryEvent = String(statusPayload?.data?.event || "unknown").toLowerCase();
    console.log(`Resend delivery check ${attempt}/30: ${deliveryEvent}`);
    if (["delivered", "opened", "clicked"].includes(deliveryEvent)) break;
    if (["bounced", "complained", "canceled", "failed"].includes(deliveryEvent)) throw new Error(`Resend delivery failed: ${deliveryEvent}`);
    await wait(5000);
  }

  if (!["delivered", "opened", "clicked"].includes(deliveryEvent)) throw new Error(`Resend delivery proof timed out: ${deliveryEvent}`);
  proofCompleted = true;
  console.log(`KY ERP owner mail delivery proof PASSED: ${deliveryEvent}; recipient=${recipient}`);
} catch (error) {
  primaryError = error;
  console.error(`PRIMARY LIVE PROOF ERROR: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  try {
    console.log("Restoring canonical Worker entrypoint and redeploying...");
    writeFileSync(entryPath, original, "utf8");
    if (readFileSync(entryPath, "utf8").includes("/api/__kyerp-owner-mail-live-proof")) throw new Error("proof interceptor remained in canonical entrypoint source");
    run("npx", ["wrangler", "deploy", "--config", "wrangler.jsonc"]);
    assertResendBinding();
    await waitForCanonicalVersion();

    const healthResponse = await fetch(`${apiBase}/api/health`);
    const healthText = await healthResponse.text();
    if (!healthResponse.ok || !/\"ok\"\s*:\s*true/.test(healthText)) throw new Error(`canonical health check failed: ${healthResponse.status} ${healthText}`);
    cleanupCompleted = true;
    console.log("Canonical Worker health and cleanup verified.");
  } catch (error) {
    cleanupError = error;
    console.error(`CLEANUP ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (primaryError || cleanupError || !proofCompleted || !cleanupCompleted) {
  throw new Error(`live proof incomplete; proof=${proofCompleted}; cleanup=${cleanupCompleted}; primary=${primaryError instanceof Error ? primaryError.message : primaryError || "none"}; cleanupError=${cleanupError instanceof Error ? cleanupError.message : cleanupError || "none"}`);
}

console.log("KY ERP OWNER MAIL LIVE PROOF PASSED");
console.log("Sender: KY ERP <admin@kyerp.net>");
console.log(`Recipient: ${recipient}`);
console.log("Provider: RESEND");
console.log(`Delivery: ${deliveryEvent}`);
console.log("Temporary entrypoint proof removed: YES");
