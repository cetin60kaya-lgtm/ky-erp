#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SOURCE_DIR = path.resolve(process.env.KYERP_DESEN_SOURCE || process.argv[2] || "");
const BASE_URL = String(process.env.KYERP_API_URL || "https://api.kyerp.net").replace(/\/$/, "");
const COMPANY = String(process.env.KYERP_COMPANY || "mecit-hakan").trim();
const USERNAME = String(process.env.KYERP_USER || "").trim();
const PASSWORD = String(process.env.KYERP_PASSWORD || "");
const BATCH_SIZE = Math.max(1, Math.min(20, Number(process.env.KYERP_DESEN_BATCH || 5)));
const PROCESS_MODE = String(process.env.KYERP_DESEN_PROCESS || "1") !== "0";
const ALLOWED = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".psd", ".tif", ".tiff", ".bmp"]);
const MANIFEST_NAME = ".kyerp-desen-import.json";

if (!SOURCE_DIR || SOURCE_DIR === path.parse(SOURCE_DIR).root) {
  console.error("Kaynak desen klasörü belirtilmedi.");
  process.exit(2);
}
if (!USERNAME || !PASSWORD) {
  console.error("KYERP_USER ve KYERP_PASSWORD zorunludur.");
  process.exit(2);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return payload;
}

async function walk(root) {
  const rows = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === MANIFEST_NAME) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED.has(ext)) continue;
      const stat = await fs.stat(full);
      rows.push({
        full,
        relative: path.relative(root, full).replaceAll("\\", "/"),
        name: entry.name,
        size: stat.size,
        mtimeMs: Math.trunc(stat.mtimeMs),
      });
    }
  }
  await visit(root);
  return rows.sort((a, b) => a.relative.localeCompare(b.relative, "tr"));
}

async function loadManifest() {
  try {
    const raw = await fs.readFile(path.join(SOURCE_DIR, MANIFEST_NAME), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { files: {} };
  } catch {
    return { version: 1, company: COMPANY, files: {} };
  }
}

async function saveManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(SOURCE_DIR, MANIFEST_NAME),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

function fingerprint(file) {
  return `${file.size}:${file.mtimeMs}`;
}

function mimeFor(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".psd": "image/vnd.adobe.photoshop",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".bmp": "image/bmp",
  })[ext] || "application/octet-stream";
}

async function login() {
  const payload = await requestJson(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!payload?.token) throw new Error("Giriş tokenı alınamadı.");
  return payload.token;
}

async function uploadOne(file, token) {
  const bytes = await fs.readFile(file.full);
  const form = new FormData();
  form.append("mainCompanySlug", COMPANY);
  form.append("relativePath", file.relative);
  form.append("file", new Blob([bytes], { type: mimeFor(file.name) }), file.name);
  return requestJson(`${BASE_URL}/api/desen/workflow/inbox/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

async function runPool(items, worker, concurrency) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function scanInbox(token) {
  return requestJson(`${BASE_URL}/api/desen/workflow/inbox/scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ mainCompanySlug: COMPANY }),
  });
}

async function processGroups(groups, token) {
  let saved = 0;
  let failed = 0;
  for (let offset = 0; offset < groups.length; offset += 40) {
    const chunk = groups.slice(offset, offset + 40).map((group) => ({
      modelName: group.modelName,
      modelCode: group.modelName,
      status: "CHANNEL_REVIEW_PENDING",
      sourceType: "FOLDER_MIGRATION",
      queueIds: (group.files || []).map((file) => file.id),
      files: (group.files || []).map((file) => ({
        queueId: file.id,
        role: file.suggestedRole || "MODEL_IMAGE",
        printAreaCode: file.suggestedPrintAreaCode || "FRONT",
      })),
      metadata: {
        migratedFromFolder: true,
        sourceRelativePaths: (group.files || []).map((file) => file.metadata?.relativePath || file.fileName),
      },
    }));
    const payload = await requestJson(`${BASE_URL}/api/desen/workflow/inbox/process-bulk`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ mainCompanySlug: COMPANY, groups: chunk }),
    });
    saved += Number(payload?.data?.saved || 0);
    failed += Number(payload?.data?.failed || 0);
    console.log(`Model işleme: ${Math.min(offset + chunk.length, groups.length)}/${groups.length} | kaydedilen ${saved} | hata ${failed}`);
  }
  return { saved, failed };
}

async function main() {
  const sourceStat = await fs.stat(SOURCE_DIR).catch(() => null);
  if (!sourceStat?.isDirectory()) throw new Error(`Kaynak klasör bulunamadı: ${SOURCE_DIR}`);

  console.log(`Kaynak: ${SOURCE_DIR}`);
  console.log(`API: ${BASE_URL}`);
  console.log(`Firma: ${COMPANY}`);
  console.log("Dosyalar taranıyor...");

  const allFiles = await walk(SOURCE_DIR);
  const manifest = await loadManifest();
  manifest.version = 1;
  manifest.company = COMPANY;
  manifest.source = SOURCE_DIR;
  manifest.files ||= {};

  const pending = allFiles.filter((file) => manifest.files[file.relative]?.fingerprint !== fingerprint(file));
  console.log(`Desteklenen dosya: ${allFiles.length} | yeni/değişen: ${pending.length} | daha önce aktarılan: ${allFiles.length - pending.length}`);

  const token = await login();
  console.log("KY ERP girişi doğrulandı.");

  let uploaded = 0;
  let failed = 0;
  await runPool(pending, async (file) => {
    try {
      const payload = await uploadOne(file, token);
      manifest.files[file.relative] = {
        fingerprint: fingerprint(file),
        uploadedAt: new Date().toISOString(),
        storageKey: payload?.data?.files?.[0]?.storageKey || "",
      };
      uploaded += 1;
      if (uploaded % 10 === 0 || uploaded === pending.length) {
        await saveManifest(manifest);
        console.log(`Yükleme: ${uploaded}/${pending.length} | hata ${failed}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`HATA ${file.relative}: ${error.message}`);
    }
  }, BATCH_SIZE);
  await saveManifest(manifest);

  console.log("R2 inbox taranıyor...");
  const scan = await scanInbox(token);
  const groups = scan?.data?.groups || [];
  const items = scan?.data?.items || [];
  console.log(`R2 bekleyen dosya: ${items.length} | önerilen model grubu: ${groups.length}`);

  let processResult = { saved: 0, failed: 0 };
  if (PROCESS_MODE && groups.length) {
    console.log("Model kartları D1 indeksine aktarılıyor...");
    processResult = await processGroups(groups, token);
  }

  const report = {
    finishedAt: new Date().toISOString(),
    source: SOURCE_DIR,
    supportedFiles: allFiles.length,
    newOrChanged: pending.length,
    uploaded,
    uploadFailed: failed,
    inboxItems: items.length,
    groups: groups.length,
    modelsSaved: processResult.saved,
    modelFailures: processResult.failed,
  };
  await fs.writeFile(
    path.join(SOURCE_DIR, "KYERP-DESEN-AKTARIM-RAPORU.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log("\nTAMAMLANDI");
  console.log(JSON.stringify(report, null, 2));
  if (failed || processResult.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nAKTARIM DURDU: ${error.message}`);
  process.exit(1);
});
