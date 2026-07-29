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

type FolderLinkResult = {
  key: keyof Omit<DesenFolderSettings, "updatedAt">;
  canonicalPath: string;
  targetPath: string;
  mode: "DEFAULT" | "JUNCTION" | "DIRECT";
  migratedCount: number;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/^['\"]+|['\"]+$/g, "").trim();
}

function safeSlug(value: unknown) {
  return (
    clean(value)
      .toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default"
  );
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
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
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

function samePath(left: string, right: string) {
  return path.resolve(left).toLocaleLowerCase("tr-TR") === path.resolve(right).toLocaleLowerCase("tr-TR");
}

function isInside(candidate: string, parent: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function uniqueTarget(targetPath: string) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const parsed = path.parse(targetPath);
  let index = 1;
  let candidate = path.join(parsed.dir, `${parsed.name}-aktarilan-${index}${parsed.ext}`);
  while (fs.existsSync(candidate)) {
    index += 1;
    candidate = path.join(parsed.dir, `${parsed.name}-aktarilan-${index}${parsed.ext}`);
  }
  return candidate;
}

function migrateDirectoryContents(sourceDir: string, targetDir: string) {
  if (!fs.existsSync(sourceDir)) return 0;
  fs.mkdirSync(targetDir, { recursive: true });
  let migratedCount = 0;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const desired = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      migratedCount += migrateDirectoryContents(source, desired);
      if (fs.existsSync(source) && fs.readdirSync(source).length === 0) fs.rmdirSync(source);
      continue;
    }
    const target = uniqueTarget(desired);
    try {
      fs.renameSync(source, target);
    } catch {
      fs.copyFileSync(source, target);
      fs.unlinkSync(source);
    }
    migratedCount += 1;
  }
  return migratedCount;
}

function ensureCanonicalLink(
  key: FolderLinkResult["key"],
  canonicalPath: string,
  targetPath: string,
): FolderLinkResult {
  const canonical = path.resolve(canonicalPath);
  const target = path.resolve(targetPath);
  fs.mkdirSync(target, { recursive: true });

  if (samePath(canonical, target)) {
    fs.mkdirSync(canonical, { recursive: true });
    return { key, canonicalPath: canonical, targetPath: target, mode: "DEFAULT", migratedCount: 0 };
  }
  if (isInside(target, canonical)) {
    throw new BadRequestException(
      `${key} hedefi standart klasörün içinde olamaz: ${target}`,
    );
  }
  if (process.platform !== "win32") {
    return { key, canonicalPath: canonical, targetPath: target, mode: "DIRECT", migratedCount: 0 };
  }

  let migratedCount = 0;
  if (fs.existsSync(canonical)) {
    const stat = fs.lstatSync(canonical);
    if (stat.isSymbolicLink()) {
      let currentTarget = "";
      try {
        currentTarget = fs.realpathSync(canonical);
      } catch {
        currentTarget = "";
      }
      if (currentTarget && samePath(currentTarget, target)) {
        return { key, canonicalPath: canonical, targetPath: target, mode: "JUNCTION", migratedCount: 0 };
      }
      fs.unlinkSync(canonical);
    } else if (stat.isDirectory()) {
      migratedCount = migrateDirectoryContents(canonical, target);
      if (fs.readdirSync(canonical).length === 0) fs.rmdirSync(canonical);
    } else {
      throw new BadRequestException(`Standart desen yolu klasör değil: ${canonical}`);
    }
  }
  fs.mkdirSync(path.dirname(canonical), { recursive: true });
  fs.symlinkSync(target, canonical, "junction");
  return { key, canonicalPath: canonical, targetPath: target, mode: "JUNCTION", migratedCount };
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

export function applyDesenFolderLinks(settings: DesenFolderSettings) {
  const base = defaults();
  return [
    ensureCanonicalLink("incomingFolder", base.incomingFolder, settings.incomingFolder),
    ensureCanonicalLink("modelsFolder", base.modelsFolder, settings.modelsFolder),
    ensureCanonicalLink("processedFolder", base.processedFolder, settings.processedFolder),
    ensureCanonicalLink("errorFolder", base.errorFolder, settings.errorFolder),
    ensureCanonicalLink("archiveFolder", base.archiveFolder, settings.archiveFolder),
  ];
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
  Object.entries(next).forEach(([key, folder]) => {
    if (key !== "updatedAt" && typeof folder === "string") fs.mkdirSync(folder, { recursive: true });
  });
  applyDesenFolderLinks(next);
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
    ? { ...getDesenFolderSettings(mainCompanySlug), ...input }
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
