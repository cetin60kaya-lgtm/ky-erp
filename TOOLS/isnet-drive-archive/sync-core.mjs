// KY ERP: provider-independent, resumable-by-idempotency İşNet archive runner.
// No credentials, cookies, original XML/PDF or personal data are persisted here.
export const ISNET_DOCUMENT_SOURCES=Object.freeze([
  "incoming_invoice","outgoing_invoice","incoming_dispatch","outgoing_dispatch",
]);
export const MAX_PORTAL_WINDOW_DAYS=31;

function validDate(raw) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(raw||"")))throw Error("TARIH_GECERSIZ");
  const millis=Date.parse(raw+"T00:00:00.000Z");
  if(!Number.isFinite(millis)||new Date(millis).toISOString().slice(0,10)!==raw)throw Error("TARIH_GECERSIZ");
  return millis;
}
const toIso=millis=>new Date(millis).toISOString().slice(0,10);
const ONE_DAY=86400000;
export function splitDateWindows(start,end,maxDays=MAX_PORTAL_WINDOW_DAYS){
  const first=validDate(start),last=validDate(end);
  if(last<first)throw Error("TARIH_SIRASI_GECERSIZ");
  if(!Number.isSafeInteger(maxDays)||maxDays<1||maxDays>31)throw Error("TARIH_PENCERESI_GECERSIZ");
  const windows=[];
  for(let day=first;day<=last;day+=maxDays*ONE_DAY){
    windows.push({start:toIso(day),end:toIso(Math.min(last,day+(maxDays-1)*ONE_DAY))});
    if(windows.length>5000)throw Error("TARIH_ARALIGI_COK_UZUN");
  }
  return windows;
}
const isSaturated=e=>String(e?.safeCode||e?.code||e?.message||e)==="200_KAYIT_SINIRI_TARIH_ARALIGINI_DARALTIN";
function divideWindow(window){
  const start=validDate(window.start),end=validDate(window.end);
  const mid=start+Math.floor((end-start)/ONE_DAY/2)*ONE_DAY;
  return [{start:toIso(start),end:toIso(mid)},{start:toIso(mid+ONE_DAY),end:toIso(end)}];
}
export function isCompleteArchive(result){
  return Boolean(result?.xmlSaved&&result?.pdfSaved&&Array.isArray(result?.errors)&&result.errors.length===0);
}
export function safeArchiveStatus(result){
  if(isCompleteArchive(result))return result.xmlReused&&result.pdfReused?"ALREADY_ARCHIVED":"ARCHIVED";
  if(result?.xmlSaved||result?.pdfSaved)return "NEEDS_REVIEW";
  return "FAILED";
}
function isTransientError(code){
  return /^(PORTAL_BAGLANTISI_HATASI|PORTAL_TIMEOUT|ECONNRESET|ETIMEDOUT|EAI_AGAIN)$/i.test(String(code||""));
}
const issueCode=e=>{
  const s=String(e?.safeCode||e?.code||e?.message||e||"ISNET_HATA");
  return /^[A-Z0-9_:-]{2,120}$/.test(s)?s:"ISNET_HATA";
};
export async function runIsnetArchiveSync({
  start,end,
  sources=ISNET_DOCUMENT_SOURCES,
  listDocuments,archiveDocument,
  shouldStop=()=>false,onProgress=()=>{},
  retryTransient=1,maxRecords=100000,
}={}){
  if(typeof listDocuments!=="function"||typeof archiveDocument!=="function")throw Error("ISNET_SYNC_CALLBACKS_REQUIRED");
  if(!Array.isArray(sources)||sources.length===0||sources.some(s=>!ISNET_DOCUMENT_SOURCES.includes(s)))throw Error("BELGE_TURU_GECERSIZ");
  const periods=splitDateWindows(start,end);
  if(!Number.isSafeInteger(maxRecords)||maxRecords<1)throw Error("MAX_RECORDS_INVALID");
  const summary={
    status:"RUNNING",start,end,sources:[...sources],windowCount:periods.length,
    inspected:0,complete:0,archived:0,alreadyArchived:0,
    needsReview:0,failed:0,xmlSaved:0,pdfSaved:0,
    xmlReused:0,pdfReused:0,saturatedDays:0,
    stopped:false,issues:[],lastSource:"",lastWindow:null,
  };
  const seen=new Set();
  const emit=async()=>{await onProgress({...summary,issues:[...summary.issues]})};
  const issue=(source,window,code)=>{
    summary.issues.push({source,window,code});
    if(summary.issues.length>75)summary.issues.shift();
  };
  const walk=async(source,window)=>{
    if(shouldStop())return;
    summary.lastSource=source;summary.lastWindow=window;
    let records;
    try{
      const response=await listDocuments(window.start,window.end,source);
      records=Array.isArray(response)?response:Array.isArray(response?.documents)?response.documents:null;
      if(!records)throw Object.assign(Error("BELGE_LISTESI_FORMAT_HATASI"),{safeCode:"BELGE_LISTESI_FORMAT_HATASI"});
    }catch(e){
      if(isSaturated(e)){
        if(window.start!==window.end){
          const [left,right]=divideWindow(window);
          await walk(source,left);await walk(source,right);
          return;
        }
        summary.saturatedDays++;
        summary.needsReview++;
        issue(source,window,"TEK_GUN_200_KAYIT_LIMITI");
        await emit();
        return;
      }
      summary.failed++;
      issue(source,window,issueCode(e));
      await emit();
      return;
    }
    // archive immediately: local portal replaces its per-source document cache
    // on every listDocuments request, so postponing archival would lose source IDs.
    for(const record of records){
      if(shouldStop())return;
      const id=String(record?.sourceId||"");
      if(!/^\d+$/.test(id)){
        summary.needsReview++;
        issue(source,window,"BELGE_KIMLIGI_GECERSIZ");
        continue;
      }
      const fingerprint=source+":"+id;
      if(seen.has(fingerprint))continue;
      seen.add(fingerprint);
      if(summary.inspected>=maxRecords){
        issue(source,window,"KAYIT_UST_SINIRINA_ULASILDI");
        summary.stopped=true;
        return;
      }
      summary.inspected++;
      let result=null,lastError=null;
      for(let attempt=0;attempt<=retryTransient;attempt++){
        try{
          result=await archiveDocument(id,source);
          break;
        }catch(e){
          lastError=e;
          if(attempt>=retryTransient||!isTransientError(issueCode(e)))break;
        }
      }
      if(!result){
        summary.failed++;
        issue(source,window,issueCode(lastError));
      }else{
        summary.xmlSaved+=result.xmlSaved?1:0;
        summary.pdfSaved+=result.pdfSaved?1:0;
        summary.xmlReused+=result.xmlReused?1:0;
        summary.pdfReused+=result.pdfReused?1:0;
        const status=safeArchiveStatus(result);
        if(status==="ARCHIVED"){summary.complete++;summary.archived++;}
        else if(status==="ALREADY_ARCHIVED"){summary.complete++;summary.alreadyArchived++;}
        else if(status==="NEEDS_REVIEW"){summary.needsReview++;}
        else{summary.failed++;}
        for(const error of result.errors||[])issue(source,window,issueCode({code:error}));
      }
      await emit();
    }
  };
  for(const source of sources){
    for(const window of periods){
      if(shouldStop()||summary.stopped)break;
      await walk(source,window);
    }
    if(shouldStop()||summary.stopped)break;
  }
  summary.stopped=Boolean(summary.stopped||shouldStop());
  summary.status=summary.stopped?"STOPPED":
    summary.failed||summary.needsReview||summary.saturatedDays?"NEEDS_REVIEW":"COMPLETE";
  await emit();
  return summary;
}
