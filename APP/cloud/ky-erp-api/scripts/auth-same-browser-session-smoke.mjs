import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WORKER_ROOT = fileURLToPath(new URL("../", import.meta.url));
const WRANGLER_BIN = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const CONFIG = "wrangler.production-local.jsonc";
const DATABASE = "ky-erp-production-local";

function runSql(sql) {
  const result = spawnSync(
    process.execPath,
    [WRANGLER_BIN, "d1", "execute", DATABASE, "--local", "--config", CONFIG, "--command", sql, "--json"],
    { cwd: WORKER_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 45_000 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`D1 same-browser smoke başarısız:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout || "[]");
}

function scalar(sql, key) {
  const payload = runSql(sql);
  const rows = payload?.[0]?.results || payload?.[0]?.result || [];
  return Number(rows?.[0]?.[key] || 0);
}

const now = new Date().toISOString();
const later = new Date(Date.now() + 60_000).toISOString();
const expires = new Date(Date.now() + 86_400_000).toISOString();
const users = [
  ["guard-viewer", "VIEWER"],
  ["guard-owner", "SUPER_ADMIN"],
];

runSql(`
  DELETE FROM auth_sessions WHERE user_id IN ('guard-viewer','guard-owner');
  DELETE FROM auth_security_audit WHERE target_user_id IN ('guard-viewer','guard-owner');
  DELETE FROM auth_user_security WHERE user_id IN ('guard-viewer','guard-owner');
  DELETE FROM auth_users WHERE id IN ('guard-viewer','guard-owner');
`);

for (const [userId, role] of users) {
  runSql(`
    INSERT INTO auth_users(id,username,password_hash,full_name,role,is_active,must_change_password,created_at,updated_at)
    VALUES ('${userId}','${userId}','x','${userId}','${role}',1,0,'${now}','${now}');

    INSERT INTO auth_sessions(id,user_id,main_company_slug,token_hash,role_at_login,device_label,user_agent,ip_address,created_at,approved_at,expires_at,last_seen_at)
    VALUES
      ('${userId}-other','${userId}','mecit-hakan','hash-other','${role}','BROWSER:OTHER-${userId}','Smoke','127.0.0.1','${now}','${now}','${expires}','${now}'),
      ('${userId}-old','${userId}','mecit-hakan','hash-old','${role}','BROWSER:SAME-${userId}','Smoke','127.0.0.1','${now}','${now}','${expires}','${now}');

    INSERT INTO auth_sessions(id,user_id,main_company_slug,token_hash,role_at_login,device_label,user_agent,ip_address,created_at,approved_at,expires_at,last_seen_at)
    VALUES ('${userId}-new','${userId}','mecit-hakan','hash-new','${role}','BROWSER:SAME-${userId}','Smoke','127.0.0.1','${later}','${later}','${expires}','${later}');
  `);

  const sameActive = scalar(`SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id='${userId}' AND device_label='BROWSER:SAME-${userId}' AND revoked_at IS NULL AND expires_at>'${later}'`, "n");
  const oldRevoked = scalar(`SELECT COUNT(*) AS n FROM auth_sessions WHERE id='${userId}-old' AND revoked_at IS NOT NULL`, "n");
  const otherActive = scalar(`SELECT COUNT(*) AS n FROM auth_sessions WHERE id='${userId}-other' AND revoked_at IS NULL`, "n");
  const auditRows = scalar(`SELECT COUNT(*) AS n FROM auth_security_audit WHERE target_user_id='${userId}' AND action='SESSION_REPLACED_SAME_BROWSER'`, "n");

  if (sameActive !== 1) throw new Error(`${role}: aynı browser için aktif session sayısı 1 değil: ${sameActive}`);
  if (oldRevoked !== 1) throw new Error(`${role}: eski aynı-browser session kapanmadı.`);
  if (otherActive !== 1) throw new Error(`${role}: farklı browser session yanlışlıkla kapandı.`);
  if (auditRows < 1) throw new Error(`${role}: same-browser replacement audit kaydı oluşmadı.`);
}

console.log(JSON.stringify({ ok: true, users: users.map(([id, role]) => ({ id, role })), rule: "same user + same BROWSER = exactly one active session; different browser preserved" }, null, 2));
