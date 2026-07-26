import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function asDate(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function stateData(automationKey: string, state: Record<string, any>) {
  return {
    automationKey,
    sourceId: String(state.sourceId || "") || null,
    kind: String(state.kind || "") || null,
    direction: String(state.direction || "") || null,
    documentNo: String(state.documentNo || "") || null,
    partnerName: String(state.partnerName || "") || null,
    dateText: String(state.dateText || "") || null,
    modelName: String(state.modelName || "") || null,
    modelLinked: Boolean(state.modelLinked),
    archiveStage: String(state.archiveStage || "") || null,
    intakeId: String(state.intakeId || "") || null,
    pdfPath: String(state.pdfPath || "") || null,
    xmlPath: String(state.xmlPath || "") || null,
    customerDispatch: Boolean(state.customerDispatch),
    printEligible: Boolean(state.printEligible),
    printedAt: asDate(state.printedAt),
    completed: Boolean(state.completed),
    downloadedAt: asDate(state.downloadedAt),
    markedReadAt: asDate(state.markedReadAt),
    firstSeenAt: asDate(state.firstSeenAt),
    newDocument: Boolean(state.newDocument),
    appReadAt: asDate(state.appReadAt),
    error: String(state.error || "") || null,
    lastAttemptAt: asDate(state.lastAttemptAt),
    metadata: state,
  };
}

async function main() {
  const settings = await prisma.setting.findMany({
    where: { scope: "ISNET", key: "AUTOMATION", deletedAt: null },
  });
  let migrated = 0;
  for (const setting of settings) {
    const slug = String(setting.mainCompanySlug || "").trim();
    if (!slug) continue;
    const documents = asObject(asObject(setting.value).documents);
    for (const [automationKey, rawState] of Object.entries(documents)) {
      if (!automationKey) continue;
      const data = stateData(automationKey, asObject(rawState));
      await prisma.isnetDocumentState.upsert({
        where: {
          mainCompanySlug_automationKey: {
            mainCompanySlug: slug,
            automationKey,
          },
        },
        update: data,
        create: { mainCompanySlug: slug, ...data },
      });
      migrated += 1;
    }
  }
  console.log(
    JSON.stringify(
      { migrated, total: await prisma.isnetDocumentState.count() },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());