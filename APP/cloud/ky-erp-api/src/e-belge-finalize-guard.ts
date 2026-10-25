// @ts-nocheck
// D1 conditional UPDATE is the exclusive finalization claim for a single document.
// This is a fail-visible reservation, not a distributed transaction over R2/stocks.
export async function claimEBelgeFinalization(db:any,slug:string,id:string,expectedUpdatedAt:string,actorId:string) {
  if(!slug||!id||!expectedUpdatedAt||!actorId)return {ok:false,code:"FINALIZE_CONTEXT_REQUIRED"};
  const ts=new Date().toISOString();
  const query=[
    "UPDATE accounting_documents SET status='FINALIZING',approved_by=?,approved_at=?,updated_at=?",
    "WHERE id=? AND main_company_slug=? AND deleted_at IS NULL AND posted_at IS NULL",
    "AND updated_at=? AND status IN ('INGESTED','REVIEW_REQUIRED','READY_FOR_APPROVAL','APPROVED')",
  ].join(" ");
  const result=await db.prepare(query).bind(actorId,ts,ts,id,slug,expectedUpdatedAt).run();
  if(Number(result.meta?.changes||0)===1)return {ok:true,claimedAt:ts};
  const row=await db.prepare("SELECT status,updated_at,posted_at FROM accounting_documents WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1").bind(id,slug).first();
  if(!row)return {ok:false,code:"NOT_FOUND"};
  if(row.posted_at)return {ok:false,code:"DOCUMENT_ALREADY_POSTED",postedAt:row.posted_at};
  return {ok:false,code:"FINALIZE_CONFLICT",currentStatus:row.status,currentUpdatedAt:row.updated_at};
}
export async function markEBelgeFinalization(db:any,slug:string,id:string,state:string) {
  if(!["APPROVED","REVIEW_REQUIRED","FINALIZE_RETRY"].includes(state))throw Error("Invalid document finalization state");
  return db.prepare("UPDATE accounting_documents SET status=?,updated_at=? WHERE id=? AND main_company_slug=? AND deleted_at IS NULL AND posted_at IS NULL AND status IN ('FINALIZING','APPROVED')").bind(state,new Date().toISOString(),id,slug).run();
}
