// Isolated TEST drafts. No provider writes or accounting entries.
// @ts-nocheck
const parties=["TEST_A","TEST_B"];
const txt=(v,n=250)=>String(v??"").trim().slice(0,n);
const fail=m=>{throw Error(m)};
const num=(v,min,max)=>{if(v===""||v==null||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max)fail("Miktar, fiyat veya KDV geçersiz.");return Number(v)};
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const qtyRound=n=>Number(n.toFixed(6));
const dateOK=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
export function draftLines(d){return Array.isArray(d.lines)&&d.lines.length?d.lines:[{description:d.description,quantity:d.quantity,unit:d.unit||"ADET",price:d.price,vatRate:d.vatRate,net:d.net,vat:d.vat,total:d.total}];}
function normalizeLines(a,dispatch){
 const raw=Array.isArray(a.lines)?a.lines:[a];
 if(!raw.length||raw.length>50)fail("1–50 ürün kalemi gerekli.");
 const locked=dispatch?draftLines(dispatch):null;
 if(locked&&Array.isArray(a.lines)&&raw.length!==locked.length)fail("İrsaliye kalem sayısı değiştirilemez.");
 return (locked||raw).map((row,i)=>{
 const input=locked?(Array.isArray(a.lines)?raw[i]:a):row;
 const description=txt(row.description),quantity=num(row.quantity,0.000001,1000000),unit=txt(row.unit)||"ADET";
 if(!description)fail("Ürün açıklaması gerekli.");
 if(locked&&Array.isArray(a.lines)&&(txt(input.description)!==description||Number(input.quantity)!==quantity||txt(input.unit)!==unit))fail("İrsaliye kalemi değiştirilemez.");
 return {description,quantity,unit,...(a.kind==="SAVE_INVOICE"?(()=>{const price=num(input.price,0.01,1000000),vatRate=num(input.vatRate,0,100),net=round(quantity*price),vat=round(net*vatRate/100);return {price,vatRate,net,vat,total:round(net+vat)};})():{})};
 });
}
export function transition(state,a,id,now){
 const rows=state.drafts,old=rows.find(d=>d.id===a.id),kind=a.kind;
 if(!["SAVE_DISPATCH","SAVE_INVOICE","CANCEL"].includes(kind))fail("Yalnız taslak işlemi. Gönderim kapalı.");
 if(a.id&&!old||old?.status==="CANCELLED")fail("Aktif taslak bulunamadı.");
 const hasInvoice=d=>rows.some(x=>x.dispatchId===d.id&&x.status==="DRAFT");
 if(kind==="CANCEL"){if(!old)fail("Taslak yok.");if(old.type==="DISPATCH"&&hasInvoice(old))fail("Önce bağlı fatura taslağını iptal edin.");return {drafts:rows.map(d=>d.id===old.id?{...d,status:"CANCELLED",updatedAt:now}:d)};}
 if(!old&&rows.length>=100)fail("Test kayıt sınırı 100.");
 const type=kind==="SAVE_DISPATCH"?"DISPATCH":"INVOICE";
 if(old&&old.type!==type)fail("Belge türü değiştirilemez.");
 const dispatchId=type==="INVOICE"?(old?old.dispatchId:txt(a.dispatchId)):"",dispatch=dispatchId?rows.find(x=>x.id===dispatchId&&x.type==="DISPATCH"&&x.status==="DRAFT"):null;
 if(dispatchId&&!dispatch)fail("İrsaliye taslağı yok.");
 if(dispatchId&&rows.some(x=>x.dispatchId===dispatchId&&x.status==="DRAFT"&&x.id!==old?.id))fail("Bağlı fatura taslağı zaten var.");
 const party=dispatch?(dispatch.party||"TEST_A"):txt(a.party||old?.party||"TEST_A");
 if(!parties.includes(party))fail("Yalnız sentetik TEST firma seçilebilir.");
 const issueDate=txt(a.issueDate||old?.issueDate||a.transport?.date||dispatch?.transport?.date||(String(now).slice(0,10)));
 if(!dateOK(issueDate))fail("Belge tarihi geçersiz.");
 let d,lines;
 if(type==="DISPATCH"){
  if(old&&hasInvoice(old))fail("Bağlı fatura var; önce onu iptal edin.");
  if(a.scenario&&a.scenario!=="TEMELIRSALIYE"||a.dispatchType&&a.dispatchType!=="SEVK")fail("Bu senaryo/tip henüz TEST taslağında desteklenmiyor.");
  const source=old?.source||a.source;if(!["DEMO_INCOMING","MANUAL"].includes(source))fail("Geçersiz kaynak.");
  if(source==="DEMO_INCOMING"){
   const raw=Array.isArray(a.lines)?a.lines:[a];if(raw.length!==1)fail("Örnek kaynak tek kalemdir.");
   lines=[{description:"TEST Emprime baskı",unit:"ADET",quantity:num(raw[0].quantity,0.000001,1000000)}];
   const reserved=rows.filter(x=>x.type==="DISPATCH"&&x.source==="DEMO_INCOMING"&&x.status==="DRAFT"&&x.id!==old?.id).reduce((s,x)=>s+x.quantity,0);
   if(lines[0].quantity>5500-reserved)fail("Test bakiyesi aşılamaz.");
   if(party!=="TEST_A")fail("Örnek kaynak firma değiştirilemez.");
  }else lines=normalizeLines(a,null);
  const transport=Object.fromEntries(["driver","plate","date","time","note","deliveryAddress","carrierName","trailerPlate"].map(k=>[k,txt(a.transport?.[k],k==="note"?1000:250)]));
  if(!transport.driver||!transport.plate||!dateOK(transport.date)||transport.date<issueDate||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(transport.time))fail("Şoför, plaka, geçerli sevk tarihi ve saat gerekli. Sevk tarihi belge tarihinden önce olamaz.");
  d={type,source,transport,scenario:"TEMELIRSALIYE",dispatchType:"SEVK"};
 }else{
  if(!["TICARI","TEMEL"].includes(a.scenario)||a.invoiceType&&a.invoiceType!=="SATIS")fail("Bu senaryo/tip henüz TEST taslağında desteklenmiyor.");
  lines=normalizeLines(a,dispatch);
  const net=round(lines.reduce((sum,l)=>sum+l.net,0)),vat=round(lines.reduce((sum,l)=>sum+l.vat,0));
  const sample=a.sample?.enabled===true?{quantity:num(a.sample.quantity,0.000001,1000000),description:txt(a.sample.description)||"TEST numunesi",reason:txt(a.sample.reason,1000),price:0,taxStatus:"REVIEW_REQUIRED"}:null;
  if(sample&&!sample.reason)fail("Numune açıklaması gerekli.");
  d={type,source:dispatch?"DISPATCH_DRAFT":"MANUAL",dispatchId,transport:dispatch?.transport||null,price:lines[0].price,vatRate:lines[0].vatRate,scenario:a.scenario,invoiceType:"SATIS",note:txt(a.note,1000),sample,net,vat,total:round(net+vat)};
 }
 const units=[...new Set(lines.map(l=>l.unit))];
 d={...d,party,issueDate,lines,quantity:qtyRound(lines.reduce((sum,l)=>sum+l.quantity,0)),description:lines[0].description,unit:units.length===1?units[0]:"KARIŞIK",id:old?.id||id,status:"DRAFT",environment:"TEST",officialNumber:null,officialSent:false,createdAt:old?.createdAt||now,updatedAt:now};
 return {drafts:old?rows.map(x=>x.id===old.id?d:x):[...rows,d]};
}
