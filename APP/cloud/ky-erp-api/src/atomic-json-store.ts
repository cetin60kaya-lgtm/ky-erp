// Transactional compare-and-swap for the existing D1 json_store; no migration.
type Row = Record<string, any>;
export type StoreSnapshot = { id: string; scope: string; slug: string; fileName: string; raw: string; value: Row };
const txt = (v: unknown) => String(v ?? "").trim();
export async function storeSnapshot(db: any, scope: string, slug: string, fileName: string): Promise<StoreSnapshot | null> {
  if (!slug || !fileName) return null;
  const result = await db.prepare("SELECT id,data,file_name FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 2").bind(scope,slug,fileName).all();
  if (!Array.isArray(result.results) || result.success === false) throw Error("STORE_READ_FAILED");
  if (result.results.length > 1) throw Error("STORE_DUPLICATE_REVIEW");
  const row = result.results[0];
  if (!row) return null;
  const value = JSON.parse(row.data);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("STORE_DATA_INVALID");
  return {id:txt(row.id),scope,slug,fileName:txt(row.file_name),raw:row.data,value:{...value,id:txt(value.id || row.file_name)}};
}
// A false precondition must abort the *whole* D1 batch, not merely update 0 rows.
// SQLite abs(min signed integer) throws; CASE evaluates only the selected branch.
export function storeGuard(db: any, snapshot: StoreSnapshot) {
  return db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM json_store WHERE id=? AND scope=? AND main_company_slug=? AND file_name=? AND data IS ?) THEN 1 ELSE abs(-9223372036854775808) END AS ok")
    .bind(snapshot.id,snapshot.scope,snapshot.slug,snapshot.fileName,snapshot.raw);
}
export function storeUpdate(db: any, snapshot: StoreSnapshot, value: Row, at: string) {
  return db.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND scope=? AND main_company_slug=? AND file_name=?")
    .bind(JSON.stringify({...value,updatedAt:at}),at,snapshot.id,snapshot.scope,snapshot.slug,snapshot.fileName);
}
export function storeInsert(db: any, scope: string, slug: string, id: string, value: Row, at: string) {
  return db.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .bind(id,scope,slug,id,JSON.stringify({...value,id,updatedAt:at}),at,at);
}
export async function stableStoreId(prefix: string, parts: unknown[]) {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(parts)));
  return prefix+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function commitStoreBatch(db: any, guards: any[], writes: any[]) {
  if (!writes.length) throw Error("STORE_EMPTY_BATCH");
  const result = await db.batch([...guards,...writes]);
  if (!Array.isArray(result) || result.length !== guards.length+writes.length || result.some((r:any)=>r.success===false)) throw Error("STORE_BATCH_FAILED");
}
