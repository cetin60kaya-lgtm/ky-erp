// Exact HKN/DDM PDF evidence. Filename/subject similarity never grants a model
// relationship: only canonical File Hub relations from BOTH attachment assets do.
export function invoiceMailDocumentFromFile(value:unknown,prefix:"HKN"|"DDM"){
 const name=String(value||"").trim().toUpperCase();
 if(!name.endsWith(".PDF"))return "";
 const match=name.match(new RegExp("^("+prefix+"[0-9]{8,18})(?![0-9])(?:[\\s_.()\\-].*)?\\.PDF$"));
 return match?.[1]||"";
}
export function invoiceMailCommonModelIds(rows:Array<{modelId:string,assetId:string}>,hknAssetId:string,ddmAssetId:string){
 const hkn=new Set(rows.filter(r=>r.assetId===hknAssetId).map(r=>r.modelId));
 const ddm=new Set(rows.filter(r=>r.assetId===ddmAssetId).map(r=>r.modelId));
 return [...hkn].filter(id=>id&&ddm.has(id)).sort();
}
export function invoiceMailOutlookFileEvidence(names:string[],knownHkn:string[],knownDdm:string[]){
 const invoices=[...new Set(names.map(n=>invoiceMailDocumentFromFile(n,"HKN")).filter(n=>n&&knownHkn.includes(n)))];
 const delivery=[...new Set(names.map(n=>invoiceMailDocumentFromFile(n,"DDM")).filter(n=>n&&knownDdm.includes(n)))];
 return invoices.length===1&&delivery.length===1?{invoiceNo:invoices[0],deliveryNo:delivery[0]}:null;
}
