type D1Like = D1Database;

let readyInThisIsolate = false;
const REQUIRED = ["id","main_company_slug","user_id","message_id","is_pinned","pinned_at","updated_at"];

async function tableColumns(db:D1Like, table:string){
  const exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<{name:string}>();
  if(!exists?.name)return null;
  const rows=await db.prepare('PRAGMA table_info("'+table.replace(/"/g,'""')+'")').all<{name:string}>();
  return new Set((rows.results||[]).map((row)=>row.name));
}

async function indexExists(db:D1Like,name:string){
  const row=await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=? LIMIT 1").bind(name).first<{name:string}>();
  return Boolean(row?.name);
}

export async function ensureMailWorkspaceUx(db:D1Like){
  if(readyInThisIsolate)return {state:"READY" as const,created:false};
  const columns=await tableColumns(db,"mail_message_user_state");
  if(!columns)throw new Error("MAIL_UX_SCHEMA_NOT_READY:0051_mail_workspace_user_state");
  const missing=REQUIRED.filter((name)=>!columns.has(name));
  if(missing.length)throw new Error("MAIL_UX_PARTIAL_SCHEMA:mail_message_user_state:"+missing.join(","));
  if(!(await indexExists(db,"idx_mail_message_user_state_pinned")))throw new Error("MAIL_UX_INDEX_NOT_READY:idx_mail_message_user_state_pinned");
  readyInThisIsolate=true;
  return {state:"READY" as const,created:false};
}
