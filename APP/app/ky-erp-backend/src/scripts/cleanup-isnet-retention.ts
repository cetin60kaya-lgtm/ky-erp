import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaService } from "../prisma/prisma.service";

type DocumentState = Record<string, any>;

const execute = process.argv.includes("--execute");
const cutoffArgument = process.argv.find((argument) => argument.startsWith("--cutoff="));

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function retentionCutoff() {
  const configured = clean(cutoffArgument?.slice("--cutoff=".length));
  if (configured) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(configured)) {
      throw new Error("Kesim tarihi YYYY-AA-GG biçiminde olmalıdır.");
    }
    return configured;
  }
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 10);
}

function documentDate(state: DocumentState) {
  const text = clean(state.dateText);
  const localMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (localMatch) {
    return `${localMatch[3]}-${localMatch[2].padStart(2, "0")}-${localMatch[1].padStart(2, "0")}`;
  }
  const parsed = Date.parse(text || clean(state.downloadedAt));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

function managedFile(filePath: unknown, archiveRoot: string) {
  const source = clean(filePath);
  if (!source) return "";
  const root = path.resolve(archiveRoot);
  const resolved = path.resolve(source);
  const relative = path.relative(root, resolved);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? resolved : "";
}

async function main() {
  const cutoff = retentionCutoff();
  const archiveRoot = clean(process.env.KYERP_ISNET_ARCHIVE_ROOT) || path.join("D:\\onedrive-Hkn\\OneDrive", "Masaüstü", "HKN");
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const automationRows = await prisma.setting.findMany({
      where: { scope: "ISNET", key: "AUTOMATION", deletedAt: null },
    });
    const oldIntakeIds = new Set<string>();
    const obsoleteFiles = new Set<string>();
    const updates: Array<{ id: string; value: Record<string, any> }> = [];
    let removedStates = 0;
    let confirmedPrints = 0;

    for (const row of automationRows) {
      const value = (row.value && typeof row.value === "object" && !Array.isArray(row.value))
        ? { ...(row.value as Record<string, any>) }
        : {};
      const documents = (value.documents && typeof value.documents === "object" && !Array.isArray(value.documents))
        ? (value.documents as Record<string, DocumentState>)
        : {};
      const retained: Record<string, DocumentState> = {};
      for (const [key, rawState] of Object.entries(documents)) {
        const state = rawState && typeof rawState === "object" && !Array.isArray(rawState)
          ? { ...rawState }
          : {};
        const date = documentDate(state);
        if (date && date < cutoff) {
          removedStates += 1;
          const intakeId = clean(state.intakeId);
          if (intakeId) oldIntakeIds.add(intakeId);
          for (const filePath of [state.pdfPath, state.xmlPath]) {
            const managed = managedFile(filePath, archiveRoot);
            if (managed) obsoleteFiles.add(managed);
          }
          continue;
        }
        if (state.printEligible && !state.printedAt) {
          state.printedAt = new Date().toISOString();
          confirmedPrints += 1;
        }
        retained[key] = state;
      }
      updates.push({
        id: row.id,
        value: {
          ...value,
          documents: retained,
          backfillComplete: true,
          retentionStartDate: cutoff,
          retentionCleanedAt: new Date().toISOString(),
        },
      });
    }

    const linkedDocuments = oldIntakeIds.size
      ? await prisma.documentIntake.findMany({
          where: { id: { in: [...oldIntakeIds] } },
          select: { id: true, documentKind: true, issueDate: true },
        })
      : [];
    const documentKinds = linkedDocuments.reduce<Record<string, number>>((summary, document) => {
      const kind = String(document.documentKind);
      summary[kind] = (summary[kind] || 0) + 1;
      return summary;
    }, {});
    const report = {
      mode: execute ? "execute" : "dry-run",
      cutoff,
      automationRows: automationRows.length,
      oldAutomationStates: removedStates,
      managedFiles: obsoleteFiles.size,
      linkedDocumentIntakes: linkedDocuments.length,
      documentKinds,
      retainedPrintsConfirmed: confirmedPrints,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!execute) return;

    for (const filePath of obsoleteFiles) fs.rmSync(filePath, { force: true });
    await prisma.$transaction([
      ...updates.map((update) => prisma.setting.update({ where: { id: update.id }, data: { value: update.value } })),
      ...(oldIntakeIds.size
        ? [prisma.documentIntake.deleteMany({ where: { id: { in: [...oldIntakeIds] } } })]
        : []),
    ]);
    console.log("İşNet iki aylık saklama temizliği tamamlandı.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});