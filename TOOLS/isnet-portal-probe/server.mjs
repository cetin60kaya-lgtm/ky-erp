// Isolated, local-only NetteFatura portal proof-of-concept. Node >= 22; no dependencies.
// No ERP writes, no automatic downloads, no credential persistence.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || "8787");
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
async function listInvoices(start,end) {
  if(!state.connected) err("FIRMA_SECIN");
  range(start,end);
  const pagePath="/IncomingInvoice/IncomingInvoiceList?minDate="+encodeURIComponent(start);
  const page=await request(pagePath);
  const token=verification(await page.text());
  if(!page.ok||!token) err("FATURA_SAYFASI_ACILAMADI");
  const result=[];
  for(let offset=0;offset<200;offset+=50) {
    const body=new URLSearchParams({
      draw:"1",start:String(offset),length:"50","search[value]":"","search[regex]":"false",
      CompanyIdFilter:state.companyId,__RequestVerificationToken:token,
      IlkTarih:trDate(start),SonTarih:trDate(end),FaturaIlkTarihi:trDate(start),FaturaSonTarihi:trDate(end)
    });
    const response=await request("/IncomingInvoice/AllIncomingInvoiceByFilter",{method:"POST",headers:{
      Accept:"application/json","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
      Referer:REMOTE+pagePath,"X-Requested-With":"XMLHttpRequest"
    },body:body.toString()});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!Array.isArray(payload?.data))err("FATURA_LISTESI_ALINAMADI");
    for(const row of payload.data){
      const sourceId=safe(row.IdFaturaGelen);
      if(!/^\d+$/.test(sourceId))continue;
      result.push({sourceId,no:safe(row.FaturaNo),date:safe(row.FaturaTarihiFormated),
        company:safe(row.FirmaAdi||row.AliciAdi),amount:safe(row.OdenecekTutarFormatted),uuid:safe(row.Ettn||row.ETTN||row.UUID)});
    }
    if(payload.data.length<50)break;
  }
  state.documents=result;
  return result;
}
async function downloadXml(sourceId) {
  if(!state.connected || !state.documents.some(d=>d.sourceId===sourceId))err("ONCE_LISTEDEN_FATURA_SECIN");
  const res=await request("/Invoice/GetInvoiceXml?InOrOut=true&InvoiceId="+encodeURIComponent(sourceId),{headers:{Accept:"application/xml,text/xml,*/*"}});
  if(!res.ok||res.status>=300)err("XML_INDIRME_YETKISI_VEYA_OTURUM_HATASI");
  const size=Number(res.headers.get("content-length")||0);
  if(size>MAX_XML)err("XML_COK_BUYUK");
  const raw=Buffer.from(await res.arrayBuffer());
  if(!raw.length||raw.length>MAX_XML)err("XML_BOYUT_GECERSIZ");
  const xml=raw.toString("utf8").replace(/^\uFEFF/,"").trimStart();
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)||!/^<\?xml\b|^<(?:[\w.-]+:)?Invoice\b/.test(xml) || !/<(?:[\w.-]+:)?Invoice\b/.test(xml)
    || /<html\b/i.test(xml))err("XML_YERINE_PORTAL_YANITI");
  return raw;
}
const html=`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KY ERP · İşNet Portal XML Testi</title>
<style>body{font:15px system-ui;background:#f4f6fa;color:#17233c;margin:0;padding:25px}main{max-width:860px;margin:auto}section{background:white;padding:20px;margin:16px 0;border-radius:13px;border:1px solid #dae0e9}input,select,button{font:inherit;padding:10px;margin:5px;border:1px solid #bcc7d7;border-radius:8px}button{background:#173f79;color:white;cursor:pointer}button:disabled{background:#9aa6b7}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:9px;border-bottom:1px solid #e2e6ed;text-align:left}#status{white-space:pre-wrap}small{color:#51627c}</style>
<main><h2>İşNet NetteFatura · XML Bağlantı Testi</h2><small>Yalnız bu bilgisayarda çalışır. Şifre dosyaya kaydedilmez. KY ERP canlı verisine dokunmaz.</small>
<section><h3>1. Portal hesabı</h3><form id="login"><input name="username" autocomplete="username" placeholder="İşNet kullanıcı adı / VKN" required><input name="password" type="password" autocomplete="off" placeholder="Şifre" required><button>Giriş ve firmaları sorgula</button></form></section>
<section><h3>2. Firma seç</h3><form id="company"><select name="id" id="companies"><option value="">Önce giriş yapın</option></select><button>Firma oturumu aç</button></form></section>
<section><h3>3. Gelen e-Faturalar</h3><form id="invoices"><input name="start" type="date" required><input name="end" type="date" required><button>Sonuçları getir</button></form><div style="overflow-x:auto"><table><thead><tr><th>Tarih</th><th>Fatura</th><th>Tedarikçi</th><th>Tutar</th><th>XML</th></tr></thead><tbody id="results"></tbody></table></div></section>
<section><b>Test sonucu:</b><div id="status">Hazır. Gerçek portala henüz bağlanılmadı.</div><button id="clear" type="button">Oturumu temizle</button></section>
</main><script>
const csrf=${JSON.stringify(csrf)};
const status=document.querySelector("#status");
const today=new Date();document.querySelector('[name=end]').value=today.toISOString().slice(0,10);today.setDate(today.getDate()-7);document.querySelector('[name=start]').value=today.toISOString().slice(0,10);
async function api(path,data){const res=await fetch(path,{method:"POST",headers:{"content-type":"application/json","x-ky-csrf":csrf},body:JSON.stringify(data)});const obj=await res.json();if(!res.ok)throw Error(obj.error||"İşlem başarısız");return obj}
async function run(task){status.textContent="İşlem yürütülüyor...";try{await task()}catch(e){status.textContent="HATA: "+e.message}}
document.querySelector("#login").onsubmit=e=>{e.preventDefault();run(async()=>{const f=new FormData(e.target);const r=await api("/login",Object.fromEntries(f));e.target.elements.password.value="";const sel=document.querySelector("#companies");sel.innerHTML='<option value="">Firma seçin</option>';r.companies.forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=x.name;sel.append(o)});status.textContent=r.companies.length+" yetkili firma bulundu."})};
document.querySelector("#company").onsubmit=e=>{e.preventDefault();run(async()=>{const sel=document.querySelector("#companies");const r=await api("/company",{id:sel.value,name:sel.selectedOptions[0]?.textContent});status.textContent=r.message})};
document.querySelector("#invoices").onsubmit=e=>{e.preventDefault();run(async()=>{const r=await api("/invoices",Object.fromEntries(new FormData(e.target)));const tbody=document.querySelector("#results");tbody.replaceChildren();r.documents.forEach(doc=>{const tr=document.createElement("tr");for(const field of ["date","no","company","amount"]){const td=document.createElement("td");td.textContent=doc[field]||"—";tr.append(td)}const cell=document.createElement("td"),btn=document.createElement("button");btn.textContent="XML indir";btn.onclick=async()=>{status.textContent="XML alınıyor...";try{const resp=await fetch("/xml",{method:"POST",headers:{"content-type":"application/json","x-ky-csrf":csrf},body:JSON.stringify({id:doc.sourceId})});if(!resp.ok){const o=await resp.json();throw Error(o.error)}const blob=await resp.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=(doc.no||"gelen-fatura").replace(/[^a-zA-Z0-9_-]/g,"_")+".xml";a.click();URL.revokeObjectURL(url);status.textContent="XML alındı: "+doc.no+" ("+blob.size+" bayt)."}catch(e){status.textContent="HATA: "+e.message}};cell.append(btn);tr.append(cell);tbody.append(tr)});status.textContent=r.documents.length+" gelen fatura listelendi (ilk 200 kayıt sınırı)."})};
document.querySelector("#clear").onclick=()=>run(async()=>{await api("/clear",{});document.querySelector("#results").replaceChildren();status.textContent="Oturum ve şifre bellekten temizlendi."});
</script></html>`;
function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data));}
async function readBody(req) {
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>4096)err("ISTEK_COK_BUYUK");chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"))}catch{err("GECERSIZ_JSON")}
}
const server=createServer(async(req,res)=>{
  if(req.socket.remoteAddress!=="127.0.0.1" && req.socket.remoteAddress!=="::ffff:127.0.0.1")return json(res,403,{error:"YEREL_ERISIM"});
  if(req.method==="GET" && req.url==="/"){res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-frame-options":"DENY","content-security-policy":"default-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'"});return res.end(html)}
  if(req.method!=="POST" || !["/login","/company","/invoices","/xml","/clear"].includes(req.url))return json(res,404,{error:"BULUNAMADI"});
  if(req.headers["x-ky-csrf"]!==csrf || !["http://127.0.0.1:"+PORT,undefined].includes(req.headers.origin))return json(res,403,{error:"YETKISIZ_ISTEK"});
  try{
    const body=await readBody(req);
    if(req.url==="/clear"){reset();return json(res,200,{ok:true})}
    if(req.url==="/login"){const companies=await loginStep(safe(body.username),safe(body.password));return json(res,200,{companies})}
    if(req.url==="/company"){await chooseCompany(safe(body.id),safe(body.name));return json(res,200,{message:"Firma oturumu açıldı. Gelen faturaları sorgulayabilirsiniz."})}
    if(req.url==="/invoices"){const documents=await listInvoices(safe(body.start),safe(body.end));return json(res,200,{documents})}
    if(req.url==="/xml"){const raw=await downloadXml(safe(body.id));res.writeHead(200,{"content-type":"application/xml; charset=utf-8","content-disposition":"attachment; filename=gelen-fatura.xml","cache-control":"no-store","x-content-type-options":"nosniff"});return res.end(raw)}
  }catch(e){return json(res,400,{error:e?.safeCode||"PORTAL_BAGLANTISI_HATASI"})}
});
server.listen(PORT,HOST,()=>{console.log("İşNet izole test: http://"+HOST+":"+PORT);});
process.on("SIGINT",()=>{reset();server.close(()=>process.exit(0));});
