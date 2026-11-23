// Isolated, local-only NetteFatura portal proof-of-concept. Node >= 22; no dependencies.
// No ERP writes or forced downloads. Optional credential protection uses the current Windows user DPAPI vault.
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink, readdir } from "node:fs/promises";
import { join, isAbsolute, dirname } from "node:path";
import {runIsnetArchiveSync,splitDateWindows} from "./sync-core.mjs";
import {requireAuthorizedIsnetCompany} from "./isnet-company-selection.mjs";
import {windowsIsnetCredential} from "./isnet-windows-vault.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || "8791");
const ARCHIVE_ROOT = process.env.KY_ISNET_ARCHIVE_ROOT || "";
if (!ARCHIVE_ROOT || !isAbsolute(ARCHIVE_ROOT)) throw Error("KY_ISNET_ARCHIVE_ROOT_ABSOLUTE_PATH_REQUIRED");
const REMOTE = "https://nettefatura.isnet.net.tr";
const MAX_XML = 8 * 1024 * 1024;
const csrf = randomBytes(24).toString("hex");
let state = { username: "", password: "", companies: [], rememberPassword: false, companyId: "", companyName: "", connected: false, documents: [], jar: new Map() };

function reset() {
  state = { username: "", password: "", companies: [], rememberPassword: false, companyId: "", companyName: "", connected: false, documents: [], jar: new Map() };
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
  // An ordinary NetteFatura login in another browser can invalidate this
  // isolated session. Never silently log in again and evict the active browser.
  const redirectPath=String(response.headers.get("location")||"");
  if(state.connected && (response.status===401 || response.status===403 ||
      (response.status>=300 && response.status<400 &&
       redirectPath.toLowerCase().startsWith("/account/login"))){
    state.connected=false;
    state.documents=[];
    syncJob.monitor=false;
    if(monitorTimer){clearTimeout(monitorTimer);monitorTimer=null;}
    err("ISNET_OTURUM_SONA_ERDI");
  }
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
async function loginStep(username,password,rememberPassword=false) {
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
  state.username=username;state.password=password;state.companies=companies;state.rememberPassword=rememberPassword===true;
  return companies;
}
async function chooseCompany(id,name) {
  if (!state.username || !state.password) err("ONCE_GIRIS_YAPIN");
  if(!requireAuthorizedIsnetCompany(state.companies,id,name))err("YETKISIZ_FIRMA_SECIMI");
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
  let passwordSaved=false;
  if(state.rememberPassword) {
    try { passwordSaved=await windowsIsnetCredential("save",state.username,state.password); }
    catch { passwordSaved=false; }
  }
  state.password="";state.rememberPassword=false;
  return {passwordSaved};
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
async function listDocuments(start,end,sourceKey) {
  if(!state.connected)err("FIRMA_SECIN");
  range(start,end);
  const source=selectedSource(sourceKey);
  const pagePath=source.page+(sourceKey==="outgoing_dispatch"?"":"?minDate="+encodeURIComponent(start));
  const page=await request(pagePath);
  const token=verification(await page.text());
  if(!page.ok||!token)err("BELGE_SAYFASI_VEYA_CSRF_HATASI");
  const items=[];
  for(let offset=0;offset<200;offset+=50){
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
  if(items.length>=200)err("200_KAYIT_SINIRI_TARIH_ARALIGINI_DARALTIN");
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


// Existing 101-document archive keeps its historical on-disk folder names.
// New corporate e-Belgeler roots use the same four human-facing folder names
// as KY ERP; this never silently migrates or duplicates old documents.
const corporateLayout=/(?:^|[\\/])e-Belgeler[\\/]?$/i.test(ARCHIVE_ROOT);
const FOLDERS=Object.freeze(corporateLayout ? {
  incoming_invoice:"Gelen e-Fatura", outgoing_invoice:"Giden e-Fatura",
  incoming_dispatch:"Gelen e-İrsaliye", outgoing_dispatch:"Giden e-İrsaliye"
} : {
  incoming_invoice:"GELEN-FATURA", outgoing_invoice:"GIDEN-FATURA",
  incoming_dispatch:"GELEN-IRSALIYE", outgoing_dispatch:"GIDEN-IRSALIYE"
});
const cleanName=(value)=>safe(value).normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").replace(/[. ]+$/g,"").slice(0,100)||"BELGE";
const sha256=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const archivedAt=()=>new Date().toISOString();
function archiveLocation(document) {
  if(!FOLDERS[document.sourceKey]||!/^\d+$/.test(document.sourceId))err("GECERSIZ_BELGE_KIMLIGI");
  const dateMatch=safe(document.date).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  const year=dateMatch?.[3] || "TARIH_YOK";
  const month=dateMatch?.[2] || "00";
  if(!state.companyId || !state.companyName)err("FIRMA_OTURUMU_SECILMEDI");
  const companyFolder=cleanName(state.companyName)+"_"+cleanName(state.companyId);
  const dir=join(ARCHIVE_ROOT,FOLDERS[document.sourceKey],companyFolder,year,month,cleanName(document.no)+"_"+document.sourceId);
  return {dir,stem:cleanName(document.no||document.sourceId)};
}
async function saveOriginal(document,format,bytes) {
  const {dir,stem}=archiveLocation(document);
  await mkdir(dir,{recursive:true});
  const destination=join(dir,stem+"."+format);
  const digest=sha256(bytes);
  let prior=null;
  try {prior=await readFile(destination);}catch(e){if(e.code!=="ENOENT")throw e;}
  if(prior) {
    if(sha256(prior)!==digest)err("ARŞİVDE_FARKLI_ORİJİNAL_VAR_INCELEYIN");
    return {relativePath:destination.slice(ARCHIVE_ROOT.length+1),bytes:bytes.length,sha256:digest,reused:true};
  }
  // A partial file is never published under the final XML/PDF name.
  // No overwrite of existing originals: conflicting content requires manual review.
  const temporary=destination+".partial-"+randomBytes(6).toString("hex");
  try {
    await writeFile(temporary,bytes,{flag:"wx"});
    const stored=await readFile(temporary);
    if(sha256(stored)!==digest)err("YAZILAN_DOSYA_HASH_HATASI");
    let current=null;
    try{current=await readFile(destination);}catch(e){if(e.code!=="ENOENT")throw e;}
    if(current){if(sha256(current)!==digest)err("ARŞİVDE_FARKLI_ORİJİNAL_VAR_INCELEYIN");}
    else await rename(temporary,destination);
  }finally{
    await unlink(temporary).catch(e=>{if(e.code!=="ENOENT")throw e;});
  }
  return {relativePath:destination.slice(ARCHIVE_ROOT.length+1),bytes:bytes.length,sha256:digest,reused:false};
}
async function writeManifest(document,result){
  const {dir}=archiveLocation(document);
  await mkdir(dir,{recursive:true});
  const manifest=join(dir,"belge-kayit.json");
  let previous={};
  try {previous=JSON.parse(await readFile(manifest,"utf8"));}catch(e){if(e.code!=="ENOENT"&&!(e instanceof SyntaxError))throw e;}
  const contents={
    schema:"KY_ISNET_ORIGINAL_ARCHIVE_V1",sourceKey:document.sourceKey,sourceId:document.sourceId,
    documentNo:document.no,uuid:document.uuid||"",date:document.date||"",
    kind:document.kind,direction:document.direction,company:document.company||"",
    lastCheckedAt:archivedAt(),xml:result.xml||previous.xml||null,pdf:result.pdf||previous.pdf||null,
    errors:result.errors,
    review:result.review||previous.review||null,
  };
  const temporary=manifest+".partial-"+randomBytes(6).toString("hex");
  try {await writeFile(temporary,JSON.stringify(contents,null,2),{flag:"wx"});await rename(temporary,manifest);}
  finally{await unlink(temporary).catch(e=>{if(e.code!=="ENOENT")throw e;});}
}

const PDF_REVIEW_CODE="PDF_SURUM_FARKI_INCELEME";
const legacyPdfConflict=(v)=>String(v||"").includes("ARŞİVDE_FARKLI_ORİJİNAL_VAR_INCELEYIN") ||
  String(v||"").includes(PDF_REVIEW_CODE);
const pendingPdfReview=(manifest)=>manifest?.review?.status==="PENDING" ||
  (Array.isArray(manifest?.errors)&&manifest.errors.some(legacyPdfConflict));
async function readDocumentManifest(doc){
  const {dir,stem}=archiveLocation(doc);
  let manifest=null;
  try{manifest=JSON.parse(await readFile(join(dir,"belge-kayit.json"),"utf8"))}
  catch(e){if(e.code==="ENOENT")return {dir,stem,manifest:null};if(e instanceof SyntaxError)err("ARSIV_MANIFEST_BICIM_HATASI");throw e;}
  if(manifest.sourceKey!==doc.sourceKey || String(manifest.sourceId)!==String(doc.sourceId) ||
    String(manifest.documentNo)!==String(doc.no))err("ARSIV_BELGE_KIMLIGI_CAKISMASI");
  return {dir,stem,manifest};
}
async function verifyOriginalFiles(dir,stem,manifest){
  if(!manifest?.xml?.sha256||!manifest?.pdf?.sha256)return false;
  try{
    const [xml,pdf]=await Promise.all([readFile(join(dir,stem+".xml")),readFile(join(dir,stem+".pdf"))]);
    if(!pdf.subarray(0,5).equals(Buffer.from("%PDF-")))return false;
    return sha256(xml)===manifest.xml.sha256 && sha256(pdf)===manifest.pdf.sha256;
  }catch(e){if(e.code==="ENOENT")return false;throw e;}
}
async function alreadyArchived(doc){
  const {dir,stem,manifest}=await readDocumentManifest(doc);
  if(!manifest||!(await verifyOriginalFiles(dir,stem,manifest)))return null;
  const review=pendingPdfReview(manifest);
  // Historical PDF conflict stays visible, but does NOT trigger endless redownloads.
  return {documentNo:doc.no,sourceKey:doc.sourceKey,xmlSaved:true,pdfSaved:true,
    xmlReused:true,pdfReused:true,reviewPending:review,reviewCandidates:manifest.review?.candidates?.length||0,
    errors:review?[PDF_REVIEW_CODE]:[]};
}
// A portal-rendered PDF may differ in metadata between requests. Never replace
// the first verified original. Save the competing byte stream under a unique hash,
// retain a single review record, and never silently call it legally equivalent.
async function preservePdfAlternative(doc,bytes){
  if(!bytes.subarray(0,5).equals(Buffer.from("%PDF-")))err("PDF_ALTERNATIF_GECERSIZ");
  const {dir,stem,manifest}=await readDocumentManifest(doc);
  if(!manifest?.pdf?.sha256)err("PDF_ORIJINAL_METADATA_YOK");
  const original=await readFile(join(dir,stem+".pdf"));
  if(sha256(original)!==manifest.pdf.sha256)err("PDF_ORIJINAL_HASH_UYUSMAZLIGI");
  const digest=sha256(bytes);
  if(digest===manifest.pdf.sha256)return null;
  const reviews=Array.isArray(manifest.review?.candidates)?manifest.review.candidates:[];
  if(reviews.some(x=>x.sha256===digest))return reviews.find(x=>x.sha256===digest);
  if(reviews.length>=8)err("PDF_ALTERNATIF_LIMITI_INCELEME");
  const folder=join(dir,"_INCELEME");
  await mkdir(folder,{recursive:true});
  const fileName="PDF-ALTERNATIF-"+digest.slice(0,16)+".pdf";
  const destination=join(folder,fileName);
  let exists=false;
  try{
    const previous=await readFile(destination);
    if(sha256(previous)!==digest)err("PDF_ALTERNATIF_HASH_CAKISMASI");
    exists=true;
  }catch(e){if(e.code!=="ENOENT")throw e;}
  if(!exists){
    const temp=destination+".partial-"+randomBytes(6).toString("hex");
    try{
      await writeFile(temp,bytes,{flag:"wx"});
      if(sha256(await readFile(temp))!==digest)err("PDF_ALTERNATIF_YAZIM_HATASI");
      await rename(temp,destination);
    }finally{await unlink(temp).catch(e=>{if(e.code!=="ENOENT")throw e;});}
  }
  return {sha256:digest,bytes:bytes.length,fileName,detectedAt:archivedAt()};
}


async function scanPdfReviews(){
  if(!state.connected||!state.companyId)err("ONCE_FIRMA_OTURUMU_ACIN");
  const companyFolder=cleanName(state.companyName)+"_"+cleanName(state.companyId);
  const result=[];
  for(const sourceKey of Object.keys(FOLDERS)){
    const root=join(ARCHIVE_ROOT,FOLDERS[sourceKey],companyFolder);
    let names=[];
    try{names=await readdir(root,{recursive:true})}
    catch(e){if(e.code==="ENOENT")continue;throw e;}
    if(names.length>30000)err("INCELEME_DIZINI_COK_BUYUK");
    for(const relative of names){
      if(!relative.endsWith("belge-kayit.json"))continue;
      if(relative.split(/[\/\\]/).at(-1)!=="belge-kayit.json")continue;
      const file=join(root,relative);
      let manifest;
      try{manifest=JSON.parse(await readFile(file,"utf8"))}
      catch{continue}
      if(manifest?.sourceKey!==sourceKey||!/^\d+$/.test(String(manifest?.sourceId||""))||!pendingPdfReview(manifest))continue;
      const otherErrors=(manifest.errors||[]).filter(x=>!legacyPdfConflict(x));
      result.push({sourceKey,sourceId:String(manifest.sourceId),documentNo:String(manifest.documentNo||""),
        date:String(manifest.date||""),candidateCount:manifest.review?.candidates?.length||0,
        otherIssues:otherErrors.length,manifestFile:file,manifest});
      if(result.length>=200)return result;
    }
  }
  return result;
}
async function findPdfReview(sourceKey,sourceId){
  selectedSource(sourceKey);
  if(!/^\d+$/.test(String(sourceId)))err("BELGE_KIMLIGI_GECERSIZ");
  const reviews=await scanPdfReviews();
  const match=reviews.filter(x=>x.sourceKey===sourceKey&&x.sourceId===String(sourceId));
  if(match.length!==1)err("PDF_INCELEME_KAYDI_BULUNAMADI");
  return match[0];
}
async function previewPdfReview(sourceKey,sourceId,variant){
  if(!["original","alternative"].includes(variant))err("PDF_SURUM_SECIMI_GECERSIZ");
  const record=await findPdfReview(sourceKey,sourceId);
  const dir=dirname(record.manifestFile),stem=cleanName(record.documentNo),manifest=record.manifest;
  const candidate=manifest.review?.candidates?.at(-1);
  if(variant==="alternative"&&!candidate)err("PDF_ALTERNATIF_DOSYASI_YOK");
  const name=variant==="original"?stem+".pdf":"PDF-ALTERNATIF-"+String(candidate.sha256).slice(0,16)+".pdf";
  const path=variant==="original"?join(dir,name):join(dir,"_INCELEME",name);
  const bytes=await readFile(path);
  const wanted=variant==="original"?manifest.pdf?.sha256:candidate?.sha256;
  if(!wanted||sha256(bytes)!==wanted||!bytes.subarray(0,5).equals(Buffer.from("%PDF-")))err("PDF_ONIZLEME_HASH_KONTROLU_HATASI");
  return bytes;
}
async function recheckPortalPdfReview(sourceKey,sourceId){
  if(syncJob.running)err("SENKRONIZASYON_DEVAM_EDIYOR");
  const record=await findPdfReview(sourceKey,sourceId);
  const manifest=record.manifest;
  const date=String(record.date||"").match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if(!date)err("INCELEME_BELGESI_TARIHSIZ");
  const iso=date[3]+"-"+date[2]+"-"+date[1];
  const documents=await listDocuments(iso,iso,sourceKey);
  const doc=documents.find(d=>d.sourceId===String(sourceId)&&d.sourceKey===sourceKey);
  if(!doc||doc.no!==record.documentNo)err("PORTAL_BELGE_REFERANSI_DEGISTI");
  const {dir,stem}=archiveLocation(doc);
  if(!(await verifyOriginalFiles(dir,stem,manifest)))err("ORIJINAL_XML_PDF_HASH_KONTROLU_HATASI");
  const bytes=await downloadDocument(doc.sourceId,doc.sourceKey,"pdf");
  if(sha256(bytes)===manifest.pdf.sha256){
    await writeManifest(doc,{xml:null,pdf:null,errors:[],review:{
      ...manifest.review,status:"RESOLVED_PORTAL_MATCH",reason:PDF_REVIEW_CODE,
      resolvedAt:archivedAt(),confirmedOriginalSha256:manifest.pdf.sha256,
      candidates:manifest.review?.candidates||[]}});
    return {status:"PORTAL_PDF_AYNI",candidateCount:manifest.review?.candidates?.length||0};
  }
  const candidate=await preservePdfAlternative(doc,bytes);
  const existing=(await readDocumentManifest(doc)).manifest;
  const prior=Array.isArray(existing?.review?.candidates)?existing.review.candidates:[];
  const candidates=candidate&&!prior.some(x=>x.sha256===candidate.sha256)?[...prior,candidate]:prior;
  await writeManifest(doc,{xml:null,pdf:null,errors:[PDF_REVIEW_CODE],review:{
    status:"PENDING",reason:PDF_REVIEW_CODE,firstSeenAt:existing?.review?.firstSeenAt||archivedAt(),
    candidates}});
  return {status:"ALTERNATIF_PDF_SAKLANDI",candidateCount:candidates.length};
}

async function keepReviewedOriginal(sourceKey,sourceId){
  const record=await findPdfReview(sourceKey,sourceId);
  const manifest=record.manifest,dir=dirname(record.manifestFile);
  if((manifest.errors||[]).some(e=>!legacyPdfConflict(e)))err("BASKA_BELGE_HATASI_INCELEME_GEREKLI");
  if(!(await verifyOriginalFiles(dir,cleanName(record.documentNo),manifest)))err("ORIJINAL_XML_PDF_HASH_KONTROLU_HATASI");
  const contents={...manifest,lastCheckedAt:archivedAt(),errors:[],
    review:{...manifest.review,status:"RESOLVED_KEEP_ORIGINAL",
      reason:PDF_REVIEW_CODE,resolvedAt:archivedAt(),confirmedOriginalSha256:manifest.pdf.sha256,
      candidates:manifest.review?.candidates||[]}};
  const temp=record.manifestFile+".partial-"+randomBytes(6).toString("hex");
  try{
    await writeFile(temp,JSON.stringify(contents,null,2),{flag:"wx"});
    await rename(temp,record.manifestFile);
  }finally{await unlink(temp).catch(e=>{if(e.code!=="ENOENT")throw e;});}
  return {ok:true,reviewStatus:"RESOLVED_KEEP_ORIGINAL"};
}

let archiveBusy=false;
async function archiveListed(id,sourceKey) {
  if(archiveBusy)err("BIR_ISLEM_SURUYOR");
  const doc=state.documents.find(x=>x.sourceId===id&&x.sourceKey===sourceKey);
  if(!doc||!state.connected)err("ONCE_SECILI_BELGEYI_LISTELEYIN");
  archiveBusy=true;
  try{
    const existing=await alreadyArchived(doc);
    if(existing)return existing;
    const out={xml:null,pdf:null,errors:[],review:null};
    for(const format of ["xml","pdf"]){
      let bytes=null;
      try{
        bytes=await downloadDocument(id,sourceKey,format);
        out[format]=await saveOriginal(doc,format,bytes);
      }catch(e){
        if(format==="pdf"&&bytes&&e.safeCode==="ARŞİVDE_FARKLI_ORİJİNAL_VAR_INCELEYIN"){
          try{
            const candidate=await preservePdfAlternative(doc,bytes);
            const existing=(await readDocumentManifest(doc)).manifest;
            const prior=Array.isArray(existing?.review?.candidates)?existing.review.candidates:[];
            const candidates=candidate&& !prior.some(x=>x.sha256===candidate.sha256)?[...prior,candidate]:prior;
            out.review={status:"PENDING",firstSeenAt:existing?.review?.firstSeenAt||archivedAt(),
              candidates,reason:PDF_REVIEW_CODE};
            out.errors.push(PDF_REVIEW_CODE);
          }catch(stageError){
            out.errors.push("PDF:"+String(stageError.safeCode||"PDF_ALTERNATIF_ARSIV_HATASI"));
          }
        }else out.errors.push(format.toUpperCase()+":"+(e.safeCode||"DOSYA_ARSIV_HATASI"));
      }
    }
    if(out.xml||out.pdf||out.review)await writeManifest(doc,out);
    const checked=await alreadyArchived(doc);
    if(checked)return checked; // Both files exist and match hashes, even if review is pending.
    return {documentNo:doc.no,sourceKey:doc.sourceKey,xmlSaved:Boolean(out.xml),pdfSaved:Boolean(out.pdf),
      xmlReused:Boolean(out.xml?.reused),pdfReused:Boolean(out.pdf?.reused),errors:out.errors};
  }finally{archiveBusy=false;}
}


let syncJob={running:false,stop:false,monitor:false,progress:null,startedAt:"",finishedAt:""};
let monitorTimer=null;
async function publishJobStatus(){
  const {running,stop,monitor,progress,startedAt,finishedAt}=syncJob;
  const report={version:2,running,stopRequested:stop,monitor,cloudVerified:false,erpImported:false,startedAt,finishedAt,
    progress:progress?{...progress,issues:(progress.issues||[]).slice(-25)}:null};
  const statusDir=join(ARCHIVE_ROOT,"_DURUM");
  await mkdir(statusDir,{recursive:true});
  await writeFile(join(statusDir,"ISNET_OTOMATIK_SENKRON_DURUM.json"),JSON.stringify(report,null,2),"utf8");
}
function startArchiveJob(start,end,monitor=false){
  if(monitorTimer){clearTimeout(monitorTimer);monitorTimer=null;}
  if(syncJob.running)err("SENKRONIZASYON_DEVAM_EDIYOR");
  if(!state.connected||!state.companyId)err("ONCE_FIRMA_OTURUMU_ACIN");
  splitDateWindows(start,end);
  syncJob={running:true,stop:false,monitor:Boolean(monitor),progress:{status:"RUNNING",inspected:0,complete:0,
    archived:0,alreadyArchived:0,failed:0,needsReview:0},startedAt:new Date().toISOString(),finishedAt:""};
  void (async()=>{
    let lastStoredAt=0;
    try{
      const summary=await runIsnetArchiveSync({
        start,end,
        listDocuments:(a,b,source)=>listDocuments(a,b,source),
        archiveDocument:(id,source)=>archiveListed(id,source),
        shouldStop:()=>syncJob.stop,
        onProgress:async progress=>{
          syncJob.progress=progress;
          if(Date.now()-lastStoredAt>12000){
            await publishJobStatus();
            lastStoredAt=Date.now();
          }
        },
      });
      syncJob.progress=summary;
    }catch(e){
      syncJob.progress={...syncJob.progress,status:"NEEDS_REVIEW",
        error:/^[A-Z_]{3,90}$/.test(String(e?.safeCode||""))?e.safeCode:"ISNET_SYNC_INTERNAL_ERROR"};
    }finally{
      syncJob.running=false;
      syncJob.finishedAt=new Date().toISOString();
      await publishJobStatus().catch(()=>{});
      // Portal credentials remain memory-only. Monitor only while the user has
      // an authorized active session; after Windows restart a new login is needed.
      if(syncJob.monitor&&!syncJob.stop&&state.connected && syncJob.progress?.status!=="NEEDS_REVIEW"){
        monitorTimer=setTimeout(()=>{
          if(syncJob.running||syncJob.stop||!state.connected)return;
          const end=new Date().toISOString().slice(0,10);
          const start=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
          try{startArchiveJob(start,end,true)}catch{}
        },15*60*1000);
        monitorTimer.unref?.();
      }
    }
  })();
}

const html=`<!doctype html><html lang=\"tr\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"referrer\" content=\"no-referrer\"><title>KY ERP · İşNet Yerel Drive Arşivi</title>\n<style>body{font:14px system-ui;background:#f4f6fb;color:#1b2b44;margin:0;padding:18px}main{max-width:1100px;margin:auto}h1{font-size:24px;margin:8px 0}h3{font-size:16px}section{background:white;padding:18px;margin:14px 0;border:1px solid #d9e0ed;border-radius:12px}input,select,button{padding:10px;font:inherit;border:1px solid #b5c3d8;border-radius:8px;margin:4px}button{background:#183f7a;color:white;cursor:pointer}button:focus{outline:2px solid #4777c1}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:9px;border-bottom:1px solid #e4e8f2}td button{padding:7px}small{color:#52637a}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}.pill{background:#e9f0fd;padding:5px 9px;border-radius:99px;color:#16417f}#status{white-space:pre-wrap;padding:12px;background:#f4f7fd;border-radius:6px}.overflow{overflow-x:auto}</style>\n<main><h1>KY ERP · İşNet Yerel Drive Arşivi</h1><small>Yerel arşiv · XML + PDF Google Drive eşitleme klasörüne kaydedilir (bulut kaydı ayrıca doğrulanır) · Şifre yalnız açık onayla Windows şifreli kasasında korunur; çerez saklanmaz · Resmî belge gönderilmez</small>\n<section><h3>1. İşNet giriş</h3><form id=\"login\" method=\"post\" action=\"/login\" autocomplete=\"off\" onsubmit=\"return false\"><input name=\"username\" autocomplete=\"username\" placeholder=\"Kullanıcı / VKN\" required><input name=\"password\" type=\"password\" autocomplete=\"off\" placeholder=\"Şifre\" required><button>Bağlan ve firmaları getir</button><label style="display:inline-flex;align-items:center;font-size:12px;gap:5px"><input id="rememberPassword" type="checkbox"> Şifreyi bu Windows kullanıcısında sakla</label><button id="loginSaved" type="button">Kayıtlı Şifreyle Bağlan</button><button id="deleteSaved" type="button">Kayıtlı Şifreyi Sil</button></form></section>\n<section><h3>2. Firma</h3><form id=\"company\"><select name=\"id\" id=\"companies\"><option value=\"\">Önce bağlanın</option></select><button>Firma oturumu aç</button><label style="font-size:12px"><input id="rememberCompany" type="checkbox" checked> Son yetkili firmayı hatırla</label></form></section>\n<section><h3>3. Belgeleri sorgula</h3><form id=\"invoices\"><div class=\"grid\"><label>Belge türü<br><select name=\"sourceKey\"><option value=\"incoming_invoice\">Gelen e-Fatura</option><option value=\"outgoing_invoice\">Giden e-Fatura</option><option value=\"incoming_dispatch\">Gelen e-İrsaliye</option><option value=\"outgoing_dispatch\">Giden e-İrsaliye</option></select></label><label>Başlangıç<br><input name=\"start\" type=\"date\" required></label><label>Bitiş<br><input name=\"end\" type=\"date\" required></label></div><button>Belge listesini getir</button></form><p><small>Tek arşiv: dört belge türünün XML ve PDF dosyaları ayrı klasörlerde korunur. Bir sorgu en fazla 31 gün / tür başına 200 kayıt.</small></p><button type=\"button\" id=\"archiveAll\">Dört Yönü Şimdi Al · XML + PDF</button><button type=\"button\" id=\"stopArchive\" disabled>İşlemden Sonra Durdur</button><label style=\"display:inline-flex;align-items:center;gap:6px;font-size:12px;\"><input id=\"keepMonitoring\" type=\"checkbox\">Oturum açıkken 15 dakikada bir kontrolü sürdür</label><p><small><strong>İndirme ve arşiv farkı:</strong> XML/PDF elle indir = Windows İndirilenler. Drive'a XML + PDF Kaydet = seçili firmanın Drive eşitleme arşivi; tarayıcı indirmesi açılmaz. Sonuç her belge satırının altında görünür.</small></p><div class=\"overflow\"><table><thead><tr><th>Tarih</th><th>Belge numarası</th><th>Firma</th><th>Tutar</th><th>Portal durumu</th><th>XML</th><th>PDF</th><th>Drive Arşiv</th></tr></thead><tbody id=\"results\"></tbody></table></div></section>\n<section><h3>4. PDF sürüm uyuşmazlıkları</h3><small>Orijinal XML/PDF korunur. Yeni PDF farklıysa _INCELEME altında tek hash'li alternatif olarak saklanır; kendiliğinden resmî belge yerine geçmez.</small><p><button type="button" id="reviewRefresh">İnceleme kayıtlarını göster</button></p><div id="reviewList" style="display:grid;gap:8px"></div><iframe id="reviewPreview" title="PDF Sürüm Önizleme" style="width:100%;height:510px;border:1px solid #d9e0ed;border-radius:8px;display:none"></iframe></section>
<section><b>Test sonucu</b><div id=\"status\">Hazır; portal girişi bekleniyor.</div><button type=\"button\" id=\"clear\">Oturumu temizle</button></section></main>\n<script>\nconst csrf=\"{{CSRF}}\";const status=document.querySelector(\"#status\");
let stopArchive=false,archiveRunning=false;\nconst form=document.querySelector(\"#invoices\"),today=new Date();form.elements.end.value=today.toISOString().slice(0,10);today.setDate(today.getDate()-7);form.elements.start.value=today.toISOString().slice(0,10);\nasync function api(path,data){const res=await fetch(path,{method:\"POST\",headers:{\"content-type\":\"application/json\",\"x-ky-csrf\":csrf},body:JSON.stringify(data)});const obj=await res.json();if(!res.ok)throw Error(obj.error||\"Bilinmeyen hata\");return obj}\nasync function run(task){status.textContent=\"İşlem yürütülüyor...\";try{await task()}catch(e){status.textContent=\"HATA: \"+e.message}}\nlet activeLoginName='';\nasync function prefKey(username){\n const name=String(username||'').trim().toUpperCase();\n if(!name||!crypto.subtle)return '';\n const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name));\n return 'kyerp:isnet:company:'+Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');\n}\nasync function authorizedCompanies(result,username){\n activeLoginName=String(username||'').trim();\n const sel=document.querySelector('#companies');sel.replaceChildren();\n const first=document.createElement('option');first.value='';first.textContent='Firma seçin';sel.append(first);\n const list=(result.companies||[]).filter(c=>c&&c.id&&c.name&&c.hasRole!==false);\n list.forEach(c=>{const option=document.createElement('option');option.value=c.id;option.textContent=c.name;sel.append(option)});\n const key=await prefKey(activeLoginName),previous=key?(localStorage.getItem(key)||''):'';\n const matches=list.filter(c=>String(c.id)===previous);\n const chosen=list.length===1?list[0]:(previous&&matches.length===1?matches[0]:null);\n if(chosen){\n  const response=await api('/company',{id:chosen.id,name:chosen.name});\n  sel.value=chosen.id;\n  status.textContent='Yetkili firma açıldı: '+chosen.name+(response.passwordSaved?' · Windows kasasına şifre kaydedildi':'');\n  return;\n }\n status.textContent=list.length+' yetkili firma var. İlk girişte firmayı seçin; sonraki girişte doğrulanarak otomatik açılacak.';\n}\ndocument.querySelector('#login').onsubmit=e=>{e.preventDefault();run(async()=>{\n const f=new FormData(e.target),username=String(f.get('username')||'').trim();\n const result=await api('/login',{username,password:String(f.get('password')||''),rememberPassword:document.querySelector('#rememberPassword').checked});\n e.target.elements.password.value='';\n await authorizedCompanies(result,username);\n})};\ndocument.querySelector('#loginSaved').onclick=()=>run(async()=>{\n const username=String(document.querySelector('#login').elements.username.value||'').trim();\n if(!username)throw Error('Kullanıcı/VKN girin.');\n const result=await api('/login-saved',{username});\n await authorizedCompanies(result,username);\n});\ndocument.querySelector('#deleteSaved').onclick=()=>run(async()=>{\n const username=String(document.querySelector('#login').elements.username.value||'').trim();\n if(!username)throw Error('Kullanıcı/VKN girin.');\n if(!confirm('Bu Windows kullanıcısının kayıtlı İşNet şifresi silinsin mi?'))return;\n await api('/password-delete',{username});\n status.textContent='Kayıtlı şifre silindi; aktif oturum korunuyor.';\n});\ndocument.querySelector('#company').onsubmit=e=>{e.preventDefault();run(async()=>{\n const sel=document.querySelector('#companies');if(!sel.value)throw Error('Yetkili firma seçin.');\n const response=await api('/company',{id:sel.value,name:sel.selectedOptions[0].textContent});\n if(document.querySelector('#rememberCompany').checked&&activeLoginName){\n  const key=await prefKey(activeLoginName);if(key)localStorage.setItem(key,sel.value);\n }\n status.textContent='Firma açıldı: '+sel.selectedOptions[0].textContent+(response.passwordSaved?' · Windows kasasına şifre kaydedildi':'');\n})};\nasync function download(d,format){status.textContent=format.toUpperCase()+\" indiriliyor...\";try{const response=await fetch(\"/file\",{method:\"POST\",headers:{\"content-type\":\"application/json\",\"x-ky-csrf\":csrf},body:JSON.stringify({id:d.sourceId,sourceKey:d.sourceKey,format})});if(!response.ok){const obj=await response.json();throw Error(obj.error)}const blob=await response.blob();const url=URL.createObjectURL(blob),link=document.createElement(\"a\");link.href=url;link.download=(d.no||\"isnet-belge\").replace(/[^a-zA-Z0-9_-]/g,\"_\")+\".\"+format;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);status.textContent=d.no+\" \"+format.toUpperCase()+\" tarayıcıya indirildi, Drive arşivi değildir (\"+blob.size+\" bayt).\"}catch(e){status.textContent=\"HATA: \"+e.message}}\nform.onsubmit=e=>{e.preventDefault();run(async()=>{const r=await api(\"/documents\",Object.fromEntries(new FormData(form)));const tbody=document.querySelector(\"#results\");tbody.replaceChildren();r.documents.forEach(d=>{const tr=document.createElement(\"tr\");for(const field of [\"date\",\"no\",\"company\",\"amount\",\"status\"]){const td=document.createElement(\"td\");td.textContent=d[field]||\"—\";tr.append(td)}for(const fmt of [\"xml\",\"pdf\"]){const cell=document.createElement(\"td\"),button=document.createElement(\"button\");button.textContent=fmt.toUpperCase()+\" elle indir\";button.onclick=()=>download(d,fmt);cell.append(button);tr.append(cell)}const archiveCell=document.createElement(\"td\"),archiveButton=document.createElement(\"button\"),archiveState=document.createElement(\"small\");archiveButton.textContent=\"Drive'a XML + PDF Kaydet\";archiveState.setAttribute(\"role\",\"status\");archiveState.setAttribute(\"aria-live\",\"polite\");archiveState.style.display=\"block\";archiveState.style.marginTop=\"5px\";archiveButton.onclick=async()=>{archiveButton.disabled=true;archiveState.textContent=\"Drive arşivine kaydediliyor...\";try{const saved=await api(\"/archive-item\",{id:d.sourceId,sourceKey:d.sourceKey});const errors=Array.isArray(saved.errors)?saved.errors:[];const complete=Boolean(saved.xmlSaved&&saved.pdfSaved&&errors.length===0);const reused=Boolean(saved.xmlReused&&saved.pdfReused);const message=complete?(reused?\"Drive arşivinde zaten mevcut ✓\":\"XML + PDF Drive arşivine kaydedildi ✓\"):(\"Arşiv incelemesi gerekli · XML: \"+(saved.xmlSaved?\"OK\":\"Eksik\")+\" · PDF: \"+(saved.pdfSaved?\"OK\":\"Eksik\")+(errors.length?\" · \"+errors.join(\", \"):\"\"));archiveState.textContent=message;archiveState.style.color=complete?\"#17683d\":\"#9a3412\";status.textContent=d.no+\" · \"+message+\" · İndirilenler'e dosya oluşturulmaz.\";}catch(error){const message=\"Arşiv kaydı başarısız: \"+error.message;archiveState.textContent=message;archiveState.style.color=\"#9a3412\";status.textContent=d.no+\" · \"+message;}finally{archiveButton.disabled=false}};archiveCell.append(archiveButton,archiveState);tr.append(archiveCell);tbody.append(tr)});status.textContent=r.documents.length+\" belge listelendi; seçilen tür: \"+form.elements.sourceKey.selectedOptions[0].textContent})};\ndocument.querySelector(\"#clear\").onclick=()=>run(async()=>{await api(\"/clear\",{});document.querySelector(\"#results\").replaceChildren();status.textContent=\"Oturum bilgileri temizlendi.\"});

const reviewList=document.querySelector("#reviewList");
const reviewFrame=document.querySelector("#reviewPreview");
let previewObjectUrl="";
async function loadReviewPdf(record,variant){
  const res=await fetch("/review-pdf",{method:"POST",headers:{"content-type":"application/json","x-ky-csrf":csrf},
    body:JSON.stringify({sourceKey:record.sourceKey,sourceId:record.sourceId,variant})});
  if(!res.ok){const e=await res.json();throw Error(e.error||"ONIZLEME_HATASI");}
  const blob=await res.blob();
  if(previewObjectUrl)URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl=URL.createObjectURL(blob);
  reviewFrame.src=previewObjectUrl;
  reviewFrame.style.display="block";
}
async function showPdfReviews(){
  const payload=await api("/review-list",{});
  reviewList.replaceChildren();
  if(!payload.reviews.length){
    const empty=document.createElement("span");empty.textContent="Bekleyen PDF sürüm incelemesi yok.";reviewList.append(empty);return;
  }
  for(const record of payload.reviews){
    const row=document.createElement("div");
    row.style.cssText="padding:10px;border:1px solid #d8e2ef;border-radius:7px;display:flex;gap:8px;align-items:center;flex-wrap:wrap";
    const title=document.createElement("strong");
    title.textContent=record.documentNo+" · "+record.sourceKey+" · "+(record.candidateCount?record.candidateCount+" alternatif PDF":"eski sürüm farkı kaydı");
    row.append(title);
    const original=document.createElement("button");original.textContent="Arşivdeki PDF'yi göster";
    original.onclick=()=>run(async()=>{await loadReviewPdf(record,"original");status.textContent="Arşivdeki orijinal PDF salt okunur açıldı."});
    row.append(original);
    if(record.candidateCount){
      const alternative=document.createElement("button");alternative.textContent="Farklı PDF'yi karşılaştır";
      alternative.onclick=()=>run(async()=>{await loadReviewPdf(record,"alternative");status.textContent="Alternatif PDF salt okunur açıldı; resmî arşive geçmez."});
      row.append(alternative);
    }
    const recheck=document.createElement("button");recheck.textContent="Portaldaki PDF'yi bir kez yeniden kontrol et";
    recheck.onclick=()=>run(async()=>{
      const result=await api("/review-refresh",{sourceKey:record.sourceKey,sourceId:record.sourceId});
      status.textContent=result.status==="PORTAL_PDF_AYNI"?
        "Portal PDF'si arşivle birebir aynı. Uyuşmazlık kendiliğinden çözüldü.":
        "Farklı PDF _INCELEME altında korundu; iki sürümü karşılaştırıp karar verin.";
      await showPdfReviews();
    });
    row.append(recheck);
    const approve=document.createElement("button");approve.textContent="Mevcut orijinali koru · İncelemeyi kapat";
    approve.disabled=record.otherIssues>0;
    approve.onclick=()=>run(async()=>{
      if(!confirm("XML ve PDF'nin mevcut arşiv sürümünü koruyup bu PDF uyuşmazlık incelemesini kapatmak istiyor musunuz? Alternatif dosyalar silinmez."))return;
      await api("/review-resolve",{sourceKey:record.sourceKey,sourceId:record.sourceId,action:"KEEP_ORIGINAL"});
      status.textContent="Mevcut orijinal korundu; karar kayıt dosyasına işlendi. Alternatifler silinmedi.";
      await showPdfReviews();
    });
    row.append(approve);
    reviewList.append(row);
  }
}
document.querySelector("#reviewRefresh").onclick=()=>run(async()=>{await showPdfReviews();status.textContent="PDF inceleme listesi güncellendi."});

let syncPolling=null;
async function refreshSyncStatus(){
  try{
    const result=await api("/sync-status",{});
    const job=result.job||{},p=job.progress||{};
    if(job.startedAt){
      status.textContent=(job.running?"SENKRONİZASYON ÇALIŞIYOR":"SONUÇ: "+(p.status||"BİTTİ"))+
        "\\nİncelenen: "+(p.inspected||0)+" · Tamam: "+(p.complete||0)+" · Zaten arşivli: "+(p.alreadyArchived||0)+
        "\\nXML: "+(p.xmlSaved||0)+" · PDF: "+(p.pdfSaved||0)+
        " · İnceleme: "+(p.needsReview||0)+" · Hata: "+(p.failed||0)+
        "\\nTür: "+(p.lastSource||"-")+" · Dönem: "+(p.lastWindow?.start||"-")+" / "+(p.lastWindow?.end||"-")+
        ((p.issues||[]).length?"\\nUyarı: "+p.issues.slice(-3).map(x=>x.code).join(", "):"");
    }
    document.querySelector("#archiveAll").disabled=Boolean(job.running);
    document.querySelector("#stopArchive").disabled=!job.running;
    if(!job.running&&syncPolling){clearInterval(syncPolling);syncPolling=null;}
  }catch(e){status.textContent="Senkronizasyon durumu alınamadı. İşlem arka planda sürebilir.";}
}
document.querySelector("#stopArchive").onclick=()=>run(async()=>{
  await api("/sync-stop",{});
  status.textContent="Durdurma istendi; geçerli belge tamamlanınca duracak.";
});
document.querySelector("#archiveAll").onclick=()=>run(async()=>{
  const f=new FormData(form);
  await api("/sync-start",{start:f.get("start"),end:f.get("end"),monitor:document.querySelector("#keepMonitoring").checked});
  await refreshSyncStatus();
  if(syncPolling)clearInterval(syncPolling);
  syncPolling=setInterval(refreshSyncStatus,2000);
});
refreshSyncStatus();\n</script></html>`.replace('{{CSRF}}',csrf);

function json(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data));}
async function readBody(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)err("ISTEK_COK_BUYUK");chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString("utf8"))}catch{err("GECERSIZ_JSON")}}
const HEALTH_ALLOWED_ORIGINS=new Set(["https://kyerp.net","https://app.kyerp.net"]);
const LOCAL_HEALTH_ADAPTER="KY_ISNET_DRIVE_ARCHIVE_V1";
const server=createServer(async(req,res)=>{
  if(req.socket.remoteAddress!=="127.0.0.1"&&req.socket.remoteAddress!=="::ffff:127.0.0.1")return json(res,403,{error:"YEREL_ERISIM"});
  // Reject DNS rebinding: loopback requests must use the actual fixed loopback host.
  if(req.headers.host!=="127.0.0.1:"+PORT)return json(res,403,{error:"YEREL_HOST_GECERSIZ"});
  if(req.url==="/health"&&(req.method==="GET"||req.method==="OPTIONS")){
    const origin=String(req.headers.origin||"");
    const allowed=HEALTH_ALLOWED_ORIGINS.has(origin);
    if(req.method==="OPTIONS"){
      if(!allowed)return json(res,403,{error:"YEREL_HEALTH_ORIGIN_GECERSIZ"});
      res.writeHead(204,{"access-control-allow-origin":origin,"access-control-allow-methods":"GET, OPTIONS",
        "access-control-allow-headers":"content-type","access-control-allow-private-network":"true",
        "vary":"Origin","cache-control":"no-store"});
      return res.end();
    }
    res.writeHead(200,{"content-type":"application/json; charset=utf-8","cache-control":"no-store",
      "x-content-type-options":"nosniff",...(allowed?{"access-control-allow-origin":origin,
      "access-control-allow-private-network":"true","vary":"Origin"}:{})});
    return res.end(JSON.stringify({ok:true,adapter:LOCAL_HEALTH_ADAPTER,connected:state.connected&&Boolean(state.companyId),
      running:syncJob.running,monitoring:Boolean(monitorTimer),lastSyncStatus:syncJob.progress?.status||"",
      lastSyncAt:syncJob.finishedAt||""}));
  }
  if(req.method==="GET"&&req.url?.startsWith("/?")){res.writeHead(303,{"location":"/","cache-control":"no-store","referrer-policy":"no-referrer"});return res.end();}
  if(req.method==="GET"&&req.url==="/"){res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff","content-security-policy":"frame-ancestors https://kyerp.net https://app.kyerp.net; default-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self' blob:; form-action 'self'; base-uri 'none'"});return res.end(html);}
  if(req.method!=="POST"||!["/login","/login-saved","/password-delete","/company","/documents","/file","/clear","/archive-item","/sync-start","/sync-status","/sync-stop","/review-list","/review-pdf","/review-resolve","/review-refresh"].includes(req.url))return json(res,404,{error:"BULUNAMADI"});
  if(req.headers["x-ky-csrf"]!==csrf||!["http://127.0.0.1:"+PORT,undefined].includes(req.headers.origin))return json(res,403,{error:"YETKISIZ_ISTEK"});
  try{
    const body=await readBody(req);
    if(req.url==="/review-list"){
      const records=await scanPdfReviews();
      return json(res,200,{reviews:records.map(({sourceKey,sourceId,documentNo,date,candidateCount,otherIssues})=>
        ({sourceKey,sourceId,documentNo,date,candidateCount,otherIssues}))});
    }
    if(req.url==="/review-refresh"){
      const result=await recheckPortalPdfReview(safe(body.sourceKey),safe(body.sourceId));
      return json(res,200,result);
    }
    if(req.url==="/review-resolve"){
      if(syncJob.running)err("SENKRONIZASYON_DEVAM_EDIYOR");
      if(safe(body.action)!=="KEEP_ORIGINAL")err("PDF_KARAR_SECIMI_GECERSIZ");
      const decision=await keepReviewedOriginal(safe(body.sourceKey),safe(body.sourceId));
      return json(res,200,decision);
    }
    if(req.url==="/review-pdf"){
      const bytes=await previewPdfReview(safe(body.sourceKey),safe(body.sourceId),safe(body.variant));
      res.writeHead(200,{"content-type":"application/pdf","cache-control":"no-store",
        "content-disposition":"inline; filename=review.pdf","x-content-type-options":"nosniff"});
      return res.end(bytes);
    }
    if(req.url==="/sync-status")return json(res,200,{job:syncJob});
    if(req.url==="/sync-stop"){syncJob.stop=true;syncJob.monitor=false;if(monitorTimer){clearTimeout(monitorTimer);monitorTimer=null;}return json(res,200,{stopRequested:syncJob.running});}
    if(req.url==="/sync-start"){startArchiveJob(safe(body.start),safe(body.end),body.monitor===true);return json(res,202,{started:true});}
    if(syncJob.running)err("SENKRONIZASYON_DEVAM_EDIYOR");
    if(req.url==="/clear"){if(monitorTimer){clearTimeout(monitorTimer);monitorTimer=null;}syncJob.monitor=false;reset();return json(res,200,{ok:true});}
    if(req.url==="/login"){const companies=await loginStep(safe(body.username),safe(body.password),body.rememberPassword===true);return json(res,200,{companies});}
    if(req.url==="/login-saved"){const username=safe(body.username),password=await windowsIsnetCredential("load",username);const companies=await loginStep(username,password,false);return json(res,200,{companies});}
    if(req.url==="/password-delete"){await windowsIsnetCredential("delete",safe(body.username));return json(res,200,{ok:true});}
    if(req.url==="/company"){const selected=await chooseCompany(safe(body.id),safe(body.name));return json(res,200,{message:"Firma oturumu açıldı",passwordSaved:selected.passwordSaved});}
    if(req.url==="/documents"){const documents=await listDocuments(safe(body.start),safe(body.end),safe(body.sourceKey));return json(res,200,{documents});}
    if(req.url==="/archive-item"){const data=await archiveListed(safe(body.id),safe(body.sourceKey));return json(res,200,data);}
    if(req.url==="/file"){
      const format=safe(body.format),id=safe(body.id),sourceKey=safe(body.sourceKey);
      const bytes=await downloadDocument(id,sourceKey,format);
      res.writeHead(200,{"content-type":format==="pdf"?"application/pdf":"application/xml; charset=utf-8",
        "content-disposition":"attachment; filename=isnet-belge."+format,
        "cache-control":"no-store","x-content-type-options":"nosniff"});
      return res.end(bytes);
    }
  }catch(e){
    const reason=String(e?.safeCode||"PORTAL_BAGLANTISI_HATASI");
    if(/OTURUM|NOT_AUTHORIZED|FIRMA_OTURUMU|BELGE_DOSYA_YETKISI/.test(reason)){
      // A lost provider session must not silently keep the 15-minute monitor alive.
      state.connected=false;state.documents=[];syncJob.monitor=false;
      if(monitorTimer){clearTimeout(monitorTimer);monitorTimer=null;}
    }
    return json(res,400,{error:reason});
  }
});
if(process.env.KY_ISNET_SELFTEST==="1"){
  if(!ARCHIVE_ROOT.includes("KY-ISNET-QA"))throw Error("QA_PATH_REQUIRED");
  state.companyId="0";state.companyName="QA";
  const doc={sourceId:"1",sourceKey:"incoming_invoice",no:"QA-001",date:"20.11.2026",
    kind:"invoice",direction:"incoming",company:"QA",uuid:""};
  const one=await saveOriginal(doc,"xml",Buffer.from("<Invoice>QA</Invoice>"));
  const two=await saveOriginal(doc,"xml",Buffer.from("<Invoice>QA</Invoice>"));
  if(one.reused || !two.reused || one.sha256!==two.sha256)throw Error("QA_IDEMPOTENCY_FAILED");
  let conflict=false;
  try{await saveOriginal(doc,"xml",Buffer.from("<Invoice>DIFFERENT</Invoice>"));}
  catch(e){conflict=e.safeCode==="ARŞİVDE_FARKLI_ORİJİNAL_VAR_INCELEYIN";}
  if(!conflict)throw Error("QA_OVERWRITE_PROTECTION_FAILED");
  const pdf=await saveOriginal(doc,"pdf",Buffer.from("%PDF-1.4\nQA"));
  await writeManifest(doc,{xml:one,pdf,errors:[]});
  // Regression 1: historical conflict on disk must NOT download over verified
  // XML/PDF; both should count present, but remain in a review queue.
  await writeManifest(doc,{xml:one,pdf,errors:["PDF:ARŞİVDE_FARKLI_ORİJİNAL_VAR_INCELEYIN"]});
  const historical=await alreadyArchived(doc);
  if(!historical?.xmlSaved||!historical?.pdfSaved||!historical?.reviewPending||
    historical.errors[0]!==PDF_REVIEW_CODE)throw Error("QA_HISTORICAL_PDF_CONFLICT_COUNT_FAILED");
  state.connected=true;state.documents=[doc];
  const stable=await archiveListed(doc.sourceId,doc.sourceKey);
  if(!stable.pdfReused||stable.errors[0]!==PDF_REVIEW_CODE)throw Error("QA_REPEAT_DOWNLOAD_NOT_SKIPPED");
  const variant=Buffer.from("%PDF-1.4\nQA-ALTERNATIVE");
  const candidate=await preservePdfAlternative(doc,variant);
  const repeated=await preservePdfAlternative(doc,variant);
  if(candidate?.sha256!==sha256(variant)||repeated?.sha256!==candidate.sha256)
    throw Error("QA_ALTERNATIVE_DUPLICATE_PROTECTION_FAILED");
  await writeManifest(doc,{xml:one,pdf,errors:[PDF_REVIEW_CODE],review:{
    status:"PENDING",reason:PDF_REVIEW_CODE,firstSeenAt:archivedAt(),candidates:[candidate]}});
  const reviews=await scanPdfReviews();
  if(reviews.length!==1||reviews[0].candidateCount!==1)throw Error("QA_PENDING_REVIEW_INDEX_FAILED");
  if(!(await previewPdfReview(doc.sourceKey,doc.sourceId,"original")).equals(Buffer.from("%PDF-1.4\nQA")) ||
    !(await previewPdfReview(doc.sourceKey,doc.sourceId,"alternative")).equals(variant))
    throw Error("QA_PDF_PREVIEW_WRONG_CONTENT");
  await keepReviewedOriginal(doc.sourceKey,doc.sourceId);
  if((await scanPdfReviews()).length||!(await alreadyArchived(doc))|| (await alreadyArchived(doc)).errors.length)
    throw Error("QA_REVIEW_RESOLUTION_DID_NOT_PERSIST");
  if(!(await readFile(join(archiveLocation(doc).dir,"_INCELEME",candidate.fileName))).equals(variant))
    throw Error("QA_ALTERNATIVE_WAS_DELETED");
  console.log("KY_ISNET_LOCAL_ARCHIVE_QA_PASS: ORIGINALS_DEDUP_PDF_VERSIONS_REVIEW");
}else{
  server.listen(PORT,HOST,()=>console.log("KY İşNet Drive Arşivi: http://"+HOST+":"+PORT+" · ARŞİV HAZIR"));
  process.on("SIGINT",()=>{reset();server.close(()=>process.exit(0));});
}