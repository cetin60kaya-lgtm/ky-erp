import {createHash} from "node:crypto";
import {readdir,readFile,lstat} from "node:fs/promises";
import {join} from "node:path";
import {parseTnfReferenceFile} from "./tnf-reference-import.mjs";

const sha=(value)=>createHash("sha256").update(value).digest("hex");
const dateOk=(value)=>typeof value==="string"&&/^\d{4}-\d\d-\d\d$/.test(value)&&
  !Number.isNaN(Date.parse(value+"T12:00:00Z"))&&
  new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
const timeOk=(value)=>typeof value==="string"&&
  /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
const sources=new Set(["KY_LOCAL_SIGNED_QR_KIOSK","USB_HID_CARD_WEDGE_UNVERIFIED"]);
const key=(card,date,hour)=>card+"|"+date+"|"+hour.slice(0,5);

/** Local QR journal fact shape check: no signature is reconstructed here.
 * An earlier kiosk HMAC check is not physical terminal/employee certification.
 */
export function inspectLocalTerminalFact(row,{companyId,terminalId}){
  if(!row||typeof row!=="object"||row.companyId!==companyId||
    row.terminalId!==terminalId||!sources.has(row.source)||
    !/^\d{5}$/.test(row.cardNo??"")||!dateOk(row.workDate)||
    !timeOk(row.localTime)||!Number.isSafeInteger(Date.parse(row.receivedAt))||
    row.timezone!=="Europe/Istanbul"||
    !/^[a-f0-9]{64}$/.test(row.sourceKey??"")||
    row.physicalHardwareProven!==false||row.firebirdReconciled!==false||
    row.tnfReconciled!==false||row.cloudAcked!==false)
    return {valid:false,reason:"TERMINAL_SOURCE_FACT_INVALID"};
  // Protect against edited source-key/event files. This is a format binding,
  // not an independent proof of origin (only the kiosk validated QR HMAC).
  let expected="";
  if(row.source==="KY_LOCAL_SIGNED_QR_KIOSK"){
    if(!/^[a-f0-9]{64}$/.test(row.credentialHash??"")||
       typeof row.nonce!=="string"||!row.nonce||
       typeof row.employeeId!=="string"||!row.employeeId||
       row.status!=="PENDING_RECONCILIATION"||
       !["IN","OUT"].includes(row.direction))
      return {valid:false,reason:"TERMINAL_QR_FACT_INVALID"};
    expected=sha(JSON.stringify([row.companyId,row.terminalId,row.credentialHash,row.nonce]));
  } else {
    if(row.identityVerified!==false||
       row.status!=="PENDING_IDENTITY_AND_RECONCILIATION"||
       !["IN","OUT"].includes(row.direction))
      return {valid:false,reason:"TERMINAL_USB_FACT_INVALID"};
    expected=sha(JSON.stringify(["UNVERIFIED_WEDGE",row.companyId,row.terminalId,
      row.cardNo,row.direction,Math.floor(Date.parse(row.receivedAt)/10000)]));
  }
  if(expected!==row.sourceKey)return {valid:false,reason:"TERMINAL_SOURCE_KEY_MISMATCH"};
  const iso=Date.parse(row.receivedAt);
  const d=new Date(iso);
  const observedDate=new Intl.DateTimeFormat("en-CA",{
    timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",
  }).format(d);
  const observedClock=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Europe/Istanbul",hour:"2-digit",minute:"2-digit",second:"2-digit",
    hourCycle:"h23",
  }).format(d);
  if(observedDate!==row.workDate||observedClock!==row.localTime)
    return {valid:false,reason:"TERMINAL_SOURCE_CLOCK_MISMATCH"};
  return {valid:true,reason:"VALID_PENDING_LOCAL_RECORD",key:key(row.cardNo,row.workDate,row.localTime)};
}

/** Strict preview: compare exact card + Istanbul day + minute to a reference
 * TNF file. TNF rows have NO IN/OUT direction; do not infer one.
 */
export function reconcileLocalEvents({companyId,terminalId,events,tnfText,yearHint=null}){
  if(!/^[A-Za-z0-9._:-]{3,100}$/.test(companyId??"")||
     !/^[A-Za-z0-9._-]{3,64}$/.test(terminalId??"")||
     !Array.isArray(events)||events.length>30000||
     typeof tnfText!=="string"||tnfText.length>30_000_000)
    throw new Error("TERMINAL_RECONCILIATION_ARGUMENTS_INVALID");
  const reference=parseTnfReferenceFile(tnfText,yearHint);
  // Avoid conflating two physical-like readings in the same minute with a
  // single original TNF row; both need manual evidence review.
  const indexed=new Map();
  for(const row of reference.accepted){
    const k=key(row.cardNo,row.workDate,row.time);
    indexed.set(k,(indexed.get(k)||0)+1);
  }
  const inspected=events.map(row=>inspectLocalTerminalFact(row,{companyId,terminalId}));
  const eventsPerMinute=new Map();
  inspected.forEach((result)=>{if(result.valid)
    eventsPerMinute.set(result.key,(eventsPerMinute.get(result.key)||0)+1);
  });
  let matched=0,unmatched=0,ambiguous=0,rejected=0;
  let qr=0,usb=0;
  const reasons={};
  inspected.forEach((result,index)=>{
    if(!result.valid){rejected++;reasons[result.reason]=(reasons[result.reason]||0)+1;return;}
    if(events[index].source==="KY_LOCAL_SIGNED_QR_KIOSK")qr++;else usb++;
    if(eventsPerMinute.get(result.key)!==1||indexed.get(result.key)>1){ambiguous++;return;}
    if(indexed.get(result.key)===1)matched++;else unmatched++;
  });
  return Object.freeze({
    mode:"READ_ONLY_TNF_REFERENCE_PREVIEW",
    terminalId,yearHint,inspected:events.length,acceptedPending:qr+usb,
    signedQrPending:qr,unsignedUsbPending:usb,matchedReference:matched,
    notInReference:unmatched,ambiguousDuplicateMinute:ambiguous,
    rejectedFacts:rejected,rejectionReasons:Object.freeze(reasons),
    referenceRows:reference.accepted.length,
    rejectedReferenceRows:reference.rejected.length,
    // A file-level match is never equivalent to physical terminal or FDB proof.
    tnFReferenceCompared:true,terminalRawCertified:false,firebirdVerified:false,
    tnfApplied:false,cloudApplied:false,annualTnfWritten:false,
    safeToApply:false,requiresHumanReview:true,
  });
}

/** Operator-invoked, bounded and read-only. Files in the journal are never
 * deleted, rewritten, acknowledged or uploaded.
 */
export async function readLocalTerminalJournal(journalRoot,{limit=30000}={}){
  if(!Number.isInteger(limit)||limit<1||limit>30000)
    throw new Error("TERMINAL_JOURNAL_LIMIT_INVALID");
  const dir=join(journalRoot,"events");
  const names=(await readdir(dir)).filter(name=>/^[a-f0-9]{64}\.json$/.test(name));
  if(names.length>limit)throw new Error("TERMINAL_JOURNAL_LIMIT_EXCEEDED");
  const rows=[];
  for(const name of names.sort()){
    const file=join(dir,name);
    const stat=await lstat(file);
    if(!stat.isFile()||stat.size>4096)throw new Error("TERMINAL_JOURNAL_FILE_INVALID");
    let row;
    try{row=JSON.parse(await readFile(file,"utf8"));}
    catch{throw new Error("TERMINAL_JOURNAL_JSON_INVALID");}
    if(row?.sourceKey!==name.slice(0,64))
      throw new Error("TERMINAL_JOURNAL_FILENAME_HASH_MISMATCH");
    rows.push(row);
  }
  return rows;
}
