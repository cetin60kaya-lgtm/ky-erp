/** Accountant-independent, read-only SGK workbook layout recognition. No personal fixtures. */
export const SGK_FIELDS = {
  name:["ADI SOYADI","AD SOYAD","PERSONEL","PERSONEL ADI","CALISAN","CALISAN ADI","ADI VE SOYADI"],
  identity:["TC KIMLIK NO","T C KIMLIK NO","TC KIMLIK","KIMLIK NUMARASI","TCKN","TC NO"],
  code:["PERSONEL KODU","PERSONEL KOD","SICIL NO","PERSONEL NO","CALISAN KODU"],
  hire:["GIRIS TARIHI","ISE GIRIS","ISE GIRIS TARIHI"],
  exit:["CIKIS TARIHI","ISTEN CIKIS","ISTEN CIKIS TARIHI"],
  days:["SGK GUN","GUN","PRIM GUN","PRIM GUN SAYISI","GUN SAYISI","CALISILAN GUN"],
  normal:["NORMAL KAZANC","NORMAL KAZANCLAR","NORMAL UCRET"],
  other:["DIGER KAZANC","DIGER KAZANCLAR","EK KAZANC"],
  gross:["TOPLAM KAZANC","BRUT KAZANC","BRUT","BRUT UCRET","TOPLAM BRUT"],
  base:["SGK MATRAH","SSK MATRAH","PRIME ESAS KAZANC","PEK"],
  sgkPremium:["SGK PRIMI","SSK PRIMI","ISCI SGK PRIMI"],
  unemployment:["ISSIZLIK PRIMI","ISCI ISSIZLIK PRIMI"],
  incomeTax:["GELIR VERGISI","GV KESINTISI"],
  stampTax:["DAMGA VERGISI","DV KESINTISI"],
  specialDeduction:["OZEL KESINTI","DIGER KESINTI"],
  employerSgk:["ISVEREN SGK","ISVEREN SSK"],
  employerUnemployment:["ISVEREN ISSIZLIK"],
  incentive:["SGK TESVIK","TESVIK"],
  employerCost:["ISVEREN NET MALIYET","NET MALIYET"],
  net:["NET ISTIHKAK","NET UCRET","NET","ODENECEK NET","NET ODENECEK","NET MAAS","NET TUTAR","NET HAK EDIS","BANKAYA YATACAK","BANKA ODEME TUTARI"],
} as const;
export type SgkField = keyof typeof SGK_FIELDS;
export type SgkHeaderOverrides = Partial<Record<SgkField,string>>;
export const sgkNormalizeHeader=(v:unknown)=>String(v??"").toLocaleUpperCase("tr-TR")
 .replace(/[İI]/g,"I").replace(/Ğ/g,"G").replace(/Ü/g,"U").replace(/Ş/g,"S").replace(/Ö/g,"O").replace(/Ç/g,"C").replace(/[^A-Z0-9]+/g," ").trim();
export function sgkResolveColumns(headers:unknown[], overrides:SgkHeaderOverrides={}):Record<SgkField,number> {
 const values=headers.map(sgkNormalizeHeader), result={} as Record<SgkField,number>;
 for(const field of Object.keys(SGK_FIELDS) as SgkField[]){
  const preferred=overrides[field]?sgkNormalizeHeader(overrides[field]):-1;
  let index=typeof preferred==="string"?values.indexOf(preferred):-1;
  const aliases=SGK_FIELDS[field].map(sgkNormalizeHeader);
  if(index<0) for(const alias of aliases){index=values.indexOf(alias);if(index>=0)break;}
  if(index<0)index=values.findIndex(v=>aliases.some(a=>a.length>=7 && v.startsWith(a+" ")));
  result[field]=index;
 }
 return result;
}
export type SgkSheet={sheetName:string;matrix:unknown[][]};
export type SgkLayoutOptions={sheetName?:string;headerRow?:number;columns?:SgkHeaderOverrides};
export function sgkDetectLayout(sheets:SgkSheet[],opts:SgkLayoutOptions={}) {
 let best:null|{score:number;sheetName:string;headerRow:number;headers:string[];columns:Record<SgkField,number>}=null;
 for(const sheet of sheets.filter(s=>!opts.sheetName||s.sheetName===opts.sheetName)){
  for(let rowIndex=0;rowIndex<Math.min(sheet.matrix.length,120);rowIndex++){
   if(opts.headerRow!==undefined&&rowIndex!==opts.headerRow)continue;
   const headers=(sheet.matrix[rowIndex]||[]).map(v=>String(v??"").trim().slice(0,150));
   const count=headers.filter(v=>/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(v)).length;
   if(count<2)continue;
   const columns=sgkResolveColumns(headers,opts.columns);
   const score=140*Number(columns.name>=0)+140*Number(columns.net>=0)+24*Number(columns.identity>=0)
     +18*Number(columns.days>=0)+12*Number(columns.code>=0)+Math.min(count,30);
   if(!best||score>best.score)best={score,sheetName:sheet.sheetName,headerRow:rowIndex,headers,columns};
  }
 }
 return best?{needsMapping:best.columns.name<0||best.columns.net<0,sheetName:best.sheetName,
   headerRow:best.headerRow,headers:best.headers,columns:best.columns}
   :{needsMapping:true,sheetName:opts.sheetName||sheets[0]?.sheetName||"",headerRow:0,headers:[] as string[],columns:sgkResolveColumns([])};
}
export function sgkStrictAmount(value:unknown):number|null {
 if(typeof value==="number")return Number.isFinite(value)?Math.round(value*100)/100:null;
 const raw=String(value??"").trim().replace(/[₺\s]/g,"");
 if(!raw||raw==="-"||!/^[-+]?[\d.,]+$/.test(raw))return null;
 const comma=raw.lastIndexOf(","),dot=raw.lastIndexOf(".");
 let cleaned=raw;
 if(comma>=0&&dot>=0)cleaned=comma>dot?raw.replace(/\./g,"").replace(",","."):raw.replace(/,/g,"");
 else if(comma>=0)cleaned=raw.replace(",",".");
 else if(dot>=0&&/^\d{1,3}(\.\d{3})+$/.test(raw))cleaned=raw.replace(/\./g,"");
 const n=Number(cleaned);return Number.isFinite(n)?Math.round(n*100)/100:null;
}
export function sgkOfficialRowError(row:{employeeId?:unknown;net?:unknown;sgkDays?:unknown}):string|null {
 if(!String(row.employeeId??"").trim())return "SGK_EMPLOYEE_REQUIRED";
 const net=sgkStrictAmount(row.net);if(net===null||net<0)return "SGK_NET_INVALID";
 const days=Number(row.sgkDays??0);if(!Number.isInteger(days)||days<0||days>30)return "SGK_DAYS_INVALID";
 return null;
}
