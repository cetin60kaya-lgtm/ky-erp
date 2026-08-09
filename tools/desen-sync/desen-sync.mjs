#!/usr/bin/env node
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import process from "node:process";
import sharp from "sharp";

const ROOT = path.resolve(String(process.env.KYERP_DESEN_ROOT || ""));
const API = String(process.env.KYERP_API_URL || "https://api.kyerp.net").replace(/\/$/, "");
const COMPANY = String(process.env.KYERP_COMPANY || "mecit-hakan").trim();
const USERNAME = String(process.env.KYERP_USER || "").trim();
const PASSWORD = String(process.env.KYERP_PASSWORD || "");
const POLL_MS = Math.max(2000, Number(process.env.KYERP_DESEN_POLL_MS || 4000));
const ONCE = process.argv.includes("--once") || String(process.env.KYERP_DESEN_ONCE || "") === "1";
const MAX_FAILURES = 5;
const STABLE_MS = 5000;
const SUPPORTED = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const PREVIEW_MAX = 1600;
const THUMB_MAX = 420;

if (!ROOT || ROOT === path.parse(ROOT).root) {
  console.error("KYERP_DESEN_ROOT tanımlı değil.");
  process.exit(2);
}
if (!USERNAME || !PASSWORD) {
  console.error("KYERP kullanıcı bilgileri tanımlı değil.");
  process.exit(2);
}

const DIRS = {
  incoming: path.join(ROOT, "gelen"),
  models: path.join(ROOT, "modeller"),
  errors: path.join(ROOT, "hata"),
  unprocessed: path.join(ROOT, "islenemeyen"),
};
const LOCAL_STATE_ROOT = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "KYERP",
  "DesenSync",
);
const STATE_FILE = path.join(LOCAL_STATE_ROOT, "state.json");
const LOG_DIR = path.join(LOCAL_STATE_ROOT, "logs");

let token = "";
let state = { version: 2, files: {}, lastHeartbeatAt: "", lastSuccessAt: "" };
const stability = new Map();
let stopping = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(ROOT, { recursive: true }),
    fs.mkdir(DIRS.incoming, { recursive: true }),
    fs.mkdir(DIRS.models, { recursive: true }),
    fs.mkdir(DIRS.errors, { recursive: true }),
    fs.mkdir(DIRS.unprocessed, { recursive: true }),
    fs.mkdir(LOCAL_STATE_ROOT, { recursive: true }),
    fs.mkdir(LOG_DIR, { recursive: true }),
  ]);
}

async function log(message, level = "INFO") {
  const line = `${nowIso()} [${level}] ${message}`;
  console.log(line);
  try {
    await fs.appendFile(path.join(LOG_DIR, `${dateStamp()}.log`), `${line}\n`, "utf8");
  } catch {
    // Log yazılamaması senkronu durdurmaz.
  }
}

async function loadState() {
  try {
    const parsed = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
    if (parsed && typeof parsed === "object") state = { ...state, ...parsed, files: parsed.files || {} };
  } catch {
    // İlk çalışma.
  }
}

async function saveState() {
  state.updatedAt = nowIso();
  const temp = `${STATE_FILE}.tmp`;
  await fs.writeFile(temp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(temp, STATE_FILE).catch(async () => {
    await fs.copyFile(temp, STATE_FILE);
    await fs.unlink(temp).catch(() => {});
  });
}

function normalizeText(value) {
  return String(value || "")
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "O")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "C")
    .replace(/ç/g, "c")
    .toUpperCase();
}

function inferArea(value) {
  const text = normalizeText(value).replace(/[_-]+/g, " ");
  if (/\bARKA\b|\bBACK\b/.test(text)) return { code: "BACK", name: "Arka" };
  if (/ENSE ETIKET|NECK LABEL/.test(text)) return { code: "NECK_LABEL", name: "Ense Etiket" };
  if (/\bENSE\b|\bNECK\b/.test(text)) return { code: "NECK", name: "Ense" };
  if (/SOL KOL|LEFT SLEEVE/.test(text)) return { code: "LEFT_SLEEVE", name: "Sol Kol" };
  if (/SAG KOL|RIGHT SLEEVE/.test(text)) return { code: "RIGHT_SLEEVE", name: "Sağ Kol" };
  if (/SOL PACA|LEFT LEG/.test(text)) return { code: "LEFT_LEG", name: "Sol Paça" };
  if (/SAG PACA|RIGHT LEG/.test(text)) return { code: "RIGHT_LEG", name: "Sağ Paça" };
  if (/\bCEP\b|\bPOCKET\b/.test(text)) return { code: "POCKET", name: "Cep" };
  return { code: "FRONT", name: "Ön" };
}

function cleanModelName(fileName) {
  let base = path.basename(fileName, path.extname(fileName)).trim();
  base = base.replace(/-thumb$/i, "");
  base = base.replace(/[-_][0-9a-f]{8,16}$/i, "");
  if (base.includes("__")) base = base.split("__")[0];
  base = base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base || path.basename(fileName, path.extname(fileName));
}

function isLegacyThumb(fileName) {
  return /(?:-|_)thumb\.(?:png|jpe?g|webp)$/i.test(fileName);
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function requestJson(url, options = {}, retryAuth = true) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (response.status === 401 && retryAuth) {
    token = "";
    await login();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    return requestJson(url, { ...options, headers }, false);
  }
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.message || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.code = body?.error?.code || "HTTP_ERROR";
    throw error;
  }
  return body;
}

async function login() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.token) {
    throw new Error(body?.error?.message || "KY ERP girişi doğrulanamadı.");
  }
  token = body.token;
}

async function heartbeat(extra = {}) {
  if (!token) await login();
  await requestJson(`${API}/api/desen/bridge/heartbeat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-KYERP-Device": os.hostname(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      mainCompanySlug: COMPANY,
      deviceName: os.hostname(),
      rootName: path.basename(ROOT),
      version: "2.0",
      ...extra,
    }),
  });
  state.lastHeartbeatAt = nowIso();
}

async function buildWebImages(filePath) {
  const base = sharp(filePath, { failOn: "none" }).rotate();
  const metadata = await base.metadata();
  const preview = await base
    .clone()
    .resize({ width: PREVIEW_MAX, height: PREVIEW_MAX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78, effort: 4, smartSubsample: true })
    .toBuffer();
  const thumbnail = await base
    .clone()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 68, effort: 4, smartSubsample: true })
    .toBuffer();
  return { preview, thumbnail, metadata };
}

async function ingest(filePath, stat, hash) {
  const fileName = path.basename(filePath);
  const modelName = cleanModelName(fileName);
  const area = inferArea(fileName);
  const { preview, thumbnail, metadata } = await buildWebImages(filePath);
  const form = new FormData();
  form.append("mainCompanySlug", COMPANY);
  form.append("modelName", modelName);
  form.append("printAreaCode", area.code);
  form.append("printAreaName", area.name);
  form.append("sourceOriginalName", fileName);
  form.append("sourceRelativePath", path.relative(ROOT, filePath).replaceAll("\\", "/"));
  form.append("sourceSha256", hash);
  form.append("sourceLocalSize", String(stat.size));
  form.append("sourceModifiedAt", new Date(stat.mtimeMs).toISOString());
  form.append("sourceType", "UXP_FOLDER_BRIDGE");
  form.append("preview", new Blob([preview], { type: "image/webp" }), `${modelName}.webp`);
  form.append("thumbnail", new Blob([thumbnail], { type: "image/webp" }), `${modelName}-thumb.webp`);

  if (!token) await login();
  const payload = await requestJson(`${API}/api/desen/bridge/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "X-KYERP-Device": os.hostname() },
    body: form,
  });
  return {
    ...payload?.data,
    modelName,
    area,
    previewBytes: preview.length,
    thumbnailBytes: thumbnail.length,
    width: metadata.width || 0,
    height: metadata.height || 0,
  };
}

async function uniqueDestination(dir, fileName) {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  try {
    await fs.access(candidate);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    candidate = path.join(dir, `${stem}__${stamp}${ext}`);
  } catch {
    // Dosya yok, orijinal ad kullanılabilir.
  }
  return candidate;
}

async function moveFile(source, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const target = await uniqueDestination(targetDir, path.basename(source));
  try {
    await fs.rename(source, target);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    await fs.copyFile(source, target);
    await fs.unlink(source);
  }
  return target;
}

async function listIncoming() {
  const entries = await fs.readdir(DIRS.incoming, { withFileTypes: true }).catch(() => []);
  const rows = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith(".~") || entry.name.startsWith("~$")) continue;
    const full = path.join(DIRS.incoming, entry.name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat?.isFile()) continue;
    rows.push({ full, name: entry.name, stat });
  }
  return rows.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
}

function stableEnough(row) {
  const key = row.full;
  const signature = `${row.stat.size}:${Math.trunc(row.stat.mtimeMs)}`;
  const current = stability.get(key);
  const now = Date.now();
  if (!current || current.signature !== signature) {
    stability.set(key, { signature, since: now });
    return false;
  }
  return now - current.since >= STABLE_MS;
}

async function markFailure(fileName, error) {
  const current = state.files[fileName] || {};
  const failures = Number(current.failures || 0) + 1;
  state.files[fileName] = {
    ...current,
    failures,
    lastError: error?.message || String(error),
    lastErrorAt: nowIso(),
  };
  await saveState();
  return failures;
}

async function processOne(row) {
  if (!stableEnough(row)) return false;
  stability.delete(row.full);

  const ext = path.extname(row.name).toLowerCase();
  if (!SUPPORTED.has(ext) || isLegacyThumb(row.name)) {
    const reason = isLegacyThumb(row.name) ? "Eski thumbnail dosyası" : "Desteklenmeyen otomatik görsel türü";
    const target = await moveFile(row.full, DIRS.unprocessed);
    await log(`${row.name} işlenmedi (${reason}) -> ${path.basename(target)}`, "WARN");
    state.files[row.name] = { status: "UNPROCESSED", reason, movedAt: nowIso() };
    await saveState();
    return true;
  }

  try {
    const hash = await sha256(row.full);
    const result = await ingest(row.full, row.stat, hash);
    const target = await moveFile(row.full, DIRS.models);
    state.files[row.name] = {
      status: result?.duplicate ? "DUPLICATE" : "SYNCED",
      hash,
      modelId: result?.modelId || result?.model?.id || "",
      modelName: result?.modelName || cleanModelName(row.name),
      area: result?.area?.code || "FRONT",
      localArchive: path.basename(target),
      previewBytes: result?.previewBytes || 0,
      thumbnailBytes: result?.thumbnailBytes || 0,
      syncedAt: nowIso(),
      failures: 0,
    };
    state.lastSuccessAt = nowIso();
    await saveState();
    await heartbeat({
      lastModelName: state.files[row.name].modelName,
      lastModelId: state.files[row.name].modelId,
      lastSyncAt: state.lastSuccessAt,
    }).catch(() => {});
    await log(
      `${row.name} -> ${state.files[row.name].modelName} | ${state.files[row.name].area} | ` +
      `preview ${Math.round((result?.previewBytes || 0) / 1024)} KB | thumb ${Math.round((result?.thumbnailBytes || 0) / 1024)} KB` +
      `${result?.duplicate ? " | tekrar kayıt, R2'ye yeniden yazılmadı" : ""}`,
    );
    return true;
  } catch (error) {
    const failures = await markFailure(row.name, error);
    const retryable = !error?.status || error.status >= 500 || error.status === 429;
    await log(`${row.name} senkron hatası (${failures}/${MAX_FAILURES}): ${error.message}`, "ERROR");
    if (!retryable || failures >= MAX_FAILURES) {
      const target = await moveFile(row.full, DIRS.errors).catch(() => null);
      state.files[row.name] = {
        ...(state.files[row.name] || {}),
        status: "ERROR",
        movedTo: target ? path.basename(target) : "",
        failedAt: nowIso(),
      };
      await saveState();
      await log(`${row.name} hata klasörüne alındı.`, "ERROR");
      return true;
    }
    return false;
  }
}

async function scanCycle() {
  const rows = await listIncoming();
  for (const row of rows) {
    if (stopping) break;
    await processOne(row);
  }
}

async function main() {
  await ensureDirs();
  await loadState();
  await log(`KY ERP Desen Sync başladı. Kök: ${ROOT}`);
  await login();
  await heartbeat({ startedAt: nowIso() });
  await log("KY ERP bağlantısı doğrulandı. Gelen klasörü izleniyor.");

  if (ONCE) {
    await scanCycle();
    return;
  }

  let lastHeartbeat = Date.now();
  while (!stopping) {
    await scanCycle();
    if (Date.now() - lastHeartbeat >= 60_000) {
      await heartbeat().catch((error) => log(`Heartbeat hatası: ${error.message}`, "WARN"));
      lastHeartbeat = Date.now();
      await saveState().catch(() => {});
    }
    await sleep(POLL_MS);
  }
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

main().catch(async (error) => {
  await log(`DESEN SYNC DURDU: ${error.message}`, "ERROR");
  process.exit(1);
});
