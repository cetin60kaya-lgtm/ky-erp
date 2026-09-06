type D1Like = D1Database;

type TableSpec = {
  name: string;
  columns: string[];
};

type IndexSpec = {
  name: string;
  columns: string[];
};

const TABLES: TableSpec[] = [
  {
    name: "accounting_report_categories",
    columns: [
      "id",
      "main_company_slug",
      "code",
      "name",
      "category_type",
      "is_active",
      "sort_order",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "accounting_report_overrides",
    columns: [
      "id",
      "main_company_slug",
      "source_type",
      "source_id",
      "report_included",
      "report_category_id",
      "report_amount",
      "report_description",
      "report_official_type",
      "report_vat_amount",
      "report_vat_included",
      "report_expense_status",
      "report_note",
      "override_mask",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "accounting_expense_rules",
    columns: [
      "id",
      "main_company_slug",
      "company_id",
      "product_id",
      "normalized_description",
      "category_id",
      "category_name",
      "routing_type",
      "priority",
      "is_active",
      "source",
      "created_at",
      "updated_at",
    ],
  },
];

const INDEXES: IndexSpec[] = [
  {
    name: "ix_accounting_report_categories_active",
    columns: ["main_company_slug", "is_active", "sort_order", "name"],
  },
  {
    name: "ix_accounting_report_overrides_source",
    columns: ["main_company_slug", "source_type", "source_id"],
  },
  {
    name: "ix_accounting_expense_rules_match",
    columns: [
      "main_company_slug",
      "company_id",
      "product_id",
      "normalized_description",
      "is_active",
      "priority",
    ],
  },
];

const readyDatabases = new WeakSet<D1Like>();

function quotedIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function existingTableColumns(db: D1Like, table: string): Promise<Set<string> | null> {
  const exists = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .bind(table)
    .first<{ name: string }>();

  if (!exists?.name) return null;

  const result = await db
    .prepare(`PRAGMA table_info(${quotedIdentifier(table)})`)
    .all<{ name: string }>();

  return new Set((result.results || []).map((row) => row.name));
}

async function existingIndexColumns(db: D1Like, index: string): Promise<string[] | null> {
  const exists = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1")
    .bind(index)
    .first<{ name: string }>();

  if (!exists?.name) return null;

  const result = await db
    .prepare(`PRAGMA index_info(${quotedIdentifier(index)})`)
    .all<{ seqno: number; name: string }>();

  return [...(result.results || [])]
    .sort((left, right) => Number(left.seqno) - Number(right.seqno))
    .map((row) => row.name);
}

async function preflight(
  db: D1Like,
): Promise<{ missingTables: string[]; missingIndexes: string[] }> {
  const missingTables: string[] = [];
  const missingIndexes: string[] = [];

  for (const spec of TABLES) {
    const columns = await existingTableColumns(db, spec.name);
    if (!columns) {
      missingTables.push(spec.name);
      continue;
    }

    const missingColumns = spec.columns.filter((column) => !columns.has(column));
    if (missingColumns.length) {
      throw new Error(
        `MIGRATION_0046_PARTIAL_SCHEMA:${spec.name}:${missingColumns.join(",")}`,
      );
    }
  }

  for (const spec of INDEXES) {
    const columns = await existingIndexColumns(db, spec.name);
    if (!columns) {
      missingIndexes.push(spec.name);
      continue;
    }

    if (columns.join("\u0000") !== spec.columns.join("\u0000")) {
      throw new Error(
        `MIGRATION_0046_PARTIAL_INDEX:${spec.name}:${columns.join(",")}`,
      );
    }
  }

  return { missingTables, missingIndexes };
}

async function verify(db: D1Like): Promise<void> {
  for (const spec of TABLES) {
    const columns = await existingTableColumns(db, spec.name);
    if (!columns) {
      throw new Error(`MIGRATION_0046_VERIFY_TABLE_MISSING:${spec.name}`);
    }

    const missingColumns = spec.columns.filter((column) => !columns.has(column));
    if (missingColumns.length) {
      throw new Error(
        `MIGRATION_0046_VERIFY_COLUMNS_MISSING:${spec.name}:${missingColumns.join(",")}`,
      );
    }
  }

  for (const spec of INDEXES) {
    const columns = await existingIndexColumns(db, spec.name);
    if (!columns) {
      throw new Error(`MIGRATION_0046_VERIFY_INDEX_MISSING:${spec.name}`);
    }
    if (columns.join("\u0000") !== spec.columns.join("\u0000")) {
      throw new Error(
        `MIGRATION_0046_VERIFY_INDEX_COLUMNS:${spec.name}:${columns.join(",")}`,
      );
    }
  }
}

export async function ensureAccountingCanonicalReportControls0046(
  db: D1Like,
): Promise<{
  state: "READY";
  createdTables: string[];
  createdIndexes: string[];
}> {
  if (readyDatabases.has(db)) return { state: "READY", createdTables: [], createdIndexes: [] };

  const { missingTables, missingIndexes } = await preflight(db);
  if (missingTables.length) {
    throw new Error(`MIGRATION_0046_REQUIRED_TABLES:${missingTables.join(",")}`);
  }
  if (missingIndexes.length) {
    throw new Error(`MIGRATION_0046_REQUIRED_INDEXES:${missingIndexes.join(",")}`);
  }

  await verify(db);
  readyDatabases.add(db);
  return { state: "READY", createdTables: [], createdIndexes: [] };
}

export const accountingCanonical0046Contract = {
  tables: TABLES.map((spec) => ({ name: spec.name, columns: [...spec.columns] })),
  indexes: INDEXES.map((spec) => ({ name: spec.name, columns: [...spec.columns] })),
};
