/**
 * KY PDKS write transport: Cloud D1 ONLY, never device/Firebird/TNF.
 * No retries, no offline queuing, no "success" without fresh readback.
 * Transactions on multiple storage engines need a separate agent orchestrator.
 *
 * This file is lazy imported ONLY after an authenticated FULL user explicitly
 * confirms a frozen preview. Do NOT import it from design preview.
 */
import {apiFetch,apiGet} from "../../utils/api";
import {operationById} from "./operationCatalog.js";

const base="/ik/personnel-control";
const canonical=(payload)=>payload&&payload.ok===true && Object.prototype.hasOwnProperty.call(payload,"data")
  ? payload.data:payload;
const sent=new Map(); // fingerprint -> permanent UUID, never a new retry ID
const unified="/ik/personnel-control/unified/commands";
const fresh=(path,params)=>apiGet(path,params,{forceFresh:true,cache:false});
const arr=(x)=>Array.isArray(x)?x:[];
const same=(a,b)=>String(a??"")===String(b??"");
const fold=(value)=>String(value??"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"I").toUpperCase();
const ensureReadback=async(preview,accepted)=>{
  const {id,payload:p,company}=preview;
  const companyParams={mainCompanyId:company};
  // A newly created record must be the exact row returned by the server,
  // not a different older row with matching employee/date/amount fields.
  const created=new Set(["work-group","personnel-group","service","holiday","leave",
    "advance","overtime","deduction"]);
  if(created.has(id) && !accepted?.id)throw new Error("PDKS_WRITE_RECEIPT_ID_MISSING");
  const savedId=String(accepted?.businessId||accepted?.id||"");
  if(["work-group","personnel-group","assign-work-group","assign-personnel-group",
      "service","assign-service"].includes(id)){
    const masters=canonical(await fresh(base+"/pdks-masters",companyParams));
    const lookup={
      "work-group":["groups",(row)=>same(row.code,p.code?.toLocaleUpperCase("tr-TR"))&&same(row.name,p.name)&&same(row.entryTime,p.entryTime)],
      "personnel-group":["personnelGroups",(row)=>same(row.code,p.code?.toLocaleUpperCase("tr-TR"))&&same(row.name,p.name)&&Boolean(row.requirePunch)===p.requirePunch],
      "service":["services",(row)=>same(row.code,p.code?.toLocaleUpperCase("tr-TR"))&&same(row.name,p.name)&&same(row.routeNote,p.routeNote)],
      "assign-work-group":["groupAssignments",(row)=>same(row.employeeId,p.employeeId)&&same(row.groupId,p.groupId)],
      "assign-personnel-group":["personnelGroupAssignments",(row)=>same(row.employeeId,p.employeeId)&&same(row.personnelGroupId,p.personnelGroupId)],
      "assign-service":["serviceAssignments",(row)=>same(row.employeeId,p.employeeId)&&same(row.serviceId,p.serviceId)],
    };
    const [key,match]=lookup[id];
    if(!Array.isArray(masters?.[key]))throw new Error("PDKS_READBACK_SHAPE_INVALID");
    return arr(masters[key]).some((row)=>match(row) &&
      (!created.has(id)||String(row.id)===savedId));
  }
  if(id==="holiday"){
    const rows=canonical(await fresh(base+"/operations/holidays",{...companyParams,year:p.date.slice(0,4)}));
    if(!Array.isArray(rows))throw new Error("PDKS_READBACK_SHAPE_INVALID");
    return rows.some((row)=>same(row.id,savedId)&&same(row.date,p.date) &&
      same(row.name,p.name)&&Boolean(row.halfDay)===p.halfDay);
  }
  if(id==="leave"){
    const rows=canonical(await fresh(base+"/operations/leaves",{
      ...companyParams,from:p.startDate,to:p.endDate,
    }));
    if(!Array.isArray(rows?.plans))throw new Error("PDKS_READBACK_SHAPE_INVALID");
    return rows.plans.some((row)=>same(row.id,savedId)&&same(row.employeeId,p.employeeId)&&
      same(row.startDate,p.startDate)&&same(row.endDate,p.endDate)&&
      String(row.recordType||"").toLocaleUpperCase("tr-TR").includes(p.recordType));
  }
  if(["advance","overtime","deduction"].includes(id)){
    const [year,month]=p.date.split("-").map(Number);
    const rows=canonical(await fresh(base+"/operations/month",{...companyParams,year,month}));
    if(!Array.isArray(rows?.adjustments))throw new Error("PDKS_READBACK_SHAPE_INVALID");
    return rows.adjustments.some((row)=>same(row.id,savedId)&&same(row.employeeId,p.employeeId)&&
      same(row.date,p.date)&&
      (id==="advance"?/AVANS/.test(fold(row.adjustmentType)):
        id==="overtime"?/MESAI/.test(fold(row.adjustmentType)):
        /KESINT/.test(fold(row.adjustmentType)))&&
      Number(row.amount)===p.amount&&
      (id!=="overtime"||(Number(row.hourOrDay)===p.hourOrDay &&
        same(row.note,p.note))));
  }
  throw new Error("PDKS_READBACK_NOT_CONFIGURED");
};

export async function checkUnifiedReceipt(requestId){
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(String(requestId)))
    throw new Error("PDKS_REQUEST_ID_INVALID");
  const response=await apiFetch(unified+"/"+encodeURIComponent(requestId),{
    method:"GET",cache:"no-store",timeoutMs:10000,
  });
  const record=canonical(response);
  if(!record || !record.receiptId || record.cloudState!=="COMMITTED")
    throw new Error("PDKS_DURABLE_RECEIPT_INVALID");
  return record;
}
const freezeOutcome=(status,record,requestId,verified)=>
  Object.freeze({status,requestId,receiptId:record.receiptId,
    confirmed:true,sourceReadback:verified,localFDB:false,
    annualTNF:false,terminalRaw:false,detail:record});

export async function submitAndVerify(preview){
  if(!preview || !Object.isFrozen(preview)||!Object.isFrozen(preview.payload)||
    !operationById(preview.id))
    throw new Error("İşlem önizlemesi geçersiz veya değiştirildi.");
  const fingerprint=JSON.stringify([preview.company,preview.id,preview.payload]);
  if(sent.has(fingerprint)){
    const known=new Error("Aynı işlem zaten gönderildi; önce işlem kimliğiyle sonucu sorgulayın.");
    known.requestId=sent.get(fingerprint);
    known.code="PDKS_PREVIOUS_REQUEST_PENDING";
    throw known;
  }
  const requestId=crypto.randomUUID();
  sent.set(fingerprint,requestId);
  const body={requestId,action:preview.id,payload:preview.payload};
  let posted=null;
  try{
    const response=await apiFetch(unified,{method:"POST",body,timeoutMs:18000});
    posted=canonical(response);
    if(!posted?.receiptId||posted.cloudState!=="COMMITTED")
      throw new Error("PDKS_COMMIT_RECEIPT_MISSING");
  }catch(error){
    if(error?.status>=400 && error?.status<500 && error?.status!==408){
      // Known validation/permission denial: no retry, but UI can correct.
      sent.delete(fingerprint);
      throw error;
    }
    try {
      const recovered=await checkUnifiedReceipt(requestId);
      if(recovered?.receiptId)posted=recovered;
    }catch{ /* network or genuinely uncommitted; never send another POST */ }
    if(!posted){
      const uncertain=new Error("İşlem sonucu belirsiz. Yeniden kaydetmeyin; kimlikle sonucu sorgulayın: "+requestId);
      uncertain.code="PDKS_OUTCOME_UNKNOWN";
      uncertain.requestId=requestId;
      uncertain.cause=error;
      throw uncertain;
    }
  }
  let durable;
  try{durable=await checkUnifiedReceipt(requestId);}
  catch(error){
    const uncertain=new Error("Sunucu yazmayı kabul etti, ancak kalıcı işlem fişi şu an okunamıyor. İşlem kimliği: "+requestId);
    uncertain.code="PDKS_RECEIPT_READ_UNAVAILABLE";
    uncertain.requestId=requestId;
    uncertain.cause=error;
    throw uncertain;
  }
  if(durable.receiptId!==posted.receiptId || durable.action!==preview.id){
    const uncertain=new Error("Yazma ve okuma fişleri farklı. Tekrar göndermeyin. İşlem: "+requestId);
    uncertain.code="PDKS_RECEIPT_MISMATCH";
    uncertain.requestId=requestId;
    throw uncertain;
  }
  let sourceVerified=false;
  try{sourceVerified=await ensureReadback(preview,durable);}
  catch{
    // The immutable D1 receipt and transaction are confirmed, but a view
    // endpoint could be unavailable. Never lie that the write was rolled back.
  }
  return freezeOutcome(sourceVerified?"CLOUD_D1_VERIFIED":
    "CLOUD_D1_COMMITTED_SOURCE_UNVERIFIED",durable,requestId,sourceVerified);
}
