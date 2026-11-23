// One complete, fail-closed read-only schema/relationship inspection.
// D1 batches reduce the per-table network round-trips that timed out on large databases.
type Row = Record<string, any>;
type Relation = { table: string; count: number };
const safeName = (v: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v);
const refs = new Set(["company_id","firm_id","customer_id","supplier_company_id","party_company_id","counterparty_id","supplier_id","customer_company_id","source_company_id","target_company_id"]);
const jsonRef = new Map([["model_records","raw"],["models","raw"],["production_records","raw"],["json_store","data"]]);
const quote = (name: string) => '"' + name + '"';

/** The preserved target is never deleted or re-parented. Only its identity,
 * current balance and revision are needed for an empty-source merge. */
export async function readCompanyMergeTarget(db: D1Database, slug: string, id: string) {
  if (!slug || !id) throw new Error("COMPANY_SCAN_SCOPE_REQUIRED");
  const record = await db.prepare(
    "SELECT id,name,updated_at,current_balance,opening_balance,is_active FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1"
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

/** Only bounded error codes are returned to managers; raw SQL and identifiers
 * remain in protected server logs and never enter the UI. */
export function publicCompanyScanFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/^COMPANY_SCAN_[A-Z0-9_]{1,64}$/.test(message)) return message;
  return "COMPANY_SCAN_DATABASE_ERROR";
}


export async function scanCompanyRelations(db: D1Database, slug: string, id: string): Promise<{
  blockedRelations: Relation[]; blockedTotal: number; aliasCount: number; scannedTables: number;
}> {
  if (!slug || !id) throw new Error("COMPANY_SCAN_SCOPE_REQUIRED");
  // D1 does not reliably support a correlated table-valued PRAGMA with
  // sqlite_master as its argument. Read the table inventory first, then read
  // each table's columns using independent statements batched in small groups.
  // Every failure aborts the entire preview (fail closed).
  let inventory: D1Result<Row>;
  try {
    inventory = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all<Row>();
  } catch (cause) {
    throw new Error("COMPANY_SCAN_TABLE_LIST_FAILED", { cause });
  }
  if (!inventory?.success || !Array.isArray(inventory.results) || inventory.results.length === 0)
    throw new Error("COMPANY_SCAN_TABLE_LIST_INCOMPLETE");

  const columnsByTable = new Map<string, Set<string>>();
  const tables = inventory.results.map(row => String(row.name ?? ""));
  if (tables.some(table => !safeName(table)) || new Set(tables).size !== tables.length)
    throw new Error("COMPANY_SCAN_UNSAFE_TABLE_NAME");

  const schemaBatchSize = 16;
  for (let offset=0; offset<tables.length; offset+=schemaBatchSize) {
    const group=tables.slice(offset,offset+schemaBatchSize);
    let schema: D1Result<Row>[];
    try {
      schema=await db.batch(group.map(table =>
        db.prepare("PRAGMA table_info("+quote(table)+")")
      ));
    } catch (cause) {
      throw new Error("COMPANY_SCAN_SCHEMA_BATCH_FAILED", { cause });
    }
    if (!Array.isArray(schema) || schema.length!==group.length)
      throw new Error("COMPANY_SCAN_SCHEMA_BATCH_INCOMPLETE");
    for (let n=0;n<group.length;n++) {
      const info=schema[n];
      if (!info?.success || !Array.isArray(info.results) || info.results.length===0)
        throw new Error("COMPANY_SCAN_UNREADABLE_TABLE_SCHEMA");
      const columnNames=new Set<string>();
      for (const row of info.results) {
        const column=String(row.name??"");
        if (!safeName(column) || columnNames.has(column))
          throw new Error("COMPANY_SCAN_UNREADABLE_TABLE_SCHEMA");
        columnNames.add(column);
      }
      columnsByTable.set(group[n],columnNames);
    }
  }
  if (!columnsByTable.has("companies")) throw new Error("COMPANY_SCAN_SCHEMA_UNAVAILABLE");
  const plans: {table:string; where:string; binds:string[]}[] = [];
  for (const [table,cols] of columnsByTable) {
    if (table === "companies") continue;
    const keys = [...cols].filter(n => refs.has(n) || (n.endsWith("_company_id") && n !== "main_company_id"));
    const rawColumn=jsonRef.get(table);
    const where=keys.map(key=>quote(key)+"=?");
    const binds=keys.map(()=>id);
    if (rawColumn && cols.has(rawColumn)) { where.push("INSTR(COALESCE("+quote(rawColumn)+",''),?)>0"); binds.push(id); }
    if (!where.length) continue;
    const scope=cols.has("main_company_slug") ? " AND "+quote("main_company_slug")+"=?" : "";
    if (scope) binds.push(slug);
    const active=cols.has("deleted_at") ? " AND "+quote("deleted_at")+" IS NULL" : "";
    plans.push({table,where:"("+where.join(" OR ")+")"+scope+active,binds});
  }

  // Only existence is needed for empty duplicates. Full counts run for tables
  // with at least one relation, avoiding expensive COUNT scans across every archive.
  const detected: typeof plans = [];
  const batchSize=24;
  for (let offset=0;offset<plans.length;offset+=batchSize) {
    const group=plans.slice(offset,offset+batchSize);
    const statements=group.map(p=>db.prepare(
      "SELECT 1 AS n FROM "+quote(p.table)+" WHERE "+p.where+" LIMIT 1"
    ).bind(...p.binds));
    let results: D1Result<Row>[];
    try { results = await db.batch(statements); }
    catch (cause) { throw new Error("COMPANY_SCAN_EXISTS_BATCH_FAILED", { cause }); }
    if (!Array.isArray(results) || results.length!==group.length)
      throw new Error("COMPANY_SCAN_INCOMPLETE_BATCH");
    for (let n=0;n<results.length;n++) {
      if (!results[n]?.success) throw new Error("COMPANY_SCAN_QUERY_FAILED_"+group[n].table);
      if ((results[n].results||[]).length) detected.push(group[n]);
    }
  }

  const blockedRelations:Relation[]=[];
  let aliasCount=0;
  for (const group of Array.from({length:Math.ceil(detected.length/batchSize)},(_,n)=>detected.slice(n*batchSize,(n+1)*batchSize))) {
    let results: D1Result<Row>[];
    try {
      results = await db.batch(group.map(p=>db.prepare(
        "SELECT COUNT(*) AS n FROM "+quote(p.table)+" WHERE "+p.where
      ).bind(...p.binds)));
    } catch (cause) {
      throw new Error("COMPANY_SCAN_COUNT_BATCH_FAILED", { cause });
    }
    if (!Array.isArray(results) || results.length!==group.length)
      throw new Error("COMPANY_SCAN_INCOMPLETE_COUNT");
    for(let n=0;n<group.length;n++) {
      if (!results[n]?.success) throw new Error("COMPANY_SCAN_COUNT_FAILED_"+group[n].table);
      const count=Number((results[n].results?.[0] as Row | undefined)?.n);
      if (!Number.isSafeInteger(count)||count<1)throw new Error("COMPANY_SCAN_INVALID_COUNT");
      if (group[n].table==="company_aliases") aliasCount+=count;
      else blockedRelations.push({table:group[n].table,count});
    }
  }
  return {
    blockedRelations,
    blockedTotal:blockedRelations.reduce((sum,x)=>sum+x.count,0),
    aliasCount,scannedTables:columnsByTable.size,
  };
}
