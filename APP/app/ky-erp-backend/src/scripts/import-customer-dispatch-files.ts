import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module";
import { MuhasebeModule } from "../muhasebe/muhasebe.module";
import { MuhasebeDbService } from "../muhasebe/muhasebe-db.service";

@Module({ imports: [DatabaseModule, MuhasebeModule] })
class CustomerDispatchImportModule {}

if (typeof process.loadEnvFile === "function") process.loadEnvFile();

async function main() {
  const [slugArg, ...fileArgs] = process.argv.slice(2);
  const slug = String(slugArg || "").trim();
  const paths = fileArgs.map((value) => path.resolve(value));
  if (!slug || !paths.length) {
    throw new Error(
      "Kullanim: npx tsx src/scripts/import-customer-dispatch-files.ts <ana-firma-slug> <xml/pdf> [...]",
    );
  }
  const missing = paths.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length) throw new Error(`Dosya bulunamadi: ${missing.join(", ")}`);

  const app = await NestFactory.createApplicationContext(CustomerDispatchImportModule, {
    logger: ["error", "warn"],
  });
  try {
    const service = app.get(MuhasebeDbService);
    const files = paths.map((filePath) => {
      const stat = fs.statSync(filePath);
      return {
        path: filePath,
        originalname: path.basename(filePath),
        filename: path.basename(filePath),
        mimetype: path.extname(filePath).toLowerCase() === ".xml"
          ? "application/xml"
          : "application/pdf",
        size: stat.size,
        preserveSource: true,
      };
    });
    const result = await service.uploadAndClassifyDocuments(files, slug, undefined, {
      targetType: "MUSTERIDEN_GELEN_IRSALIYE",
      documentType: "musteriden_gelen_irsaliye",
      templateCompanyName: "TAHA GİYİM SAN. VE TİC.",
      notes: "Gercek TIA e-Irsaliye XML toplu aktarimi",
    });
    const rows = Array.isArray(result?.results) ? result.results : [];
    console.log(JSON.stringify({
      total: rows.length,
      saved: rows.filter((row: any) => row?.routeStatus !== "DUPLICATE").length,
      duplicate: rows.filter((row: any) => row?.routeStatus === "DUPLICATE").length,
      rows: rows.map((row: any) => ({
        id: row.id,
        fileName: row.fileName,
        targetType: row.targetType,
        routeStatus: row.routeStatus,
      })),
    }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
