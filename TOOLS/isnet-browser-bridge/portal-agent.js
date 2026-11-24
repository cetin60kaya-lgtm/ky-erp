/* Authenticated portal browser agent. No password/cookie/storage access. */
(()=>{
"use strict";
if(location.origin!=="https://nettefatura.isnet.net.tr"||window.top!==window)return;
const C=globalThis.KYIsnetCore;
const routes={
 "incoming-invoice":["/IncomingInvoice/IncomingInvoiceList","/IncomingInvoice/AllIncomingInvoiceByFilter"],
 "outgoing-invoice":["/OutgoingInvoice/OutgoingInvoiceList","/OutgoingInvoice/AllOutgoingInvoiceByFilter"],
 "incoming-dispatch":["/IncomingDespatchAdvice/IncomingDespatchAdviceList","/IncomingDespatchAdvice/AllIncomingDespatchAdviceByFilter"],
 "outgoing-dispatch":["/OutgoingDespatch/OutgoingDespatchList","/OutgoingDespatch/AllOutgoingDespatchByFilter"]
};
let snapshot=null;
const dateOK=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const fmt=s=>s.split("-").reverse().join(".");
function portalSession(){return !/\/Account\/Login/i.test(location.pathname)&&!document.querySelector('input[type="password"]')&&!!document.querySelector('a[href*="IncomingInvoice"],a[href*="IncomingDespatchAdvice"],a[href*="OutgoingInvoice"],a[href*="OutgoingDespatch"]')}
async function request(path,init={}){
 const url=new URL(path,location.origin);
 if(url.origin!==location.origin)throw Error("PORTAL_TARGET_INVALID");
 const r=await fetch(url,{...init,credentials:"same-origin",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error("PORTAL_HTTP_"+r.status);return r;
}
async function list(p){
 snapshot=null;
 if(!portalSession())throw Error("PORTAL_LOGIN_REQUIRED");
 const route=routes[p.kind];if(!route||!dateOK(p.from)||!dateOK(p.to)||p.from>p.to||(Date.parse(p.to)-Date.parse(p.from))>31*86400000)throw Error("INVALID_DATE_OR_TYPE");
 const page=route[0]+"?minDate="+encodeURIComponent(p.from),r=await request(page),html=await r.text(),doc=new DOMParser().parseFromString(html,"text/html");
 if(doc.querySelector('input[type="password"]'))throw Error("PORTAL_LOGIN_REQUIRED");
 const token=doc.querySelector('input[name="__RequestVerificationToken"]')?.value;
 const field=doc.querySelector('[name="CompanyIdFilter"],#CompanyIdFilter');
 const company=String(field?.value||"").trim();
 if(!token)throw Error("PORTAL_FORM_UNVERIFIED");
 // An explicit selected firm is required; no guessing or all-company fallback.
 if(!/^\d{1,24}$/.test(company))throw Error("PORTAL_COMPANY_FILTER_UNVERIFIED");
 const start=Number(p.start||0);if(!Number.isInteger(start)||start<0||start>5000)throw Error("INVALID_PAGE");
 const form=new URLSearchParams({draw:"1",start:String(start),length:"100","search[value]":"","search[regex]":"false",CompanyIdFilter:company,__RequestVerificationToken:token,IlkTarih:fmt(p.from),SonTarih:fmt(p.to)});
 const prefix=p.kind.endsWith("invoice")?"Fatura":"Irsaliye";form.set(prefix+"IlkTarihi",fmt(p.from));form.set(prefix+"SonTarihi",fmt(p.to));
 const rr=await request(route[1],{method:"POST",headers:{Accept:"application/json","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"},body:form});
 const j=await rr.json();if(!Array.isArray(j?.data))throw Error("PORTAL_LIST_UNVERIFIED");
 const src=C.source(route[0]),seen=new Set(),rows=j.data.slice(0,100).map(x=>C.normalize(x,src)).filter(x=>x&&!seen.has(x.id)&&seen.add(x.id));
 if(j.data.length&&!rows.length)throw Error("PORTAL_LIST_UNVERIFIED");
 const key=crypto.randomUUID();
 snapshot={key,company,rows,expires:Date.now()+10*60*1000};
 return {rows,key,total:Number(j.recordsFiltered||j.recordsTotal||rows.length),companySelected:true};
}
async function file(p){
 if(!portalSession()||!snapshot||snapshot.key!==p.key||snapshot.expires<Date.now())throw Error("PORTAL_LIST_EXPIRED");
 const row=snapshot.rows.find(r=>r.id===p.id);if(!row||!["xml","pdf"].includes(p.format))throw Error("DOCUMENT_NOT_SELECTED");
 const r=await request(C.downloadPath(row,p.format));if(Number(r.headers.get("content-length")||0)>C.MAX_FILE||!r.body)throw Error("FILE_TOO_LARGE");
 const reader=r.body.getReader();let size=0;const parts=[];
 try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>C.MAX_FILE)throw Error("FILE_TOO_LARGE");parts.push(x.value)}}catch(e){await reader.cancel().catch(()=>{});throw e}
 const bytes=new Uint8Array(size);let off=0;for(const part of parts){bytes.set(part,off);off+=part.length}
 C.validate(bytes,p.format,row.kind,row.number,x=>new DOMParser().parseFromString(x,"application/xml"));
 let binary="";for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return {name:C.fileStem(row)+"."+p.format,base64:btoa(binary),size:bytes.length};
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
 if(s.id!==chrome.runtime.id||m?.type!=="KY_PORTAL_AGENT")return false;
 (async()=>{if(m.op==="status")return{connected:portalSession()};if(m.op==="list")return list(m.payload||{});if(m.op==="file")return file(m.payload||{});throw Error("UNSUPPORTED")})().then(data=>reply({ok:true,data}),e=>reply({ok:false,error:String(e.message||"PORTAL_FAILED").slice(0,160)}));return true;
});
})();