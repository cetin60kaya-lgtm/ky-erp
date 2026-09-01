#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const VERSION = "1.0.0";
const API = String(process.env.KYERP_API_URL || "https://api.kyerp.net").replace(/\/+$/, "");
const AGENT_KEY = String(process.env.KYERP_AGENT_KEY || "").trim();
const COMPANY = String(process.env.KYERP_MAIN_COMPANY_SLUG || "mecit-hakan").trim();
const DEVICE = String(process.env.KYERP_DEVICE_NAME || os.hostname()).trim();
const CONFIG_PATH = process.env.KYERP_FILE_HUB_CONFIG || path.join(process.cwd(), "file-hub-agent.config.json");
const HEARTBEAT_MS = Math.max(30_000, Number(process.env.KYERP_HEARTBEAT_MS || 60_000));
const RESCAN_MS = Math.max(60_000, Number(process.env.KYERP_RESCAN_MS || 10 * 60_000));
const STABLE_DELAY_MS = Math.max(500, Number(process.env.KYERP_STABLE_DELAY_MS || 1500));
const IGNORE = /(^|[\\/])(\.git|node_modules|~\$|\.tmp|\.part|\.crdownload|desktop\.ini|thumbs\.db)([\\/]|$)/i;

if (!AGENT_KEY) throw new Error("KYERP_AGENT_KEY zorunludur.");

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function normalizeRel(root, absolute) { return path.relative(root, absolute).split(path.sep).join("/"); }
function extOf(file) { return path.extname(file).replace(/^\./, "").toUpperCase(); }
function mimeOf(ext) {
  return ({ JPG:"image/jpeg",JPEG:"image/jpeg",PNG:"image/png",WEBP:"image/webp",PDF:"application/pdf",XML:"application/xml",PSD:"image/vnd.adobe.photoshop",AI:"application/postscript",ZIP:"application/zip",XLSX:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",DOCX:"application/vnd.openxmlformats-officedocument.wordprocessingml.document" })[ext] || "application/octet-stream";
}
function logicalKeyOf(fileName) {
  return fileName.replace(/\.[^.]+$/, "").replace(/\b(final|son|yeni|rev\s*\d+)\b/gi, " ").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}
async function loadConfig() {
  const raw = JSON.parse(await fsp.readFile(CONFIG_PATH, "utf8"));
  const rows = Array.isArray(raw) ? raw : raw.connections;
  if (!Array.isArray(rows) || !rows.length) throw new Error("Config içinde connections bulunamadı.");
  return rows.map((row, index) => ({
    storageConnectionId: String(row.storageConnectionId || "").trim(),
    rootPath: path.resolve(String(row.rootPath || "").trim()),
    providerType: String(row.providerType || "LOCAL_FOLDER").trim().toUpperCase(),
    include: Array.isArray(row.include) ? row.include.map(String) : [],
    exclude: Array.isArray(row.exclude) ? row.exclude.map(String) : [],
    name: String(row.name || `storage-${index+1}`),
  })).filter(row => row.storageConnectionId && row.rootPath);
}
async function api(endpoint, payload) {
  const response = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type":"application/json", "X-KYERP-Agent-Key":AGENT_KEY, "X-KYERP-Tenant-Slug":COMPANY },
    body: JSON.stringify({ mainCompanySlug: COMPANY, deviceName: DEVICE, ...payload }),
  });
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw:text }; }
  if (!response.ok || data?.ok === false) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  return data;
}
async function statStable(file) {
  const first = await fsp.stat(file);
  if (!first.isFile()) return null;
  await sleep(STABLE_DELAY_MS);
  const second = await fsp.stat(file);
  if (!second.isFile() || first.size !== second.size || first.mtimeMs !== second.mtimeMs) return null;
  return second;
}
async function sha256(file) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(file);
    input.on("error", reject); input.on("data", chunk => hash.update(chunk)); input.on("end", () => resolve(hash.digest("hex")));
  });
}
function allowedByRules(connection, rel) {
  if (IGNORE.test(rel)) return false;
  const lower = rel.toLowerCase();
  if (connection.exclude.some(v => lower.includes(String(v).toLowerCase()))) return false;
  if (connection.include.length && !connection.include.some(v => lower.includes(String(v).toLowerCase()))) return false;
  return true;
}
async function ingestFile(connection, absolute) {
  const rel = normalizeRel(connection.rootPath, absolute);
  if (!rel || !allowedByRules(connection, rel)) return;
  let stat;
  try { stat = await statStable(absolute); } catch { return; }
  if (!stat) return;
  const fileName = path.basename(absolute), extension = extOf(fileName);
  const digest = await sha256(absolute);
  await api("/api/auth/file-hub-agent/ingest", {
    storageConnectionId: connection.storageConnectionId,
    relativePath: rel,
    fileName,
    extension,
    mimeType: mimeOf(extension),
    sizeBytes: stat.size,
    sha256: digest,
    modifiedAt: new Date(stat.mtimeMs).toISOString(),
    logicalKey: logicalKeyOf(fileName),
    metadata: { agentVersion:VERSION, providerType:connection.providerType, rootName:connection.name },
  });
  console.log(`[INGEST] ${connection.name}: ${rel}`);
}
async function markMissing(connection, absolute) {
  const rel = normalizeRel(connection.rootPath, absolute);
  if (!rel || !allowedByRules(connection, rel)) return;
  try { await fsp.access(absolute); return; } catch {}
  await api("/api/auth/file-hub-agent/missing", { storageConnectionId:connection.storageConnectionId, relativePath:rel });
  console.log(`[MISSING] ${connection.name}: ${rel}`);
}
async function walk(connection, dir) {
  let entries; try { entries = await fsp.readdir(dir, { withFileTypes:true }); } catch { return; }
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name); const rel = normalizeRel(connection.rootPath, absolute);
    if (!allowedByRules(connection, rel)) continue;
    if (entry.isDirectory()) await walk(connection, absolute);
    else if (entry.isFile()) await ingestFile(connection, absolute);
  }
}
function watchConnection(connection) {
  if (!fs.existsSync(connection.rootPath)) { console.error(`[YOK] ${connection.name}: ${connection.rootPath}`); return null; }
  try {
    return fs.watch(connection.rootPath, { recursive:true }, async (eventType, fileName) => {
      if (!fileName) return;
      const absolute = path.join(connection.rootPath, String(fileName));
      if (IGNORE.test(absolute)) return;
      try {
        const stat = await fsp.stat(absolute);
        if (stat.isFile()) await ingestFile(connection, absolute);
      } catch {
        if (eventType === "rename") await markMissing(connection, absolute);
      }
    });
  } catch (error) { console.error(`[WATCH HATA] ${connection.name}: ${error.message}`); return null; }
}
async function heartbeat(connections, lastError="") {
  await api("/api/auth/file-hub-agent/heartbeat", {
    version: VERSION,
    watchedConnections: connections.map(c => ({ id:c.storageConnectionId, name:c.name, rootPath:c.rootPath, providerType:c.providerType })),
    lastError: lastError || null,
    metadata: { platform:process.platform, node:process.version },
  });
}

const connections = await loadConfig();
console.log(`KY File Agent ${VERSION} | Firma=${COMPANY} | Cihaz=${DEVICE} | Kaynak=${connections.length}`);
let lastError = "";
await heartbeat(connections);
for (const connection of connections) {
  console.log(`[TARAMA] ${connection.name}: ${connection.rootPath}`);
  await walk(connection, connection.rootPath);
  watchConnection(connection);
}
setInterval(() => heartbeat(connections,lastError).catch(error => { lastError=error.message; console.error("[HEARTBEAT]",error.message); }), HEARTBEAT_MS).unref();
setInterval(async () => {
  for (const connection of connections) {
    try { await walk(connection, connection.rootPath); lastError=""; }
    catch(error){ lastError=error.message; console.error(`[RESCAN HATA] ${connection.name}:`,error.message); }
  }
}, RESCAN_MS).unref();
process.on("unhandledRejection", error => { lastError=error instanceof Error?error.message:String(error); console.error("[HATA]",lastError); });
await new Promise(() => {});
