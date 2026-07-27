import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".json")
      ? [fullPath]
      : [];
  });
}

function normalizeKey(value: string) {
  return value.replace(/\\/g, "/").replace(/\.json$/i, "");
}

function storeMeta(root: string, filePath: string) {
  const relative = normalizeKey(path.relative(root, filePath));
  const parts = relative.split("/");
  const mainCompanyIndex = parts.indexOf("main-companies");
  if (mainCompanyIndex >= 0 && parts[mainCompanyIndex + 1]) {
    return {
      scope: "main-company",
      mainCompanySlug: parts[mainCompanyIndex + 1],
      fileName: parts.slice(mainCompanyIndex + 2).join("/"),
    };
  }
  return { scope: "global", mainCompanySlug: "", fileName: relative };
}

async function main() {
  const root =
    process.argv[2] ||
    path.join(process.cwd(), "uploads", "kyerp-data");
  const files = walk(root);
  let imported = 0;
  for (const filePath of files) {
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }
    const meta = storeMeta(root, filePath);
    await (prisma as any)["json" + "Store"].upsert({
      where: {
        scope_mainCompanySlug_fileName: {
          scope: meta.scope,
          mainCompanySlug: meta.mainCompanySlug,
          fileName: meta.fileName,
        },
      },
      update: { data: data as any },
      create: {
        scope: meta.scope,
        mainCompanySlug: meta.mainCompanySlug,
        fileName: meta.fileName,
        data: data as any,
      },
    });
    imported += 1;
  }
  console.log(`JSON -> SQL import tamamlandı. Aktarılan dosya: ${imported}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
