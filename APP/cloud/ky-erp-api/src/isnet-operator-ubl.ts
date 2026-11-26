// Build unsigned UBL-TR from the canonical KYERP draft, not from a QA XML fixture.
// Deliberately limited to TEST e-Fatura (TRY, TEMEL/TICARI, SATIS) and TEMELIRSALIYE.
// No external I/O, numbering, signing, legal tax inference or provider authorization here.
import {normalizeDraft,type DraftKind} from "./e-belge-draft-core.ts";
const U="urn:oasis:names:specification:ubl:schema:xsd:";
const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const clean=(v:unknown,max:number,name:string)=>{
 if(typeof v!=="string"||!v.trim()||v.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(v))throw Error("UBL_FIELD_REQUIRED:"+name);
 return v.trim();
};
const optional=(v:unknown,max:number,name:string)=>v===undefined||v===""?"":clean(v,max,name);
const c=(n:string,v:string,attrs="")=>"<cbc:"+n+attrs+">"+esc(v)+"</cbc:"+n+">";
const a=(n:string,inside:string)=>"<cac:"+n+">"+inside+"</cac:"+n+">";
type Address={street:string;buildingNumber:string;district:string;city:string;postalCode:string;country:string};
type Party={id:string;taxNo:string;name:string;taxOffice:string;address:Address};
type Exemption={lineIndex:number;code:string;reason:string;approved:true;approvalRef:string};
type SourceRef={documentNo:string;issueDate:string;ettn?:string};
type Shipment={value:string;currency:"TRY";driverFirstName:string;driverLastName:string;driverNationalityId:string;deliveryAddress:Address;plate:string};
type Input={environment:"TEST";kind:DraftKind;draft:unknown;sender:Party;receiver:Party;localEttn:string;localDocumentNo:string;issueTime:string;exemptions?:readonly Exemption[];shipment?:Shipment;sourceDespatches?:readonly SourceRef[]};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const number=/^[A-Z0-9]{3}[0-9]{13}$/;
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+"T00:00:00Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const time=(s:string)=>/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(s);
const money=(n:string,v:string)=>c(n,v,' currencyID="TRY"');
const cents=(s:string)=>BigInt(s.replace(".",""));
const fmt=(x:bigint)=>{const s=x.toString().padStart(3,"0");return s.slice(0,-2)+"."+s.slice(-2)};
function address(v:Address){
 if(!v)throw Error("UBL_ADDRESS_REQUIRED");
 const pc=clean(v.postalCode,5,"postalCode");if(!/^\d{5}$/.test(pc))throw Error("UBL_POSTAL_CODE");
 if(v.country!=="Türkiye")throw Error("UBL_DOMESTIC_ONLY");
 return c("StreetName",clean(v.street,250,"street"))+c("BuildingNumber",clean(v.buildingNumber,30,"buildingNumber"))+c("CitySubdivisionName",clean(v.district,100,"district"))+c("CityName",clean(v.city,100,"city"))+c("PostalZone",pc)+a("Country",c("Name",v.country));
}
function party(v:Party){
 if(!v||!/^\d{10}$/.test(v.taxNo))throw Error("UBL_COMPANY_VKN_REQUIRED");
 return a("PartyIdentification",c("ID",v.taxNo,' schemeID="VKN"'))+a("PartyName",c("Name",clean(v.name,300,"partyName")))+a("PostalAddress",address(v.address))+a("PartyTaxScheme",a("TaxScheme",c("Name",clean(v.taxOffice,100,"taxOffice"))));
}
function signature(v:Party){
 return a("Signature",c("ID",v.taxNo,' schemeID="VKN_TCKN"')+a("SignatoryParty",a("PartyIdentification",c("ID",v.taxNo,' schemeID="VKN"'))+a("PostalAddress",address(v.address)))+a("DigitalSignatureAttachment",a("ExternalReference",c("URI","#Signature"))));
}
type TaxRow={net:bigint;vat:bigint;rate:string;code?:string;reason?:string};
function tax(rows:TaxRow[]){
 const sum=rows.reduce((n,r)=>n+r.vat,0n);
 return a("TaxTotal",money("TaxAmount",fmt(sum))+rows.map(r=>a("TaxSubtotal",money("TaxableAmount",fmt(r.net))+money("TaxAmount",fmt(r.vat))+c("Percent",r.rate)+a("TaxCategory",(r.code?c("TaxExemptionReasonCode",r.code)+c("TaxExemptionReason",r.reason!):"")+a("TaxScheme",c("Name","KDV")+c("TaxTypeCode","0015"))))).join(""));
}
export function buildTestUblFromOperatorDraft(x:Input){
 if(x.environment!=="TEST"||!["INVOICE","DISPATCH"].includes(x.kind))throw Error("UBL_TEST_ONLY");
 if(!uuid.test(x.localEttn)||!number.test(x.localDocumentNo)||!time(x.issueTime))throw Error("UBL_LOCAL_IDENTITY");
 const d=normalizeDraft(x.draft,x.kind),inv=x.kind==="INVOICE";
 if(d.currency!=="TRY"||(inv?!["TEMELFATURA","TICARIFATURA"].includes(d.scenario):d.scenario!=="TEMELIRSALIYE"))throw Error("UBL_UNSUPPORTED_SCENARIO");
 if(!x.sender||!x.receiver||x.sender.taxNo===x.receiver.taxNo||d.partyId!==x.receiver.id)throw Error("UBL_PARTY_MISMATCH");
 const sender=party(x.sender),receiver=party(x.receiver);
 // Draft totals are always recomputed from raw line quantities, prices and rates.
 // Zero-rate lines require explicit approval of a legal basis; never infer 351.
 const exemptions=new Map<number,Exemption>();
 for(const e of x.exemptions||[]){
  if(!inv||!Number.isInteger(e.lineIndex)||e.lineIndex<0||e.lineIndex>=d.lines.length||exemptions.has(e.lineIndex)||e.approved!==true||!clean(e.approvalRef,150,"taxApproval")||!/^\d{3}$/.test(e.code))throw Error("UBL_EXEMPTION_APPROVAL");
  clean(e.reason,500,"exemptionReason");exemptions.set(e.lineIndex,e);
 }
 const rows:TaxRow[]=inv?d.lines.map((l,i)=>{
  const e=exemptions.get(i),zero=l.vatRate==="0.00";
  if(zero!==Boolean(e))throw Error("UBL_EXEMPTION_APPROVAL");
  // Allowance/discount needs its own GIB contract acceptance, not silent omission.
  if(l.discountRate!=="0.00")throw Error("UBL_DISCOUNT_REVIEW_REQUIRED");
  return {net:cents(l.net),vat:cents(l.vat),rate:l.vatRate,...(e?{code:e.code,reason:e.reason.trim()}: {})};
 }):[];
 const grouped=new Map<string,TaxRow>();
 for(const r of rows){const k=JSON.stringify([r.rate,r.code||"",r.reason||""]),old=grouped.get(k);grouped.set(k,old?{...old,net:old.net+r.net,vat:old.vat+r.vat}:r);}
 const root=inv?"Invoice":"DespatchAdvice";
 let body="<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>";
 body+=c("UBLVersionID","2.1")+c("CustomizationID","TR1.2.1")+c("ProfileID",d.scenario)+c("ID",x.localDocumentNo)+c("CopyIndicator","false")+c("UUID",x.localEttn)+c("IssueDate",d.issueDate)+c("IssueTime",x.issueTime)+c(inv?"InvoiceTypeCode":"DespatchAdviceTypeCode",inv?"SATIS":"SEVK");
 if(d.note)body+=c("Note",d.note);
 if(inv)body+=c("DocumentCurrencyCode","TRY")+c("LineCountNumeric",String(d.lines.length));
 const refs=x.sourceDespatches||[];
 if(refs.length>100||(!inv&&refs.length))throw Error("UBL_SOURCE_REFERENCE_INVALID");
 const refIds=new Set<string>();
 for(const r of refs){
  if(!number.test(r.documentNo)||!date(r.issueDate)||r.issueDate>d.issueDate||refIds.has(r.documentNo)||(r.ettn!==undefined&&!uuid.test(r.ettn)))throw Error("UBL_SOURCE_REFERENCE_INVALID");
  refIds.add(r.documentNo);
  // DespatchDocumentReference is part of the original invoice UBL order.
  body+=a("DespatchDocumentReference",c("ID",r.documentNo)+(r.ettn?c("UUID",r.ettn):"")+c("IssueDate",r.issueDate));
 }
 body+=signature(x.sender)+a(inv?"AccountingSupplierParty":"DespatchSupplierParty",a("Party",sender))+a(inv?"AccountingCustomerParty":"DeliveryCustomerParty",a("Party",receiver));
 if(inv){
  body+=tax([...grouped.values()])+a("LegalMonetaryTotal",money("LineExtensionAmount",d.net)+money("TaxExclusiveAmount",d.net)+money("TaxInclusiveAmount",d.total)+money("PayableAmount",d.total));
 }else{
  const sh=x.shipment;
  if(!sh||sh.currency!=="TRY"||!/^\d{1,15}(?:\.\d{1,2})?$/.test(sh.value)||!/^\d{11}$/.test(sh.driverNationalityId)||!sh.plate||sh.plate!==d.plate)throw Error("UBL_SHIPMENT_REQUIRED");
  const first=clean(sh.driverFirstName,100,"driverFirstName"),last=clean(sh.driverLastName,100,"driverLastName");
  if(d.driver.trim()!==first+" "+last)throw Error("UBL_DRIVER_MISMATCH");
  if(!d.dispatchDate||!d.dispatchTime||d.dispatchDate===d.issueDate&&d.dispatchTime+":00"<x.issueTime)throw Error("UBL_DISPATCH_TIME");
  const stage=a("ShipmentStage",a("TransportMeans",a("RoadTransport",c("LicensePlateID",clean(sh.plate,32,"plate"),' schemeID="PLAKA"')))+a("DriverPerson",c("FirstName",first)+c("FamilyName",last)+c("NationalityID",sh.driverNationalityId)));
  body+=a("Shipment",c("ID","1")+a("GoodsItem",money("ValueAmount",sh.value))+stage+a("Delivery",a("DeliveryAddress",address(sh.deliveryAddress))+a("Despatch",c("ActualDespatchDate",d.dispatchDate)+c("ActualDespatchTime",d.dispatchTime+":00"))));
 }
 for(let i=0;i<d.lines.length;i++){
  const l=d.lines[i];if(!/^[A-Z0-9]{2,3}$/.test(l.unit))throw Error("UBL_UNIT_CODE");
  let line=c("ID",String(i+1))+(l.note?c("Note",l.note):"")+c(inv?"InvoicedQuantity":"DeliveredQuantity",l.quantity,' unitCode="'+l.unit+'"');
  if(inv)line+=money("LineExtensionAmount",l.net)+tax([rows[i]!]);
  else line+=a("OrderLineReference",c("LineID",String(i+1)));
  line+=a("Item",c("Name",l.description));
  if(inv)line+=moneyPrice(l.price);
  body+=a(inv?"InvoiceLine":"DespatchLine",line);
 }
 const xml='<?xml version="1.0" encoding="UTF-8"?><'+root+' xmlns="'+U+root+'-2" xmlns:cbc="'+U+'CommonBasicComponents-2" xmlns:cac="'+U+'CommonAggregateComponents-2" xmlns:ext="'+U+'CommonExtensionComponents-2">'+body+'</'+root+'>';
 return {xml,kind:inv?"E_FATURA" as const:"E_IRSALIYE" as const,localEttn:x.localEttn,localDocumentNo:x.localDocumentNo,net:d.net,vat:d.vat,total:d.total,requiresExternalValidation:true as const,sendAllowed:false as const};
}
function moneyPrice(price:string){return a("Price",money("PriceAmount",price))}
