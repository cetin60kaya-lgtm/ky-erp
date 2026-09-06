type D1Like = D1Database;

let readyInThisIsolate = false;

async function tableColumns(db:D1Like, table:string){
  const exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<{name:string}>();
  if(!exists?.name)return null;
  const rows=await db.prepare('PRAGMA table_info("'+table.replace(/"/g,'""')+'")').all<{name:string}>();
  return new Set((rows.results||[]).map((row)=>row.name));
}

export async function ensureMailWorkspaceUx(db:D1Like){
  if(readyInThisIsolate)return {state:"READY" as const,created:false};
  const columns=await tableColumns(db,"mail_message_user_state");
  if(columns){
    const required=["id","main_company_slug","user_id","message_id","is_pinned","pinned_at","updated_at"];
    const missing=required.filter((name)=>!columns.has(name));
    if(missing.length)throw new Error("MAIL_UX_PARTIAL_SCHEMA:mail_message_user_state:"+missing.join(","));
  }else{
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS mail_message_user_state (
        id TEXT PRIMARY KEY,
        main_company_slug TEXT NOT NULL,
        user_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0,1)),
        pinned_at TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(main_company_slug,user_id,message_id),
        FOREIGN KEY(message_id) REFERENCES mail_messages(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_mail_message_user_state_pinned ON mail_message_user_state(main_company_slug,user_id,is_pinned,pinned_at)")
    ]);
  }
  const verified=await tableColumns(db,"mail_message_user_state");
  if(!verified)throw new Error("MAIL_UX_VERIFY_TABLE_MISSING");
  for(const name of ["id","main_company_slug","user_id","message_id","is_pinned","pinned_at","updated_at"]){
    if(!verified.has(name))throw new Error("MAIL_UX_VERIFY_COLUMN_MISSING:"+name);
  }
  readyInThisIsolate=true;
  return {state:"READY" as const,created:!columns};
}
