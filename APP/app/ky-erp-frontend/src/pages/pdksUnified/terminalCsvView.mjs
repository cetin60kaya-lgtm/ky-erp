// Strict operator-selected, read-only terminal export projection.
// CSV cannot certify the source terminal, card identity or payroll.
const date=v=>/^\d{4}-\d\d-\d\d$/.test(v)&&!Number.isNaN(Date.parse(v+"T12:00:00Z"))&&
 new Date(v+"T12:00:00Z").toISOString().slice(0,10)===v;
const clock=v=>/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v);
function fields(line){
 const result=[];let value="",quoted=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}
   else if(quoted||value==="")quoted=!quoted;
   else throw Error("CSV_QUOTE_INVALID");}
  else if(ch===","&&!quoted){result.push(value);value="";}
  else value+=ch;
 }
 if(quoted)throw Error("CSV_QUOTE_INVALID");
 result.push(value);return result;
}
export function projectTerminalCsv(raw){
 if(typeof raw!=="string"||raw.length>8_000_000)throw Error("TERMINAL_CSV_SIZE_INVALID");
 const lines=raw.replace(/^\uFEFF/,"").replace(/\r\n/g,"\n").split("\n").filter(x=>x.trim());
 if(lines.length<2||lines.length>50001)throw Error("TERMINAL_CSV_ROW_LIMIT");
 if(fields(lines[0]).join("|")!=="eventId|cardNo|date|time|direction")
  throw Error("TERMINAL_CSV_COLUMNS_INVALID");
 const ids=new Set(),days=new Map();
 let rejected=0,duplicates=0,accepted=0;
 for(const line of lines.slice(1)){
  let row;try{row=fields(line);}catch{row=[];}
  const [id,card,workDate,time,direction]=row;
  if(row.length!==5||!id||id.length>120||!/^\d{5}$/.test(card??"")||
    !date(workDate)||!clock(time)||!["IN","OUT"].includes(direction)||
    row.some(x=>/[\x00-\x1f]/.test(x))){
    rejected++;continue;
  }
  if(ids.has(id)){duplicates++;rejected++;continue;}
  ids.add(id);accepted++;
  const item=days.get(workDate)||{date:workDate,entries:0,exits:0,records:0};
  item.records++;
  if(direction==="IN")item.entries++;else item.exits++;
  days.set(workDate,item);
 }
 return Object.freeze({
  kind:"LOCAL_TERMINAL_CSV_REVIEW",inspected:lines.length-1,
  accepted,rejected,duplicates,
  dailyBatches:Object.freeze([...days.values()].sort((a,b)=>b.date.localeCompare(a.date))),
  physicalDeviceCertified:false,sourceAuthenticated:false,
  tnfReconciled:false,firebirdReconciled:false,cloudAcked:false,safeToApply:false,
 });
}
