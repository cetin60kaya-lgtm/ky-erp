/**
 * Canonical File Hub relative path. It never moves/renames existing provider files;
 * used only for NEW accounting archive jobs. Provider root comes from File Hub binding.
 * XML and PDF of one document keep the same stem but remain separate files.
 */
const val=(v:unknown)=>String(v??"").trim();
export function safeArchiveSegment(v:unknown,empty="BELIRTILMEDI",max=80){
 const s=val(v).normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g,"-")
  .replace(/[. ]+$/g,"").replace(/\s+/g," ").replace(/\.{2,}/g,".")
  .trim().slice(0,max).replace(/[. ]+$/g,"");
 return s && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(s)?s:empty;
}
export function modelArchiveFileStem(documentNo:unknown,modelNames:unknown[]){
 const number=safeArchiveSegment(documentNo,"BELGE",90);
 const seen=new Set<string>(),models:string[]=[];
 for(const value of modelNames||[]){
  const model=safeArchiveSegment(value,"",42);
  const key=model.normalize("NFC").toLocaleUpperCase("tr-TR");
  if(!model||seen.has(key))continue;
  seen.add(key);models.push(model);
 }
 const suffix=models.slice(0,3).join(" - ");
 const rest=models.length>3?" - +"+(models.length-3)+" MODEL":"";
 // Keep Windows paths short; full model links are always in ERP, not the filename.
 return (number+(suffix?" "+suffix+rest:"")).slice(0,188).replace(/[. ]+$/g,"");
}
export function buildEBelgeArchiveRelativePath(input:{
 root:string;date:unknown;party:unknown;direction:unknown;documentType:unknown;
 documentNo:unknown;modelNames?:unknown[];originalFileName:unknown;
}){
 const date=val(input.date);
 const year=/^20\d{2}/.test(date)?date.slice(0,4):new Date().getUTCFullYear().toString();
 const direction=/OUTGOING|GIDEN/i.test(val(input.direction))?"GIDEN":"GELEN";
 const kind=/IRSALIYE|DESPATCH|DISPATCH/i.test(val(input.documentType))?"IRSALIYE":"FATURA";
 const ext=val(input.originalFileName).split(".").pop()?.toLowerCase();
 const extension=/^(xml|pdf|png|jpg|jpeg|webp|tif|tiff)$/i.test(ext||"")?ext:"bin";
 const root=val(input.root).replace(/\\/g,"/").replace(/^\/+|\/+$/g,"");
 const parts=[root,year,safeArchiveSegment(input.party,"ESLESMEYEN-FIRMA"),direction,kind,
  modelArchiveFileStem(input.documentNo,input.modelNames||[])+"."+extension];
 return parts.filter(Boolean).join("/");
}
