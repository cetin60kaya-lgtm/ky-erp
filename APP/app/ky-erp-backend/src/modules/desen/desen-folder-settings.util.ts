import * as fs from "fs";
import * as path from "path";
import { BadRequestException } from "@nestjs/common";
import { getStorageRoot } from "../../storage/storage-path.util";

export type DesenFolderSettings = {
  incomingFolder: string;
  modelsFolder: string;
  processedFolder: string;
  errorFolder: string;
  archiveFolder: string;
  updatedAt?: string;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/^['\"]+|['\"]+$/g, "").trim();
}

function safeSlug(value: unknown) {
  return clean(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

function defaults(): DesenFolderSettings {
  const root = path.join(getStorageRoot(), "desen");
  return {
    incomingFolder: path.join(root, "gelen"),
    modelsFolder: path.join(root, "modeller"),
    processedFolder: path.join(root, "islenen"),
    errorFolder: path.join(root, "islenemeyen"),
    archiveFolder: path.join(root, "arsiv"),
  };
}

function settingsFile() {
  return path.join(getStorageRoot(), "desen", "folder-settings.json");
}

function readAll(): Record<string, DesenFolderSettings> {
  const file = settingsFile();
  try {
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeFolder(value: unknown, fallback: string) {
  const raw = clean(value);
  if (!raw) return path.resolve(fallback);
  if (!path.isAbsolute(raw)) {
    throw new BadRequestException(`Desen klasör yolu tam yol olmalıdır: ${raw}`);
  }
  return path.resolve(raw);
}

export function getDesenFolderSettings(mainCompanySlug: unknown): DesenFolderSettings {
  const base = defaults();
  const saved = readAll()[safeSlug(mainCompanySlug)] || {};
  return {
    incomingFolder: normalizeFolder(saved.incomingFolder, base.incomingFolder),
    modelsFolder: normalizeFolder(saved.modelsFolder, base.modelsFolder),
    processedFolder: normalizeFolder(saved.processedFolder, base.processedFolder),
    errorFolder: normalizeFolder(saved.errorFolder, base.errorFolder),
    archiveFolder: normalizeFolder(saved.archiveFolder, base.archiveFolder),
    updatedAt: clean(saved.updatedAt) || undefined,
  };
}

export function saveDesenFolderSettings(
  mainCompanySlug: unknown,
  input: Partial<DesenFolderSettings>,
): DesenFolderSettings {
  const current = getDesenFolderSettings(mainCompanySlug);
  const next: DesenFolderSettings = {
    incomingFolder: normalizeFolder(input.incomingFolder, current.incomingFolder),
    modelsFolder: normalizeFolder(input.modelsFolder, current.modelsFolder),
    processedFolder: normalizeFolder(input.processedFolder, current.processedFolder),
    errorFolder: normalizeFolder(input.errorFolder, current.errorFolder),
    archiveFolder: normalizeFolder(input.archiveFolder, current.archiveFolder),
    updatedAt: new Date().toISOString(),
  };
  const distinct = new Set([
    next.incomingFolder.toLocaleLowerCase("tr-TR"),
    next.modelsFolder.toLocaleLowerCase("tr-TR"),
    next.processedFolder.toLocaleLowerCase("tr-TR"),
    next.errorFolder.toLocaleLowerCase("tr-TR"),
    next.archiveFolder.toLocaleLowerCase("tr-TR"),
  ]);
  if (distinct.size !== 5) {
    throw new BadRequestException("Desen klasörlerinin her biri farklı olmalıdır.");
  }
  Object.values(next).forEach((folder) => {
    if (typeof folder === "string" && path.isAbsolute(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  });
  const all = readAll();
  all[safeSlug(mainCompanySlug)] = next;
  const file = settingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, JSON.stringify(all, null, 2), "utf8");
  fs.renameSync(temporary, file);
  return next;
}

export function testDesenFolderSettings(
  mainCompanySlug: unknown,
  input?: Partial<DesenFolderSettings>,
) {
  const current = input
    ? {
        ...getDesenFolderSettings(mainCompanySlug),
        ...input,
      }
    : getDesenFolderSettings(mainCompanySlug);
  const normalized: DesenFolderSettings = {
    incomingFolder: normalizeFolder(current.incomingFolder, defaults().incomingFolder),
    modelsFolder: normalizeFolder(current.modelsFolder, defaults().modelsFolder),
    processedFolder: normalizeFolder(current.processedFolder, defaults().processedFolder),
    errorFolder: normalizeFolder(current.errorFolder, defaults().errorFolder),
    archiveFolder: normalizeFolder(current.archiveFolder, defaults().archiveFolder),
  };
  const checks = Object.entries(normalized).map(([key, folder]) => {
    fs.mkdirSync(folder, { recursive: true });
    const probe = path.join(folder, `.kyerp-write-test-${process.pid}-${Date.now()}`);
    try {
      fs.writeFileSync(probe, "ok", "utf8");
      const writable = fs.readFileSync(probe, "utf8") === "ok";
      return { key, folder, exists: fs.existsSync(folder), writable };
    } finally {
      if (fs.existsSync(probe)) fs.unlinkSync(probe);
    }
  });
  const supported = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
  const pendingFileCount = fs.existsSync(normalized.incomingFolder)
    ? fs
        .readdirSync(normalized.incomingFolder, { withFileTypes: true })
        .filter((item) => item.isFile() && supported.has(path.extname(item.name).toLowerCase())).length
    : 0;
  return {
    ok: checks.every((item) => item.exists && item.writable),
    settings: normalized,
    checks,
    pendingFileCount,
    testedAt: new Date().toISOString(),
  };
}
