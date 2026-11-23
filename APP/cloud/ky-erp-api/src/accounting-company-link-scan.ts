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
  let metadata: D1Result<Row>;
  try {
    metadata = await db.prepare(`
      SELECT m.name AS table_name, p.name AS column_name
      FROM sqlite_master AS m
      LEFT JOIN pragma_table_info(m.name) AS p
      WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%'
      ORDER BY m.name, p.cid
    `).all<Row>();
  } catch (cause) {
    throw new Error("COMPANY_SCAN_METADATA_FAILED", { cause });
  }
  const columnsByTable = new Map<string, Set<string>>();
  for (const row of metadata.results || []) {
    const table = String(row.table_name || "");
    if (!safeName(table)) throw new Error("COMPANY_SCAN_UNSAFE_TABLE_NAME");
    const column = String(row.column_name || "");
    if (!column || !safeName(column)) throw new Error("COMPANY_SCAN_UNREADABLE_TABLE_SCHEMA");
    if (!columnsByTable.has(table)) columnsByTable.set(table,new Set());
    columnsByTable.get(table)!.add(column);
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
