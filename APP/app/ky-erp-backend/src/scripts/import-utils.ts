import * as fs from "fs";
import * as path from "path";
import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeSearchText(value: unknown) {
  return normalizeText(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decimal(value: unknown) {
  const parsed = Number(value ?? 0);
  return new Prisma.Decimal(Number.isFinite(parsed) ? parsed : 0);
}

export function readJsonArray(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.data)) return parsed.data;
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    return [];
  } catch {
    return [];
  }
}

export function findJsonFiles(fileName: string) {
  const roots = [
    path.join(process.cwd(), "data"),
    path.resolve(process.cwd(), "..", "..", "backup"),
  ].filter((root) => fs.existsSync(root));
  const result: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
        result.push(fullPath);
      }
    }
  };
  for (const root of roots) walk(root);
  return result;
}

export async function ensureMainCompany(mainCompanySlug: string) {
  const slug = normalizeText(mainCompanySlug || "mecit-hakan");
  return prisma.mainCompany.upsert({
    where: { slug },
    create: { slug, name: slug },
    update: {},
  });
}

export function slugFromPath(filePath: string) {
  const parts = filePath.split(/[\\/]+/);
  const modulesIndex = parts.lastIndexOf("modules");
  if (modulesIndex >= 0 && parts[modulesIndex + 1]) return parts[modulesIndex + 1];
  const deletedMainIndex = parts.lastIndexOf("deleted-main-companies");
  if (deletedMainIndex >= 0 && parts[deletedMainIndex + 1]) return parts[deletedMainIndex + 1];
  const excelIndex = parts.lastIndexOf("excel-muhasebe-import");
  if (excelIndex >= 0 && parts[excelIndex + 1]) return String(parts[excelIndex + 1]).split("-202")[0] || "mecit-hakan";
  return "mecit-hakan";
}

export async function runScript(name: string, fn: () => Promise<any>) {
  try {
    const result = await fn();
    console.log(`${name} tamamlandi`, result || "");
  } finally {
    await prisma.$disconnect();
  }
}
