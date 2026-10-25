// @ts-nocheck
// Permanent D1 idempotency: deterministic primary-key identity + transactional record/link.
const str = (value: unknown) => value == null ? "" : String(value).trim();
const json = (value: unknown) => typeof value === "string" ? JSON.parse(value || "{}") : (value || {});
const utf8 = new TextEncoder();
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", utf8.encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function productionIdentity(
  tenant: string, requestId: string, clientId: string, payload: Record<string, unknown>,
) {
  if (!tenant || !requestId || !clientId) throw Object.assign(new Error("Ana firma ve işlem kimliği zorunludur."),{code:"PRODUCTION_REQUEST_ID_REQUIRED"});
  const [key,payloadHash]=await Promise.all([
    digest(JSON.stringify([tenant,requestId,clientId])),
    digest(JSON.stringify(payload)),
  ]);
  return { id: "KYPR:" + key, linkId: "KYPL:" + key, payloadHash };
}
const allowed = new Set(["production_records","model_production_links"]);
const quote = (s: string) => '"' + s.replace(/"/g,'""') + '"';
async function preparedInsert(db: any, table: string, values: Record<string,unknown>) {
  if(!allowed.has(table)) throw new Error("Production table not supported");
  const info=await db.prepare("PRAGMA table_info(" + quote(table) + ")").all();
  const cols=new Set((info.results||[]).map((x:any)=>String(x.name)));
  if (!cols.has("id") || !cols.has("main_company_slug") || !cols.has(table==="production_records"?"model_id":"production_record_id"))
    throw Object.assign(new Error(table + " tablosu hazır değil; yazma güvenle durduruldu."),{code:"PRODUCTION_SCHEMA_NOT_READY"});
  const fields=Object.entries(values).filter(([key,value])=>cols.has(key)&&value!==undefined);
  const query="INSERT INTO "+quote(table)+" ("+fields.map(([k])=>quote(k)).join(",")+") VALUES ("+fields.map(()=>"?").join(",")+")";
  return db.prepare(query).bind(...fields.map(([,v])=>typeof v==="object"&&v!==null?JSON.stringify(v):v));
}
export async function writeProductionEntryAtomic(
  db: any, tenant: string, requestId: string, clientId: string,
  rawPayload: Record<string,unknown>, record: Record<string,unknown>, link: Record<string,unknown>,
) {
  const identity=await productionIdentity(tenant,requestId,clientId,rawPayload);
  const existing=async()=>db.prepare("SELECT id,raw FROM production_records WHERE id=? AND main_company_slug=? LIMIT 1").bind(identity.id,tenant).first();
  const resolveExisting=(row:any)=>{
    let payload:any={};
    try{payload=json(row.raw);}catch{}
    if(str(payload.idempotencyHash)!==identity.payloadHash)throw Object.assign(new Error("Aynı requestId/clientId farklı üretim fişinde kullanıldı."),{code:"PRODUCTION_REQUEST_PAYLOAD_CONFLICT"});
    return { id:identity.id,storage:"production_records",idempotent:true,clientId };
  };
  const previous=await existing();
  if(previous) return resolveExisting(previous);
  const timestamp=new Date().toISOString();
  const productionValues={
    ...record,id:identity.id,main_company_slug:tenant,
    raw:{...record.raw,...rawPayload,idempotencyHash:identity.payloadHash,requestId,clientId},
  };
  const linkValues={
    ...link,id:identity.linkId,main_company_slug:tenant,
    production_record_id:identity.id,
    raw:{source:"PRODUCTION_CENTER",requestId,clientId},
    created_at:timestamp,updated_at:timestamp,
  };
  const statements=await Promise.all([
    preparedInsert(db,"production_records",productionValues),
    preparedInsert(db,"model_production_links",linkValues),
  ]);
  try {
    // D1 batch is one SQLite transaction; if the link fails the record rolls back.
    await db.batch(statements);
  } catch(error:any) {
    // A competing identical request may have committed while this one was preparing.
    const winner=await existing();
    if(winner)return resolveExisting(winner);
    throw Object.assign(new Error("Üretim fişi ve model bağlantısı birlikte kaydedilemedi; kayıt oluşmadı."),{code:"PRODUCTION_ATOMIC_WRITE_FAILED"});
  }
  return { id:identity.id,storage:"production_records",idempotent:false,clientId };
}
