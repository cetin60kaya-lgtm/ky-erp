import { PrismaClient } from "@prisma/client";

type Row = Record<string, any>;
const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const slugArg = process.argv.find((arg) => arg.startsWith("--slug="))?.slice(7);

function text(value: unknown) { return String(value ?? "").trim(); }
function isSupplier(row: Row) { return text(row.company_type).toUpperCase() === "SUPPLIER"; }

async function main() {
  const result = { inspected: 0, changed: 0, skipped: 0, errors: 0, dryRun: !apply };
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT s.id, s.main_company_slug, s.intake_id, s.company_id, s.company_type,
           s.document_class, s.archive_stage, s.customer_dispatch, s.model_linked,
           i.document_kind, i.direction, i.firm_id,
           c.company_type
    FROM isnet_document_states s
    LEFT JOIN document_intakes i ON i.id = s.intake_id
    LEFT JOIN companies c ON c.id = COALESCE(s.company_id, i.firm_id)
    WHERE (? IS NULL OR s.main_company_slug = ?)
  `, slugArg || null, slugArg || null);
  result.inspected = rows.length;
  const supplierRows = rows.filter(isSupplier);

  if (!apply) {
    result.changed = supplierRows.filter((row) => row.customer_dispatch || row.model_linked || row.archive_stage === "MODEL_BEKLEYEN" || row.document_class === "CUSTOMER_DISPATCH").length;
    result.skipped = rows.length - result.changed;
    console.log(JSON.stringify({ ...result, candidates: supplierRows.map((row) => ({ id: row.id, slug: row.main_company_slug, intakeId: row.intake_id, documentClass: row.document_class, archiveStage: row.archive_stage })) }, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const row of supplierRows) {
      const needsChange = Boolean(row.customer_dispatch || row.model_linked || row.archive_stage === "MODEL_BEKLEYEN" || row.document_class === "CUSTOMER_DISPATCH");
      if (!needsChange) { result.skipped += 1; continue; }
      const nextClass = row.document_kind === "SUPPLIER_INVOICE" || row.document_kind === "EXPENSE_INVOICE"
        ? "SUPPLIER_INVOICE" : "SUPPLIER_DISPATCH";
      await tx.$executeRawUnsafe(`
        UPDATE isnet_document_states
        SET customer_dispatch = 0, model_linked = 0, model_name = NULL,
            archive_stage = 'SUPPLIER_ARCHIVE', document_class = ?,
            company_type = 'SUPPLIER', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (customer_dispatch = 1 OR model_linked = 1 OR archive_stage = 'MODEL_BEKLEYEN' OR document_class = 'CUSTOMER_DISPATCH')
      `, nextClass, row.id);
      if (row.intake_id) {
        await tx.$executeRawUnsafe(`
          UPDATE document_intakes
          SET document_kind = CASE WHEN document_kind = 'CUSTOMER_DISPATCH' THEN 'SUPPLIER_INVOICE' ELSE document_kind END,
              model_id = NULL, model_guess = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND (model_id IS NOT NULL OR model_guess IS NOT NULL OR document_kind = 'CUSTOMER_DISPATCH')
        `, row.intake_id);
      }
      const lines = await tx.$queryRawUnsafe<Row[]>(`SELECT id, main_company_slug FROM customer_dispatch_lines WHERE document_id = ? AND deleted_at IS NULL`, row.intake_id || row.id);
      for (const line of lines) {
        await tx.$executeRawUnsafe(`UPDATE customer_dispatch_lines SET durum = 'KONTROL_GEREKLI', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, line.id);
      }
      await tx.activityLog.create({ data: {
        mainCompanySlug: row.main_company_slug,
        module: "ISNET",
        entityType: "ISNET_DOCUMENT_STATE",
        entityId: row.id,
        action: "SUPPLIER_ROUTING_REPAIR",
        actionType: "UPDATE",
        description: "Tedarikçi belgesi müşteri/model akışından çıkarıldı.",
        oldValue: { documentClass: row.document_class, archiveStage: row.archive_stage, customerDispatch: row.customer_dispatch, modelLinked: row.model_linked },
        newValue: { documentClass: nextClass, archiveStage: "SUPPLIER_ARCHIVE", customerDispatch: false, modelLinked: false },
      }});
      result.changed += 1;
    }
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
