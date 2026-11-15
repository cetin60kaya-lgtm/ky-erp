export type VisualKind = "INVOICE"|"DISPATCH";
export type VisualOutput = "PDF"|"JPEG"|"PNG";
export type VisualLayout = { marginTop:number; marginSide:number; fontSize:number; tableFontSize:number; logoWidth:number; showQr:boolean; headerGap:number; companyGap:number; tableGap:number; totalsWidth:number; cellPadding:number; titleSize:number; qrWidth:number };
export const defaultVisualLayout: VisualLayout = { marginTop:30, marginSide:26, fontSize:9, tableFontSize:8, logoWidth:135, showQr:true, headerGap:18, companyGap:20, tableGap:14, totalsWidth:190, cellPadding:4, titleSize:16, qrWidth:82 };
const s = "(?:[A-Za-z_][\\w.-]*:)?";
const digits = (v:unknown) => String(v??"").replace(/\D/g,"");
export function visualProfileKey(issuerTaxNo:string,kind:VisualKind) {
 const id=digits(issuerTaxNo);
 if(!/^\d{10}(?:\d)?$/.test(id) || !["INVOICE","DISPATCH"].includes(kind))
   throw new Error("Geçerli düzenleyen VKN/TCKN ve belge türü gereklidir.");
 return id+":"+kind;
}
export function visualOutputFormat(v:unknown):VisualOutput {
 const value=String(v||"PDF").toUpperCase();
 if(!["PDF","JPEG","PNG"].includes(value))throw new Error("PDF/JPEG/PNG dışında görüntü çıktı biçimi desteklenmez.");
 return value as VisualOutput;
}
export function visualLayout(value:unknown):VisualLayout {
 const d=defaultVisualLayout;
 const v=value && typeof value==="object"&&!Array.isArray(value)?value as Record<string,any>:{};
 const clamp=(key:keyof VisualLayout,min:number,max:number)=>{
  const n=Number(v[key]);return v[key]!==undefined && Number.isFinite(n) && n>=min && n<=max?Math.round(n*10)/10:d[key] as number;
 };
 return {marginTop:clamp("marginTop",0,150),marginSide:clamp("marginSide",0,120),
  fontSize:clamp("fontSize",6,18),tableFontSize:clamp("tableFontSize",5,16),
  logoWidth:clamp("logoWidth",0,240),showQr:v.showQr!==false,
  headerGap:clamp("headerGap",0,60),companyGap:clamp("companyGap",0,80),tableGap:clamp("tableGap",0,65),
  totalsWidth:clamp("totalsWidth",110,280),cellPadding:clamp("cellPadding",1,14),
  titleSize:clamp("titleSize",10,28),qrWidth:clamp("qrWidth",40,140)};
}
function field(xml:string,name:string){
 const re=new RegExp("<"+s+name+"\\b[^>]*>([\\s\\S]*?)<\\/"+s+name+"\\s*>","i");
 return (xml.match(re)?.[1]||"").replace(/<[^>]+>/g,"").trim();
}
export function inspectUblVisual(xml:string){
 if(xml.length>20*1024*1024||/<!DOCTYPE\b|<!ENTITY\b/i.test(xml))
  throw new Error("UBL XML çok büyük veya güvensiz DTD/ENTITY içeriyor.");
 const m=xml.match(/^\uFEFF?\s*(?:<\?xml\b[^>]*\?>\s*)?<(?:[\w.-]+:)?(Invoice|DespatchAdvice)\b[^>]*>/i);
 if(!m)throw new Error("UBL-TR fatura veya irsaliye kökü bulunamadı.");
 const kind:VisualKind=m[1].toLowerCase()==="invoice"?"INVOICE":"DISPATCH";
 const blockName=kind==="INVOICE"?"AccountingSupplierParty":"DespatchSupplierParty";
 const part=xml.match(new RegExp("<"+s+blockName+"\\b[^>]*>([\\s\\S]*?)<\\/"+s+blockName+"\\s*>","i"))?.[1]||"";
 const issuerTaxNo=digits(field(part,"ID"));
 const rest=xml.slice(m[0].length);
 const documentNo=field(rest,"ID"),documentUuid=field(rest,"UUID"),issueDate=field(rest,"IssueDate");
 if(!/^\d{10}(?:\d)?$/.test(issuerTaxNo)||!documentNo||!/^\d{4}-\d{2}-\d{2}$/.test(issueDate))
  throw new Error("Düzenleyen kimliği, belge numarası veya düzenlenme tarihi eksik.");
 const embed=xml.match(new RegExp("<"+s+"EmbeddedDocumentBinaryObject\\b([^>]*)>","i"));
 const hasDocumentXslt=Boolean(embed&&/mimeCode\s*=\s*["']application\/xml["']/i.test(embed[1]));
 return {kind,issuerTaxNo,documentNo,documentUuid,issueDate,hasDocumentXslt,profileKey:visualProfileKey(issuerTaxNo,kind)};
}
export function selectVisualSource(
 doc:{issuerTaxNo:string;kind:VisualKind;hasDocumentXslt:boolean},
 profile:{issuerTaxNo:string;kind:VisualKind;approved?:boolean}|null,
) {
 const same=Boolean(profile && profile.issuerTaxNo===doc.issuerTaxNo && profile.kind===doc.kind);
 // One document's XSLT may contain its own QR/code; do not reuse its images
 // or static document values as a template for another document.
 return {templateSource:doc.hasDocumentXslt?"DOCUMENT_OWN_XSLT":same&&profile?.approved?"APPROVED_FIRM_LAYOUT":"REVIEW_REQUIRED",
   issuerMatched:same,needsReview:!same||!profile?.approved,mayAutoSend:false};
}
