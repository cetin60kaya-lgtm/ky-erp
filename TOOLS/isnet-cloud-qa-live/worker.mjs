/* KY ERP · İşNet QA only — separate Cloudflare Worker and separate D1.
 * No production D1/R2/Google Drive access, no official document send.
 * User's password is not saved; selected portal session is encrypted at rest with AES-GCM.
 * Access is restricted to the public IP approved from DESEN (server-verified Cloudflare header).
 */
import { PAGE, APP_JS } from './ui.mjs';
import { portalLogin, portalList, portalDownload, portalFormHealth } from './portal.ts';
const txt=v=>String(v??'').trim();
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
 if(data.mode!=='portal-v1')throw Error('QA_LOGIN_EXPIRED');
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
 QA_LOGIN_REQUIRED:'Önce normal İşNet portal hesabınızla giriş yapın.',
 PORTAL_FORM_UNAVAILABLE:'Cloudflare gerçek NetteFatura PROD giriş formuna ulaşamadı. Şifre İşNet’e gönderilmedi.',
 PORTAL_PRODUCTION_UNVERIFIED:'İşNet PROD ortamı doğrulanamadı; hesap bilgileri gönderilmeyecek.',
 PORTAL_UNSAFE_TARGET:'Portal yönlendirmesi izinli kaynak dışında kaldı.',
 PORTAL_CREDENTIAL_REJECTED:'Aşama 2: İşNet giriş yanıtında kimlik doğrulama hatası bildirdi.',
 PORTAL_LOGIN_REDIRECT:'Aşama 2: İşNet yeniden giriş ekranına yönlendirdi; oturum doğrulanamadı.',
 PORTAL_LOGIN_FORM_RETURNED:'Aşama 2: Giriş formu geri döndü; yetkili oturum doğrulanamadı.',
 PORTAL_COMPANY_ACCESS_REJECTED:'Aşama 3: İşNet firma listeleme isteğini reddetti.',
 PORTAL_COMPANY_LIST_EMPTY:'Aşama 3: İşNet yetkili firma listesi doğrulanamadı.',
 PORTAL_LOGIN_REJECTED:'İşNet portal girişini reddetti. Tekrar denemeden portal hesabını kontrol edin.',
 PORTAL_LOGIN_HTTP_ERROR:'İşNet portalı giriş isteğinde HTTP hatası döndürdü.',
 PORTAL_INTERACTIVE_SECURITY_REQUIRED:'İşNet ek güvenlik doğrulaması istiyor. İşNet portalında tamamlanması gerekiyor; otomatik geçilmez.',
 PORTAL_USER_CONFIRMATION_REQUIRED:'İşNet kullanıcı onayı istiyor. Otomatik onay verilmez.',
 PORTAL_SELECTION_REQUIRED:'Önce yetkili firmayı seçip portal oturumunu doğrulayın.',
 PORTAL_LIST_HTTP_ERROR:'İşNet belge listesi isteğinde HTTP hatası verdi.',
 PORTAL_LIST_UNVERIFIED:'Portal belge listesi beklenen biçimde doğrulanamadı.',
 PORTAL_SESSION_EXPIRED:'İşNet portal oturumu doğrulanamadı veya süresi doldu.',
 PORTAL_LOGIN_UNVERIFIED:'Normal portal girişi veya firma listesi doğrulanamadı.',
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
 const raw=txt(e?.message); const suffix=raw.split(': ').at(-1); const code=Object.hasOwn(problems,raw)?raw:Object.hasOwn(problems,suffix)?suffix:/ek güvenlik|doğrulaması gerekiyor/i.test(raw)?'PORTAL_INTERACTIVE_SECURITY_REQUIRED':/portal|İşNet|firma/i.test(raw)?'PORTAL_LOGIN_UNVERIFIED':e?.name==='AbortError'||e?.name==='TimeoutError'?'ISNET_TIMEOUT':'QA_UNVERIFIED';
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
  if(req.method==='GET'&&path==='/api/health')return json({ok:true,app:'KY ERP İşNet Gerçek Bulut Test',environment:'ISOLATED_QA',readOnly:true,noProductionBinding:true,mode:'portal-v1',revision:'browser-control-7'});
  if(!allowed(req,env))return denied('QA_IP_NOT_ALLOWED',403);

  if(req.method==='POST'&&path==='/api/browser-run-control'){
   if(!validateOrigin(req))return denied('QA_ORIGIN_INVALID',403);
   if(!env.BROWSER||typeof env.BROWSER.quickAction!=='function')return denied('BROWSER_BINDING_UNAVAILABLE',503);
   const key=await sha('KYERP_BROWSER_RUN_NEUTRAL_CONTROL_V7'),now=Date.now();
   const lock=await env.DB.prepare('INSERT INTO qa_login_attempts(ip_hash,tries,window_start) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET tries=1,window_start=excluded.window_start WHERE qa_login_attempts.window_start<?').bind(key,now,now-86400000).run();
   if(Number(lock.meta?.changes||0)!==1)return denied('BROWSER_CONTROL_DAILY_LIMIT',429);
   const start=Date.now();
   try{
    const r=await env.BROWSER.quickAction('content',{url:'https://example.com/',gotoOptions:{waitUntil:'domcontentloaded',timeout:20000}});
    const html=(await r.text()).slice(0,200000);
    return json({ok:r.ok&&/Example Domain/i.test(html),browserHttp:r.status,neutralControl:/Example Domain/i.test(html),elapsedMs:Date.now()-start,credentialsSent:false,authenticated:false});
   }catch(e){return json({ok:false,error:'BROWSER_CONTROL_FAILED',elapsedMs:Date.now()-start,credentialsSent:false,authenticated:false},502)}
  }
  if(req.method==='POST'&&path==='/api/browser-run-probe'){
   if(!validateOrigin(req))return denied('QA_ORIGIN_INVALID',403);
   if(!env.BROWSER||typeof env.BROWSER.quickAction!=='function')return denied('BROWSER_BINDING_UNAVAILABLE',503);
   // Single bounded anonymous reachability test; no credentials, no private pages.
   const key=await sha('KYERP_BROWSER_RUN_PUBLIC_FORM_PROBE_V6'),now=Date.now();
   const lock=await env.DB.prepare('INSERT INTO qa_login_attempts(ip_hash,tries,window_start) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET tries=1,window_start=excluded.window_start WHERE qa_login_attempts.window_start<?').bind(key,now,now-86400000).run();
   if(Number(lock.meta?.changes||0)!==1)return denied('BROWSER_PROBE_DAILY_LIMIT',429);
   const start=Date.now();
   try{
    const r=await env.BROWSER.quickAction('content',{url:'https://nettefatura.isnet.net.tr/Account/Login',gotoOptions:{waitUntil:'domcontentloaded',timeout:20000}});
    const used=Number(r.headers.get('X-Browser-Ms-Used')||0);
    const html=(await r.text()).slice(0,200000);
    const form=/<form\b/i.test(html)&&/__RequestVerificationToken/.test(html)&&/type\s*=\s*["']password["']/i.test(html);
    const prod=/if\s*\(\s*['"]PROD['"]\s*==\s*['"]TEST['"]\s*\)/i.test(html);
    const challenge=/cf-chl-|captcha|verify you are human|access denied|bot detection/i.test(html)&&!form;
    return json({ok:true,probe:'PUBLIC_FORM_ONLY',browserHttp:r.status,elapsedMs:Date.now()-start,browserMs:used||null,form,productionVerified:form&&prod,challenge,credentialsSent:false,authenticated:false});
   }catch(e){return json({ok:false,error:'BROWSER_PROBE_FAILED',elapsedMs:Date.now()-start,credentialsSent:false,authenticated:false},502)}
  }

  if(req.method==='GET'&&path==='/api/service-connectivity'){
   const targets=[
    ['PROD_PORTAL','https://nettefatura.isnet.net.tr/Account/Login'],
    ['PROD_LEGACY_WSDL','https://nfhostservis.isnet.net.tr/ws/services/efatura?singleWsdl'],
    ['PROD_SOAP_WSDL','https://einvoiceservice.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc?singleWsdl'],
    ['PROD_ADDRESS_WSDL','https://einvoiceservice.isnet.net.tr/AddressBookService/ServiceContract/AddressBookService.svc?singleWsdl']
   ];
   const results=await Promise.all(targets.map(async([name,url])=>{
    const start=Date.now();
    try{
     const r=await fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(25000),headers:{Accept:'application/xml,text/xml,text/html'}});
     const reader=r.body?.getReader();let bytes=0,head='';
     if(reader){try{while(bytes<65536){const x=await reader.read();if(x.done)break;bytes+=x.value.length;head+=new TextDecoder().decode(x.value.subarray(0,65536));if(head.length>=65536)break}}finally{await reader.cancel().catch(()=>{})}}
     return {name,host:new URL(url).hostname,status:r.status,ms:Date.now()-start,wsdl:/<(?:\w+:)?definitions\b|<(?:\w+:)?description\b/i.test(head),loginForm:/__RequestVerificationToken/.test(head)&&/type=["']password["']/i.test(head),redirect:r.status>=300&&r.status<400,authenticated:false};
    }catch(e){return {name,host:new URL(url).hostname,status:null,ms:Date.now()-start,error:e?.name==='TimeoutError'||e?.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR',authenticated:false}}
   }));
   return json({ok:true,credentialsSent:false,results});
  }
  if(req.method==='GET'&&path==='/api/portal-form-health')return json({ok:true,credentialTested:false,targets:await portalFormHealth()});
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
    const res=await portalLogin(username,password);
    const companies=res.companies.filter(c=>/^\d+$/.test(c.id)&&c.hasRole!==false).map(c=>({id:c.id,name:c.name}));
    if(!companies.length)throw Error('PORTAL_LOGIN_UNVERIFIED');
    const cookie=await newSession(req,env,{mode:'portal-v1',username,companies,companyId:'',createdAt:Date.now()});
    return json({ok:true,stage:'COMPANY_SELECTION',companies,message:'İşNet portal firma listesi doğrulandı.'},200,{'set-cookie':cookie});
   }
   if(path==='/api/state'&&req.method==='GET'){
    const {data}=await getSession(req,env);
    return json({ok:true,stage:data.companyId?'READY':'COMPANY_SELECTION',companies:data.companies,companyId:data.companyId});
   }
   if(path==='/api/company'&&req.method==='POST'){
    const s=await getSession(req,env),body=await parseJson(req),id=txt(body.companyId);
    if(!/^\d+$/.test(id)||!s.data.companies.some(c=>c.id===id))throw Error('BAD_INPUT');
    const selected=s.data.companies.find(c=>c.id===id);
    const password=String(body.password??'');if(!password||password.length>200)throw Error('BAD_INPUT');
    await loginRateLimit(req,env);
    const session=await portalLogin(s.data.username,password,id,selected.name);
    if(!session.companySelected||!session.cookie||!session.companies.some(c=>c.id===id))throw Error('PORTAL_SELECTION_REQUIRED');
    s.data.companyId=id;s.data.portal={base:session.base,cookie:session.cookie,companyId:id,companySelected:true};
    await saveSession(req,env,s);
    return json({ok:true,stage:'READY',companyId:id});
   }
   if(path==='/api/list'&&req.method==='GET'){
    const s=await getSession(req,env);
    if(!s.data.companyId)throw Error('QA_LOGIN_REQUIRED');
    const p={kind:txt(u.searchParams.get('kind')),direction:txt(u.searchParams.get('direction')),
      from:txt(u.searchParams.get('from')),to:txt(u.searchParams.get('to'))};
    if(!kindOk(p.kind)||!dirOk(p.direction)||!periodOk(p.from,p.to))throw Error('INVALID_QUERY');
    const r=await portalList(s.data.portal,p.kind,p.direction,p.from,p.to);
    return json({ok:true,...r});
   }
   if(path==='/api/download'&&req.method==='GET'){
    const s=await getSession(req,env);
    if(!s.data.companyId)throw Error('QA_LOGIN_REQUIRED');
    const x=k=>txt(u.searchParams.get(k)),kind=x('kind'),direction=x('direction'),from=x('from'),to=x('to'),ettn=x('ettn'),format=x('format');
    if(!kindOk(kind)||!dirOk(direction)||!periodOk(from,to))throw Error('INVALID_QUERY');
    const {bytes}=await portalDownload(s.data.portal,kind,direction,from,to,ettn,format);
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