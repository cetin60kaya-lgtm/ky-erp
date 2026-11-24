/* KY ERP NetteFatura: pure validation, safe download paths and ZIP creation. */
(function(root){
"use strict";
const SOURCE=Object.freeze({
 "/incominginvoice/incominginvoicelist":{kind:"invoice",dir:"incoming",id:"IdFaturaGelen",no:"FaturaNo",date:"FaturaTarihiFormated"},
 "/outgoinginvoice/outgoinginvoicelist":{kind:"invoice",dir:"outgoing",id:"IdFatura",no:"FaturaNo",date:"FaturaTarihiFormated"},
 "/incomingdespatchadvice/incomingdespatchadvicelist":{kind:"dispatch",dir:"incoming",id:"IdIrsaliyeGelen",no:"IrsaliyeNo",date:"IrsaliyeTarihiFormated"},
 "/outgoingdespatch/outgoingdespatchlist":{kind:"dispatch",dir:"outgoing",id:"IdIrsaliye",no:"IrsaliyeNo",date:"IrsaliyeTarihiFormated"}
});
const MAX_FILE=20*1024*1024,MAX_BATCH=100*1024*1024;
const t=x=>String(x??"").trim();
function source(path){return SOURCE[String(path).replace(/\/+$/,"").toLowerCase()]||null}
function normalize(raw,src){
 if(!src||!raw||typeof raw!=="object")return null;
 const id=t(raw[src.id]),number=t(raw[src.no]);
 if(!/^\d{1,24}$/.test(id)||!number||number.length>100)return null;
 return {id,number,date:t(raw[src.date]).slice(0,40),partner:t(raw.FirmaAdi||raw.AliciAdi).slice(0,160),kind:src.kind,dir:src.dir};
}
function downloadPath(row,fmt){
 if(!/^\d{1,24}$/.test(t(row.id))||!["pdf","xml"].includes(fmt)||!["invoice","dispatch"].includes(row.kind)||!["incoming","outgoing"].includes(row.dir))throw Error("Geçersiz belge seçimi.");
 const entity=row.kind==="invoice"?"Invoice":"Despatch";
 return "/"+entity+"/Get"+entity+(fmt==="pdf"?"Pdf":"Xml")+"?InOrOut="+(row.dir==="incoming")+"&"+entity+"Id="+encodeURIComponent(row.id);
}
function validate(bytes,fmt,kind,number,parseXml){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_FILE)throw Error("Dosya boş veya 20 MB sınırını aşıyor.");
 const decoder=new TextDecoder("utf-8",{fatal:false}),head=decoder.decode(bytes.subarray(0,4096)).replace(/^\uFEFF/,"").trimStart();
 if(fmt==="pdf"){
  if(!head.startsWith("%PDF-")||!decoder.decode(bytes.subarray(Math.max(0,bytes.length-2048))).includes("%%EOF"))throw Error("İşNet gerçek PDF döndürmedi.");
 }else if(fmt==="xml"){
  const xml=decoder.decode(bytes);
  if(/<!DOCTYPE\b|<!ENTITY\b/i.test(xml))throw Error("XML güvenlik kontrolü başarısız.");
  const wanted=kind==="invoice"?"Invoice":"DespatchAdvice";
  const root=/^(?:\s*<\?xml\b[^>]*\?>\s*)?(?:\s*<!--[\s\S]*?-->\s*)*\s*<(?:[\w.-]+:)?(Invoice|DespatchAdvice)\b/.exec(xml.replace(/^\uFEFF/,""))?.[1];
  if(root!==wanted)throw Error("Orijinal UBL belge türü doğrulanamadı.");
  if(typeof parseXml==="function"){
   const doc=parseXml(xml);
   if(doc.getElementsByTagName("parsererror").length||doc.documentElement?.localName!==wanted)throw Error("XML ayrıştırılamadı.");
   if(!String(doc.documentElement.namespaceURI||"").includes("urn:oasis:names:specification:ubl:schema:xsd:"))throw Error("UBL isim alanı doğrulanamadı.");
   const id=Array.from(doc.documentElement.children).find(el=>el.localName==="ID"&&String(el.namespaceURI||"").endsWith("CommonBasicComponents-2"));
   if(!id||t(id.textContent)!==t(number))throw Error("XML belge numarası seçilen satırla eşleşmiyor.");
  }
 }else throw Error("Geçersiz format.");
 return bytes;
}
const encoder=new TextEncoder();
function fileStem(row){const name=row.number.replace(/[^A-Za-z0-9._-]/g,"_").replace(/^\.+/,"").slice(0,100);return (name||"BELGE")+"_"+row.id}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0});
function crc32(b){let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function zip(files){
 if(!files.length||files.length>50)throw Error("ZIP dosya sayısı geçersiz.");
 let offset=0,total=0;const locals=[],central=[],names=new Set();
 for(const file of files){
  if(!/^[A-Za-z0-9_.-]+\.(xml|pdf)$/.test(file.name)||names.has(file.name)||!(file.data instanceof Uint8Array))throw Error("Paket dosya adı geçersiz.");
  names.add(file.name);total+=file.data.length;if(total>MAX_BATCH)throw Error("100 MB paket sınırı aşıldı.");
  const name=encoder.encode(file.name),crc=crc32(file.data),l=new Uint8Array(30+name.length),v=new DataView(l.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(10,0,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,file.data.length,true);v.setUint32(22,file.data.length,true);v.setUint16(26,name.length,true);l.set(name,30);
  const c=new Uint8Array(46+name.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(14,0x21,true);cv.setUint32(16,crc,true);cv.setUint32(20,file.data.length,true);cv.setUint32(24,file.data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);c.set(name,46);
  locals.push(l,file.data);central.push(c);offset+=l.length+file.data.length;
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,central.reduce((n,b)=>n+b.length,0),true);v.setUint32(16,offset,true);
 return new Blob([...locals,...central,end],{type:"application/zip"});
}
const api={source,normalize,downloadPath,validate,fileStem,zip,MAX_FILE,MAX_BATCH};
root.KYIsnetCore=api;if(typeof module!=="undefined")module.exports=api;
})(globalThis);
