// Common operator-draft source reservation. Internal only, never proof of official remaining quantity.
// Draft payload is the reservation ledger: one SQLite/D1 write guards all source lines.
export const sourceEligible = `d.direction='OUTGOING' AND d.document_type='GIDEN_IRSALIYE'
 AND d.deleted_at IS NULL AND COALESCE(d.record_scope,'OFFICIAL')='OFFICIAL'
 AND d.xml_file_asset_id IS NOT NULL
 AND CASE WHEN json_valid(d.raw_metadata) THEN json_extract(d.raw_metadata,'$.ublVerified') ELSE 0 END=1
 AND UPPER(COALESCE(d.status,'')) NOT IN ('CANCELLED','CANCELED','REJECTED','IPTAL','REDDEDILDI')
 AND NOT EXISTS (SELECT 1 FROM accounting_document_relations r
 JOIN accounting_documents peer ON peer.main_company_slug=r.main_company_slug
 AND peer.id=CASE WHEN r.document_id=d.id THEN r.related_document_id ELSE r.document_id END
 WHERE r.main_company_slug=d.main_company_slug AND (r.document_id=d.id OR r.related_document_id=d.id)
 AND r.relation_type IN ('INVOICE_OF','DESPATCH_OF','DISPATCH_OF')
 AND peer.direction='OUTGOING' AND (peer.document_type LIKE '%FATURA%' OR peer.document_type LIKE '%INVOICE%' OR peer.document_type LIKE '%ARSIV%')
 AND peer.deleted_at IS NULL)`;
const sourceQuantity = `l.quantity>0 AND l.quantity<=9999999.999
 AND ABS(l.quantity*1000-ROUND(l.quantity*1000))<0.00001`;
export const sourceLookupSql = `SELECT d.id AS documentId,d.document_no AS documentNo,l.id AS lineId,l.description,l.unit_code AS unit,l.quantity,
 COALESCE((SELECT SUM(CAST(ROUND(CAST(json_extract(j.value,'$.quantity') AS REAL)*1000) AS INTEGER))
 FROM accounting_document_drafts a JOIN json_each(a.payload,'$.lines') j
 WHERE a.main_company_slug=d.main_company_slug AND a.state IN ('DRAFT','CHECKED') AND a.kind='INVOICE'
 AND json_extract(j.value,'$.sourceDocumentId')=d.id AND json_extract(j.value,'$.sourceLineId')=l.id),0) AS reservedMilli
 FROM accounting_documents d JOIN accounting_document_lines l ON l.main_company_slug=d.main_company_slug AND l.document_id=d.id
 WHERE d.main_company_slug=? AND d.party_company_id=? AND d.document_no=? AND ${sourceEligible} AND ${sourceQuantity}
 ORDER BY d.id,l.line_no LIMIT 201`;
// All source references are validated again inside the same INSERT/UPDATE that persists
// the reservation. The current draft is excluded for edits; cancelled drafts release capacity.
export function sourceReservationGuard(tenant:string,draftId:string,partyId:string,payload:string){
 const sql=` AND NOT EXISTS (
 SELECT 1 FROM json_each(?,'$.lines') requested
 WHERE COALESCE(json_extract(requested.value,'$.sourceLineId'),'')<>''
 AND NOT EXISTS (
 SELECT 1 FROM accounting_documents d JOIN accounting_document_lines l
 ON l.main_company_slug=d.main_company_slug AND l.document_id=d.id
 WHERE d.main_company_slug=? AND d.party_company_id=?
 AND d.id=json_extract(requested.value,'$.sourceDocumentId') AND l.id=json_extract(requested.value,'$.sourceLineId')
 AND l.description=json_extract(requested.value,'$.description') AND l.unit_code=json_extract(requested.value,'$.unit')
 AND ${sourceEligible} AND ${sourceQuantity}
 AND CAST(ROUND(CAST(json_extract(requested.value,'$.quantity') AS REAL)*1000) AS INTEGER)
 + COALESCE((SELECT SUM(CAST(ROUND(CAST(json_extract(j.value,'$.quantity') AS REAL)*1000) AS INTEGER))
 FROM accounting_document_drafts a JOIN json_each(a.payload,'$.lines') j
 WHERE a.main_company_slug=d.main_company_slug AND a.id<>? AND a.kind='INVOICE' AND a.state IN ('DRAFT','CHECKED')
 AND json_extract(j.value,'$.sourceDocumentId')=d.id AND json_extract(j.value,'$.sourceLineId')=l.id),0)
 <= CAST(ROUND(l.quantity*1000) AS INTEGER)
 ))`;
 return {sql,args:[payload,tenant,partyId,draftId]};
}
