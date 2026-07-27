import { PrismaClient } from "@prisma/client";

type Row = Record<string, any>;
const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const supplierDocumentSql = `
  SELECT d.id, d.main_company_slug, d.document_no, d.document_type, d.target_type,
         c.id AS company_id, c.name AS company_name, c.company_type,
         (SELECT COUNT(*) FROM customer_dispatch_lines l WHERE l.document_id=d.id AND l.deleted_at IS NULL) AS active_lines
  FROM documents d
  JOIN companies c ON c.id=d.company_id
  WHERE d.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND c.company_type='SUPPLIER'
    AND (
      upper(coalesce(d.target_type,'')) IN ('MUSTERIDEN_GELEN_IRSALIYE','CUSTOMER_DISPATCH') OR
      upper(coalesce(d.document_type,'')) IN ('MUSTERIDEN_GELEN_IRSALIYE','MUSTERI_IRSALIYE','CUSTOMER_DISPATCH')
    )`;

async function main() {
  const documents = await prisma.$queryRawUnsafe<Row[]>(supplierDocumentSql);
  const report = {
    dryRun: !apply,
    inspectedCompanies: new Set(documents.map((row) => row.company_id)).size,
    inspectedDocuments: documents.length,
    supplierDocuments: documents.length,
    wrongCustomerDispatches: documents.length,
    activeSalesLines: documents.reduce((sum, row) => sum + Number(row.active_lines || 0), 0),
    changed: 0,
    skipped: 0,
    errors: 0,
  };
  if (!apply) {
    console.log(JSON.stringify({ ...report, companies: [...new Set(documents.map((row) => row.company_name))] }, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const document of documents) {
      const lines = await tx.$queryRawUnsafe<Row[]>(
        "SELECT id FROM customer_dispatch_lines WHERE document_id=? AND deleted_at IS NULL",
        document.id,
      );
      const lineIds = lines.map((line) => String(line.id));
      if (lineIds.length) {
        const placeholders = lineIds.map(() => "?").join(",");
        await tx.$executeRawUnsafe(
          `UPDATE dispatch_invoice_matches SET status='RECLASSIFIED_SUPPLIER', updated_at=CURRENT_TIMESTAMP WHERE dispatch_line_id IN (${placeholders}) AND status NOT IN ('RECLASSIFIED_SUPPLIER','REJECTED')`,
          ...lineIds,
        );
        await tx.$executeRawUnsafe(
          `UPDATE customer_dispatch_lines SET durum='SUPPLIER_APPLICABLE_NOT', model_id=NULL, model_adi=NULL, deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
          ...lineIds,
        );
      }
      await tx.$executeRawUnsafe(
        `UPDATE documents SET document_type='tedarikci_gelen_irsaliye', target_type='TEDARIKCI_GELEN_IRSALIYE', target_module='MUHASEBE', route_status='ARCHIVED', route_message='Tedarikçi belgesi müşteri satış akışından çıkarıldı', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        document.id,
      );
      await tx.activityLog.create({ data: {
        mainCompanySlug: document.main_company_slug,
        module: "ISNET",
        entityType: "DOCUMENT",
        entityId: document.id,
        action: "INVOICE_ASSISTANT_SUPPLIER_REPAIR",
        actionType: "UPDATE",
        description: `${document.company_name} belgesi Fatura Kesme Yardımcısı akışından çıkarıldı.`,
        oldValue: { documentType: document.document_type, targetType: document.target_type, activeSalesLines: lineIds.length },
        newValue: { documentType: "tedarikci_gelen_irsaliye", targetType: "TEDARIKCI_GELEN_IRSALIYE", activeSalesLines: 0 },
        actor: "CODEX_ISNET_REPAIR",
      }});
      report.changed += 1;
    }
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
