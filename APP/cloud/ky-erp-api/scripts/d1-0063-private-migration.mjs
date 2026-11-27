// Owner-operated, one-target D1 migration. No GitHub runner data export.
// Uses existing Wrangler authorization; never prints credentials, SQL dump, or rows.
import {DatabaseSync} from "node:sqlite";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,readFileSync,writeFileSync,mkdtempSync,realpathSync,statSync,rmSync} from "node:fs";
import {dirname,join,resolve,relative,isAbsolute} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const migration=join(root,"migrations","0063_ebelge_operator_drafts.sql");
const dbName="ky-erp-db";
const tableNames=["accounting_document_drafts","accounting_document_read_state","ebelge_command_defaults","ebelge_operator_policy"];
const indexNames=["idx_ebelge_operator_drafts_list","idx_ebelge_command_defaults"];
const names=[...tableNames,...indexNames];
const quote=s=>"'"+s.replaceAll("'","''")+"'";
export const schemaQuery="SELECT type,name,sql FROM sqlite_master WHERE name IN ("+names.map(quote).join(",")+") ORDER BY name";
const norm=s=>String(s??"").replace(/\bIF NOT EXISTS\b/gi,"").replace(/\s+/g," ").replace(/\s*([(),=])\s*/g,"$1").trim();
function schemaRows(db){return db.prepare(schemaQuery).all()}
export function expectedSchema(sql=readFileSync(migration,"utf8")){
 const statements=sql.replace(/--[^\n]*/g,"").split(";").map(s=>s.trim()).filter(Boolean);
 if(statements.length!==6||statements.some(s=>!/^CREATE (?:TABLE|INDEX) IF NOT EXISTS\s+/i.test(s)))throw Error("MIGRATION_NOT_ADDITIVE");
 const db=new DatabaseSync(":memory:");
 try{db.exec(sql);const rows=schemaRows(db);if(rows.length!==6)throw Error("MIGRATION_SHAPE_INVALID");return rows}finally{db.close()}
}
export function classifySchema(rows,expected=expectedSchema()){
 if(!Array.isArray(rows))throw Error("SCHEMA_RESULT_INVALID");
 if(rows.length===0)return "MISSING";
 if(rows.length!==expected.length)return "PARTIAL_OR_MISMATCH";
 return expected.every(e=>rows.some(r=>r.name===e.name&&r.type===e.type&&norm(r.sql)===norm(e.sql)))?"READY":"PARTIAL_OR_MISMATCH";
}
const prerequisites=[
 "SELECT id,main_company_slug,party_company_id,document_no,direction,document_type,deleted_at,record_scope,xml_file_asset_id,raw_metadata,status FROM accounting_documents LIMIT 0",
 "SELECT id,main_company_slug,document_id,line_no,description,unit_code,quantity FROM accounting_document_lines LIMIT 0",
 "SELECT main_company_slug,document_id,related_document_id,relation_type FROM accounting_document_relations LIMIT 0",
 "SELECT id,name,tax_no,main_company_slug,deleted_at,is_active FROM companies LIMIT 0",
 "SELECT id,scope,main_company_slug,file_name,data,created_at,updated_at FROM json_store LIMIT 0"
];
const inside=(path,parent)=>{const r=relative(parent,path);return r===""||(!r.startsWith("..")&&!isAbsolute(r))};
function run(args,label){
 const wrangler=join(root,"node_modules","wrangler","bin","wrangler.js");
 if(!existsSync(wrangler))throw Error("EXISTING_WRANGLER_REQUIRED");
 const r=spawnSync(process.execPath,[wrangler,...args],{cwd:root,encoding:"utf8",maxBuffer:8*1024*1024,windowsHide:true});
 if(r.error||r.status!==0)throw Error(label+"_FAILED");
 return r.stdout;
}
function remote(sql){
 const response=JSON.parse(run(["d1","execute",dbName,"--remote","--config","wrangler.jsonc","--command",sql,"--json"],"D1_READ"));
 if(!Array.isArray(response)||response.length!==1||response[0].success!==true||!Array.isArray(response[0].results))throw Error("D1_READ_UNVERIFIED");
 return response[0].results;
}
function findBookmark(obj){
 if(!obj||typeof obj!=="object")return null;
 if(typeof obj.bookmark==="string"&&obj.bookmark.length>10)return obj.bookmark;
 for(const v of Object.values(obj)){const b=findBookmark(v);if(b)return b}return null;
}
function preflight(){
 for(const sql of prerequisites)remote(sql);
 const state=classifySchema(remote(schemaQuery));
 if(state==="PARTIAL_OR_MISMATCH")throw Error("D1_0063_PARTIAL_OR_MISMATCH");
 return state;
}
function backup(dir){
 const privateRoot=realpathSync(dir);
 if(!statSync(privateRoot).isDirectory()||inside(privateRoot,resolve(root,"../../..")))throw Error("PRIVATE_BACKUP_OUTSIDE_REPO_REQUIRED");
 if(process.platform!=="win32"&&(statSync(privateRoot).mode&0o077)!==0)throw Error("PRIVATE_BACKUP_DIRECTORY_PERMISSIONS");
 const bookmark=findBookmark(JSON.parse(run(["d1","time-travel","info",dbName,"--config","wrangler.jsonc","--json"],"TIME_TRAVEL")));
 if(!bookmark)throw Error("TIME_TRAVEL_UNVERIFIED");
 const pre=remote("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name");
 const folder=mkdtempSync(join(privateRoot,"kyerp-0063-"));
 const file=join(folder,"full-d1.sql"),verify=join(folder,"verify.sqlite");
 run(["d1","export",dbName,"--remote","--config","wrangler.jsonc","--output",file,"--skip-confirmation"],"FULL_BACKUP");
 const bytes=readFileSync(file);if(!bytes.length)throw Error("FULL_BACKUP_EMPTY");
 const local=new DatabaseSync(verify);
 try{
  local.exec(bytes.toString("utf8"));
  const tables=new Set(local.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  if(!pre.every(r=>tables.has(r.name)))throw Error("FULL_BACKUP_TABLE_COVERAGE");
  for(const sql of prerequisites)local.prepare(sql).all();
  if(local.prepare("PRAGMA quick_check").all().some(r=>r.quick_check!=="ok"))throw Error("FULL_BACKUP_INTEGRITY");
 }finally{local.close();rmSync(verify,{force:true});rmSync(verify+"-wal",{force:true});rmSync(verify+"-shm",{force:true});rmSync(verify+"-journal",{force:true})}
 const receipt={database:dbName,createdAt:new Date().toISOString(),bookmark,sha256:createHash("sha256").update(bytes).digest("hex"),size:bytes.length,tablesVerified:pre.length,restoredLocally:true};
 writeFileSync(join(folder,"receipt.json"),JSON.stringify(receipt,null,2),{flag:"wx",mode:0o600});
 console.log("D1_PRIVATE_FULL_BACKUP_VERIFIED");
}
function main(){
 const args=process.argv.slice(2);
 if(process.env.GITHUB_ACTIONS||process.env.CI)throw Error("OWNER_PRIVATE_ENVIRONMENT_ONLY");
 const check=args.length===1&&args[0]==="--check";
 const apply=args.length===3&&args[0]==="--apply-0063"&&args[1]==="--private-backup-dir";
 if(!check&&!apply)throw Error("USE_CHECK_OR_EXPLICIT_APPLY_0063_WITH_PRIVATE_BACKUP_DIR");
 expectedSchema();
 const initial=preflight();console.log("D1_0063_"+initial);
 if(check||initial==="READY")return;
 backup(args[2]);
 // Recheck after backup. Another process may already have applied the schema.
 const before=preflight();
 if(before==="MISSING"){
  run(["d1","execute",dbName,"--remote","--config","wrangler.jsonc","--file",migration,"--yes"],"TARGETED_0063_APPLY");
 }
 if(preflight()!=="READY")throw Error("D1_0063_POSTCHECK_FAILED");
 console.log("D1_0063_READY_VERIFIED");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{main()}catch(e){const msg=String(e?.message||"");console.error(/^[A-Z0-9_]+$/.test(msg)?msg:"D1_0063_FAILED_NO_DETAILS_EXPORTED");process.exitCode=1}
}
