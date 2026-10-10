import {createHash} from "node:crypto";

/** Vendor-neutral, strictly read-only CSV import for hardware that offers
 * an authenticated export. This does not certify the export's provenance. */
const isoDate=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 !Number.isNaN(Date.parse(v+"T12:00:00Z"))&&
 new Date(v+"T12:00:00Z").toISOString().slice(0,10)===v;
const clock=v=>typeof v==="string"&&/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v);
const columns=["eventId","cardNo","date","time","direction"];
const splitLine=line=>{
 const result=[];let value="",quoted=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(ch==='"'){
   if(quoted&&line[i+1]==='"'){value+='"';i++;}
   else if(!value||quoted)quoted=!quoted;
   else throw Error("CSV_QUOTE_INVALID");
  }else if(ch===","&&!quoted){result.push(value);value="";}
  else value+=ch;
 }
 if(quoted)throw Error("CSV_QUOTE_INVALID");
 result.push(value);return result;
};
export function inspectTerminalCsv(csv,{terminalId,companyId}={}){
 if(typeof csv!=="string"||Buffer.byteLength(csv,"utf8")>8_000_000||
  !/^[A-Za-z0-9._:-]{3,64}$/.test(terminalId??"")||
  !/^[A-Za-z0-9._:-]{3,100}$/.test(companyId??""))
  throw Error("CSV_SOURCE_INVALID");
 const lines=csv.replace(/^\uFEFF/,"").replace(/\r\n/g,"\n").split("\n").filter(v=>v.trim());
 if(lines.length<2||lines.length>50001)throw Error("CSV_ROW_LIMIT");
 const header=splitLine(lines[0]);
 if(header.length!==columns.length||header.some((v,i)=>v!==columns[i]))
  throw Error("CSV_EXPLICIT_COLUMNS_REQUIRED");
 const ids=new Set(),seen=new Set(),days=new Map();
 const reasons={};let accepted=0,rejected=0,duplicate=0;
 for(const line of lines.slice(1)){
  let values;
  try{values=splitLine(line);}
  catch{values=[];}
  const [id,card,date,time,direction]=values;
  const ok=values.length===5&&id?.length>0&&id.length<=120&&
   /^\d{5}$/.test(card??"")&&isoDate(date)&&clock(time)&&
   ["IN","OUT"].includes(direction)&&
   values.every(v=>!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(v));
  if(!ok){rejected++;reasons.INVALID_ROW=(reasons.INVALID_ROW||0)+1;continue;}
  const fingerprint=createHash("sha256").update(JSON.stringify([terminalId,id,card,date,time,direction])).digest("hex");
  if(ids.has(id)||seen.has(fingerprint)){duplicate++;rejected++;reasons.DUPLICATE_SOURCE=(reasons.DUPLICATE_SOURCE||0)+1;continue;}
  ids.add(id);seen.add(fingerprint);accepted++;
  const row=days.get(date)||{date,inspected:0,entries:0,exits:0};
  row.inspected++;if(direction==="IN")row.entries++;else row.exits++;
  days.set(date,row);
 }
 return Object.freeze({
  kind:"KY_PDKS_READ_ONLY_TERMINAL_CSV_DIAGNOSTIC",terminalId,
  sourceSha256:createHash("sha256").update(csv).digest("hex"),
  inspected:lines.length-1,accepted,rejected,duplicates:duplicate,
  rejectionReasons:Object.freeze(reasons),
  dailyBatches:Object.freeze([...days.values()].sort((a,b)=>b.date.localeCompare(a.date))),
  credentialVerified:false,hardwareCertified:false,cardIdentityVerified:false,
  firebirdReconciled:false,tnfReconciled:false,cloudAcked:false,
  safeToApply:false,sourceDirectionExplicit:true,
 });
}
