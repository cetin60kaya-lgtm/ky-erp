// Canonical, fail-closed company relationship inspection shared by merge and Hard Sil.
// No PRAGMA is executed: Cloudflare D1 rejects PRAGMA metadata batches in production.
// The authoritative sqlite_master CREATE TABLE SQL includes ALTER TABLE additions.
type Row = Record<string, any>;
type Relation = { table: string; count: number };

const refNames = new Set([
  "company_id", "firm_id", "customer_id", "supplier_company_id",
  "party_company_id", "counterparty_id", "supplier_id", "customer_company_id",
  "source_company_id", "target_company_id",
]);
const jsonRef = new Map([
  ["model_records", "raw"],
  ["models", "raw"],
  ["production_records", "raw"],
  ["json_store", "data"],
]);
const safeName = (name: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';

export function publicCompanyScanFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^COMPANY_SCAN_[A-Z0-9_]{1,64}$/.test(message)
    ? message
    : "COMPANY_SCAN_DATABASE_ERROR";
}

export async function readCompanyMergeTarget(db: D1Database, slug: string, id: string) {
  if (!slug || !id) throw new Error("COMPANY_SCAN_SCOPE_REQUIRED");
  const record = await db.prepare(
    "SELECT id,name,updated_at,current_balance,opening_balance,is_active FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1",
  ).bind(id, slug).first<Row>();
  if (!record) return null;
  return {
    companyId: String(record.id ?? ""),
    companyName: String(record.name ?? ""),
    updatedAt: String(record.updated_at ?? ""),
    currentBalance: Number(record.current_balance ?? 0),
    openingBalance: Number(record.opening_balance ?? 0),
    isActive: Number(record.is_active ?? 1) !== 0,
  };
}

// Parse the top-level CREATE TABLE column definitions, respecting quoted text,
// comments and nested constraints. This parses metadata ONLY, never executes DDL.
export function columnNamesFromCreateSql(ddl: string): Set<string> {
  if (!/^\s*CREATE\s+(?:VIRTUAL\s+)?TABLE\s+/i.test(ddl)) {
    throw new Error("COMPANY_SCAN_SCHEMA_FORMAT_UNSUPPORTED");
  }
  const chunks: string[] = [];
  let depth = 0;
  let opening = -1;
  let start = -1;
  let state: "normal" | "single" | "double" | "backtick" | "bracket" | "line" | "block" = "normal";
  for (let i = 0; i < ddl.length; i++) {
    const c = ddl[i], n = ddl[i + 1];
    if (state === "line") { if (c === "\n") state = "normal"; continue; }
    if (state === "block") { if (c === "*" && n === "/") { state = "normal"; i++; } continue; }
    if (state === "single" || state === "double" || state === "backtick") {
      const terminal = state === "single" ? "'" : state === "double" ? '"' : "`";
      if (c === terminal) { if (n === terminal) i++; else state = "normal"; }
      continue;
    }
    if (state === "bracket") { if (c === "]") state = "normal"; continue; }
    if (c === "-" && n === "-") { state = "line"; i++; continue; }
    if (c === "/" && n === "*") { state = "block"; i++; continue; }
    if (c === "'") { state = "single"; continue; }
    if (c === '"') { state = "double"; continue; }
    if (c === "`") { state = "backtick"; continue; }
    if (c === "[") { state = "bracket"; continue; }
    if (c === "(") {
      if (opening < 0) { opening = i; start = i + 1; }
      depth++; continue;
    }
    if (c === ")") {
      depth--;
      if (depth < 0) throw new Error("COMPANY_SCAN_SCHEMA_PARSE_FAILED");
      if (depth === 0) {
        chunks.push(ddl.slice(start, i).trim());
        break;
      }
      continue;
    }
    if (c === "," && depth === 1) {
      chunks.push(ddl.slice(start, i).trim()); start = i + 1;
    }
  }
  if (opening < 0 || depth !== 0 || state !== "normal" || chunks.length === 0)
    throw new Error("COMPANY_SCAN_SCHEMA_PARSE_FAILED");

  const columns = new Set<string>();
  for (const fragment of chunks) {
    if (!fragment || /^(?:PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(fragment)) continue;
    const m = fragment.match(/^\s*(?:"((?:[^"]|"")*)"|`((?:[^`]|``)*)`|\[([^\]]+)\]|([^\s(),]+))/);
    const name = (m?.[1] || m?.[2] || m?.[3] || m?.[4] || "").replace(/""/g, '"').replace(/``/g, "`");
    if (!safeName(name) || columns.has(name)) throw new Error("COMPANY_SCAN_SCHEMA_PARSE_FAILED");
    columns.add(name);
  }
  if (!columns.size) throw new Error("COMPANY_SCAN_SCHEMA_PARSE_FAILED");
  return columns;
}

type ScanPlan = { table: string; where: string; binds: string[] };

export async function scanCompanyRelations(db: D1Database, slug: string, id: string): Promise<{
  blockedRelations: Relation[]; blockedTotal: number; aliasCount: number; scannedTables: number;
}> {
  if (!slug || !id) throw new Error("COMPANY_SCAN_SCOPE_REQUIRED");
  let metadata: D1Result<Row>;
  try {
    metadata = await db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all<Row>();
  } catch (cause) {
    throw new Error("COMPANY_SCAN_METADATA_FAILED", { cause });
  }
  if (!metadata?.success || !Array.isArray(metadata.results) || !metadata.results.length)
    throw new Error("COMPANY_SCAN_METADATA_INCOMPLETE");

  const schema = new Map<string, Set<string>>();
  for (const row of metadata.results) {
    const table = String(row.name ?? "");
    if (!safeName(table) || schema.has(table))
      throw new Error("COMPANY_SCAN_UNSAFE_TABLE_NAME");
    const ddl = String(row.sql ?? "");
    if (!ddl) throw new Error("COMPANY_SCAN_SCHEMA_UNAVAILABLE");
    schema.set(table, columnNamesFromCreateSql(ddl));
  }
  if (!schema.has("companies")) throw new Error("COMPANY_SCAN_SCHEMA_UNAVAILABLE");

  const plans: ScanPlan[] = [];
  for (const [table, columns] of schema) {
    if (table === "companies") continue;
    const keys = [...columns].filter((key) =>
      refNames.has(key) || (key.endsWith("_company_id") && key !== "main_company_id"));
    const jsonColumn = jsonRef.get(table);
    const conditions = keys.map((key) => quote(key) + "=?");
    const binds = keys.map(() => id);
    if (jsonColumn && columns.has(jsonColumn)) {
      conditions.push("INSTR(COALESCE(" + quote(jsonColumn) + ",''),?)>0");
      binds.push(id);
    }
    if (!conditions.length) continue;
    let where = "(" + conditions.join(" OR ") + ")";
    if (columns.has("main_company_slug")) { where += ' AND "main_company_slug"=?'; binds.push(slug); }
    if (columns.has("deleted_at")) where += ' AND "deleted_at" IS NULL';
    plans.push({ table, where, binds });
  }

  const blockedRelations: Relation[] = [];
  let aliasCount = 0;
  // Small concurrency protects D1 query budgets. No batch/PRAGMA/DDL and no
  // guessed zero counts. Any query error aborts the entire destructive preview.
  const limit = 4;
  for (let offset = 0; offset < plans.length; offset += limit) {
    await Promise.all(plans.slice(offset, offset + limit).map(async (p) => {
      let exists: Row | null;
      try {
        exists = await db.prepare("SELECT 1 AS present FROM " + quote(p.table) +
          " WHERE " + p.where + " LIMIT 1").bind(...p.binds).first<Row>();
      } catch (cause) { throw new Error("COMPANY_SCAN_RELATION_READ_FAILED", { cause }); }
      if (!exists) return;
      let counted: Row | null;
      try {
        counted = await db.prepare("SELECT COUNT(*) AS n FROM " + quote(p.table) +
          " WHERE " + p.where).bind(...p.binds).first<Row>();
      } catch (cause) { throw new Error("COMPANY_SCAN_RELATION_COUNT_FAILED", { cause }); }
      const count = Number(counted?.n);
      if (!Number.isSafeInteger(count) || count < 1)
        throw new Error("COMPANY_SCAN_RELATION_COUNT_INVALID");
      if (p.table === "company_aliases") aliasCount += count;
      else blockedRelations.push({ table: p.table, count });
    }));
  }
  blockedRelations.sort((a, b) => a.table.localeCompare(b.table));
  return {
    blockedRelations,
    blockedTotal: blockedRelations.reduce((total, item) => total + item.count, 0),
    aliasCount,
    scannedTables: schema.size,
  };
}
