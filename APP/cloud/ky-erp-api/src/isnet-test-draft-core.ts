// Isolated test drafts; never posts to accounting or calls provider.
// @ts-nocheck
export function transition(state,a,id,now){
 const fail=m=>{throw Error(m)},text=(v,n=250)=>String(v??"").trim().slice(0,n),number=(v,min,max)=>{if(v===""||v==null||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max)fail("Miktar, fiyat veya KDV geçersiz.");return Number(v)},round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const rows=state.drafts,old=rows.find(d=>d.id===a.id),kind=a.kind;
 if(!["SAVE_DISPATCH","SAVE_INVOICE","CANCEL"].includes(kind))fail("Yalnız taslak işlemi. Gönderim kapalı.");
 if(a.id&&!old||old?.status==="CANCELLED")fail("Aktif taslak bulunamadı.");
 const hasInvoice=d=>rows.some(x=>x.dispatchId===d.id&&x.status==="DRAFT");
 if(kind==="CANCEL"){if(!old)fail("Taslak yok.");if(old.type==="DISPATCH"&&hasInvoice(old))fail("Önce bağlı fatura taslağını iptal edin.");return {drafts:rows.map(d=>d.id===old.id?{...d,status:"CANCELLED",updatedAt:now}:d)};}
 if(!old&&rows.length>=100)fail("Test kayıt sınırı 100.");
 const type=kind==="SAVE_DISPATCH"?"DISPATCH":"INVOICE";
 if(old&&old.type!==type)fail("Belge türü değiştirilemez.");
 let d;
 if(type==="DISPATCH"){
  if(old&&hasInvoice(old))fail("Bağlı fatura var; önce onu iptal edin.");
  const source=old?.source||a.source;if(!["DEMO_INCOMING","MANUAL"].includes(source))fail("Geçersiz kaynak.");
  const quantity=number(a.quantity,0.000001,1000000),reserved=rows.filter(x=>x.type==="DISPATCH"&&x.source==="DEMO_INCOMING"&&x.status==="DRAFT"&&x.id!==old?.id).reduce((s,x)=>s+x.quantity,0);
  if(source==="DEMO_INCOMING"&&quantity>5500-reserved)fail("Test bakiyesi aşılamaz.");
  const transport=Object.fromEntries(["driver","plate","date","time","note"].map(k=>[k,text(a.transport?.[k],k==="note"?1000:250)]));
  if(!transport.driver||!transport.plate||!/^\d{4}-\d{2}-\d{2}$/.test(transport.date)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(transport.time))fail("Şoför, plaka, tarih ve saat gerekli.");
  const description=source==="DEMO_INCOMING"?"TEST Emprime baskı":text(a.description);if(!description)fail("Ürün açıklaması gerekli.");
  d={type,source,quantity,description,unit:source==="DEMO_INCOMING"?"ADET":text(a.unit)||"ADET",transport};
 }else{
  const dispatchId=old?old.dispatchId:text(a.dispatchId),dispatch=dispatchId?rows.find(x=>x.id===dispatchId&&x.type==="DISPATCH"&&x.status==="DRAFT"):null;
  if(dispatchId&&!dispatch)fail("İrsaliye taslağı yok.");
  if(dispatchId&&rows.some(x=>x.dispatchId===dispatchId&&x.status==="DRAFT"&&x.id!==old?.id))fail("Bağlı fatura taslağı zaten var.");
  const quantity=dispatch?dispatch.quantity:number(a.quantity,0.000001,1000000),description=dispatch?dispatch.description:text(a.description);
  if(!description||!["TICARI","TEMEL"].includes(a.scenario))fail("Ürün/senaryo gerekli.");
  const price=number(a.price,0.01,1000000),vatRate=number(a.vatRate,0,100),net=round(quantity*price),vat=round(net*vatRate/100);
  const sample=a.sample?.enabled===true?{quantity:number(a.sample.quantity,0.000001,1000000),description:text(a.sample.description)||"TEST numunesi",reason:text(a.sample.reason,1000),price:0,taxStatus:"REVIEW_REQUIRED"}:null;
  if(sample&&!sample.reason)fail("Numune açıklaması gerekli.");
  d={type,source:dispatch?"DISPATCH_DRAFT":"MANUAL",dispatchId,quantity,description,unit:dispatch?dispatch.unit:text(a.unit)||"ADET",transport:dispatch?.transport||null,price,vatRate,scenario:a.scenario,invoiceType:"SATIS",note:text(a.note,1000),sample,net,vat,total:round(net+vat)};
 }
 d={...d,id:old?.id||id,status:"DRAFT",environment:"TEST",officialNumber:null,officialSent:false,createdAt:old?.createdAt||now,updatedAt:now};
 return {drafts:old?rows.map(x=>x.id===old.id?d:x):[...rows,d]};
}
