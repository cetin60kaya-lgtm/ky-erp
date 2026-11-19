// Single canonical mail evidence contract shared by accounting and Outlook.
// Names are candidates only. A provider attachment needs a matching SHA-256
// and a tenant-scoped File Hub asset to become VERIFIED.
const txt=(value:unknown)=>String(value??"").trim();
export function invoiceMailDocumentFromFile(value:unknown,prefix:"HKN"|"DDM"){
  const name=txt(value).toUpperCase();
  if(!name.endsWith(".PDF"))return "";
  const match=name.match(new RegExp("^("+prefix+"[0-9]{8,18})(?![0-9])(?:[\\s_.()\\-].*)?\\.PDF$"));
  return match?.[1]||"";
}
export function invoiceMailCommonModelIds(rows:Array<{modelId:string,assetId:string}>,hknAssetId:string,ddmAssetIds:string|string[]){
  const hkn=new Set(rows.filter(r=>r.assetId===hknAssetId).map(r=>r.modelId));
  const ddm=new Set(Array.isArray(ddmAssetIds)?ddmAssetIds:[ddmAssetIds]);
  const linked=new Set(rows.filter(r=>ddm.has(r.assetId)).map(r=>r.modelId));
  return [...hkn].filter(id=>id&&linked.has(id)).sort();
}
export function invoiceMailOutlookFileEvidence(names:string[],knownHkn:string[],knownDdm:string[]){
  const allHkn=[...new Set(names.map(n=>invoiceMailDocumentFromFile(n,"HKN")).filter(Boolean))];
  const allDdm=[...new Set(names.map(n=>invoiceMailDocumentFromFile(n,"DDM")).filter(Boolean))];
  const matched=allDdm.filter(n=>knownDdm.includes(n));
  // A shared HKN may have other DDMs belonging to different models.
  if(allHkn.length!==1||!knownHkn.includes(allHkn[0])||!matched.length)return null;
  return {invoiceNo:allHkn[0],deliveryNo:matched[0],deliveryNos:allDdm.sort(),matchingDeliveryNos:matched.sort()};
}
export function invoiceMailDispatchKey(tenant:string,invoiceNo:string){
  const scope=txt(tenant).toLocaleLowerCase("tr-TR"),no=txt(invoiceNo).toUpperCase();
  if(!scope||!/^HKN[0-9]{8,18}$/.test(no))throw new Error("INVOICE_MAIL_KEY_INVALID");
  return ["MODEL_INVOICE_MAIL",scope,no].join(":");
}
export function invoiceMailLegacyKeyPrefix(tenant:string,invoiceNo:string){
  return invoiceMailDispatchKey(tenant,invoiceNo)+":";
}
export function invoiceMailIsLegacyOrCanonicalKey(jobKey:string,tenant:string,invoiceNo:string,deliveryNos:string[]){
  const key=invoiceMailDispatchKey(tenant,invoiceNo);
  return jobKey===key||(deliveryNos.length===1&&jobKey===key+":"+deliveryNos[0]);
}
export function invoiceMailAttachmentProved(attachment:{fileAssetId?:string;sha256?:string;fileName?:string},
asset:{id:string;sha256?:string;fileName?:string}|undefined){
  const hash=txt(attachment.sha256).toLowerCase();
  return Boolean(asset&&txt(attachment.fileAssetId)===asset.id&&/^[0-9a-f]{64}$/.test(hash)&&hash===txt(asset.sha256).toLowerCase()&&
    (invoiceMailDocumentFromFile(attachment.fileName,"HKN")===invoiceMailDocumentFromFile(asset.fileName,"HKN")&&Boolean(invoiceMailDocumentFromFile(asset.fileName,"HKN"))||
     invoiceMailDocumentFromFile(attachment.fileName,"DDM")===invoiceMailDocumentFromFile(asset.fileName,"DDM")&&Boolean(invoiceMailDocumentFromFile(asset.fileName,"DDM"))));
}

// A whole Outlook package is VERIFIED only when every PDF has tenant-owned
// SHA-256 proof and a canonical MODEL relation. The viewed model must own the
// HKN and at least one of its related DDMs; other DDMs may belong to other models.
export function invoiceMailPackageVerified(
  attachments:Array<{file_name?:string;file_asset_id?:string;provider_metadata?:string}>,
  evidence:{invoiceNo:string;deliveryNos:string[];matchingDeliveryNos:string[]},
  assets:Map<string,{id:string;file_name:string;sha256?:string}>,
  modelAssetIds:Set<string>,canonicalLinkedAssetIds:Set<string>
){
  const hkn=attachments.filter(a=>invoiceMailDocumentFromFile(a.file_name,"HKN")===evidence.invoiceNo);
  const delivery=evidence.deliveryNos.map(no=>attachments.filter(a=>invoiceMailDocumentFromFile(a.file_name,"DDM")===no));
  if(hkn.length!==1||delivery.some(rows=>rows.length!==1))return false;
  const pdfs=[hkn[0],...delivery.map(rows=>rows[0])];
  if(!modelAssetIds.has(txt(hkn[0].file_asset_id))||
    !delivery.some((rows,i)=>evidence.matchingDeliveryNos.includes(evidence.deliveryNos[i])&&
      modelAssetIds.has(txt(rows[0].file_asset_id))))return false;
  return pdfs.every(att=>{
    const id=txt(att.file_asset_id),asset=assets.get(id);
    if(!canonicalLinkedAssetIds.has(id)||!asset)return false;
    let metadata:Record<string,unknown>={};
    try{metadata=JSON.parse(txt(att.provider_metadata)||"{}");}catch{return false;}
    return invoiceMailAttachmentProved({
      fileAssetId:id,fileName:txt(att.file_name),sha256:txt(metadata.sha256)
    },{id:asset.id,fileName:asset.file_name,sha256:asset.sha256});
  });
}
