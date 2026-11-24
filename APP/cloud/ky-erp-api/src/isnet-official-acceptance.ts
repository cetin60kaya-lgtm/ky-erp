/**
 * NetteFatura official integration acceptance contract.
 * Provider-agnostic local checks. No network, credentials, database or official
 * document submission. A capability is never granted by the catalogue alone.
 * A reviewed official service contract and real sandbox evidence are required.
 */
export const ISNET_DOCUMENTS = ["E_FATURA","E_ARSIV","E_IRSALIYE","E_SMM","E_MM","E_DEKONT"] as const;
export type DocumentKind = typeof ISNET_DOCUMENTS[number];
export const ISNET_OPERATIONS = [
 "connection.health","company.list","company.identity","taxpayer.lookup","address.list",
 "address.write","product.list","product.write","credits.read","reports.read",
 "users.read","roles.read","roles.write","settings.read","settings.write",
 "series.read","template.read","files.read","files.import","payments.read",
 "payments.create","document.list","document.xml","document.pdf","document.validate",
 "document.create","document.submit","document.status","document.response",
 "document.cancel","document.objection","document.archive","document.reconcile"
] as const;
export type Operation = typeof ISNET_OPERATIONS[number];
export type Environment = "TEST"|"PROD";
export type Capability = { operation: Operation; kind?: DocumentKind; direction?: "INCOMING"|"OUTGOING" };
export type Evidence = Capability & {
 tenant:string; environment:Environment; contractRevision:string; companyVerified:boolean;
 providerVerified:boolean; evidenceId:string;
};
export type Profile = {
 tenant:string; environment:Environment; contractRevision:string;
 endpoint:string; reviewedEndpoints:readonly string[]; credentialRef:string;
 companyVerified:boolean; enabled:boolean; evidence:readonly Evidence[];
};
const nonblank=(v:unknown)=>typeof v==="string"&&v.trim().length>0;
const hashOK=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{64}$/i.test(v);
const uuidOK=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const isDocument=(op:Operation)=>op.startsWith("document.");
export function capabilityKey(c:Capability):string {
 if(!ISNET_OPERATIONS.includes(c.operation)) throw Error("UNKNOWN_OPERATION");
 if(isDocument(c.operation)){
  if(!c.kind||!ISNET_DOCUMENTS.includes(c.kind))throw Error("DOCUMENT_KIND_REQUIRED");
  if(!["INCOMING","OUTGOING"].includes(c.direction||""))throw Error("DOCUMENT_DIRECTION_REQUIRED");
  return [c.operation,c.kind,c.direction].join(":");
 }
 if(c.kind||c.direction)throw Error("INVALID_CAPABILITY");
 return c.operation;
}
function reviewedEndpoint(p:Profile):boolean {
 try{
  const u=new URL(p.endpoint);
  // Exact HTTPS endpoint, no URL credentials, arbitrary query, or fragment.
  if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port)return false;
  if(!/(^|\.)isnet\.net\.tr$/.test(u.hostname))return false;
  // No guessed endpoint or accidental TEST/PROD fallback.
  return p.reviewedEndpoints.includes(u.href);
 }catch{return false}
}
export function requireCapability(p:Profile,c:Capability,tenant:string,environment:Environment):void {
 const key=capabilityKey(c);
 if(!["TEST","PROD"].includes(environment)||p.environment!==environment)throw Error("ENVIRONMENT_MISMATCH");
 if(!nonblank(tenant)||p.tenant!==tenant)throw Error("TENANT_MISMATCH");
 if(!p.enabled||!p.companyVerified||!nonblank(p.contractRevision)||!nonblank(p.credentialRef))throw Error("PROFILE_NOT_VERIFIED");
 if(!reviewedEndpoint(p))throw Error("ENDPOINT_NOT_REVIEWED");
 if(!p.evidence.some(e=>e.tenant===tenant&&e.environment===environment&&e.contractRevision===p.contractRevision&&e.companyVerified&&e.providerVerified&&nonblank(e.evidenceId)&&capabilityKey(e)===key))throw Error("CAPABILITY_NOT_VERIFIED");
}
export type Draft = {
 tenant:string; environment:Environment; kind:DocumentKind; direction:"OUTGOING";
 id:string; ettn:string; contentSha256:string; version:string;
 status:"DRAFT"|"VERIFIED"|"APPROVED"|"SUBMITTING"|"UNKNOWN_REVIEW_REQUIRED"|"PROVIDER_ACCEPTED"|"FINAL"|"REJECTED";
};
export type Approval = {
 tenant:string; environment:Environment; draftId:string; ettn:string;
 contentSha256:string; version:string; userId:string; approvedAt:string; explicit:true;
};
export function requireApprovedSend(p:Profile,d:Draft,a:Approval,now:number):void {
 requireCapability(p,{operation:"document.submit",kind:d.kind,direction:d.direction},d.tenant,d.environment);
 if(d.direction!=="OUTGOING"||d.status!=="APPROVED")throw Error("DRAFT_NOT_SENDABLE");
 if(!nonblank(d.id)||!nonblank(d.version)||!uuidOK(d.ettn)||!hashOK(d.contentSha256))throw Error("DRAFT_IDENTITY_INVALID");
 if(a.explicit!==true||!nonblank(a.userId)||a.tenant!==d.tenant||a.environment!==d.environment||a.draftId!==d.id||a.ettn!==d.ettn||a.version!==d.version||a.contentSha256!==d.contentSha256)throw Error("APPROVAL_MISMATCH");
 const age=now-Date.parse(a.approvedAt);
 if(!Number.isFinite(age)||age<0||age>15*60*1000)throw Error("APPROVAL_EXPIRED");
}
export type ProviderResult = {
 transport:"RESPONSE"|"TIMEOUT"|"NETWORK_ERROR";
 explicitAcceptance?:boolean; explicitRejection?:boolean; ettn?:string; documentNo?:string;
 receiptId?:string; finalStatusVerified?:boolean;
};
export function classifySendResult(d:Draft,r:ProviderResult):Draft["status"]{
 // A lost response may already have created a document. Never auto-retry.
 if(d.status!=="SUBMITTING"||r.transport!=="RESPONSE")return "UNKNOWN_REVIEW_REQUIRED";
 if(r.explicitAcceptance===true&&r.explicitRejection===true)return "UNKNOWN_REVIEW_REQUIRED";
 if(r.explicitRejection===true&&r.explicitAcceptance!==true)return "REJECTED";
 if(r.explicitAcceptance!==true||!uuidOK(r.ettn)||r.ettn?.toLowerCase()!==d.ettn.toLowerCase()||!nonblank(r.documentNo)||!nonblank(r.receiptId))return "UNKNOWN_REVIEW_REQUIRED";
 return r.finalStatusVerified===true?"FINAL":"PROVIDER_ACCEPTED";
}
export function documentIdentity(tenant:string,environment:Environment,ettn:string):string{
 if(!nonblank(tenant)||!["TEST","PROD"].includes(environment)||!uuidOK(ettn))throw Error("DOCUMENT_IDENTITY_INVALID");
 return JSON.stringify([tenant,environment,ettn.toLowerCase()]);
}
export function requireArchivePair(meta:{tenant:string;environment:Environment;ettn:string;xmlSha256:string;pdfSha256:string;xmlIdentityVerified:boolean;pdfIdentityVerified:boolean;xmlStored:boolean;pdfStored:boolean;fileHubVerified:boolean}):string{
 const id=documentIdentity(meta.tenant,meta.environment,meta.ettn);
 if(!hashOK(meta.xmlSha256)||!hashOK(meta.pdfSha256)||meta.xmlSha256===meta.pdfSha256||!meta.xmlIdentityVerified||!meta.pdfIdentityVerified||!meta.xmlStored||!meta.pdfStored||!meta.fileHubVerified)throw Error("ARCHIVE_PAIR_UNVERIFIED");
 return id;
}
