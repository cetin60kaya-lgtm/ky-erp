// KY ERP: deterministic archive-name → canonical model identity. No fuzzy auto-merge.
type Row = Record<string, any>;
const txt=(v:unknown)=>v==null?"":String(v).trim();
export const modelKey=(value:unknown)=>txt(value).toLocaleUpperCase("tr-TR")
  .replace(/İ/g,"I").replace(/ı/g,"I").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");

export function archiveDocumentIdentity(fileName:unknown) {
  const stem=txt(fileName).split(/[\\/]/).pop()?.replace(/\.(?:pdf|xml)$/i,"").trim()||"";
  const cleaned=stem.replace(/\s*(?:-|_)?\s*Kopya(?:\s*\(\d+\))?$/i,"").trim();
  const match=cleaned.match(/^(DDM|HKN)\s*([0-9]{8,})(?:\s+(.+))?$/i);
  return match?{series:match[1].toUpperCase(),documentNo:match[1].toUpperCase()+match[2],modelName:(match[3]||"").trim()}:null;
}
export function modelHintFromArchiveName(fileName:unknown) {
  const identity=archiveDocumentIdentity(fileName);
  return identity?.modelName?identity:null;
}

export function chooseCanonicalDocumentModels(input:{
  models:Row[]; lines:Row[]; fileName?:string; companyId?:string; documentNo?:string; explicitModelName?:string;
}) {
  const companyId=txt(input.companyId),rows=input.models.filter(m=>!txt(m.deleted_at)&&txt(m.id));
  const eligible=rows.filter(m=>!companyId||!txt(m.company_id||m.customer_id)||txt(m.company_id||m.customer_id)===companyId);
  const hint=modelHintFromArchiveName(input.fileName);
  const declaredModel=txt(input.explicitModelName);
  const find=(name:unknown)=>{
    const key=modelKey(name);
    if(!key)return [];
    return eligible.filter(m=>modelKey(m.model_name)===key||modelKey(m.model_code)===key);
  };
  const lineMatches=input.lines.map(line=>{
    const name=txt(line.description);
    const exact=find(name);
    // Only a delimited, explicit model field may be used as a second source.
    const explicit=name.match(/(?:^|\s)(?:MODEL|MODEL ADI)\s*[:=-]\s*([^;|,]+)(?:$|[;|,])/i);
    const found=exact.length?exact:explicit?find(explicit[1]):[];
    return found.length===1?{id:txt(found[0].id),name:txt(found[0].model_name),source:"LINE_EXACT"}:
      {id:"",name:"",source:found.length>1?"AMBIGUOUS":"UNMATCHED"};
  });
  const fileMatches=hint&&(!input.documentNo||modelKey(hint.documentNo)===modelKey(input.documentNo))
    ?find(hint.modelName):declaredModel?find(declaredModel):[];
  const fileModel=fileMatches.length===1?fileMatches[0]:null;
  const lineIds=new Set(lineMatches.map(x=>x.id).filter(Boolean));
  const conflict=Boolean(fileModel&&lineIds.size&&[...lineIds].some(id=>id!==txt(fileModel.id)));
  const ambiguous=Boolean(fileMatches.length>1||lineMatches.some(x=>x.source==="AMBIGUOUS"));
  const effectiveLines=lineMatches.map(m=>m.id?m:fileModel&&!conflict?{id:txt(fileModel.id),name:txt(fileModel.model_name),source:"FILE_NAME_EXACT"}:m);
  const ids=new Set(effectiveLines.map(x=>x.id).filter(Boolean));
  const one=ids.size===1?[...ids][0]:"";
  const selected=eligible.find(m=>txt(m.id)===one);
  return {
    status:conflict?"CONFLICT":ambiguous?"AMBIGUOUS":one?"MATCHED":hint||declaredModel?"MODEL_NOT_FOUND":"NO_MODEL_HINT",
    modelId:!conflict&&!ambiguous?one:"",
    modelName:!conflict&&!ambiguous?txt(selected?.model_name):"",
    models:effectiveLines,
    multipleModels:ids.size>1,
    fileHint:hint?.modelName||declaredModel,
    documentNoHint:hint?.documentNo||"",
  };
}

export function packageWeightFromItem(description:unknown,quantity:unknown,unit:unknown) {
  const match=txt(description).match(/\(\s*(\d+(?:[.,]\d+)?)\s*(?:KG|KİLOGRAM|KILOGRAM)\s*\)/i);
  const each=match?Number(match[1].replace(",",".")):0;
  const packages=Number(quantity)||0;
  const isPiece=["C62","AD","ADET","PCE","PCS"].includes(txt(unit).toUpperCase());
  return each>0&&packages>0&&isPiece?
    {packageWeightKg:each,packageCount:packages,calculatedKg:Math.round(each*packages*1000)/1000,requiresStockUnitReview:true}:
    {packageWeightKg:0,packageCount:0,calculatedKg:0,requiresStockUnitReview:false};
}

export function dispatchInvoiceQuantity(dispatchQty:unknown,invoicedQty:unknown,productionQty?:unknown) {
  const d=Number(dispatchQty),i=Number(invoicedQty),p=productionQty==null?NaN:Number(productionQty);
  if(!Number.isFinite(d)||!Number.isFinite(i)||d<0||i<0)throw new Error("DOCUMENT_QUANTITY_INVALID");
  return {dispatchQuantity:d,invoicedQuantity:i,remaining:Math.max(0,d-i),
    overInvoiced:Math.max(0,i-d),productionQuantity:Number.isFinite(p)&&p>=0?p:null,
    productionDifference:Number.isFinite(p)&&p>=0?p-d:null,
    status:i>d+0.00001?"EXTRA_DISPATCH_REQUIRED":i===0?"INVOICE_WAITING":i<d-0.00001?"PARTIAL":"COMPLETED"};
}
