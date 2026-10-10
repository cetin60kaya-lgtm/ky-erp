// Disconnected stage-only one-shot QA punch and matching synthetic TNF line.
// Hard blocks production; writes only into the disposable Windows QA directory.
import {writeFile} from "node:fs/promises";
import {basename,dirname,isAbsolute} from "node:path";
import {issueQrCredential} from "./qr-terminal-core.mjs";
const [portValue,tnfFile,cardNo]=process.argv.slice(2);
const port=Number(portValue);
const company="stage-company-01",terminal="stage-terminal-01";
if(process.env.KY_PDKS_ISOLATED_COPY!=="1"||
  process.env.KY_PDKS_STAGE_FDB_PATH?.toUpperCase().endsWith("\\KY_PDKS_STAGE.FDB")!==true||
  !Number.isInteger(port)||port<5197||port>5205||
  !/^\d{5}$/.test(cardNo??"")||!isAbsolute(tnfFile??"")||
  !basename(dirname(tnfFile)).startsWith("KY-PDKS-INSTALL-GATE-")||
  basename(tnfFile).toLowerCase()!=="stage-reference.tnf")
  throw Error("STAGE_QR_ONLY_DISPOSABLE_INPUT_REQUIRED");
const sign=process.env.KY_PDKS_QR_HMAC_SECRET??"";
const operator=process.env.KY_PDKS_TERMINAL_OPERATOR_KEY??"";
if(sign.length<32||operator.length<32)throw Error("STAGE_DPAPI_KEYS_REQUIRED");
const now=Date.now();
const token=issueQrCredential({companyId:company,
  employeeId:"stage-person-01",cardNo,issuer:"KY-STAGE-QR",
  secret:sign,now,ttlSeconds:90});
const host="http://127.0.0.1:"+port;
const response=await fetch(host+"/scan",{
  method:"POST",redirect:"error",signal:AbortSignal.timeout(3000),
  headers:{"content-type":"application/json",
    "x-ky-pdks-terminal-key":operator,origin:host},
  body:JSON.stringify({token,direction:"IN"}),
});
if(response.status!==202)throw Error("STAGE_LOCAL_QR_SCAN_NOT_ACCEPTED");
const receipt=await response.json();
if(!receipt?.sourceKey||receipt.status!=="PENDING_RECONCILIATION"||
   receipt.fdbReconciled!==false||receipt.tnfReconciled!==false)
  throw Error("STAGE_QR_SOURCE_NOT_PENDING");
const observed=new Date(receipt.receivedAt);
if(Number.isNaN(observed.getTime()))throw Error("STAGE_RECEIPT_TIMESTAMP_INVALID");
const day=new Intl.DateTimeFormat("en-CA",{
  timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",
}).format(observed);
const time=new Intl.DateTimeFormat("en-GB",{
  timeZone:"Europe/Istanbul",hour:"2-digit",minute:"2-digit",hourCycle:"h23",
}).format(observed);
const [year,month,dd]=day.split("-");
const row=cardNo+","+time+","+dd+month+year.slice(2)+",1,001\n";
await writeFile(tnfFile,row,{flag:"wx",mode:0o600});
process.stdout.write("RESULT=STAGE_LOCAL_QR_AND_SYNTHETIC_TNF_CREATED\n");
process.stdout.write("LIVE_PERSONNEL_OR_ANNUAL_TNF_WRITTEN=false\n");
