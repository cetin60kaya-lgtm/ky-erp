import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const mainPath = resolve("src/main.ts");
const original = readFileSync(mainPath, "utf8");
const marker = 'shell.onError((error, c) => {';
const token = randomBytes(32).toString("hex");
const apiBase = "https://api.kyerp.net";

console.log(`::add-mask::${token}`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function proofBlock(secretToken) {
  return `
shell.post("/api/__kyerp-owner-mail-live-proof", async (c) => {
  if (c.req.header("X-KYERP-Live-Proof") !== ${JSON.stringify(secretToken)}) return c.json({ ok: false, error: { code: "PROOF_FORBIDDEN" } }, 403);
  const owner = await c.env.DB.prepare(\`SELECT s.email AS email FROM auth_users u JOIN auth_user_security s ON s.user_id=u.id WHERE UPPER(TRIM(COALESCE(s.role_override,u.role,''))) IN ('SUPER_ADMIN','ADMIN') AND COALESCE(s.email_verified,0)=1 AND TRIM(COALESCE(s.email,''))<>'' ORDER BY CASE WHEN UPPER(TRIM(COALESCE(s.role_override,u.role,'')))='SUPER_ADMIN' THEN 0 ELSE 1 END LIMIT 1\`).first<any>();
  const destination = String(owner?.email || "").trim();
  if (!destination) return c.json({ ok: false, error: { code: "OWNER_EMAIL_NOT_FOUND" } }, 404);
  const key = String(c.env.RESEND_API_KEY || "").trim();
  if (!key) return c.json({ ok: false, error: { code: "RESEND_BINDING_MISSING" } }, 503);
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
  if (!response.ok) return c.json({ ok: false, error: { code: "RESEND_SEND_FAILED", status: response.status, message: String(payload?.message || "") } }, 503);
  const messageId = String(payload?.id || payload?.messageId || "").trim();
  if (!messageId) return c.json({ ok: false, error: { code: "RESEND_MESSAGE_ID_MISSING" } }, 503);
  const parts = destination.split("@");
  const masked = String(parts[0] || "").slice(0, 1) + "***@" + String(parts[1] || "");
  return c.json({ ok: true, data: { provider: "RESEND", messageId, sender: "KY ERP <admin@kyerp.net>", recipient: masked } });
});

shell.get("/api/__kyerp-owner-mail-live-proof/:messageId", async (c) => {
  if (c.req.header("X-KYERP-Live-Proof") !== ${JSON.stringify(secretToken)}) return c.json({ ok: false, error: { code: "PROOF_FORBIDDEN" } }, 403);
  const key = String(c.env.RESEND_API_KEY || "").trim();
  if (!key) return c.json({ ok: false, error: { code: "RESEND_BINDING_MISSING" } }, 503);
  const messageId = String(c.req.param("messageId") || "").trim();
  const response = await fetch("https://api.resend.com/emails/" + encodeURIComponent(messageId), {
    method: "GET",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
  });
  let payload: any = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) return c.json({ ok: false, error: { code: "RESEND_STATUS_FAILED", status: response.status, message: String(payload?.message || "") } }, 503);
  const event = String(payload?.last_event || payload?.lastEvent || payload?.status || "unknown").toLowerCase();
  return c.json({ ok: true, data: { provider: "RESEND", messageId: String(payload?.id || messageId), event } });
});

`;
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch {}
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  return payload;
}

let deliveryEvent = "";
let recipient = "";
let proofCompleted = false;
let cleanupCompleted = false;

try {
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN missing");
  if (!original.includes(marker)) throw new Error("main.ts proof insertion marker missing");

  const temporary = original.replace(marker, proofBlock(token) + marker);
  writeFileSync(mainPath, temporary, "utf8");
  if (!readFileSync(mainPath, "utf8").includes("/api/__kyerp-owner-mail-live-proof")) throw new Error("temporary proof route was not inserted");

  console.log("Deploying temporary protected proof route...");
  run("npx", ["wrangler", "deploy", "--config", "wrangler.jsonc"]);

  const sendPayload = await jsonFetch(`${apiBase}/api/__kyerp-owner-mail-live-proof`, {
    method: "POST",
    headers: { "X-KYERP-Live-Proof": token, "Content-Type": "application/json" },
  });
  const messageId = String(sendPayload?.data?.messageId || "");
  recipient = String(sendPayload?.data?.recipient || "");
  if (!messageId) throw new Error(`Resend message id missing: ${JSON.stringify(sendPayload)}`);
  console.log(`::add-mask::${messageId}`);

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const statusPayload = await jsonFetch(`${apiBase}/api/__kyerp-owner-mail-live-proof/${encodeURIComponent(messageId)}`, {
      headers: { "X-KYERP-Live-Proof": token },
    });
    deliveryEvent = String(statusPayload?.data?.event || "unknown").toLowerCase();
    if (["delivered", "opened", "clicked"].includes(deliveryEvent)) break;
    if (["bounced", "complained", "canceled", "failed"].includes(deliveryEvent)) throw new Error(`Resend delivery failed: ${deliveryEvent}`);
    await wait(5000);
  }

  if (!["delivered", "opened", "clicked"].includes(deliveryEvent)) throw new Error(`Resend delivery proof timed out: ${deliveryEvent}`);
  proofCompleted = true;
  console.log(`KY ERP owner mail delivery proof: ${deliveryEvent}; recipient=${recipient}`);
} finally {
  console.log("Restoring canonical Worker source and redeploying...");
  writeFileSync(mainPath, original, "utf8");
  if (readFileSync(mainPath, "utf8").includes("/api/__kyerp-owner-mail-live-proof")) throw new Error("proof route remained in canonical source");
  run("npx", ["wrangler", "deploy", "--config", "wrangler.jsonc"]);

  const healthResponse = await fetch(`${apiBase}/api/health`);
  const healthText = await healthResponse.text();
  if (!healthResponse.ok || !/\"ok\"\s*:\s*true/.test(healthText)) throw new Error(`canonical health check failed: ${healthResponse.status} ${healthText}`);

  const proofRouteResponse = await fetch(`${apiBase}/api/__kyerp-owner-mail-live-proof`);
  if (proofRouteResponse.status !== 404) throw new Error(`temporary proof route still reachable: HTTP ${proofRouteResponse.status}`);
  cleanupCompleted = true;
  console.log("Canonical Worker restored; temporary proof route removed.");
}

if (!proofCompleted || !cleanupCompleted) throw new Error("live proof did not complete cleanly");
console.log("KY ERP OWNER MAIL LIVE PROOF PASSED");
console.log(`Sender: KY ERP <admin@kyerp.net>`);
console.log(`Recipient: ${recipient}`);
console.log(`Provider: RESEND`);
console.log(`Delivery: ${deliveryEvent}`);
console.log("Temporary route removed: YES");
