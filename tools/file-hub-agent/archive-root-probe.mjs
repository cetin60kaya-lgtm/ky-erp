import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Read-only probe for a user-provided, existing cloud directory. This script is
// installed in Program Files with KY ERP; no network, credentials or grants.
const names = new Set(["googledrive", "google drive", "drivefs", "onedrive"]);
const evidence = ["KY-ISNET-BELGELER", "MUHASEBE", "DESEN", "BOYAHANE", "İMALAT", "YÖNETİM"];
const cloudName = name => names.has(name.toLowerCase()) || name.toLowerCase().startsWith("onedrive - ");
const accountName = name => name.toLowerCase().startsWith("drive'") ||
  ["my drive", "mydrive", "shared drives", "google drive"].includes(name.toLowerCase());
const existsDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const children = p => {
  try { return fs.readdirSync(p, { withFileTypes: true }).slice(0, 512)
    .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
    .map(entry => path.join(p, entry.name)); } catch { return []; }
};
function cloudAncestor(root) {
  let current = path.dirname(root);
  while (current !== path.dirname(current)) {
    if (cloudName(path.basename(current))) return true;
    current = path.dirname(current);
  }
  return false;
}
function validate(root) {
  if (typeof root !== "string" || !path.isAbsolute(root) || root.includes("\0")) throw Error("Geçersiz mutlak klasör yolu.");
  const normalized = path.resolve(root);
  if (normalized === path.parse(normalized).root || !cloudAncestor(normalized))
    throw Error("Bulut dizini içindeki gerçek firma alt klasörü seçilmelidir.");
  const info = fs.lstatSync(normalized);
  if (info.isSymbolicLink() || !fs.statSync(normalized).isDirectory())
    throw Error("Firma ana klasörü doğrudan bağlantı/junction veya dosya olamaz.");
  return normalized;
}
function evidenceCount(root) {
  return evidence.filter(name => existsDir(path.join(root, name))).length;
}
function safeRelative(root, relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\0") ||
    path.isAbsolute(relative)) throw Error("Geçersiz standart klasör yolu.");
  const segments = relative.split("/");
  if (segments.some(s => !s || s === "." || s === ".." || /[\\:*?"<>|]/.test(s)))
    throw Error("Geçersiz standart klasör bölümü.");
  const absolute = path.resolve(root, ...segments);
  if (!absolute.toLowerCase().startsWith(root.toLowerCase() + path.sep.toLowerCase()))
    throw Error("Firma ana klasörü dışına çıkılamaz.");
  return { segments, absolute };
}
function checkPath(root, relative, create) {
  const { segments } = safeRelative(root, relative);
  let current = root, missing = false, created = 0;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const info = fs.lstatSync(current);
      if (info.isSymbolicLink() || !fs.statSync(current).isDirectory())
        throw Error("Bağlantı veya dosya çakışması: " + relative);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      missing = true;
      if (create) { fs.mkdirSync(current); created++; }
    }
  }
  return { missing, created };
}
function scanRoot(root) {
  const found = [];
  for (const item of children(root)) {
    for (const candidate of [item, ...(accountName(path.basename(item)) ? children(item) : [])]) {
      try {
        const verified = validate(candidate);
        if (evidenceCount(verified) >= 2) found.push(verified);
      } catch { /* unrelated directory */ }
    }
  }
  return found;
}
function discover() {
  const roots = new Set();
  for (const key of ["OneDrive", "OneDriveCommercial", "OneDriveConsumer"]) {
    const value = process.env[key];
    if (value && existsDir(value)) roots.add(value);
  }
  for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
    const root = letter + ":\\";
    if (!existsDir(root)) continue;
    for (const cloud of ["Googledrive", "Google Drive", "DriveFS", "OneDrive"]) {
      const candidate = path.join(root, cloud);
      if (existsDir(candidate)) roots.add(candidate);
    }
    for (const item of children(root)) if (cloudName(path.basename(item))) roots.add(item);
  }
  const profile = os.homedir();
  if (existsDir(profile)) {
    for (const item of children(profile)) if (cloudName(path.basename(item))) roots.add(item);
  }
  const candidates = new Set();
  for (const root of roots) for (const candidate of scanRoot(root)) candidates.add(candidate);
  return { ok: true, candidates: [...candidates].sort(), rootsChecked: roots.size };
}
try {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  const action = input?.action;
  if (action === "discover") {
    process.stdout.write(JSON.stringify(discover()));
  } else if (action === "inspect") {
    const root = validate(input.root);
    const standardPaths = Array.isArray(input.standardPaths) ? input.standardPaths : [];
    if (standardPaths.length > 128) throw Error("Çok fazla standart klasör.");
    const missingPaths = [];
    let created = 0;
    for (const relative of standardPaths) {
      const result = checkPath(root, relative, false);
      if (result.missing) missingPaths.push(relative);
      created += result.created;
    }
    process.stdout.write(JSON.stringify({
      ok: true, root, evidenceCount: evidenceCount(root), missingPaths, created
    }));
  } else {
    throw Error("Bilinmeyen yerel doğrulama işlemi.");
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: String(error?.message || error).slice(0, 400) }));
  process.exitCode = 1;
}
