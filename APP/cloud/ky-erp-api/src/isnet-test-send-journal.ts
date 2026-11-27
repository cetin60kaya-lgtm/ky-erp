// Durable TEST-only reservation on existing json_store. No schema mutation or network.
// Server-owned draft and approval are required; not a public request handler.
import {classifySendResult,requireApprovedSend,type Profile,type Draft,type Approval,type ProviderResult} from "./isnet-official-acceptance.ts";
import {classifyProviderNumberedTestResult,PROVIDER_NUMBERING} from "./isnet-soap-provider-numbering.ts";
import {officeFenceCondition,type OfficeFence} from "./isnet-office-coordinator.ts";
type NumberingMode="CLIENT_NUMBERED"|typeof PROVIDER_NUMBERING;
const SCOPE="ISNET_TEST_SEND_CLAIM_V1";
const key=(d:Draft)=>SCOPE+":"+JSON.stringify([d.tenant,d.id]);
type DB={prepare(sql:string):{bind(...args:any[]):{run():Promise<{meta?:{changes?:number|bigint}}>} }};
type ClaimInput={tenant:string;environment:string;draftId:string;version:string;ettn:string;contentSha256:string;expectedStatus:string;numberingMode?:NumberingMode};
type SettleInput={claimId:string;tenant:string;draftId:string;version:string;ettn:string;status:string;providerResult:ProviderResult|null;numberingMode?:NumberingMode};
/** Exclusive reservation on both draft and ETTN. Never delete/retry an ambiguous claim. */
export function makeTestSendJournal(db:DB,profile:Profile,draft:Draft,approval:Approval,numberingMode:NumberingMode="CLIENT_NUMBERED",officeFence?:OfficeFence){
 if(numberingMode!=="CLIENT_NUMBERED"&&numberingMode!==PROVIDER_NUMBERING)throw Error("SEND_NUMBERING_MODE");
 const id=key(draft);
 return {
  async claim(input:ClaimInput){
   if(draft.environment!=="TEST"||input.environment!=="TEST")throw Error("TEST_ONLY");
   requireApprovedSend(profile,draft,approval,Date.now());
   if(input.tenant!==draft.tenant||input.draftId!==draft.id||input.version!==draft.version||input.ettn!==draft.ettn||input.contentSha256!==draft.contentSha256||input.expectedStatus!=="APPROVED"||(input.numberingMode||"CLIENT_NUMBERED")!==numberingMode)throw Error("SEND_CLAIM_IDENTITY");
   const claimId=crypto.randomUUID(),now=new Date().toISOString(),ettn=draft.ettn.toLowerCase();
   const data={claimId,tenant:draft.tenant,environment:"TEST",draftId:draft.id,kind:draft.kind,version:draft.version,ettn,contentSha256:draft.contentSha256,approvedAt:approval.approvedAt,approvedBy:approval.userId,status:"SUBMITTING",numberingMode,claimedAt:now};
   // Single SQL write, serialized by SQLite/D1; scope-wide ETTN exclusion protects
   // the same external test document even when a second tenant creates a copy.
   const gate=officeFence?officeFenceCondition(officeFence,draft.tenant,Date.now()):{sql:"",args:[]};
   const sql="INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM json_store WHERE scope=? AND (json_extract(data,'$.ettn')=? OR json_extract(data,'$.providerEttn')=?))"+gate.sql+" ON CONFLICT(id) DO NOTHING";
   const r=await db.prepare(sql).bind(id,SCOPE,draft.tenant,id,JSON.stringify(data),now,now,SCOPE,ettn,ettn,...gate.args).run();
   return Number(r.meta?.changes||0)===1?claimId:null;
  },
  async settle(input:SettleInput){
   if(draft.environment!=="TEST"||input.tenant!==draft.tenant||input.draftId!==draft.id||input.version!==draft.version||input.ettn!==draft.ettn||(input.numberingMode||"CLIENT_NUMBERED")!==numberingMode)throw Error("SEND_SETTLE_IDENTITY");
   const r=input.providerResult;
   // Initial submission must never claim FINAL, even if a parser asserts it.
   const computed=numberingMode===PROVIDER_NUMBERING?classifyProviderNumberedTestResult({...draft,status:"SUBMITTING"},r):r?classifySendResult({...draft,status:"SUBMITTING"},{...r,finalStatusVerified:false}):"UNKNOWN_REVIEW_REQUIRED";
   if(input.status!==computed)throw Error("SEND_SETTLE_STATUS");
   const accepted=computed==="PROVIDER_ACCEPTED";
   const number=accepted&&/^[A-Z0-9]{3}[0-9]{13}$/.test(r?.documentNo||"")?r?.documentNo:null;
   const proof=accepted&&/^[a-f0-9]{64}$/.test(r?.responseEvidenceSha256||"")?r?.responseEvidenceSha256:null;
   if(accepted&&(!number||!proof))throw Error("SEND_SETTLE_EVIDENCE");
   const providerEttn=accepted?r?.ettn?.toLowerCase()||null:null;
   const now=new Date().toISOString();
   const q=await db.prepare("UPDATE json_store SET data=json_set(data,'$.status',?,'$.documentNo',?,'$.providerEttn',?,'$.responseEvidenceSha256',?,'$.settledAt',?),updated_at=? WHERE id=? AND scope=? AND main_company_slug=? AND json_extract(data,'$.claimId')=? AND json_extract(data,'$.version')=? AND json_extract(data,'$.ettn')=? AND json_extract(data,'$.status')='SUBMITTING' AND COALESCE(json_extract(data,'$.numberingMode'),'CLIENT_NUMBERED')=? AND NOT EXISTS (SELECT 1 FROM json_store j WHERE j.scope=? AND j.id<>? AND ? IS NOT NULL AND (json_extract(j.data,'$.ettn')=? OR json_extract(j.data,'$.providerEttn')=?))").bind(computed,number,providerEttn,proof,now,now,id,SCOPE,draft.tenant,input.claimId,draft.version,draft.ettn.toLowerCase(),numberingMode,SCOPE,id,providerEttn,providerEttn,providerEttn).run();
   if(Number(q.meta?.changes||0)!==1)throw Error("SEND_SETTLE_CONFLICT");
  }
 };
}
