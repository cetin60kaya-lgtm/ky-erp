import * as path from "path";
import * as fs from "fs";
import { BuildStoragePathInput } from "./storage.types";

const SETTINGS_FILE = "storage-settings.json";

function settingsPath() {
  return path.join(process.cwd(), SETTINGS_FILE);
}

export function readStorageSettings() {
  try {
    const filePath = settingsPath();
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8")) || {};
  } catch {
    return {};
  }
}

export function writeStorageSettings(settings: Record<string, any>) {
  const next = { ...readStorageSettings(), ...settings };
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function getStorageRoot() {
  const envPath =
    process.env.KYERP_STORAGE_ROOT ||
    process.env.STORAGE_PATH ||
    process.env.STORAGE_ROOT;
  if (envPath) return path.resolve(envPath);
  const configuredRoot = String(readStorageSettings()?.storageRoot || "").trim();
  if (configuredRoot) return path.resolve(configuredRoot);
  return process.platform === "win32"
    ? "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE"
    : "/opt/ky-erp/storage";
}

function slugToken(value: any, fallback: string) {
  const cleaned =
    String(value ?? "")
      .toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback;
  return cleaned.slice(0, 80);
}

export function buildStoragePath(input: BuildStoragePathInput) {
  const date = input.date ? new Date(input.date) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const tokens: Record<string, string> = {
    firma: slugToken(input.firmSlug, "firma-yok"),
    model: slugToken(input.modelSlug, "model-yok"),
    personel: slugToken(input.personelSlug, "personel-yok"),
    yil: String(safeDate.getFullYear()),
    ay: String(safeDate.getMonth() + 1).padStart(2, "0"),
    cekTipi: slugToken(input.extraTokens?.cekTipi, "genel"),
  };
  Object.entries(input.extraTokens || {}).forEach(([key, value]) => {
    tokens[key] = slugToken(value, "genel");
  });

  const relativeDir = String(input.targetPathTemplate || "")
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => tokens[key] || slugToken("", "genel"))
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/");
  const fileName = input.storedFileName || input.originalFileName;
  const relativePath = [relativeDir, fileName].filter(Boolean).join("/");
  const storageRoot = getStorageRoot();
  return {
    storageRoot,
    relativeDir,
    relativePath,
    absolutePath: path.join(storageRoot, ...relativePath.split("/")),
    publicUrl: `/storage/${relativePath}`,
  };
}
