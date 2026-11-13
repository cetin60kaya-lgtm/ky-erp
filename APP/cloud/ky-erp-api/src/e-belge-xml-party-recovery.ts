/** Validate an official UBL-TR XML against an existing, still-unposted e-Belge.
 * No amount, direction, party, or date may silently change during a cari repair.
 */
type Row=Record<string,unknown>;
const text=(value:unknown)=>value==null?"":String(value).trim();
const tax=(value:unknown)=>text(value).replace(/\D/g,"");
const up=(value:unknown)=>text(value).toLocaleUpperCase("tr-TR");
export function verifiedXmlPartyRecoveryDecision(existing:Row,source:Row){
  const raw=source.rawMetadata as Record<string,unknown>|undefined;
  if(raw?.ublVerified!==true)return{ok:false,code:"UBL_XML_NOT_VERIFIED"};
  if(source.directionNeedsReview===true)return{ok:false,code:"XML_DIRECTION_REVIEW"};
  if(existing.posted_at||["POSTED","FINALIZING","FINALIZE_RETRY","APPROVED"].includes(up(existing.status)))
    return{ok:false,code:"POSTED_DOCUMENT_LOCKED"};
  if(text(existing.party_company_id))return{ok:false,code:"COMPANY_ALREADY_LINKED"};
  if(text(existing.record_scope)&&up(existing.record_scope)!=="OFFICIAL")
    return{ok:false,code:"DOCUMENT_NOT_OFFICIAL"};
  const originalNo=up(existing.document_no),newNo=up(source.documentNo);
  if(!originalNo||originalNo!==newNo)return{ok:false,code:"DOCUMENT_NO_CONFLICT"};
  const originalTax=tax(existing.party_tax_no),newTax=tax(source.partyTaxNo);
  if(!/^\d{10,11}$/.test(originalTax)||originalTax!==newTax)
    return{ok:false,code:"COUNTERPARTY_VKN_CONFLICT"};
  if(!text(existing.party_name)||!text(source.partyName))
    return{ok:false,code:"COUNTERPARTY_NAME_MISSING"};
  const originalDate=text(existing.issue_date).slice(0,10),newDate=text(source.issueDate).slice(0,10);
  if(!originalDate||originalDate!==newDate)return{ok:false,code:"ISSUE_DATE_CONFLICT"};
  const originalKind=up(existing.document_type),newKind=up(source.documentType);
  if(!originalKind||originalKind!==newKind)return{ok:false,code:"DOCUMENT_KIND_CONFLICT"};
  if(!["INCOMING","OUTGOING"].includes(up(existing.direction))||
    up(existing.direction)!==up(source.direction))return{ok:false,code:"DOCUMENT_DIRECTION_CONFLICT"};
  if(text(existing.uuid)&&text(source.uuid)&&up(existing.uuid)!==up(source.uuid))
    return{ok:false,code:"DOCUMENT_UUID_CONFLICT"};
  return{ok:true,code:"VERIFIED_XML_RECOVERY_ELIGIBLE"};
}
