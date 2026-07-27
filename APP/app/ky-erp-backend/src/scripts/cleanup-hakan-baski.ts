import { PrismaClient } from "@prisma/client";

if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

if (!String(process.env.DATABASE_URL || "").trim()) {
  throw new Error(
    "DATABASE_URL tanımlı değil. cleanup:hakan-baski çalıştırılamadı.",
  );
}

type ColumnRef = {
  table_schema: string;
  table_name: string;
  column_name: string;
};

type TableColumn = {
  table_schema: string;
  table_name: string;
  column_name: string;
};

const prisma = new PrismaClient();

const TARGET = {
  id: "main-mecit-hakan",
  slug: "mecit-hakan",
  name: "Mecit Hakan",
};

const LEGACY_SLUGS = [
  "hakan-baski",
  "main-hakan",
  "main-hakan-baski",
  "hkn-baski",
];

const LEGACY_IDS = [
  "main-hakan-baski",
  "main-hakan",
  "hkn-baski",
  "hakan-baski",
];

function escapeIdentifier(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function escapeLiteral(value: string) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function isLikelySlugColumn(columnName: string) {
  const c = String(columnName || "").toLowerCase();
  return c.includes("slug");
}

function isLikelyIdColumn(columnName: string) {
  const c = String(columnName || "").toLowerCase();
  return c.includes("maincompanyid") || c.includes("main_company_id");
}

function buildLegacyNameWhere() {
  return {
    OR: [
      { slug: { in: LEGACY_SLUGS } },
      { id: { in: LEGACY_IDS } },
      { slug: { contains: "hakan" } },
      { name: { contains: "hakan" } },
    ],
  };
}

async function listReferenceColumns(): Promise<ColumnRef[]> {
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('mainCompanySlug', 'main_company_slug', 'mainCompanyId', 'main_company_id')
    ORDER BY table_name, column_name
  `)) as ColumnRef[];

  return rows.filter((row) => {
    const tableName = String(row.table_name || "").toLowerCase();
    return tableName !== "maincompany";
  });
}

async function listAllColumns(): Promise<TableColumn[]> {
  return (await prisma.$queryRawUnsafe(`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `)) as TableColumn[];
}

function tableKey(schema: string, table: string) {
  return `${schema}.${table}`;
}

function hasColumn(
  allColumns: TableColumn[],
  schema: string,
  table: string,
  expected: string,
) {
  return allColumns.some(
    (col) =>
      col.table_schema === schema &&
      col.table_name === table &&
      col.column_name === expected,
  );
}

async function dedupeScopeFileNameRows(
  column: ColumnRef,
  allColumns: TableColumn[],
  sourceValue: string,
  targetValue: string,
) {
  const scopeCol = hasColumn(
    allColumns,
    column.table_schema,
    column.table_name,
    "scope",
  )
    ? "scope"
    : "";
  const fileCol = hasColumn(
    allColumns,
    column.table_schema,
    column.table_name,
    "file_name",
  )
    ? "file_name"
    : hasColumn(allColumns, column.table_schema, column.table_name, "fileName")
      ? "fileName"
      : "";

  if (!scopeCol || !fileCol) return 0;

  const table = `${escapeIdentifier(column.table_schema)}.${escapeIdentifier(column.table_name)}`;
  const companyCol = escapeIdentifier(column.column_name);
  const scope = escapeIdentifier(scopeCol);
  const fileName = escapeIdentifier(fileCol);

  const sql = `
    DELETE FROM ${table} AS src
    USING ${table} AS dst
    WHERE src.${companyCol} = ${escapeLiteral(sourceValue)}
      AND dst.${companyCol} = ${escapeLiteral(targetValue)}
      AND src.${scope} = dst.${scope}
      AND src.${fileName} = dst.${fileName}
  `;

  return prisma.$executeRawUnsafe(sql);
}

async function countReferences(column: ColumnRef, values: string[]) {
  const table = `${escapeIdentifier(column.table_schema)}.${escapeIdentifier(column.table_name)}`;
  const col = escapeIdentifier(column.column_name);
  let total = 0;

  for (const value of values) {
    const sql = `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${col} = ${escapeLiteral(value)}`;
    const result = (await prisma.$queryRawUnsafe(sql)) as Array<{
      count: number;
    }>;
    total += Number(result?.[0]?.count || 0);
  }

  return total;
}

async function updateReferences(
  column: ColumnRef,
  sourceValues: string[],
  targetValue: string,
  allColumns: TableColumn[],
) {
  const table = `${escapeIdentifier(column.table_schema)}.${escapeIdentifier(column.table_name)}`;
  const col = escapeIdentifier(column.column_name);
  let updated = 0;

  for (const source of sourceValues) {
    if (!source || source === targetValue) continue;
    const sql = `
      UPDATE ${table}
      SET ${col} = ${escapeLiteral(targetValue)}
      WHERE ${col} = ${escapeLiteral(source)}
    `;
    try {
      const affected = await prisma.$executeRawUnsafe(sql);
      updated += Number(affected || 0);
    } catch (error: any) {
      const message = String(error?.meta?.message || error?.message || "");
      if (!message.includes("already exists")) {
        throw error;
      }

      await dedupeScopeFileNameRows(column, allColumns, source, targetValue);
      const retried = await prisma.$executeRawUnsafe(sql);
      updated += Number(retried || 0);
    }
  }

  return updated;
}

async function run() {
  const startedAt = new Date().toISOString();

  const mainCompanyLegacyRows = await prisma.mainCompany.findMany({
    where: buildLegacyNameWhere(),
    select: { id: true, slug: true, name: true, isActive: true },
  });

  const targetMainCompany = await prisma.mainCompany.upsert({
    where: { slug: TARGET.slug },
    create: {
      id: TARGET.id,
      slug: TARGET.slug,
      name: TARGET.name,
      isActive: true,
    },
    update: {
      id: TARGET.id,
      name: TARGET.name,
      isActive: true,
    },
    select: { id: true, slug: true, name: true },
  });

  const legacyRows = mainCompanyLegacyRows.filter(
    (row) => row.slug !== TARGET.slug,
  );
  const legacySlugsFromDb = legacyRows
    .map((row) => String(row.slug || ""))
    .filter(Boolean);
  const legacyIdsFromDb = legacyRows
    .map((row) => String(row.id || ""))
    .filter(Boolean);

  const slugValues = Array.from(
    new Set([...LEGACY_SLUGS, ...legacySlugsFromDb]),
  ).filter((item) => item && item !== TARGET.slug);
  const idValues = Array.from(
    new Set([...LEGACY_IDS, ...legacyIdsFromDb]),
  ).filter((item) => item && item !== TARGET.id);

  const columns = await listReferenceColumns();
  const allColumns = await listAllColumns();

  let preReferenceMatches = 0;
  for (const column of columns) {
    const values = isLikelySlugColumn(column.column_name)
      ? slugValues
      : isLikelyIdColumn(column.column_name)
        ? idValues
        : [];
    if (!values.length) continue;
    preReferenceMatches += await countReferences(column, values);
  }

  console.log(
    JSON.stringify(
      {
        phase: "pre-report",
        startedAt,
        foundMainCompany: legacyRows.length,
        targetMainCompany,
        legacySlugCandidates: slugValues.length,
        legacyIdCandidates: idValues.length,
        tablesToScan: columns.length,
        referenceMatches: preReferenceMatches,
      },
      null,
      2,
    ),
  );

  let passivatedMainCompany = 0;
  for (const row of legacyRows) {
    if (!row.isActive) continue;
    const result = await prisma.mainCompany.updateMany({
      where: { id: row.id },
      data: { isActive: false },
    });
    passivatedMainCompany += Number(result.count || 0);
  }

  let movedRecords = 0;
  for (const column of columns) {
    if (isLikelySlugColumn(column.column_name)) {
      movedRecords += await updateReferences(
        column,
        slugValues,
        TARGET.slug,
        allColumns,
      );
      continue;
    }
    if (isLikelyIdColumn(column.column_name)) {
      movedRecords += await updateReferences(
        column,
        idValues,
        TARGET.id,
        allColumns,
      );
      continue;
    }
  }

  const skippedMainCompany = Math.max(
    legacyRows.length - passivatedMainCompany,
    0,
  );

  console.log(
    JSON.stringify(
      {
        phase: "cleanup-complete",
        finishedAt: new Date().toISOString(),
        foundMainCompany: legacyRows.length,
        movedRecords,
        passivatedMainCompany,
        skippedMainCompany,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    console.error("cleanup-hakan-baski failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
