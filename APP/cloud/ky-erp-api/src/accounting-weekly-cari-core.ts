// Weekly customer statements: deterministic preview only. Never changes paid/accounting status.
export type StatementLine={invoiceNo:string;groupCode:string;debit:number|null;credit:number|null;balance:number|null;occurrence:number};
export type StatementParse={lines:StatementLine[];ambiguousRows:number;ignoredRows:number;sheets:number};
const value=(v:unknown)=>v==null?"":String(v).trim();
const fold=(v:unknown)=>value(v).toLocaleUpperCase("tr-TR").normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").replace(/İ/g,"I").replace(/\s+/g," ").trim();
export const exactHkn=(v:unknown)=>{const m=value(v).toUpperCase().replace(/\s+/g,"").match(/^HKN[0-9]{8,18}$/);return m?m[0]:"";};
const extractHkn=(v:unknown)=>{
 const matches=[...value(v).toUpperCase().matchAll(/HKN[\s-]*[0-9]{8,18}(?![A-Z0-9])/g)]
   .map(x=>exactHkn(x[0].replace(/-/g,"")));
 return [...new Set(matches.filter(Boolean))];
};
export function parseStatementMoney(v:unknown):number|null{
 if(typeof v==="number")return Number.isFinite(v)?Math.round(v*100)/100:null;
 let s=value(v).replace(/[\s₺]/g,"").replace(/TL$/i,"");
 if(!s)return null;
 let negative=false;
 if(s.startsWith("(")&&s.endsWith(")")){negative=true;s=s.slice(1,-1);}
 if(s.includes(",")&&s.includes(".")){if(s.lastIndexOf(",")>s.lastIndexOf("."))s=s.replace(/\./g,"").replace(",",".");else s=s.replace(/,/g,"");}
 else if(s.includes(","))s=s.replace(",",".");
 else if(/^\d{1,3}(\.\d{3})+$/.test(s))return null; // Cannot guess thousands vs decimal.
 if(!/^-?\d+(?:\.\d+)?$/.test(s))return null;
 const n=Number(s);return Number.isFinite(n)?Math.round((negative?-n:n)*100)/100:null;
}
const headerCol=(heads:string[],match:RegExp)=>heads.findIndex(x=>match.test(x));
function parseOne(table:unknown[][],aggregate:StatementParse){
 if(!Array.isArray(table)||table.length>12000)throw new Error("Ekstre en fazla 12.000 satır içerebilir.");
 let cols={group:-1,debit:-1,credit:-1,balance:-1};
 let headerIndex=-1;
 for(let i=0;i<Math.min(40,table.length);i++){
  const names=(Array.isArray(table[i])?table[i]:[]).map(fold);
  const hits=[/GRUP|ALT GRUP|CARI KOD/,/BORC|DEBIT/,/ALACAK|CREDIT/,/BAKIYE|BALANCE/].filter(re=>names.some(h=>re.test(h))).length;
  if(hits>=2){headerIndex=i;cols={group:headerCol(names,/^GRUP$|ALT GRUP|CARI KOD/),debit:headerCol(names,/BORC|DEBIT/),credit:headerCol(names,/ALACAK|CREDIT/),balance:headerCol(names,/BAKIYE|BALANCE/)};break;}
 }
 const lines:StatementLine[]=[];
 for(let i=headerIndex+1;i<table.length;i++){
  const row=Array.isArray(table[i])?table[i]:[];
  const hk=[...new Set(row.flatMap(extractHkn))];
  if(!hk.length){aggregate.ignoredRows++;continue;}
  if(hk.length!==1){aggregate.ambiguousRows++;continue;}
  const code=cols.group>=0?value(row[cols.group]):"";
  const groupCode=/^\d{2,4}(?:-\d{1,3})?$/.test(code)?code:"";
  lines.push({invoiceNo:hk[0],groupCode,
    debit:cols.debit>=0?parseStatementMoney(row[cols.debit]):null,
    credit:cols.credit>=0?parseStatementMoney(row[cols.credit]):null,
    balance:cols.balance>=0?parseStatementMoney(row[cols.balance]):null,
    occurrence:1});
 }
 return lines;
}
export function parseStatementTables(tables:unknown[][][]):StatementParse{
 if(!Array.isArray(tables)||!tables.length||tables.length>10)throw new Error("Ekstre 1-10 sayfa aralığında olmalıdır.");
 const result:StatementParse={lines:[],ambiguousRows:0,ignoredRows:0,sheets:tables.length};
 for(const t of tables)result.lines.push(...parseOne(t,result));
 if(result.lines.length>3000)throw new Error("Tek karşılaştırmada en fazla 3.000 HKN satırı işlenebilir.");
 return result;
}
const comparable=(a:StatementLine,b:StatementLine)=>{
 const fields:(keyof StatementLine)[]=["debit","credit","balance"];
 return fields.some(k=>typeof a[k]==="number"&&typeof b[k]==="number"&&Math.abs(Number(a[k])-Number(b[k]))>0.009);
};
export function compareWeeklyStatements(previous:StatementLine[],current:StatementLine[],erp:ReadonlySet<string>,hasPrevious=true){
 const map=(arr:StatementLine[])=>{const m=new Map<string,StatementLine[]>();for(const v of arr)m.set(v.invoiceNo,[...(m.get(v.invoiceNo)||[]),v]);return m;};
 const prev=map(previous),cur=map(current),ids=[...new Set([...prev.keys(),...cur.keys()])].sort();
 const result=ids.map(invoiceNo=>{
  const old=prev.get(invoiceNo)||[],latest=cur.get(invoiceNo)||[],p=old[0],n=latest[0];
  let state=hasPrevious?"PRESENT_BOTH_REVIEW":"CURRENT_ONLY_NOT_COMPARED";
  if(!hasPrevious)state="CURRENT_ONLY_NOT_COMPARED";
  else if(!latest.length)state="MISSING_ON_CURRENT_REVIEW";
  else if(!old.length)state="NEW_ON_STATEMENT";
  else if(old.length>1||latest.length>1)state="DUPLICATE_REVIEW";
  else if(p&&n&&comparable(p,n))state="AMOUNT_CHANGED_REVIEW";
  const groups=[...new Set([...old,...latest].map(x=>x.groupCode).filter(Boolean))];
  if(groups.length>1)state="GROUP_CONFLICT_REVIEW";
  return {invoiceNo,groupCode:groups.length===1?groups[0]:"",state,
    inCurrent:latest.length>0,inPrevious:old.length>0,occurrencesCurrent:latest.length,
    erpPresent:erp.has(invoiceNo),debit:n?.debit??null,credit:n?.credit??null,balance:n?.balance??null,
    paymentStatus:"NOT_DETERMINED" as const};
 });
 const groupMap=new Map<string,{groupCode:string;current:number;notInErp:number;needsReview:number}>();
 for(const row of result){const code=row.groupCode||"BELIRSIZ",e=groupMap.get(code)||{groupCode:code,current:0,notInErp:0,needsReview:0};if(row.inCurrent){e.current++;if(!row.erpPresent)e.notInErp++;}if(!["PRESENT_BOTH_REVIEW","CURRENT_ONLY_NOT_COMPARED"].includes(row.state)||!row.erpPresent)e.needsReview++;groupMap.set(code,e);}
 return {rows:result,groups:[...groupMap.values()].sort((a,b)=>a.groupCode.localeCompare(b.groupCode,"tr-TR")),summary:{
   total:result.length,inCurrent:result.filter(x=>x.inCurrent).length,
   notInErp:result.filter(x=>x.inCurrent&&!x.erpPresent).length,
   newlySeen:result.filter(x=>x.state==="NEW_ON_STATEMENT").length,
   disappeared:result.filter(x=>x.state==="MISSING_ON_CURRENT_REVIEW").length,
   changed:result.filter(x=>x.state==="AMOUNT_CHANGED_REVIEW").length,
   duplicateOrConflict:result.filter(x=>/DUPLICATE|CONFLICT/.test(x.state)).length},
 };
}
