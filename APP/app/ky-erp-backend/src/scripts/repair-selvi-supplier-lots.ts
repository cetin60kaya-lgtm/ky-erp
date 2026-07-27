import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentParserService } from "../muhasebe/document-intake/document-parser.service";

if (typeof process.loadEnvFile === "function") process.loadEnvFile();

const slug = String(process.argv[2] || "mecit-hakan").trim();
const sourceDirectory =
  process.argv[3] ||
  "D:\\İndirilenler\\GelenFatura_Xml_20260716105319";
const requestedInvoices = new Set([
  "SLV2026000001769",
  "SLV2026000001771",
  "SLV2026000001815",
  "SLV2026000001837",
  "SLV2026000001874",
  "SLV2026000001940",
]);

const prisma = new PrismaService();
const parser = new DocumentParserService();

async function main() {
  await prisma.$connect();
  const files = fs
    .readdirSync(sourceDirectory)
    .filter((name) => /^SLV.*\.xml$/i.test(name))
    .map((name) => path.join(sourceDirectory, name));
  const summary = {
    files: 0,
    documents: 0,
    intakeLinesUpdated: 0,
    invoiceItemsUpdated: 0,
    dyehouseLotsCreated: 0,
    skipped: 0,
    errors: [] as Array<{ file: string; message: string }>,
  };

  for (const filePath of files) {
    try {
      const buffer = fs.readFileSync(filePath);
      const parsed = await parser.parseFile({
        buffer,
        fileName: path.basename(filePath),
        filePath,
        fileHash: crypto.createHash("sha256").update(buffer).digest("hex"),
        mimeType: "application/xml",
      });
      const documentNo = String(parsed.documentNo || parsed.invoiceNo || "").trim();
      if (!requestedInvoices.has(documentNo)) continue;
      summary.files += 1;
      const intake = await prisma.documentIntake.findFirst({
        where: {
          mainCompanySlug: slug,
          OR: [{ documentNo }, { invoiceNo: documentNo }],
        },
        include: { lines: { orderBy: { lineNo: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
      if (!intake) {
        summary.skipped += 1;
        summary.errors.push({ file: path.basename(filePath), message: "Havuz kaydı bulunamadı." });
        continue;
      }
      summary.documents += 1;
      const accountingDocument = await prisma.document.findFirst({
        where: {
          mainCompanySlug: slug,
          deletedAt: null,
          OR: [
            { raw: { path: "$.documentIntakeId", equals: intake.id } },
            { documentNo },
          ],
        },
        orderBy: { createdAt: "desc" },
      });

      for (const parsedLine of parsed.lines || []) {
        const lotNo = String(parsedLine.lotNo || "").trim();
        if (!lotNo) continue;
        const intakeLine = intake.lines.find(
          (line) => Number(line.lineNo || 0) === Number(parsedLine.lineNo || 0),
        );
        if (!intakeLine) continue;
        if (!String(intakeLine.lotNo || "").trim()) {
          await prisma.documentIntakeLine.update({
            where: { id: intakeLine.id },
            data: { lotNo },
          });
          summary.intakeLinesUpdated += 1;
        }

        if (!accountingDocument) continue;
        const invoiceItem = await prisma.invoiceItem.findFirst({
          where: {
            mainCompanySlug: slug,
            documentId: accountingDocument.id,
            lineNo: Number(parsedLine.lineNo || 0),
          },
        });
        if (!invoiceItem) continue;
        if (!String(invoiceItem.lotNo || "").trim()) {
          await prisma.invoiceItem.update({
            where: { id: invoiceItem.id },
            data: { lotNo },
          });
          summary.invoiceItemsUpdated += 1;
        }
        if (invoiceItem.productId) {
          const existingLot = await prisma.boyahaneLot.findUnique({
            where: { mainCompanySlug_lotNo: { mainCompanySlug: slug, lotNo } },
          });
          if (!existingLot) {
            await prisma.boyahaneLot.create({
              data: {
                mainCompanySlug: slug,
                productId: invoiceItem.productId,
                supplierCompanyId: accountingDocument.companyId,
                invoiceItemId: invoiceItem.id,
                lotNo,
                quantity: invoiceItem.quantity,
                remainingQuantity: invoiceItem.quantity,
                raw: {
                  source: "SELVİ_XML_LOT_REPAIR",
                  documentIntakeId: intake.id,
                  documentId: accountingDocument.id,
                  lineNo: parsedLine.lineNo,
                },
              },
            });
            summary.dyehouseLotsCreated += 1;
          }
        }
      }
    } catch (error: any) {
      summary.errors.push({
        file: path.basename(filePath),
        message: error?.message || "Bilinmeyen hata",
      });
    }
  }
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
