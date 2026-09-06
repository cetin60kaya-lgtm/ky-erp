type D1Like = D1Database;

type TableSpec = {
  name: string;
  columns: string[];
  createSql: string;
};

type IndexSpec = {
  name: string;
  createSql: string;
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
    createSql: `
      CREATE TABLE IF NOT EXISTS accounting_report_categories (
        id TEXT PRIMARY KEY,
        main_company_slug TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        category_type TEXT NOT NULL DEFAULT 'EXPENSE',
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 100,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(main_company_slug, code)
      )
    `,
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
    createSql: `
      CREATE TABLE IF NOT EXISTS accounting_report_overrides (
        id TEXT PRIMARY KEY,
        main_company_slug TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        report_included INTEGER,
        report_category_id TEXT,
        report_amount REAL,
        report_description TEXT,
        report_official_type TEXT,
        report_vat_amount REAL,
        report_vat_included INTEGER,
        report_expense_status TEXT,
        report_note TEXT,
        override_mask TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(main_company_slug, source_type, source_id)
      )
    `,
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
    createSql: `
      CREATE TABLE IF NOT EXISTS accounting_expense_rules (
        id TEXT PRIMARY KEY,
        main_company_slug TEXT NOT NULL,
        company_id TEXT,
        product_id TEXT,
        normalized_description TEXT,
        category_id TEXT,
        category_name TEXT NOT NULL,
        routing_type TEXT NOT NULL DEFAULT 'EXPENSE',
        priority INTEGER NOT NULL DEFAULT 100,
        is_active INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'USER',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `,
  },
];

const INDEXES: IndexSpec[] = [
  {
    name: "ix_accounting_report_categories_active",
    createSql:
      "CREATE INDEX IF NOT EXISTS ix_accounting_report_categories_active ON accounting_report_categories(main_company_slug, is_active, sort_order, name)",
  },
  {
    name: "ix_accounting_report_overrides_source",
    createSql:
      "CREATE INDEX IF NOT EXISTS ix_accounting_report_overrides_source ON accounting_report_overrides(main_company_slug, source_type, source_id)",
  },
  {
    name: "ix_accounting_expense_rules_match",
    createSql:
      "CREATE INDEX IF NOT EXISTS ix_accounting_expense_rules_match ON accounting_expense_rules(main_company_slug, company_id, product_id, normalized_description, is_active, priority)",
  },
];

let readyInThisIsolate = false;

async function existingTableColumns(db: D1Like, table: string): Promise<Set<string> | null> {
  const exists = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .bind(table)
    .first<{ name: string }>();

  if (!exists?.name) return null;

  const result = await db
    .prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`)
    .all<{ name: string }>();

  return new Set((result.results || []).map((row) => row.name));
}

async function preflight(db: D1Like): Promise<string[]> {
  const missingTables: string[] = [];

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

  return missingTables;
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

  const placeholders = INDEXES.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (${placeholders})`,
    )
    .bind(...INDEXES.map((index) => index.name))
    .all<{ name: string }>();

  const present = new Set((rows.results || []).map((row) => row.name));
  const missingIndexes = INDEXES.map((index) => index.name).filter(
    (name) => !present.has(name),
  );
  if (missingIndexes.length) {
    throw new Error(
      `MIGRATION_0046_VERIFY_INDEX_MISSING:${missingIndexes.join(",")}`,
    );
  }
}

export async function ensureAccountingCanonicalReportControls0046(
  db: D1Like,
): Promise<{ state: "READY"; createdTables: string[] }> {
  if (readyInThisIsolate) {
    return { state: "READY", createdTables: [] };
  }

  const missingTables = await preflight(db);

  const statements = [
    ...TABLES.filter((spec) => missingTables.includes(spec.name)).map((spec) =>
      db.prepare(spec.createSql),
    ),
    ...INDEXES.map((spec) => db.prepare(spec.createSql)),
  ];

  if (statements.length) {
    await db.batch(statements);
  }

  await verify(db);
  readyInThisIsolate = true;

  return { state: "READY", createdTables: missingTables };
}

export const accountingCanonical0046Contract = {
  tables: TABLES.map((spec) => ({ name: spec.name, columns: [...spec.columns] })),
  indexes: INDEXES.map((spec) => spec.name),
};
