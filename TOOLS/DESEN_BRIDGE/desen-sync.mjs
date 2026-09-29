import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const VERSION = '3.0.0';
const STARTED_AT = new Date().toISOString();
const SUPPORTED = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const SKIP_EXT = new Set(['.tmp', '.part', '.crdownload']);
const RETRY_MS = 60_000;
const HEARTBEAT_MS = 60_000;

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const rows = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const out = {};
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const scriptPath = new URL(import.meta.url).pathname;
const scriptDir = path.dirname(decodeURIComponent(scriptPath).replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)));
const dotenv = readDotEnv(path.join(scriptDir, '.env'));
for (const [key, value] of Object.entries(dotenv)) if (process.env[key] === undefined) process.env[key] = value;

function envText(key, fallback = '') {
  return String(process.env[key] ?? fallback).trim();
}

if (!envText('KYERP_DESEN_ROOT')) {
  console.error('KYERP_DESEN_ROOT zorunludur. .env dosyasında DESINATOR kökünü belirtin.');
  process.exit(2);
}

const root = path.resolve(envText('KYERP_DESEN_ROOT'));
const apiBase = envText('KYERP_API_BASE', 'https://api.kyerp.net/api').replace(/\/+$/, '');
const token = envText('KYERP_API_TOKEN');
const companySlug = envText('KYERP_MAIN_COMPANY_SLUG', 'mecit-hakan');
const deviceName = envText('KYERP_DEVICE_NAME', `DESEN:${os.hostname()}`);
const pollMs = Math.max(2_000, Number(envText('KYERP_POLL_MS', '5000')) || 5000);

const folders = {
  incoming: path.join(root, 'Gelen Desenler'),
  models: path.join(root, 'Modeller'),
  error: path.join(root, 'Hata'),
  unsupported: path.join(root, 'İşlenemeyen'),
  state: path.join(root, '.kyerp'),
};
const stateFile = path.join(folders.state, 'desen-bridge-state.json');
const statusFile = path.join(folders.state, 'desen-bridge-status.json');

let stopping = false;
let state = { version: 1, processed: {}, updatedAt: '' };
let lastSyncAt = '';
let lastModelName = '';
let lastModelId = '';
let lastError = '';
let lastHeartbeatAt = 0;
const inFlight = new Set();
const retryAfter = new Map();

function safeSegment(value) {
  return String(value || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Adsız';
}

function normalizeForMatch(value) {
  return String(value || '').toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function inferArea(value) {
  const name = normalizeForMatch(value);
  if (/ARKA|BACK/.test(name)) return ['BACK', 'Arka'];
  if (/ENSE ETIKET|NECK LABEL/.test(name)) return ['NECK_LABEL', 'Ense Etiket'];
  if (/ENSE|NECK/.test(name)) return ['NECK', 'Ense'];
  if (/SOL KOL|LEFT SLEEVE/.test(name)) return ['LEFT_SLEEVE', 'Sol Kol'];
  if (/SAG KOL|RIGHT SLEEVE/.test(name)) return ['RIGHT_SLEEVE', 'Sağ Kol'];
  if (/SOL PACA|LEFT LEG/.test(name)) return ['LEFT_LEG', 'Sol Paça'];
  if (/SAG PACA|RIGHT LEG/.test(name)) return ['RIGHT_LEG', 'Sağ Paça'];
  if (/CEP|POCKET/.test(name)) return ['POCKET', 'Cep'];
  if (/YAKA|COLLAR/.test(name)) return ['COLLAR', 'Yaka'];
  if (/KAPUSON|HOOD/.test(name)) return ['HOOD', 'Kapüşon'];
  return ['FRONT', 'Ön'];
}

function inferModelName(filePath) {
  const relative = path.relative(folders.incoming, filePath);
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.length > 1) return safeSegment(parts[0]);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext)
    .replace(/\b(ÖN|ON|FRONT|ARKA|BACK|ENSE\s*ETIKET|ENSE|NECK\s*LABEL|NECK|SOL\s*KOL|SAG\s*KOL|SAĞ\s*KOL|LEFT\s*SLEEVE|RIGHT\s*SLEEVE|SOL\s*PACA|SOL\s*PAÇA|SAG\s*PACA|SAĞ\s*PAÇA|LEFT\s*LEG|RIGHT\s*LEG|CEP|POCKET|YAKA|COLLAR|KAPUSON|KAPÜŞON|HOOD)\b.*$/i, '')
    .replace(/[-_]+$/g, '').trim();
  return safeSegment(base || path.basename(filePath, ext));
}

async function ensureFolders() {
  await Promise.all(Object.values(folders).map((folder) => fsp.mkdir(folder, { recursive: true })));
  try {
    state = JSON.parse(await fsp.readFile(stateFile, 'utf8'));
    if (!state || typeof state !== 'object') throw new Error('invalid');
    state.processed ||= {};
  } catch {
    state = { version: 1, processed: {}, updatedAt: '' };
  }
}

async function saveState() {
  state.updatedAt = new Date().toISOString();
  const temp = `${stateFile}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fsp.rename(temp, stateFile);
}

async function writeStatus(extra = {}) {
  const payload = {
    version: VERSION,
    startedAt: STARTED_AT,
    updatedAt: new Date().toISOString(),
    deviceName,
    rootPath: root,
    incomingPath: folders.incoming,
    modelsPath: folders.models,
    errorPath: folders.error,
    unprocessedPath: folders.unsupported,
    lastSyncAt,
    lastModelName,
    lastModelId,
    lastError,
    ...extra,
  };
  const temp = `${statusFile}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fsp.rename(temp, statusFile);
}

async function sha256(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function stableFile(filePath) {
  const first = await fsp.stat(filePath);
  if (!first.isFile() || first.size <= 0 || Date.now() - first.mtimeMs < 1500) return null;
  await new Promise((resolve) => setTimeout(resolve, 700));
  const second = await fsp.stat(filePath);
  if (first.size !== second.size || first.mtimeMs !== second.mtimeMs) return null;
  return second;
}

async function listFiles(folder) {
  const output = [];
  const walk = async (current) => {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) output.push(full);
    }
  };
  await walk(folder);
  return output;
}

async function uniqueTarget(folder, fileName, sourceHash = '') {
  await fsp.mkdir(folder, { recursive: true });
  const cleanName = safeSegment(fileName);
  const initial = path.join(folder, cleanName);
  try {
    await fsp.access(initial);
    if (sourceHash && await sha256(initial) === sourceHash) return { path: initial, duplicate: true };
  } catch {
    return { path: initial, duplicate: false };
  }
  const ext = path.extname(cleanName);
  const base = path.basename(cleanName, ext);
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return { path: path.join(folder, `${base}-${stamp}${ext}`), duplicate: false };
}

async function moveSafely(source, folder, sourceHash = '') {
  const target = await uniqueTarget(folder, path.basename(source), sourceHash);
  if (target.duplicate) {
    await fsp.unlink(source);
    return target.path;
  }
  try {
    await fsp.rename(source, target.path);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    await fsp.copyFile(source, target.path, fs.constants.COPYFILE_EXCL);
    if (sourceHash && await sha256(target.path) !== sourceHash) {
      await fsp.unlink(target.path).catch(() => {});
      throw new Error('Arşiv kopyası SHA-256 doğrulamasından geçmedi.');
    }
    await fsp.unlink(source);
  }
  return target.path;
}

async function moveToProblem(source, folder, reason, details = {}) {
  const dateFolder = new Date().toISOString().slice(0, 10);
  const target = await moveSafely(source, path.join(folder, dateFolder));
  await fsp.writeFile(`${target}.kyerp.json`, `${JSON.stringify({ reason, at: new Date().toISOString(), ...details }, null, 2)}\n`, 'utf8').catch(() => {});
  return target;
}

async function makeWebImages(filePath) {
  const source = sharp(filePath, { failOn: 'error' }).rotate();
  const preview = await source.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer();
  const thumbnail = await source.clone().resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
  return { preview, thumbnail };
}

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    'X-KYERP-Device': deviceName,
    'X-KYERP-Tenant-Slug': companySlug,
  };
}

async function apiJson(pathname, options = {}) {
  if (!token) {
    const error = new Error('KYERP_API_TOKEN eksik. Desen köprüsü canlı APIye yazamaz.');
    error.code = 'TOKEN_MISSING';
    throw error;
  }
  const response = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
    signal: AbortSignal.timeout(45_000),
  });
  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload?.error?.code || payload?.code || '';
    error.payload = payload;
    throw error;
  }
  return payload?.data ?? payload;
}

async function heartbeat(force = false) {
  if (!token) return;
  const now = Date.now();
  if (!force && now - lastHeartbeatAt < HEARTBEAT_MS) return;
  lastHeartbeatAt = now;
  try {
    await apiJson('/desen/bridge/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mainCompanySlug: companySlug,
        deviceName,
        version: VERSION,
        startedAt: STARTED_AT,
        lastSyncAt,
        lastModelName,
        lastModelId,
        rootName: path.basename(root),
        rootPath: root,
        incomingPath: folders.incoming,
        modelsPath: folders.models,
        errorPath: folders.error,
        unprocessedPath: folders.unsupported,
        lastError,
      }),
    });
  } catch (error) {
    lastError = `Heartbeat: ${error.message}`;
    await writeStatus({ online: false }).catch(() => {});
  }
}

async function ingest(filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED.has(ext)) {
    if (SKIP_EXT.has(ext) || path.basename(filePath).startsWith('~')) return;
    await moveToProblem(filePath, folders.unsupported, 'UNSUPPORTED_EXTENSION', { extension: ext || '(yok)' });
    return;
  }

  const relative = path.relative(folders.incoming, filePath);
  if (inFlight.has(relative) || (retryAfter.get(relative) || 0) > Date.now()) return;
  inFlight.add(relative);

  try {
    const sourceHash = await sha256(filePath);
    const previous = state.processed[sourceHash];
    if (previous?.archivePath) {
      await moveSafely(filePath, path.dirname(path.resolve(root, previous.archivePath)), sourceHash);
      lastSyncAt = new Date().toISOString();
      await writeStatus({ lastResult: 'LOCAL_DUPLICATE' });
      return;
    }

    const modelName = inferModelName(filePath);
    const [printAreaCode, printAreaName] = inferArea(relative);
    const { preview, thumbnail } = await makeWebImages(filePath);
    const date = new Date(stat.mtimeMs);
    const archiveFolder = path.join(folders.models, safeSegment(modelName), 'Kaynak', String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, '0'));
    const archivePreview = path.relative(root, path.join(archiveFolder, path.basename(filePath))).split(path.sep).join('/');

    const form = new FormData();
    form.append('mainCompanySlug', companySlug);
    form.append('modelName', modelName);
    form.append('printAreaCode', printAreaCode);
    form.append('printAreaName', printAreaName);
    form.append('sourceSha256', sourceHash);
    form.append('sourceOriginalName', path.basename(filePath));
    form.append('sourceRelativePath', relative.split(path.sep).join('/'));
    form.append('sourceArchiveRelativePath', archivePreview);
    form.append('sourceLocalSize', String(stat.size));
    form.append('sourceModifiedAt', stat.mtime.toISOString());
    form.append('preview', new Blob([preview], { type: 'image/webp' }), `${safeSegment(modelName)}.webp`);
    form.append('thumbnail', new Blob([thumbnail], { type: 'image/webp' }), `${safeSegment(modelName)}-thumb.webp`);

    const result = await apiJson('/desen/bridge/ingest', { method: 'POST', body: form });
    const archivePath = await moveSafely(filePath, archiveFolder, sourceHash);
    state.processed[sourceHash] = {
      modelId: result?.modelId || '',
      modelName: result?.modelName || modelName,
      fileId: result?.fileId || '',
      duplicate: result?.duplicate === true,
      archivePath: path.relative(root, archivePath).split(path.sep).join('/'),
      sourceRelativePath: relative.split(path.sep).join('/'),
      processedAt: new Date().toISOString(),
    };
    await saveState();
    lastSyncAt = new Date().toISOString();
    lastModelName = result?.modelName || modelName;
    lastModelId = result?.modelId || '';
    lastError = '';
    retryAfter.delete(relative);
    await writeStatus({ online: true, lastResult: result?.duplicate ? 'API_DUPLICATE' : 'SYNCED' });
    console.log(`[OK] ${relative} -> ${lastModelName} / ${printAreaName}${result?.duplicate ? ' (mükerrer)' : ''}`);
  } catch (error) {
    const status = Number(error?.status || 0);
    lastError = `${relative}: ${error.message}`;
    await writeStatus({ online: status !== 401 && status !== 403, lastResult: 'ERROR' }).catch(() => {});
    if ([400, 413, 415, 422].includes(status) || ['WEBP_REQUIRED', 'WEB_IMAGE_TOO_LARGE', 'MODEL_NAME_REQUIRED'].includes(String(error?.code || ''))) {
      await moveToProblem(filePath, folders.error, error?.code || `HTTP_${status}`, { message: error.message, status });
    } else {
      retryAfter.set(relative, Date.now() + RETRY_MS);
      console.error(`[BEKLE] ${relative}: ${error.message}`);
    }
  } finally {
    inFlight.delete(relative);
  }
}

async function cycle() {
  if (stopping) return;
  await heartbeat();
  const files = await listFiles(folders.incoming);
  for (const filePath of files) {
    if (stopping) break;
    try {
      const stat = await stableFile(filePath);
      if (stat) await ingest(filePath, stat);
    } catch (error) {
      lastError = `${path.basename(filePath)}: ${error.message}`;
      await writeStatus({ lastResult: 'SCAN_ERROR' }).catch(() => {});
    }
  }
}

async function main() {
  await ensureFolders();
  await writeStatus({ online: Boolean(token), lastResult: 'STARTED' });
  console.log(`KY ERP Desen Köprüsü v${VERSION}`);
  console.log(`DESINATOR: ${root}`);
  console.log(`Gelen: ${folders.incoming}`);
  console.log(token ? 'API kimliği hazır.' : 'UYARI: KYERP_API_TOKEN eksik; dosyalar taşınmadan bekletilecek.');
  await heartbeat(true);
  while (!stopping) {
    try { await cycle(); }
    catch (error) {
      lastError = error.message;
      await writeStatus({ lastResult: 'CYCLE_ERROR' }).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  await writeStatus({ online: false, lastResult: 'STOPPED' }).catch(() => {});
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
