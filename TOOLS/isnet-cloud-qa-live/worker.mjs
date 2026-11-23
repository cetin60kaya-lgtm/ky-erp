/* KY ERP · İşNet QA only — separate Cloudflare Worker and separate D1.
 * No production D1/R2/Google Drive access, no official document send.
 * User's password is not saved; provider token is encrypted at rest with AES-GCM.
 * Access is restricted to the X PC's public IP (server-verified Cloudflare header).
 */
import { PAGE, APP_JS } from './ui.mjs';
const API='https://einvoiceapi.isnet.net.tr';
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const txt=v=>String(v??'').trim();
const keyNames=['IdFirma','idFirma','CompanyId','companyId','Id','id'];
const goodResult=x=>[0,'0',true,'Success','success'].includes(x);
const NO_STORE={'cache-control':'private, no-store, max-age=0','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer'};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{...NO_STORE,'content-type':'application/json; charset=utf-8',...headers}});
const denied=(code='DENIED',status=403)=>json({ok:false,error:code},status);
const delayAbort=ms=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);return {signal:c.signal,done:()=>clearTimeout(t)}};
function allowed(req,env){
 const realIp=txt(req.headers.get('CF-Connecting-IP'));
 return !!env.QA_ALLOWED_IP && !!realIp && realIp===env.QA_ALLOWED_IP;
}
const dateOk=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const periodOk=(a,b)=>dateOk(a)&&dateOk(b)&&a<=b&&(Date.parse(b)-Date.parse(a)<=31*86400000);
const kindOk=x=>x==='invoice'||x==='despatch';
const dirOk=x=>x==='incoming'||x==='outgoing';
function listConfig(kind,dir,companyId,from,to){
 if(kind==='invoice')return {path:dir==='incoming'?'/api/Invoice/GetIncomingEInvoiceList':'/api/Invoice/GetSentStagingInvoiceList',
  key:'Invoices',body:{CompanyId:Number(companyId),FirstInvoiceDate:from,LastInvoiceDate:to,PageIndex:0,PageSize:25,IsArchiveIncluded:true,...(dir==='outgoing'?{IsSended:true}:{})}};
 return {path:dir==='incoming'?'/api/Invoice/GetIncomingDespatchList':'/api/Invoice/GetSentStagingDespatchList',
  key:'Despatches',body:{CompanyId:Number(companyId),FirstDespatchDate:from,LastDespatchDate:to,PageIndex:0,PageSize:25}};
}
function normalizeCompanies(payload){
 const array=payload?.CompanyList??payload?.companyList??payload?.Companies??payload?.companies??[];
 if(!Array.isArray(array))return [];
 const seen=new Set();
 return array.map(row=>{
  const id=txt(keyNames.map(k=>row?.[k]).find(v=>v!==undefined&&v!==null));
  const name=txt(row?.FirmaAdi??row?.firmaAdi??row?.CompanyName??row?.companyName??row?.Name??row?.name);
  return {id,name};
 }).filter(row=>/^\d+$/.test(row.id)&&row.name.length>0&&!seen.has(row.id)&&seen.add(row.id)).slice(0,60);
}
export async function providerLogin(fetcher,username,password){
 const a=delayAbort(15000);
 try{
  const res=await fetcher(API+'/api/Account/Login',{method:'POST',redirect:'manual',signal:a.signal,
   headers:{Accept:'application/json','Content-Type':'application/json'},
   body:JSON.stringify({IdentificationNumber:username,Password:password})});
  if(res.status===401||res.status===403)throw Error('ISNET_API_NOT_AUTHORIZED');
  if(!res.ok)throw Error('ISNET_LOGIN_HTTP_ERROR');
  if(!(res.headers.get('content-type')||'').toLowerCase().includes('json'))throw Error('ISNET_LOGIN_NOT_JSON');
  const payload=await res.json();
  if(payload.ErrorMessage||payload.errorMessage)throw Error('ISNET_API_REJECTED');
  const token=txt(payload.Token??payload.token),companies=normalizeCompanies(payload);
  if(!token||!companies.length)throw Error('ISNET_API_NO_AUTHORIZED_COMPANIES');
  return {token,companies,expiresOn:txt(payload.ExpiresOn??payload.expiresOn)};
 }finally{a.done()}
}
async function providerPost(fetcher,token,path,body){
 const a=delayAbort(10500);
 try{
  const res=await fetcher(API+path,{method:'POST',redirect:'manual',signal:a.signal,
    headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+token,Token:token},body:JSON.stringify(body)});
  if(res.status===401||res.status===403)throw Error('ISNET_API_SESSION_INVALID');
  if(!res.ok)throw Error('ISNET_PROVIDER_HTTP_ERROR');
  if(!(res.headers.get('content-type')||'').toLowerCase().includes('json'))throw Error('ISNET_PROVIDER_NON_JSON');
  const data=await res.json();
  if(!goodResult(data.Result??data.result))throw Error('ISNET_PROVIDER_REJECTED');
  return data;
 }finally{a.done()}
}
export async function listRemote(fetcher,token,companyId,kind,dir,from,to){
 if(!kindOk(kind)||!dirOk(dir)||!periodOk(from,to)||!/^\d+$/.test(txt(companyId)))throw Error('INVALID_QUERY');
 const def=listConfig(kind,dir,companyId,from,to);
 const obj=await providerPost(fetcher,token,def.path,def.body);
 const rows=obj[def.key]??obj[def.key.toLowerCase()];
 if(!Array.isArray(rows))throw Error('ISNET_LIST_FORMAT_UNVERIFIED');
 const seen=new Set();
 const result=rows.slice(0,25).map(r=>({
  ettn:txt(r.Ettn??r.ETTN),
  number:txt(r.InvoiceNumber??r.DespatchNumber??r.DocumentNumber??r.Number).slice(0,100),
  date:txt(r.InvoiceDate??r.DespatchDate??r.DocumentDate).slice(0,40),
  company:txt(r.RecipientCompanyName??r.SenderCompanyName??r.CompanyName).slice(0,160),
  state:txt(r.Status).slice(0,80)
 })).filter(r=>UUID.test(r.ettn)&&!seen.has(r.ettn)&&seen.add(r.ettn));
 return {rows:result,kind,direction:dir,from,to,providerCount:rows.length,firstPageOnly:true,readOnly:true};
}
function safeIsnetUrl(raw){
 let u;
 try{u=new URL(raw)}catch{throw Error('ISNET_FILE_URL_INVALID')}
 const host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||!!u.port||!!u.username||!!u.password||!(host==='isnet.net.tr'||host.endsWith('.isnet.net.tr')))
  throw Error('ISNET_FILE_URL_BLOCKED');
 return u.toString();
}
export async function downloadRemote(fetcher,token,companyId,kind,dir,from,to,ettn,format){
 if(!UUID.test(ettn)||!['xml','pdf'].includes(format))throw Error('INVALID_DOCUMENT');
 const list=await listRemote(fetcher,token,companyId,kind,dir,from,to);
 if(!list.rows.some(row=>row.ettn.toLowerCase()===ettn.toLowerCase()))throw Error('DOCUMENT_NOT_IN_CURRENT_PAGE');
 const path=format==='xml'?'/api/Invoice/GetInvoiceExternalXmlUrl':'/api/Invoice/GetInvoiceExternalUrl';
 const meta=await providerPost(fetcher,token,path,{Ettn:ettn,InvoiceDirection:dir==='incoming'?1:2,InvoiceDocumentType:kind==='invoice'?1:4});
 const url=safeIsnetUrl(txt(meta.ExternalLink));
 const a=delayAbort(16000);
 try{
  const res=await fetcher(url,{method:'GET',redirect:'manual',signal:a.signal,headers:{Accept:format==='pdf'?'application/pdf,application/octet-stream':'application/xml,text/xml,application/octet-stream'}});
  if(!res.ok)throw Error('ISNET_FILE_HTTP_ERROR');
  if(Number(res.headers.get('content-length')||0)>20*1024*1024)throw Error('ISNET_FILE_TOO_LARGE');
  const bytes=await res.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>20*1024*1024)throw Error('ISNET_FILE_SIZE_INVALID');
  const head=new TextDecoder().decode(bytes.slice(0,4096)).replace(/^\uFEFF/,'').trimStart();
  if(format==='pdf'){
   if(!head.startsWith('%PDF-'))throw Error('ISNET_NOT_A_REAL_PDF');
  }else{
   if(/<!DOCTYPE\b|<!ENTITY\b/i.test(head)||!/^(?:<\?xml\b[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[\w.-]+:)?(?:Invoice|DespatchAdvice)\b/i.test(head))throw Error('ISNET_NOT_A_UBL_XML');
   const root=/^(?:<\?xml\b[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[\w.-]+:)?(Invoice|DespatchAdvice)\b/i.exec(head)?.[1];
   if(root!==(kind==='invoice'?'Invoice':'DespatchAdvice'))throw Error('ISNET_XML_KIND_MISMATCH');
  }
  return {bytes,format};
 }finally{a.done()}
}
const hex=b=>Array.from(new Uint8Array(b)).map(v=>v.toString(16).padStart(2,'0')).join('');
async function sha(s){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
async function aesKey(env){
 const key=txt(env.QA_SESSION_KEY);
 if(!/^[a-f0-9]{64}$/i.test(key))throw Error('QA_KEY_MISSING');
 const bytes=Uint8Array.from(key.match(/../g),x=>parseInt(x,16));
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
async function encrypt(env,obj){
 const nonce=crypto.getRandomValues(new Uint8Array(12));
 const data=new TextEncoder().encode(JSON.stringify(obj));
 const blob=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},await aesKey(env),data);
 return {iv:hex(nonce),ciphertext:hex(blob)};
}
async function decrypt(env,row){
 const iv=Uint8Array.from(String(row.iv).match(/../g),x=>parseInt(x,16));
 const data=Uint8Array.from(String(row.ciphertext).match(/../g),x=>parseInt(x,16));
 const blob=await crypto.subtle.decrypt({name:'AES-GCM',iv},await aesKey(env),data);
 return JSON.parse(new TextDecoder().decode(blob));
}
const cookieName='kyerp_isnet_qa';
const cookieValue=req=>(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
const cookieHeader=s=>cookieName+'='+s+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2700';
async function clientTag(req){return sha(txt(req.headers.get('CF-Connecting-IP'))+'|'+txt(req.headers.get('User-Agent')))}
async function newSession(req,env,payload){
 const rand=crypto.getRandomValues(new Uint8Array(32)),id=hex(rand),hashed=await sha(id);
 const cipher=await encrypt(env,payload),expires=Date.now()+45*60*1000;
 await env.DB.prepare('INSERT INTO qa_sessions(session_hash,iv,ciphertext,expires_at,client_tag) VALUES(?,?,?,?,?)')
  .bind(hashed,cipher.iv,cipher.ciphertext,expires,await clientTag(req)).run();
 return cookieHeader(id);
}
async function getSession(req,env){
 const id=cookieValue(req);
 if(!/^[0-9a-f]{64}$/.test(id))throw Error('QA_LOGIN_REQUIRED');
 const row=await env.DB.prepare('SELECT iv,ciphertext,expires_at,client_tag FROM qa_sessions WHERE session_hash=? LIMIT 1')
  .bind(await sha(id)).first();
 if(!row||Number(row.expires_at)<=Date.now()||row.client_tag!==await clientTag(req))throw Error('QA_LOGIN_EXPIRED');
 const data=await decrypt(env,row);
 return {data,id};
}
async function saveSession(req,env,session){
 const cipher=await encrypt(env,session.data);
 await env.DB.prepare('UPDATE qa_sessions SET iv=?,ciphertext=? WHERE session_hash=?')
  .bind(cipher.iv,cipher.ciphertext,await sha(session.id)).run();
}
function validateOrigin(req){
 const origin=req.headers.get('Origin');
 return !!origin&&origin===new URL(req.url).origin;
}
const problems={
 QA_LOGIN_REQUIRED:'Önce İşNet API hesabınızla giriş yapın.',
 QA_LOGIN_EXPIRED:'Test oturumu süresi doldu; tekrar giriş yapın.',
 QA_KEY_MISSING:'Test Worker güvenlik anahtarı tanımlı değil.',
 ISNET_API_NOT_AUTHORIZED:'İşNet API 401/403: Hesap API için yetkili değil veya giriş reddedildi.',
 ISNET_LOGIN_HTTP_ERROR:'İşNet API giriş isteğine hata yanıtı verdi.',
 ISNET_LOGIN_NOT_JSON:'İşNet girişte beklenmeyen cevap döndürdü.',
 ISNET_API_REJECTED:'İşNet API hesabı giriş isteğini reddetti.',
 ISNET_API_NO_AUTHORIZED_COMPANIES:'İşNet giriş tokenı veya yetkili firma listesi gelmedi.',
 ISNET_API_SESSION_INVALID:'İşNet API oturumunu kabul etmedi.',
 ISNET_PROVIDER_HTTP_ERROR:'İşNet belge servisinden HTTP hatası geldi.',
 ISNET_PROVIDER_NON_JSON:'İşNet JSON yerine farklı cevap döndürdü.',
 ISNET_PROVIDER_REJECTED:'İşNet belge sorgusunu reddetti.',
 ISNET_LIST_FORMAT_UNVERIFIED:'İşNet belge listesi beklenen biçimde gelmedi.',
 ISNET_FILE_URL_INVALID:'İşNet belge indirme bağlantısı geçersiz.',
 ISNET_FILE_URL_BLOCKED:'Belge adresi güvenli İşNet alan adı dışında; indirme engellendi.',
 DOCUMENT_NOT_IN_CURRENT_PAGE:'Seçilen belge, aynı sorgunun ilk sayfasında bulunamadı.',
 ISNET_FILE_HTTP_ERROR:'İşNet dosya indirirken HTTP hatası verdi.',
 ISNET_FILE_TOO_LARGE:'Dosya 20 MB sınırını aşıyor.',
 ISNET_FILE_SIZE_INVALID:'Gelen dosya boş veya geçersiz.',
 ISNET_NOT_A_REAL_PDF:'İşNet bağlantısı gerçek PDF döndürmedi.',
 ISNET_NOT_A_UBL_XML:'Gelen veri UBL XML değil.',
 ISNET_XML_KIND_MISMATCH:'İndirilen XML seçilen belge türüne uymuyor.',
 INVALID_DOCUMENT:'Belge kimliği veya format geçersiz.',
 INVALID_QUERY:'Tarih aralığı veya belge türü geçersiz.',
 TOO_MANY_ATTEMPTS:'Çok sayıda giriş denemesi; 30 dakika sonra tekrar deneyin.',
 BAD_INPUT:'Giriş alanları geçersiz.',
 FORBIDDEN:'Bu test yalnız yetkili bilgisayarda açılır.',
};
const errResponse=e=>{
 const raw=txt(e?.message),code=Object.hasOwn(problems,raw)?raw:e?.name==='AbortError'?'ISNET_TIMEOUT':'QA_UNVERIFIED';
 const status=code==='QA_LOGIN_REQUIRED'||code==='QA_LOGIN_EXPIRED'?401:code==='TOO_MANY_ATTEMPTS'?429:code==='FORBIDDEN'?403:
  code==='INVALID_QUERY'||code==='INVALID_DOCUMENT'||code==='BAD_INPUT'?400:502;
 return json({ok:false,error:code,message:problems[code]||'İşNet sonucu doğrulanamadı; test başarılı sayılmadı.'},status);
};
async function loginRateLimit(req,env){
 const ipHash=await sha(txt(req.headers.get('CF-Connecting-IP'))),now=Date.now();
 const row=await env.DB.prepare('SELECT tries,window_start FROM qa_login_attempts WHERE ip_hash=?').bind(ipHash).first();
 if(row&&now-Number(row.window_start)<1800000&&Number(row.tries)>=5)throw Error('TOO_MANY_ATTEMPTS');
 if(!row||now-Number(row.window_start)>=1800000){
  await env.DB.prepare('INSERT INTO qa_login_attempts(ip_hash,tries,window_start) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET tries=1,window_start=excluded.window_start')
   .bind(ipHash,now).run();
 }else{
  await env.DB.prepare('UPDATE qa_login_attempts SET tries=tries+1 WHERE ip_hash=?').bind(ipHash).run();
 }
}
async function parseJson(req){
 const type=req.headers.get('content-type')||'';
 if(!type.startsWith('application/json'))throw Error('BAD_INPUT');
 const length=Number(req.headers.get('content-length')||0);
 if(length>4096)throw Error('BAD_INPUT');
 const obj=await req.json();
 if(!obj||Array.isArray(obj)||typeof obj!=='object')throw Error('BAD_INPUT');
 return obj;
}
export default {
 async fetch(req,env){
  const u=new URL(req.url),path=u.pathname;
  if(req.method==='GET'&&path==='/api/health')return json({ok:true,app:'KY ERP İşNet Gerçek Bulut Test',environment:'ISOLATED_QA',readOnly:true,noProductionBinding:true});
  if(!allowed(req,env))return denied('QA_IP_NOT_ALLOWED',403);
  if(req.method==='GET'&&path==='/')return new Response(PAGE,{headers:{...NO_STORE,'content-type':'text/html; charset=utf-8',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  if(req.method==='GET'&&path==='/app.js')return new Response(APP_JS,{headers:{...NO_STORE,'content-type':'application/javascript; charset=utf-8'}});
  if(!env.DB)return denied('QA_DATABASE_MISSING',503);
  if(!['GET','POST'].includes(req.method))return denied('METHOD_NOT_ALLOWED',405);
  if(req.method==='POST'&&!validateOrigin(req))return denied('QA_ORIGIN_INVALID',403);
  try{
   if(path==='/api/login'&&req.method==='POST'){
    await loginRateLimit(req,env);
    const body=await parseJson(req),username=txt(body.username),password=txt(body.password);
    if(!username||username.length>80||!password||password.length>200)throw Error('BAD_INPUT');
    const res=await providerLogin(fetch,username,password);
    const cookie=await newSession(req,env,{token:res.token,companies:res.companies,companyId:'',createdAt:Date.now()});
    return json({ok:true,stage:'COMPANY_SELECTION',companies:res.companies,message:'İşNet API girişi doğrulandı.'},200,{'set-cookie':cookie});
   }
   if(path==='/api/state'&&req.method==='GET'){
    const {data}=await getSession(req,env);
    return json({ok:true,stage:data.companyId?'READY':'COMPANY_SELECTION',companies:data.companies,companyId:data.companyId});
   }
   if(path==='/api/company'&&req.method==='POST'){
    const s=await getSession(req,env),body=await parseJson(req),id=txt(body.companyId);
    if(!/^\d+$/.test(id)||!s.data.companies.some(c=>c.id===id))throw Error('BAD_INPUT');
    s.data.companyId=id;await saveSession(req,env,s);
    return json({ok:true,stage:'READY',companyId:id});
   }
   if(path==='/api/list'&&req.method==='GET'){
    const s=await getSession(req,env);
    if(!s.data.companyId)throw Error('QA_LOGIN_REQUIRED');
    const p={kind:txt(u.searchParams.get('kind')),direction:txt(u.searchParams.get('direction')),
      from:txt(u.searchParams.get('from')),to:txt(u.searchParams.get('to'))};
    const r=await listRemote(fetch,s.data.token,s.data.companyId,p.kind,p.direction,p.from,p.to);
    return json({ok:true,...r});
   }
   if(path==='/api/download'&&req.method==='GET'){
    const s=await getSession(req,env);
    if(!s.data.companyId)throw Error('QA_LOGIN_REQUIRED');
    const x=k=>txt(u.searchParams.get(k)),kind=x('kind'),direction=x('direction'),from=x('from'),to=x('to'),ettn=x('ettn'),format=x('format');
    const {bytes}=await downloadRemote(fetch,s.data.token,s.data.companyId,kind,direction,from,to,ettn,format);
    const fname='ISNET-QA-'+direction+'-'+kind+'-'+ettn+'.'+format;
    return new Response(bytes,{headers:{...NO_STORE,'content-type':format==='pdf'?'application/pdf':'application/xml; charset=utf-8',
      'content-disposition':'attachment; filename="'+fname+'"','content-security-policy':"default-src 'none'"}});
   }
   if(path==='/api/logout'&&req.method==='POST'){
    const id=cookieValue(req);
    if(/^[0-9a-f]{64}$/.test(id))await env.DB.prepare('DELETE FROM qa_sessions WHERE session_hash=?').bind(await sha(id)).run();
    return json({ok:true},200,{'set-cookie':cookieName+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});
   }
   return denied('UNKNOWN_QA_ROUTE',404);
  }catch(e){return errResponse(e)}
 }
};