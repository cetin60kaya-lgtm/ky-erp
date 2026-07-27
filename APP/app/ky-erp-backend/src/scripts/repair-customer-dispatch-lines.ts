import * as fs from "fs";
import * as path from "path";
import { XMLParser } from "fast-xml-parser";
import { PrismaService } from "../prisma/prisma.service";

if (typeof process.loadEnvFile === "function") process.loadEnvFile();

const slug = String(process.argv[2] || "mecit-hakan").trim();
const prisma = new PrismaService();
const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

const text = (value: any) =>
  String(value && typeof value === "object" ? value["#text"] ?? "" : value ?? "").trim();

async function main() {
  await prisma.$connect();
  const documents = await prisma.document.findMany({
    where: {
      mainCompanySlug: slug,
      documentType: "musteriden_gelen_irsaliye",
      deletedAt: null,
    },
    include: { files: true },
  });
  const result = { checked: documents.length, repaired: 0, lines: 0, skipped: 0, errors: [] as any[] };

  for (const document of documents) {
    const existing = await prisma.customerDispatchLine.count({
      where: { mainCompanySlug: slug, documentId: document.id, deletedAt: null },
    });
    if (existing) {
      result.skipped += 1;
      continue;
    }
    const source = document.files.find((file) =>
      file.deletedAt == null && (file.role === "xml" || /\.xml$/i.test(file.fileName)),
    );
    if (!source) {
      result.skipped += 1;
      continue;
    }
    const sourcePath = path.resolve(process.cwd(), source.filePath);
    try {
      const parsed = parser.parse(fs.readFileSync(sourcePath, "utf8"));
      const root = parsed?.DespatchAdvice;
      const lines = asArray(root?.DespatchLine).map((line: any, index) => {
        const description = text(line?.Item?.Name) || text(line?.Item?.Description) || `Satir ${index + 1}`;
        const quantity = Number(text(line?.DeliveredQuantity).replace(",", ".")) || 0;
        return {
          lineNo: Number(text(line?.ID)) || index + 1,
          aciklama: description,
          rawDescription: description,
          productName: description,
          adet: quantity,
          quantity,
          birim: text(line?.DeliveredQuantity?.["@_unitCode"]) || "ADET",
          unit: text(line?.DeliveredQuantity?.["@_unitCode"]) || "ADET",
          modelAdiOnerisi: description.replace(/[,/]+/g, " ").replace(/\s+/g, " ").trim(),
          durum: "MODEL_BAGLANTISI_BEKLIYOR",
        };
      }).filter((line) => line.aciklama || line.adet);
      if (!lines.length) throw new Error("XML icinde DespatchLine bulunamadi");

      const raw = document.raw && typeof document.raw === "object" && !Array.isArray(document.raw)
        ? document.raw as Record<string, any>
        : {};
      const draft = raw.taslakAlanlar && typeof raw.taslakAlanlar === "object"
        ? raw.taslakAlanlar as Record<string, any>
        : {};
      const quantity = lines.reduce((sum, line) => sum + line.adet, 0);
      const nextRaw = {
        ...raw,
        kalemler: lines,
        taslakAlanlar: {
          ...draft,
          adet: quantity,
          gelenAdet: quantity,
          satirlar: lines,
          modelAdiOnerisi: lines[0]?.modelAdiOnerisi || draft.modelAdiOnerisi || "",
        },
        guessedModelName: lines[0]?.modelAdiOnerisi || raw.guessedModelName || "",
        repairInfo: {
          ...(raw.repairInfo || {}),
          customerDispatchLinesRebuiltAt: new Date().toISOString(),
          sourceFile: source.fileName,
        },
      };

      await prisma.$transaction(async (tx) => {
        for (const line of lines) {
          await tx.customerDispatchLine.create({
            data: {
              mainCompanySlug: slug,
              musteriIrsaliyeId: document.id,
              documentId: document.id,
              aciklama: line.aciklama,
              adet: line.adet,
              birim: line.birim,
              modelAdiOnerisi: line.modelAdiOnerisi,
              durum: line.durum,
            },
          });
        }
        await tx.document.update({
          where: { id: document.id },
          data: { raw: nextRaw, metadata: nextRaw },
        });
        await tx.activityLog.create({
          data: {
            mainCompanySlug: slug,
            module: "muhasebe",
            entityType: "document",
            entityId: document.id,
            actionType: "UPDATED",
            action: "customer_dispatch_lines_repaired",
            description: `${document.documentNo || document.id} XML satirlari yeniden olusturuldu`,
            newValue: { lineCount: lines.length, quantity, sourceFile: source.fileName },
          },
        });
      });
      result.repaired += 1;
      result.lines += lines.length;
    } catch (error: any) {
      result.errors.push({ documentNo: document.documentNo, message: error?.message || String(error) });
    }
  }
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
