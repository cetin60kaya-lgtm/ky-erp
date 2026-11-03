import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import XLSX from "xlsx";

// Standalone, tenant-scoped, safe-by-default model bootstrap.
// Run without --apply to inspect; never changes the Excel/Drive folder tree.
const args = process.argv.slice(2);
const opt = (key, fallback = "") => {
  const i = args.indexOf(key);
  return i < 0 ? fallback : String(args[i + 1] || "");
};
const apply = args.includes("--apply");
const tenant = opt("--tenant");
const input = opt("--input");
const year = Number(opt("--year", "2026"));
const sheet = opt("--sheet", "İmalat Takip Muhasebe");
const limit = Number(opt("--limit", "0")) || 0;
const db = opt("--database", "ky-erp-db");
const batchSize = Math.min(20, Math.max(1, Number(opt("--batch-size", "12")) || 12));
if (!/^[a-z0-9-]{3,64}$/.test(tenant) || !input || !existsSync(input) || !Number.isInteger(year) || year < 2026) {
  throw Error("Required: --tenant <slug> --input <source.xlsm> [--year 2026]");
}
if (apply && opt("--confirm-tenant") !== tenant) throw Error("Explicit --confirm-tenant required for D1 writes.");
const apiRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wrangler = join(apiRoot, "node_modules", "wrangler", "bin", "wrangler.js");
if (!existsSync(wrangler)) throw Error("Existing Wrangler installation not found.");
const sqlQuote = (x) => x == null ? "NULL" : "'" + String(x).replaceAll("'", "''") + "'";
const upperKey = (x) => String(x ?? "").trim().toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ").replace(/ +/g, " ").trim();
const clean = (x) => String(x ?? "").trim();
const positiveInt = (x) => {
  const n = Number(x);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};
const stableUuid = (s) => {
  const h = createHash("sha256").update(s).digest("hex");
  return [h.slice(0,8), h.slice(8,12), "5" + h.slice(13,16), "8" + h.slice(17,20), h.slice(20,32)].join("-");
};
function execute(extra) {
  const r = spawnSync(process.execPath, [wrangler, "d1", "execute", db, "--remote", "--json", ...extra], {
    cwd: apiRoot, encoding: "utf8", timeout: 180000, maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) throw Error("Remote D1 failed (no retry assumed): " + (r.stderr || r.stdout).slice(0, 1200));
  if (extra.includes("--file")) return [];
  const pages = JSON.parse(r.stdout.trim());
  if (!Array.isArray(pages) || pages.some((p) => p.success !== true)) throw Error("D1 query not successful.");
  return pages.flatMap((p) => p.results || []);
}
const workbook = XLSX.readFile(input, { bookVBA: false, cellDates: false });
if (!workbook.Sheets[sheet]) throw Error("Source sheet missing: " + sheet);
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: null });
const existingRows = execute(["--command",
  "SELECT id,model_name,model_code FROM model_records WHERE main_company_slug=" + sqlQuote(tenant) +
  " AND COALESCE(TRIM(deleted_at),'')=''"]);
const existingByName = new Map();
for (const r of existingRows) {
  const k = upperKey(r.model_name || r.model_code);
  if (!k) continue;
  existingByName.set(k, (existingByName.get(k) || 0) + 1);
}
const validModels = new Map();
let validProductionRows = 0, invalidRows = 0;
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const date = typeof row[0] === "number" ? XLSX.SSF.parse_date_code(row[0]) : null;
  if (!date || date.y !== year || !clean(row[2])) continue;
  const name = clean(row[2]), key = upperKey(name);
  if (key && !validModels.has(key)) validModels.set(key, {name, firstExcelRow:i+1});
  const quantity = positiveInt(row[4]);
  const fabric = row[10] == null || row[10] === "" ? 0 : positiveInt(row[10]);
  const print = row[11] == null || row[11] === "" ? 0 : positiveInt(row[11]);
  if (!(quantity > 0) || fabric == null || print == null || fabric + print > quantity) {
    invalidRows++;
    continue;
  }
  validProductionRows++;
}
const missing = [...validModels].filter(([name]) => !existingByName.has(name))
  .map(([key,value]) => ({key,...value,id:stableUuid("KYERP:XLSM:"+tenant+":"+year+":"+key)}));
const selected = limit > 0 ? missing.slice(0,limit) : missing;
const output = {mode:apply?"APPLY":"DRY_RUN",tenant,year,existingModels:existingRows.length,
  validProductionRows,invalidRows,distinctValidModels:validModels.size,
  missingModelCount:missing.length, selected: selected.length,
  firstModels: missing.slice(0,8).map((x)=>x.name)};
console.log(JSON.stringify(output,null,2));
if (!apply || selected.length === 0) process.exit(0);

// Recheck for the exact deterministic model IDs so reruns cannot overwrite unrelated records.
const sameIds = execute(["--command", "SELECT id,model_name FROM model_records WHERE main_company_slug=" +
  sqlQuote(tenant) + " AND id IN (" + selected.map((x)=>sqlQuote(x.id)).join(",") + ")"]);
for (const row of sameIds) {
  const match = selected.find((m)=>m.id===row.id);
  if (match && upperKey(row.model_name)!==match.key) throw Error("Model ID conflict; refusing to write.");
}
// Customer assignment is explicit; never guess a company for a different tenant.
const companyName = clean(opt("--customer-name"));
const companyId = clean(opt("--customer-id"));
const company = companyId ? {id:companyId,name:companyName} : null;
const ts = new Date().toISOString();
let processed = 0;
for (let i=0;i<selected.length;i+=batchSize) {
  const batch=selected.slice(i,i+batchSize);
  const statements=[];
  for (const item of batch) {
    const opId=stableUuid("KYERP:XLSM:OP:"+tenant+":"+year+":"+item.key);
    const metadata={previewStatus:"UPLOAD_REQUIRED",previewLabel:"Görsel Yüklenecek",
      source:"XLSM_IMPORT",sourceYear:year,sourceExcelRow:item.firstExcelRow};
    const workflow={
      id:item.id,modelName:item.name,modelCode:item.name,
      companyId:company?.id||"",companyName,
      status:"MODEL_INFO_MISSING",sourceType:"XLSM_IMPORT",
      operations:[{id:opId,printAreaCode:"FRONT",printAreaName:"Ön",sequence:1,moldType:"UNDEFINED",
        placementStatus:"WAITING",dyehouseStatus:"WAITING",productionReady:false,channels:[],colorGroups:[]}],
      files:[],metadata,createdAt:ts,updatedAt:ts,
    };
    const raw={workflowModelId:item.id,modelName:item.name,modelCode:item.name,
      companyId:company?.id||"",companyName,
      imageUrl:"",sourceType:"XLSM_IMPORT",workflowStatus:"MODEL_INFO_MISSING",
      sourceYear:year,previewStatus:"UPLOAD_REQUIRED",previewLabel:"Görsel Yüklenecek",
      sourceExcelRow:item.firstExcelRow,createdAt:ts,updatedAt:ts};
    const rec=[item.id,tenant,item.name,item.name,"MODEL_INFO_MISSING",JSON.stringify(raw),
      company?.id||null,company?.id||null,companyName,ts,ts];
    statements.push("INSERT OR IGNORE INTO model_records(id,main_company_slug,model_name,model_code,status,raw,company_id,customer_id,customer_name,created_at,updated_at) VALUES("+
      rec.map(sqlQuote).join(",")+")");
    const store=[stableUuid("KYERP:XLSM:STORE:"+tenant+":"+year+":"+item.key),
      "DESEN_WORKFLOW_MODEL",tenant,item.id,JSON.stringify(workflow),ts,ts];
    statements.push("INSERT OR IGNORE INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES("+
      store.map(sqlQuote).join(",")+")");
  }
  const directory=mkdtempSync(join(tmpdir(),"kyerp-new-models-"));
  try {
    const filename=join(directory,"batch.sql");
    writeFileSync(filename,statements.join(";\n")+";\n","utf8");
    execute(["--file",filename]);
    processed+=batch.length;
    console.log(JSON.stringify({processed,total:selected.length}));
  } finally {rmSync(directory,{recursive:true,force:true});}
}
const verified = execute(["--command",
  "SELECT COUNT(*) n FROM model_records WHERE main_company_slug="+sqlQuote(tenant)+
  " AND status='MODEL_INFO_MISSING' AND json_extract(raw,'$.sourceType')='XLSM_IMPORT'"+
  " AND json_extract(raw,'$.sourceYear')="+year]);
const workflowVerified = execute(["--command",
  "SELECT COUNT(*) n FROM json_store WHERE main_company_slug="+sqlQuote(tenant)+
  " AND scope='DESEN_WORKFLOW_MODEL' AND json_extract(data,'$.sourceType')='XLSM_IMPORT'"+
  " AND json_extract(data,'$.metadata.sourceYear')="+year]);
console.log(JSON.stringify({verification:"LIVE_D1",createdModelRows:verified[0]?.n,
  workflowModelRows:workflowVerified[0]?.n,attempted:processed}));
