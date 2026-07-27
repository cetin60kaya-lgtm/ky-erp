import { BadRequestException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

export const MAIN_COMPANY_REQUIRED_MESSAGE = "Ana firma zorunludur.";

export function normalizeText(text: any) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

export function slugifyTr(text: any) {
  return (
    normalizeText(text)
      .toLocaleLowerCase("tr-TR")
      .replace(/[<>:"/\\|?*]/g, " ")
      .replace(/ı/g, "i")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || `kayit-${Date.now()}`
  );
}

export function apiSuccess<T>(data: T, message = "İşlem başarılı") {
  return { ok: true, data, message };
}

export function apiError(message = MAIN_COMPANY_REQUIRED_MESSAGE, errors: any[] = []) {
  return { ok: false, message, errors };
}

export function resolveMainCompanySlug(input: any) {
  return normalizeText(
    input?.mainCompanySlug ||
      input?.main_company_slug ||
      input?.slug ||
      input?.mainCompany?.slug,
  );
}

export function requireMainCompanySlug(reqOrPayload: any) {
  const source = reqOrPayload?.body || reqOrPayload?.query || reqOrPayload || {};
  const slug =
    resolveMainCompanySlug(source) ||
    resolveMainCompanySlug(reqOrPayload?.query) ||
    resolveMainCompanySlug(reqOrPayload?.body);
  if (!slug) {
    throw new BadRequestException(apiError(MAIN_COMPANY_REQUIRED_MESSAGE));
  }
  return slug;
}

export function getMonthKey(date: any = new Date()) {
  const parsed = date instanceof Date ? date : new Date(date || Date.now());
  if (Number.isNaN(parsed.getTime())) return getMonthKey(new Date());
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function getModuleCompanyRoot(moduleName: string, mainCompanySlug: string) {
  const safeModule = slugifyTr(moduleName);
  const safeCompany = requireMainCompanySlug({ mainCompanySlug });
  return ensureDir(path.join(process.cwd(), "data", "modules", safeCompany, safeModule));
}

export function getModuleMonthRoot(moduleName: string, mainCompanySlug: string, date: any = new Date()) {
  return ensureDir(path.join(getModuleCompanyRoot(moduleName, mainCompanySlug), getMonthKey(date)));
}

export function readLegacyJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeLegacyJsonAtomic<T>(filePath: string, data: T): T {
  ensureDir(path.dirname(filePath));
  const serialized = JSON.stringify(data, null, 2);
  JSON.parse(serialized);
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, serialized, "utf8");
  try {
    fs.renameSync(temp, filePath);
  } catch {
    fs.copyFileSync(temp, filePath);
    fs.unlinkSync(temp);
  }
  return data;
}

export function createActivityLog(payload: Record<string, any>) {
  const mainCompanySlug = requireMainCompanySlug(payload);
  const moduleName = normalizeText(payload.moduleName || payload.module || "system");
  return {
    id: payload.id || randomUUID(),
    mainCompanySlug,
    moduleName,
    action: normalizeText(payload.action || payload.actionType || "activity"),
    entityType: normalizeText(payload.entityType),
    entityId: normalizeText(payload.entityId),
    detail: payload.detail || {},
    createdAt: payload.createdAt || new Date().toISOString(),
    createdBy: normalizeText(payload.createdBy || payload.user || "system"),
  };
}
