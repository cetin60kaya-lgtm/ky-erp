// KY ERP local NetteFatura -> Google Drive primary archive. Node >= 22; no dependencies.
// One physical XML/PDF original per document. Credentials remain process-memory only.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import {stat} from "node:fs/promises";
import {resolve} from "node:path";
import {archiveOriginals} from "./archive-store.mjs";
const ARCHIVE_ROOT = process.env.KYERP_ISNET_ARCHIVE_ROOT;
if(!ARCHIVE_ROOT)throw Error("KYERP_ISNET_ARCHIVE_ROOT tanımlı değil.");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || "8790");
const REMOTE = "https://nettefatura.isnet.net.tr";
const MAX_XML = 8 * 1024 * 1024;
const csrf = randomBytes(24).toString("hex");
let state = { username: "", password: "", companyId: "", companyName: "", connected: false, documents: [], jar: new Map() };

function reset() {
  state = { username: "", password: "", companyId: "", companyName: "", connected: false, documents: [], jar: new Map() };
}
const safe = (v) => String(v ?? "").trim();
function err(code) { const e = new Error(code); e.safeCode = code; throw e; }
function verification(html) {
  return html.match(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i)?.[1]
    || html.match(/value=["']([^"']+)["'][^>]*name=["']__RequestVerificationToken["']/i)?.[1] || "";
}
async function request(path, init = {}, jar = state.jar) {
  if (!path.startsWith("/") || path.startsWith("//")) err("INVALID_PORTAL_PATH");
  const headers = {
    "User-Agent": "KYERP-NetteFatura-Isolated-Tester/1.0",
    Accept: "text/html,application/json,application/xml",
    ...(jar.size ? {Cookie: [...jar].map(([k,v]) => k+"="+v).join("; ")} : {}),
    ...(init.headers || {})
  };
  const response = await fetch(REMOTE + path, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(25000) });
  for (const cookie of (response.headers.getSetCookie?.() || [])) {
    const part = cookie.split(";",1)[0]; const pos = part.indexOf("=");
    if (pos > 0 && /^[A-Za-z0-9_.-]+$/.test(part.slice(0,pos))) jar.set(part.slice(0,pos),part.slice(pos+1));
  }
  return response;
}
function companiesFrom(payload) {
  const rows = payload?.CompanyList || payload?.companyList || payload?.options || payload;
  if (!Array.isArray(rows)) return [];
  return rows.map(r=>({id:safe(r.IdFirma ?? r.idFirma ?? r.CompanyId),name:safe(r.FirmaAdi ?? r.firmaAdi ?? r.CompanyName),hasRole:r.UserHasRole!==false}))
    .filter(r=>r.id && r.name && r.hasRole).slice(0,100);
}
async function loginStep(username,password) {
  reset();
  if (!username || !password) err("KULLANICI_ADI_SIFRE_GEREKLI");
  const page = await request("/Account/Login");
  const token = verification(await page.text());
  if (!page.ok || !token) err("PORTAL_LOGIN_FORM_DEGISMIS");
  const response = await request("/Account/Login",{method:"POST",headers:{
    "Content-Type":"application/x-www-form-urlencoded",Origin:REMOTE,Referer:REMOTE+"/Account/Login"
  },body:new URLSearchParams({VknTckn:username,Password:password,RememberMe:"false",__RequestVerificationToken:token}).toString()});
  await response.text(); // Never persist/print the portal HTML.
  const list = await request("/Account/GetCompanyList",{method:"POST",headers:{
    Accept:"application/json","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
    Origin:REMOTE,Referer:REMOTE+"/Account/Login","X-Requested-With":"XMLHttpRequest"
  },body:new URLSearchParams({q:""}).toString()});
  const raw = await list.text();
  let payload;
  try { payload=JSON.parse(raw); } catch { err("FIRMA_LISTESI_JSON_DEGIL"); }
  const companies=companiesFrom(payload);
  if (!list.ok || !companies.length) err("GIRIS_VEYA_FIRMA_YETKISI_DOGRULANAMADI");
  state.username=username;state.password=password;
  return companies;
}
async function chooseCompany(id,name) {
  if (!state.username || !state.password) err("ONCE_GIRIS_YAPIN");
  const jar = new Map();
  const page = await request("/Account/Login",{},jar);
  const token = verification(await page.text());
  if (!page.ok || !token) err("PORTAL_LOGIN_FORM_DEGISMIS");
  const loginBody = new URLSearchParams({VknTckn:state.username,Password:state.password,RememberMe:"false",__RequestVerificationToken:token});
  const step = await request("/Account/Login",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Origin:REMOTE,Referer:REMOTE+"/Account/Login"},body:loginBody.toString()},jar);
  const secondToken=verification(await step.text());
  if (!secondToken) err("FIRMA_SECIM_FORMU_DEGISMIS");
  const selection = await request("/Account/Login",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Origin:REMOTE,Referer:REMOTE+"/Account/Login"},
    body:new URLSearchParams({VknTckn:state.username,Password:state.password,"validation[Companylist]":name,CompanyId:id,RememberMe:"false",__RequestVerificationToken:secondToken}).toString()},jar);
  if(selection.status!==302 || selection.headers.get("location")!=="/") err("FIRMA_OTURUMU_ACILAMADI");
  state.jar=jar;state.companyId=id;state.companyName=name;state.connected=true;state.documents=[];
}
function trDate(iso) { const [y,m,d]=iso.split("-");return d+"."+m+"."+y; }
function range(start,end) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)) err("TARIH_GECERSIZ");
  const days=(Date.parse(end)-Date.parse(start))/86400000;
  if(!Number.isFinite(days)||days<0||days>31) err("EN_FAZLA_31_GUN");
}

const SOURCES = Object.freeze({
  incoming_invoice: {kind:"invoice",direction:"incoming",page:"/IncomingInvoice/IncomingInvoiceList",list:"/IncomingInvoice/AllIncomingInvoiceByFilter",idField:"IdFaturaGelen"},
  outgoing_invoice: {kind:"invoice",direction:"outgoing",page:"/OutgoingInvoice/OutgoingInvoiceList",list:"/OutgoingInvoice/AllOutgoingInvoiceByFilter",idField:"IdFatura"},
  incoming_dispatch: {kind:"dispatch",direction:"incoming",page:"/IncomingDespatchAdvice/IncomingDespatchAdviceList",list:"/IncomingDespatchAdvice/AllIncomingDespatchAdviceByFilter",idField:"IdIrsaliyeGelen"},
  outgoing_dispatch: {kind:"dispatch",direction:"outgoing",page:"/OutgoingDespatch/OutgoingDespatchList",list:"/OutgoingDespatch/AllOutgoingDespatchByFilter",idField:"IdIrsaliye"}
});
function selectedSource(key) {if(!Object.hasOwn(SOURCES,key)) err("BELGE_TURU_GECERSIZ");return SOURCES[key];}
async function listDocuments(start,end,sourceKey,pageIndex=0) {
  if(!state.connected)err("FIRMA_SECIN");
  range(start,end);
  const source=selectedSource(sourceKey);
  const pagePath=source.page+(sourceKey==="outgoing_dispatch"?"":"?minDate="+encodeURIComponent(start));
  const page=await request(pagePath);
  const token=verification(await page.text());
  if(!page.ok||!token)err("BELGE_SAYFASI_VEYA_CSRF_HATASI");
  const items=[];
  if(!Number.isSafeInteger(pageIndex)||pageIndex<0||pageIndex>19)err("SAYFA_SINIRI");
  for(let offset=pageIndex*50;offset<pageIndex*50+50;offset+=50){
    const form=new URLSearchParams({draw:"1",start:String(offset),length:"50","search[value]":"","search[regex]":"false",
      CompanyIdFilter:state.companyId,__RequestVerificationToken:token,
      IlkTarih:trDate(start),SonTarih:trDate(end)});
    if(source.kind==="invoice"){form.set("FaturaIlkTarihi",trDate(start));form.set("FaturaSonTarihi",trDate(end));}
    else {form.set("IrsaliyeIlkTarihi",trDate(start));form.set("IrsaliyeSonTarihi",trDate(end));}
    const response=await request(source.list,{method:"POST",headers:{
      Accept:"application/json","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
      Referer:REMOTE+pagePath,"X-Requested-With":"XMLHttpRequest"},body:form.toString()});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!Array.isArray(payload?.data))err("BELGE_LISTESI_YETKI_VEYA_FORMAT_HATASI");
    for(const row of payload.data){
      const sourceId=safe(row[source.idField]);
      if(!/^\d+$/.test(sourceId))continue;
      items.push({sourceId,sourceKey,kind:source.kind,direction:source.direction,
        no:safe(source.kind==="invoice"?row.FaturaNo:row.IrsaliyeNo),
        date:safe(source.kind==="invoice"?row.FaturaTarihiFormated:row.IrsaliyeTarihiFormated),
        company:safe(source.direction==="incoming"?(row.FirmaAdi||row.AliciAdi):row.AliciAdi),
        amount:safe(source.kind==="invoice"?row.OdenecekTutarFormatted:""),
        status:safe(row.DurumAdi||row.GonderimDurumAdi),uuid:safe(row.Ettn||row.ETTN||row.UUID),
        scenario:safe(row.SenaryoAdi),subtype:safe(source.kind==="invoice"?row.FaturaTipiAdi:row.IrsaliyeTipiAdi)});
    }
    if(payload.data.length<50)break;
  }
  state.documents=items;
  return items;
}
async function downloadDocument(sourceId,sourceKey,format) {
  if(!state.connected||!state.documents.some(d=>d.sourceId===sourceId && d.sourceKey===sourceKey))err("ONCE_BELGEYI_LISTELEYIN");
  if(format!=="xml"&&format!=="pdf")err("DOSYA_FORMATI_GECERSIZ");
  const source=selectedSource(sourceKey);
  const entity=source.kind==="invoice"?"Invoice":"Despatch";
  const url="/"+entity+"/Get"+entity+(format==="xml"?"Xml":"Pdf")+"?InOrOut="+(source.direction==="incoming"?"true":"false")+"&"+entity+"Id="+encodeURIComponent(sourceId);
  const response=await request(url,{headers:{Accept:format==="pdf"?"application/pdf,*/*":"application/xml,text/xml,*/*"}});
  if(!response.ok||response.status>=300||/NotAutorized/i.test(response.headers.get("content-disposition")||""))err("BELGE_DOSYA_YETKISI_VEYA_OTURUM_HATASI");
  const limit=12*1024*1024;
  if(Number(response.headers.get("content-length")||0)>limit)err("DOSYA_COK_BUYUK");
  const reader=response.body?.getReader();
  if(!reader)err("BOS_DOSYA");
  const chunks=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>limit){await reader.cancel();err("DOSYA_COK_BUYUK");}chunks.push(Buffer.from(value));}
  }finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks);
  if(!bytes.length)err("BOS_DOSYA");
  if(format==="pdf"){
    if(!bytes.subarray(0,5).equals(Buffer.from("%PDF-")))err("PDF_YERINE_PORTAL_YANITI");
  }else{
    const value=bytes.toString("utf8").replace(/^\uFEFF/,"").trimStart();
    const root=source.kind==="invoice"?"Invoice":"DespatchAdvice";
    const rootRe=new RegExp("<(?:[\\w.-]+:)?"+root+"\\b");
    if(/<!DOCTYPE|<!ENTITY|<html\b/i.test(value)||!rootRe.test(value))err("XML_YERINE_PORTAL_YANITI");
  }
  return bytes;
}

const html="<!DOCTYPE html>\n<html lang=\"tr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>KY ERP · İşNet Drive Arşivi</title>\n<style>\n*{box-sizing:border-box}body{font:14px system-ui;background:#f3f6fb;color:#182c46;margin:0;padding:16px}main{max-width:1150px;margin:auto}\nh1{font-size:23px;margin:8px 0}h2{font-size:16px;margin:0 0 12px}\nsection{background:#fff;border:1px solid #dbe3ef;border-radius:13px;margin:12px 0;padding:16px}\nsmall,.hint{color:#596e84}input,select{padding:10px;border:1px solid #bfcbdc;border-radius:8px;background:white;min-height:41px;font:inherit;width:100%}\nbutton{padding:10px 14px;border:1px solid #184c8d;border-radius:8px;background:#194e8d;color:white;min-height:41px;cursor:pointer;font-weight:600}button:disabled{opacity:.5;cursor:wait}\nbutton.alt{background:#fff;color:#17487f}\n.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-items:end}\nlabel{display:grid;gap:5px;font-size:12px;font-weight:600}\n.head{display:flex;gap:15px;justify-content:space-between;align-items:center;flex-wrap:wrap}.tag{background:#e5f6ec;color:#216141;border-radius:30px;padding:7px 11px;font-size:12px}\n.table{overflow:auto;max-height:55vh}table{width:100%;border-collapse:collapse;min-width:850px;font-size:12px}\ntd,th{padding:10px;border-bottom:1px solid #e3e8f0;text-align:left}th{position:sticky;top:0;background:#f5f8fd}td button{padding:7px;font-size:12px;min-height:34px}\n#status{white-space:pre-wrap;padding:13px;border:1px solid #cfdaea;background:#f7f9fd;border-radius:8px;margin-top:10px}\ncode{overflow-wrap:anywhere}.note{margin:0 0 8px;font-size:12px;color:#566b81}\n@media(max-width:620px){main{max-width:100%}h1{font-size:19px}.grid{grid-template-columns:1fr}section{padding:12px}}\n</style></head><body><main>\n<header class=\"head\"><div><h1>İşNet → Google Drive · Tek Belge Arşivi</h1><p class=\"hint\">Gelen/giden fatura ve irsaliye · Orijinal XML + PDF · Tek fiziksel kopya</p></div><span class=\"tag\">Yalnız DESEN · Yerel bağlantı</span></header>\n<section><h2>Arşiv hedefi</h2><code id=\"archiveRoot\">Klasör doğrulanıyor...</code>\n<p class=\"note\">Google Drive'ın zaten eşitlediği yerel klasöre yazar. Tarayıcının İndirilenler klasörüne ikinci kopya indirmez. Şifre/cookie Drive'a yazılmaz.</p></section>\n<section><h2>1 · İşNet hesabı</h2><form id=\"login\" class=\"grid\">\n<label>Kullanıcı / TCKN <input name=\"username\" autocomplete=\"username\" required></label>\n<label>Portal şifresi <input name=\"password\" type=\"password\" autocomplete=\"off\" required></label>\n<button type=\"submit\">Giriş ve Firmaları Getir</button></form>\n<div style=\"margin-top:12px\"><form id=\"company\" class=\"grid\"><label>Yetkili firma\n<select id=\"companies\" name=\"id\"><option value=\"\">Önce bağlanın</option></select></label>\n<button type=\"submit\" class=\"alt\">Firma Oturumunu Aç</button></form></div></section>\n<section><h2>2 · Belge dönemi ve arşiv</h2>\n<form id=\"query\" class=\"grid\">\n<label>Belge yönü / türü<select name=\"sourceKey\">\n<option value=\"incoming_invoice\">Gelen e-Fatura</option>\n<option value=\"outgoing_invoice\">Giden e-Fatura</option>\n<option value=\"incoming_dispatch\">Gelen e-İrsaliye</option>\n<option value=\"outgoing_dispatch\">Giden e-İrsaliye</option></select></label>\n<label>Başlangıç <input type=\"date\" name=\"start\" required></label>\n<label>Bitiş <input type=\"date\" name=\"end\" required></label>\n<button type=\"submit\">Belge Listesini Getir</button></form>\n<div class=\"head\" style=\"margin-top:12px\"><p class=\"note\">Dört türün tamamını bir işlemde tarayabilir, aynı dosyaları ikinci kez kaydetmeden arşivleyebilirsin. Sadece salt-okunur portal çağrıları yapılır.</p>\n<button type=\"button\" id=\"bulk\" disabled>Dört Türü Arşivle · XML + PDF</button><button type=\"button\" id=\"stop\" class=\"alt\" disabled>Durdur</button></div>\n<div class=\"table\"><table><thead><tr><th>Tarih</th><th>Belge no</th><th>Firma</th><th>Tutar</th><th>Portal durumu</th><th>Arşiv</th></tr></thead><tbody id=\"results\"></tbody></table></div></section>\n<section><div class=\"head\"><h2>3 · İşlem ve hata durumu</h2><button type=\"button\" id=\"clear\" class=\"alt\">Oturumu Temizle</button></div>\n<div id=\"status\" role=\"status\">Hazır. İşNet hesabına henüz bağlanılmadı.</div>\n<p class=\"note\">Yerel arşiv oluşturma ve XML analizi aktiftir. KY ERP D1/Belge Havuzu bağlantısı ayrı yetkili File Hub kabulü gerektirir; bu ekran mali kayıt veya resmî gönderim yapmaz.</p></section>\n</main>\n<script>\nconst csrf=\"{{CSRF}}\";\nconst status=document.querySelector(\"#status\"),tbody=document.querySelector(\"#results\");\nconst form=document.querySelector(\"#query\"),bulk=document.querySelector(\"#bulk\"),stop=document.querySelector(\"#stop\");\nlet docs=[],stopped=false,bulkBusy=false;\nconst now=new Date();form.elements.end.value=now.toISOString().slice(0,10);now.setDate(now.getDate()-7);form.elements.start.value=now.toISOString().slice(0,10);\nasync function api(path,body) {\n const res=await fetch(path,{method:\"POST\",headers:{\"content-type\":\"application/json\",\"x-ky-csrf\":csrf},body:JSON.stringify(body)});\n const obj=await res.json().catch(()=>({error:\"PORTAL_CEVABI_OKUNAMADI\"}));\n if(!res.ok)throw Error(obj.error||\"PORTAL_ISLEM_HATASI\");\n return obj;\n}\nfunction info(msg){status.textContent=msg}\nfunction resetRows(){docs=[];tbody.replaceChildren();bulk.disabled=false}\nasync function query(sourceKey,page=0){\n const {start,end}=form.elements;\n return api(\"/documents\",{start:start.value,end:end.value,sourceKey,page});\n}\nasync function saveOne(doc){\n const out=await api(\"/archive\",{id:doc.sourceId,sourceKey:doc.sourceKey});\n return out;\n}\nasync function run(task){try{await task()}catch(e){info(\"HATA: \"+e.message)}}\ndocument.querySelector(\"#login\").onsubmit=e=>{e.preventDefault();void run(async()=>{\n const f=new FormData(e.target);const result=await api(\"/login\",Object.fromEntries(f));\n e.target.elements.password.value=\"\";\n const sel=document.querySelector(\"#companies\");sel.replaceChildren();\n const placeholder=document.createElement(\"option\");placeholder.value=\"\";placeholder.textContent=\"Firma seçin\";sel.append(placeholder);\n result.companies.forEach(c=>{const o=document.createElement(\"option\");o.value=c.id;o.textContent=c.name;sel.append(o)});\n info(result.companies.length+\" yetkili firma listelendi.\");\n})};\ndocument.querySelector(\"#company\").onsubmit=e=>{e.preventDefault();void run(async()=>{\n const sel=document.querySelector(\"#companies\");if(!sel.value)throw Error(\"ONCE_FIRMA_SECIN\");\n await api(\"/company\",{id:sel.value,name:sel.selectedOptions[0].textContent});\n info(\"Firma oturumu açıldı. Belgeleri listeleyebilir ve doğrudan Google Drive klasörüne arşivleyebilirsin.\");\n})};\nfunction display(rows){\n tbody.replaceChildren();docs=rows;bulk.disabled=bulkBusy;\n for(const d of rows){\n  const tr=document.createElement(\"tr\");\n  for(const f of [\"date\",\"no\",\"company\",\"amount\",\"status\"]){let td=document.createElement(\"td\");td.textContent=d[f]||\"—\";tr.append(td)}\n  const cell=document.createElement(\"td\"),btn=document.createElement(\"button\");\n  btn.textContent=\"XML + PDF Arşivle\";btn.type=\"button\";\n  btn.onclick=()=>run(async()=>{btn.disabled=true;info(d.no+\" arşive alınıyor...\");\n    try{const r=await saveOne(d);btn.textContent=r.status===\"XML_PDF\"?\"Arşivde · XML+PDF\":\"XML hazır · PDF eksik\";info(r.status+\" · \"+r.directory)}\n    finally{btn.disabled=false}});\n  cell.append(btn);tr.append(cell);tbody.append(tr);\n }\n}\nform.onsubmit=e=>{e.preventDefault();void run(async()=>{\n info(\"Belgeler sorgulanıyor...\");const res=await query(form.elements.sourceKey.value,0);display(res.documents);\n info(res.documents.length+\" belge listelendi. Tek belge için XML + PDF Arşivle; dört tür için toplu arşivi seç.\");\n})};\nstop.onclick=()=>{stopped=true;info(\"Mevcut dosya işlemi bitince durdurulacak.\")};\nbulk.onclick=()=>void run(async()=>{\n if(bulkBusy)return;\n bulkBusy=true;stopped=false;bulk.disabled=true;stop.disabled=false;form.querySelector(\"button\").disabled=true;\n let good=0,partial=0,failed=0;\n try {\n  for(const sourceKey of [\"incoming_invoice\",\"outgoing_invoice\",\"incoming_dispatch\",\"outgoing_dispatch\"]){\n   if(stopped)break;\n   for(let page=0;page<20&&!stopped;page++){\n    const res=await query(sourceKey,page);\n    if(!Array.isArray(res.documents))throw Error(\"BELGE_LISTESI_BOS_YANIT\");\n    info(sourceKey+\" · \"+(page+1)+\". sayfa · \"+res.documents.length+\" belge.\");\n    for(const [idx,d] of res.documents.entries()){\n     if(stopped)break;\n     info(sourceKey+\" · \"+(page*50+idx+1)+\". belge · \"+d.no+\" · Arşivleniyor...\");\n     try{const out=await saveOne(d);if(out.status===\"XML_PDF\")good++;else partial++}\n     catch(e){failed++;info(\"HATA: \"+sourceKey+\"/\"+d.no+\" · \"+e.message);}\n    }\n    if(res.documents.length<50)break;\n   }\n  }\n  info((stopped?\"DURDURULDU · \":\"BİTTİ · \")+\"XML+PDF: \"+good+\" · PDF eksik: \"+partial+\" · Hata: \"+failed+\". Orijinaller tek Google Drive klasöründe.\");\n } finally{bulkBusy=false;bulk.disabled=false;stop.disabled=true;form.querySelector(\"button\").disabled=false;}\n});\ndocument.querySelector(\"#clear\").onclick=()=>void run(async()=>{stopped=true;await api(\"/clear\",{});resetRows();info(\"Portal oturumu ve şifre bellekten silindi. Arşivdeki belgeler korunur.\")});\nvoid fetch(\"/health\",{cache:\"no-store\"}).then(x=>x.json()).then(data=>{document.querySelector(\"#archiveRoot\").textContent=data.archiveRoot}).catch(()=>{document.querySelector(\"#archiveRoot\").textContent=\"Hedef arşiv doğrulanamadı\"});\n</script></body></html>".replace("{{CSRF}}",csrf);

function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data));}
async function readBody(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)err("ISTEK_COK_BUYUK");chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString("utf8"))}catch{err("GECERSIZ_JSON")}}
const server=createServer(async(req,res)=>{
  if(req.socket.remoteAddress!=="127.0.0.1"&&req.socket.remoteAddress!=="::ffff:127.0.0.1")return json(res,403,{error:"YEREL_ERISIM"});
  if(req.method==="GET"&&req.url==="/health")return json(res,200,{ready:state.connected,archiveRoot:resolve(ARCHIVE_ROOT)});
  if(req.method==="GET"&&req.url==="/"){res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-frame-options":"DENY","content-security-policy":"default-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'"});return res.end(html);}
  if(req.method!=="POST"||!["/login","/company","/documents","/archive","/clear"].includes(req.url))return json(res,404,{error:"BULUNAMADI"});
  if(req.headers["x-ky-csrf"]!==csrf||!["http://127.0.0.1:"+PORT,undefined].includes(req.headers.origin))return json(res,403,{error:"YETKISIZ_ISTEK"});
  try{
    const body=await readBody(req);
    if(req.url==="/clear"){reset();return json(res,200,{ok:true});}
    if(req.url==="/login"){const companies=await loginStep(safe(body.username),safe(body.password));return json(res,200,{companies});}
    if(req.url==="/company"){await chooseCompany(safe(body.id),safe(body.name));return json(res,200,{message:"Firma oturumu açıldı"});}
    if(req.url==="/documents"){const documents=await listDocuments(safe(body.start),safe(body.end),safe(body.sourceKey),Number(body.page||0));return json(res,200,{documents});}
    if(req.url==="/archive"){
      const id=safe(body.id),sourceKey=safe(body.sourceKey);
      const doc=state.documents.find(d=>d.sourceId===id&&d.sourceKey===sourceKey);
      if(!state.connected||!doc)err("BELGE_ONCE_LISTELENMELI");
      const xml=await downloadDocument(id,sourceKey,"xml");
      let pdf=null,pdfError=null;
      try{pdf=await downloadDocument(id,sourceKey,"pdf");}
      catch{pdfError="PDF_ALINAMADI";}
      const result=await archiveOriginals({root:ARCHIVE_ROOT,document:doc,companyId:state.companyId,xml,pdf,pdfError});
      return json(res,200,result);
    }

  }catch(e){return json(res,400,{error:e?.safeCode||"PORTAL_BAGLANTISI_HATASI"});}
});
await stat(ARCHIVE_ROOT).then(x=>{if(!x.isDirectory())throw Error("ARCHIVE_NOT_DIRECTORY");});
server.listen(PORT,HOST,()=>console.log("KY ERP İşNet Drive Arşiv: http://"+HOST+":"+PORT+" | ROOT="+resolve(ARCHIVE_ROOT)));
process.on("SIGINT",()=>{reset();server.close(()=>process.exit(0));});
