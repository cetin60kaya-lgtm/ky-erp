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
const batches=new Set(); // process-local replay protection, not server idempotency
const route=(preview)=>{
  const personId=encodeURIComponent(preview.payload.employeeId||"");
  switch(preview.id){
    case "work-group":return base+"/work-groups";
    case "personnel-group":return base+"/personnel-groups";
    case "assign-work-group":return base+"/people/"+personId+"/work-group";
    case "assign-personnel-group":return base+"/people/"+personId+"/personnel-group";
    case "service":return base+"/services";
    case "assign-service":return base+"/people/"+personId+"/service";
    case "holiday":return base+"/operations/holidays";
    case "leave":return base+"/operations/leave";
    case "advance":return base+"/operations/advance";
    case "overtime":case "deduction":return base+"/operations/adjustment";
    default:throw new Error("Bilinmeyen işlem.");
  }
};
const fresh=(path,params)=>apiGet(path,params,{forceFresh:true,cache:false});
const arr=(x)=>Array.isArray(x)?x:[];
const same=(a,b)=>String(a??"")===String(b??"");
const ensureReadback=async(preview,accepted)=>{
  const {id,payload:p,company}=preview;
  const companyParams={mainCompanyId:company};
  // A newly created record must be the exact row returned by the server,
  // not a different older row with matching employee/date/amount fields.
  const created=new Set(["work-group","personnel-group","service","holiday","leave",
    "advance","overtime","deduction"]);
  if(created.has(id) && !accepted?.id)throw new Error("PDKS_WRITE_RECEIPT_ID_MISSING");
  const savedId=String(accepted?.id||"");
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
      (id==="advance"?/AVANS/.test(String(row.adjustmentType).toLocaleUpperCase("tr-TR")):
        id==="overtime"?/MESAI/.test(String(row.adjustmentType).toLocaleUpperCase("tr-TR")):
        /KESINT/.test(String(row.adjustmentType).toLocaleUpperCase("tr-TR")))&&
      Number(row.amount)===p.amount&&
      (id!=="overtime"||Number(row.hourOrDay)===p.hourOrDay));
  }
  throw new Error("PDKS_READBACK_NOT_CONFIGURED");
};

export async function submitAndVerify(preview){
  if(!preview || !Object.isFrozen(preview)||!Object.isFrozen(preview.payload)||
    !operationById(preview.id))throw new Error("İşlem önizlemesi geçersiz veya değiştirildi.");
  const fingerprint=JSON.stringify([preview.company,preview.id,preview.payload]);
  if(batches.has(fingerprint))throw new Error("Bu işlem bu oturumda gönderildi. Önce kayıtları kontrol edin; tekrar göndermeyin.");
  batches.add(fingerprint);
  let accepted=null;
  try{
    const response=await apiFetch(route(preview),{
      method:"POST",body:preview.payload,timeoutMs:15000,
    });
    accepted=canonical(response);
  }catch(error){
    // A transport timeout may follow a successful D1 write. No retry.
    const failure=new Error("Sonuç belirsiz. İşlem tekrar gönderilmeyecek; ilgili kaydı ve işlem günlüğünü kontrol edin.");
    failure.code="PDKS_WRITE_OUTCOME_UNKNOWN";
    failure.cause=error;
    throw failure;
  }
  if(!accepted || typeof accepted!=="object")
    throw new Error("PDKS_WRITE_RESPONSE_INVALID");
  let verified=false;
  try{verified=await ensureReadback(preview,accepted);}
  catch(error){
    const failure=new Error("Sunucu cevap verdi fakat geri okuma doğrulanamadı. Tekrar kayıt yapmayın; önce kaydı denetleyin.");
    failure.code="PDKS_READBACK_UNKNOWN";
    failure.cause=error;
    throw failure;
  }
  if(!verified){
    const failure=new Error("İşlem sunucuda bulunduğu kanıtlanamadı. Tekrar göndermeden önce kayıtları inceleyin.");
    failure.code="PDKS_READBACK_MISMATCH";
    throw failure;
  }
  return Object.freeze({
    status:"CLOUD_D1_VERIFIED",
    confirmed:true,localFDB:false,annualTNF:false,terminalRaw:false,
    detail:accepted,
  });
}
