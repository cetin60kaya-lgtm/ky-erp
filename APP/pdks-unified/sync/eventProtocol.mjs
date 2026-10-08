/**
 * KY PDKS cross-platform event protocol (shared pure contract).
 * An accepted web change never claims local Firebird/TNF success before ACK.
 */
export const STAGES=Object.freeze([
  "RECEIVED","VALIDATED","AUTHORIZED","LOCAL_APPLIED","RECONCILED","CLOUD_ACKED",
]);
const TERMINAL=new Set(["REJECTED","CONFLICT"]);
const transitions=new Map([
  ["RECEIVED",new Set(["VALIDATED","REJECTED","CONFLICT"])],
  ["VALIDATED",new Set(["AUTHORIZED","REJECTED","CONFLICT"])],
  ["AUTHORIZED",new Set(["LOCAL_APPLIED","REJECTED","CONFLICT"])],
  ["LOCAL_APPLIED",new Set(["RECONCILED","CONFLICT"])],
  ["RECONCILED",new Set(["CLOUD_ACKED","CONFLICT"])],
  ["CLOUD_ACKED",new Set()],
  ["REJECTED",new Set()],
  ["CONFLICT",new Set()],
]);

const value=(v)=>String(v??"").trim();
export function validateOperation(operation){
  const tenant=value(operation?.tenant);
  const id=value(operation?.idempotencyKey);
  const actor=value(operation?.actorId);
  const entity=value(operation?.entityId);
  const kind=value(operation?.kind);
  const reason=value(operation?.reason);
  const source=value(operation?.source);
  if(!tenant||!id||!actor||!entity||!reason||!source||
     !["PHYSICAL_PUNCH_BATCH","ADMIN_CORRECTION","LEAVE_APPROVAL","PERSONNEL_CHANGE"].includes(kind))
    throw new Error("INVALID_PDKS_OPERATION");
  // Pure contract only; no PII/biometric payload is serialized here.
  return Object.freeze({tenant,idempotencyKey:id,actorId:actor,entityId:entity,
    kind,reason,source,stage:"RECEIVED",revision:0,
    approval:null,localReceipt:null,reconciliation:null,cloudAck:null});
}

export function advanceOperation(current,next,proof={}){
  if(!current||!transitions.has(current.stage))throw new Error("INVALID_PDKS_STATE");
  if(!transitions.get(current.stage).has(next))throw new Error("ILLEGAL_PDKS_TRANSITION");
  const metadata = {...proof};
  if(next==="AUTHORIZED" && (!metadata.approver || !metadata.approvalId))
    throw new Error("MISSING_APPROVAL");
  if(next==="LOCAL_APPLIED" && (!metadata.transactionId || !metadata.backupId))
    throw new Error("MISSING_LOCAL_RECEIPT");
  if(next==="RECONCILED" && (!metadata.fdbValidated || !metadata.sourceValidated ||
    (current.kind==="PHYSICAL_PUNCH_BATCH" && metadata.tnfValidated !== true)))
    throw new Error("MISSING_RECONCILIATION");
  if(next==="CLOUD_ACKED" && (!metadata.remoteRevision || !metadata.ackId))
    throw new Error("MISSING_CLOUD_ACK");
  if(TERMINAL.has(next) && !value(metadata.reason))
    throw new Error("MISSING_REJECTION_REASON");
  const updated={...current,stage:next,revision:current.revision+1};
  if(next==="AUTHORIZED")updated.approval=Object.freeze(metadata);
  if(next==="LOCAL_APPLIED")updated.localReceipt=Object.freeze(metadata);
  if(next==="RECONCILED")updated.reconciliation=Object.freeze(metadata);
  if(next==="CLOUD_ACKED")updated.cloudAck=Object.freeze(metadata);
  if(TERMINAL.has(next))updated.blocker=Object.freeze(metadata);
  return Object.freeze(updated);
}

export const isFullySynchronized=(event)=>event?.stage==="CLOUD_ACKED" &&
  Boolean(event?.reconciliation?.fdbValidated && event?.reconciliation?.sourceValidated);

export const statusForUi=(event)=>{
  if(!event)return "BAĞLANTI_BEKLİYOR";
  if(event.stage==="CLOUD_ACKED" && isFullySynchronized(event))return "DOĞRULANDI";
  if(event.stage==="CONFLICT")return "İNCELEME_GEREKLİ";
  if(event.stage==="REJECTED")return "REDDEDİLDİ";
  return "BEKLİYOR";
};
