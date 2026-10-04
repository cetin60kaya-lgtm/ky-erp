// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toLocaleUpperCase("tr-TR").replace(/İ/g,"I");
const now=()=>new Date().toISOString();
const jsonObject=(v:unknown)=>{if(v&&typeof v==="object"&&!Array.isArray(v))return v as Row;try{const p=JSON.parse(text(v)||"{}");return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}catch{return{}}};
const err=(code:string,message:string)=>({ok:false,success:false,error:{code,message}});
function isOwner(u:Row){return["SUPER_ADMIN","ADMIN"].includes(upper(u?.role))}
function isCompanyAdmin(u:Row){return upper(u?.role)==="COMPANY_ADMIN"}
function permission(u:Row){return(Array.isArray(u?.permissions)?u.permissions:[]).find((p:Row)=>upper(p.moduleKey||p.module_key)==="COMPLIANCE")||null}
function canView(u:Row){return isOwner(u)||isCompanyAdmin(u)||Boolean(permission(u)?.canView??permission(u)?.can_view)}
function canWrite(u:Row){const p=permission(u);return isOwner(u)||isCompanyAdmin(u)||Boolean(p?.canCreate??p?.can_create??p?.canUpdate??p?.can_update)}
function ownSlug(u:Row){return text(u?.mainCompanySlug||u?.main_company_slug||u?.security?.main_company_slug).toLocaleLowerCase("tr-TR")}
function requestedSlug(c:Context<AppEnv>,b:Row={}){return text(b.mainCompanySlug||b.main_company_slug||c.req.query("mainCompanySlug")||c.req.header("X-KYERP-Tenant-Slug")).toLocaleLowerCase("tr-TR")}
async function bodyOf(c:Context<AppEnv>):Promise<Row>{try{const b=await c.req.json();return b&&typeof b==="object"&&!Array.isArray(b)?b as Row:{}}catch{return{}}}
async function scope(c:Context<AppEnv>,body:Row={},write=false){const u=await getAuthenticatedUser(c) as Row|null;if(!u||!canView(u)||(write&&!canWrite(u)))return{ok:false,status:u?403:401,user:u,slug:""};const requested=requestedSlug(c,body),own=ownSlug(u);if(!isOwner(u)){if(!own||(requested&&requested!==own))return{ok:false,status:403,user:u,slug:""};return{ok:true,status:200,user:u,slug:own}}const slug=requested||own;if(!slug)return{ok:false,status:400,user:u,slug:""};return{ok:true,status:200,user:u,slug}}
function scopeError(c:Context<AppEnv>,s:Row){return c.json(err(s.status===401?"UNAUTHORIZED":"COMPLIANCE_FORBIDDEN",s.status===401?"Oturum gerekli.":"Denetim Merkezi için yetkiniz yok."),s.status as any)}
async function event(c:Context<AppEnv>,slug:string,eventType:string,entityType:string,entityId:string,userId:string,detail:Row={}){try{await c.env.DB.prepare("INSERT INTO compliance_events(id,main_company_slug,event_type,entity_type,entity_id,actor_user_id,detail,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),slug,eventType,entityType,entityId,userId||null,JSON.stringify(detail),now()).run()}catch{}}
function norm(v:unknown){return text(v).toLocaleLowerCase("tr-TR").replace(/ı/g,"i").replace(/ş/g,"s").replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ö/g,"o").replace(/ç/g,"c").replace(/İ/g,"i").normalize("NFD").replace(/[\u0300-\u036f]/g,"")}

const CONTROL_SEEDS=[
 ["FACILITY_PROFILE","Tesis profili ve faaliyet bilgileri","Tesis","Tesis kimliği, çalışan sayısı, prosesler ve faaliyet kapsamı.",0,"Yönetim"],
 ["FACILITY_LEGAL","İşyeri yasal izin ve kayıtları","Tesis","Ruhsat, faaliyet, ticaret/sanayi ve uygulanabilir resmi tesis kayıtları.",0,"İdari"],
 ["BRAND_DISNEY_FAMA","Disney FAMA / tesis yetkilendirmesi","Marka Özel","Disney tesis beyanı, FAMA ve üretim yetkilendirme kanıtları.",365,"Yönetim"],
 ["BRAND_CUSTOM_APPROVAL","Müşteri / marka özel onayı","Marka Özel","Müşteriye özgü onay, portal veya uygunluk kaydı.",365,"Yönetim"],
 ["AUDIT_REPORT","Denetim / doğrulama raporu","Denetim","Geçerli audit, verified assessment veya bağımsız doğrulama raporu.",365,"Yönetim"],
 ["AUDIT_SELF_ASSESSMENT","Öz değerlendirme / self assessment","Denetim","Tesisin kendi değerlendirme cevapları ve destekleyici kanıtları.",365,"Yönetim"],
 ["AUDIT_VERIFICATION","Doğrulayıcı / verifier kaydı","Denetim","Doğrulama kuruluşu, verifier sonucu ve final doğrulanmış kayıt.",365,"Yönetim"],
 ["HR_EMPLOYMENT_FILES","Personel özlük ve sözleşme kayıtları","İnsan Kaynakları","Çalışan dosyaları, sözleşmeler, işe giriş/çıkış ve istihdam kanıtları.",0,"İK"],
 ["HR_AGE_ID","Yaş ve kimlik doğrulaması","İnsan Kaynakları","Çalışan yaşı ve kimlik uygunluğunu kanıtlayan kayıtlar.",0,"İK"],
 ["HR_WAGES_PAYMENTS","Ücret, bordro ve ödeme kanıtları","İnsan Kaynakları","Bordro, banka/ödeme kayıtları, yan hak ve yasal kesintiler.",30,"İK"],
 ["HR_TIME_ATTENDANCE","Puantaj, çalışma süresi ve fazla mesai","İnsan Kaynakları","Giriş-çıkış, puantaj, çalışma saati ve fazla mesai kayıtları.",30,"İK"],
 ["HR_LEAVE","İzin ve dinlenme kayıtları","İnsan Kaynakları","Yıllık izin, hafta tatili, dinlenme ve ilgili onay kayıtları.",30,"İK"],
 ["HR_FORCED_LABOR","Zorla çalıştırma ve işe alım ücreti kontrolleri","İnsan Kaynakları","Zorla çalıştırma, belge alıkoyma ve işe alım ücreti risk kontrolleri.",365,"İK"],
 ["HR_WORKER_VOICE","Çalışan temsili ve şikayet mekanizması","İnsan Kaynakları","Çalışan temsilcisi, örgütlenme, şikayet ve geri bildirim mekanizmaları.",365,"İK"],
 ["HR_DIGNITY","Ayrımcılık, taciz ve kötü muameleyi önleme","İnsan Kaynakları","Ayrımcılık, taciz, disiplin ve insan onuru politikaları/kayıtları.",365,"İK"],
 ["HSE_MANAGEMENT","İSG yönetim sistemi","İSG","İSG sorumlulukları, uzman/hekim, kurul ve genel yönetim sistemi.",365,"İSG"],
 ["HSE_RISK_ASSESSMENT","İSG risk değerlendirmesi","İSG","Risk değerlendirmesi, revizyon ve aksiyon kayıtları.",365,"İSG"],
 ["HSE_EMERGENCY_FIRE","Acil durum, yangın ve tahliye","İSG","Acil durum planı, ekipler, tatbikat, yangın ekipmanı ve tahliye kayıtları.",365,"İSG"],
 ["HSE_TRAINING","İSG eğitim ve yetkinlik kayıtları","İSG","İSG eğitim planı, katılım, sertifika ve yetkinlik kanıtları.",365,"İSG"],
 ["HSE_OCC_HEALTH","Sağlık gözetimi ve ilk yardım","İSG","İşe giriş/periyodik muayene, sağlık gözetimi ve ilk yardım kayıtları.",365,"İK"],
 ["HSE_INCIDENTS","Kaza, ramak kala ve meslek hastalığı","İSG","İş kazası, ramak kala, meslek hastalığı ve ilgili aksiyon kayıtları.",0,"İSG"],
 ["HSE_PPE","KKD uygunluk ve zimmet kayıtları","İSG","Kişisel koruyucu donanım uygunluğu, zimmet ve kullanım eğitimi.",365,"İSG"],
 ["HSE_EQUIPMENT_SAFETY","Makine, ekipman ve periyodik kontroller","İSG","Makine güvenliği, bakım, kaldırma/iletme ve basınçlı ekipman kontrolleri.",365,"Bakım"],
 ["HSE_ELECTRICAL","Elektrik, topraklama ve paratoner kontrolleri","İSG","Elektrik tesisatı, pano, topraklama ve yıldırımdan korunma kontrolleri.",365,"Bakım"],
 ["CHEM_INVENTORY_SDS","Kimyasal envanter ve SDS/MSDS","Kimyasal","Güncel kimyasal envanter, SDS/MSDS, CAS ve etiketleme kayıtları.",365,"Boyahane"],
 ["CHEM_MRSL","MRSL / ZDHC kimyasal uygunluğu","Kimyasal","MRSL uygunluğu, Gateway/InCheck/ChemCheck ve formülasyon kanıtları.",365,"Boyahane"],
 ["CHEM_STORAGE","Kimyasal depolama ve güvenli kullanım","Kimyasal","Depolama, ikincil kap, etiket, taşıma, PPE ve kullanım güvenliği.",365,"Boyahane"],
 ["ENV_MANAGEMENT","Çevre yönetim sistemi","Çevre","Çevre politika, boyut-etki, hedef, iç tetkik, eğitim ve yönetim kayıtları.",365,"Çevre"],
 ["ENV_PERMITS","Çevre izin / muafiyet ve yasal kayıtlar","Çevre","Çevre izinleri, ÇED/muafiyet ve uygulanabilir yasal çevre kayıtları.",365,"Çevre"],
 ["ENV_RESOURCE_USE","Su, enerji ve kaynak kullanımı","Çevre","Su, enerji, sera gazı ve kaynak tüketimi izleme/iyileştirme kayıtları.",365,"Çevre"],
 ["ENV_WASTEWATER","Atık su / deşarj ve analiz kayıtları","Çevre","Atık su, deşarj, arıtma, analiz ve uygunluk kayıtları.",365,"Çevre"],
 ["ENV_AIR_EMISSIONS","Hava emisyonları ve ölçümler","Çevre","Emisyon kaynakları, izinler, ölçüm ve izleme kanıtları.",365,"Çevre"],
 ["ENV_WASTE","Atık yönetimi ve bertaraf","Çevre","Tehlikeli/tehlikesiz atık, taşıma, beyan ve lisanslı bertaraf kayıtları.",365,"Çevre"],
 ["SCM_TRACEABILITY","Üretim yeri, proses ve taşeron izlenebilirliği","Tedarik Zinciri","Üretim lokasyonu, proses, taşeron/alt yüklenici ve sipariş izlenebilirliği.",365,"Satınalma"],
 ["SCM_SUPPLIER_DUE_DILIGENCE","Tedarikçi / taşeron uygunluk değerlendirmesi","Tedarik Zinciri","Tedarikçi sözleşmesi, durum tespiti, değerlendirme ve takip kayıtları.",365,"Satınalma"],
 ["GOV_MANAGEMENT_SYSTEM","Politika, sorumluluk ve iç kontrol sistemi","Yönetim","Politika/prosedür, sorumluluk, iç kontrol, eğitim ve yönetim gözden geçirme.",365,"Yönetim"],
 ["GOV_ETHICS","Etik, rüşvet ve yolsuzluk kontrolleri","Yönetim","Rüşvet, yolsuzluk, sahtecilik ve çıkar çatışması önleme kayıtları.",365,"Yönetim"],
 ["GOV_DATA_PRIVACY","Veri gizliliği ve bilgi güvenliği","Yönetim","Kişisel veri, bilgi güvenliği ve erişim kontrol kayıtları.",365,"Yönetim"],
 ["GOV_CAPA","Düzeltici faaliyet / CAPA kapanış kanıtları","Denetim","Kök neden, düzeltici/önleyici faaliyet, kanıt, doğrulama ve kapanış.",0,"Yönetim"],
 ["QUALITY_MANAGEMENT","Kalite yönetimi ve kontrol kayıtları","Kalite","Kalite prosedürü, kontrol sonuçları, uygunsuzluk ve iyileştirme kayıtları.",365,"Kalite"],
 ["PRODUCT_SAFETY","Ürün sağlık ve güvenlik uygunluğu","Ürün","Ürün sağlık/güvenlik, müşteri teknik şartı, test ve üretime uygunluk kanıtları.",365,"Kalite"]
];

export function inferComplianceControlKeys(title:unknown,category:unknown="",code:unknown=""):string[]{
 const n=norm([title,category,code].join(" "));
 const rules:[RegExp,string][]=[
  [/fama|facility authorization|tesis yetkilendirme/,"BRAND_DISNEY_FAMA"],
  [/pre.?assessment|minimum requirement|musteri.*onay|brand.*approval/,"BRAND_CUSTOM_APPROVAL"],
  [/verified assessment|verifier|dogrulama kayit|final verified|verification|sertifika/,"AUDIT_VERIFICATION"],
  [/self.?assessment|joint assessment|oz degerlendirme/,"AUDIT_SELF_ASSESSMENT"],
  [/audit rapor|denetim rapor|nitelikli ils|pasa/,"AUDIT_REPORT"],
  [/urun saglik|product health|ready to manufacture|\brtm\b|clear to wear/,"PRODUCT_SAFETY"],
  [/izlenebilir|traceability|uretim lokasyon|alt yuklenici|subcontract|tasaron/,"SCM_TRACEABILITY"],
  [/tedarikci.*uygunluk|supplier.*assessment|tedarikci.*sozles/,"SCM_SUPPLIER_DUE_DILIGENCE"],
  [/yas uygun|kimlik dogr|child labour|child labor|18\+/,"HR_AGE_ID"],
  [/ucret|bordro|banka odeme|fair remuneration|compensation|wages|yan hak/,"HR_WAGES_PAYMENTS"],
  [/puantaj|calisma saat|fazla mesai|working hours|hours of work|giris.?cikis/,"HR_TIME_ATTENDANCE"],
  [/yillik izin|izin kayit|rest day|dinlenme/,"HR_LEAVE"],
  [/ozluk|is sozles|employment file|precarious employment|personel kayit/,"HR_EMPLOYMENT_FILES"],
  [/zorla calis|forced labor|forced labour|recruitment fee|ise alim ucret|borc karsiligi/,"HR_FORCED_LABOR"],
  [/orgutlen|calisan temsil|worker voice|worker involvement|sikayet|grievance|freedom of association/,"HR_WORKER_VOICE"],
  [/ayrimcil|taciz|harassment|abuse|disciplin|no discrimination/,"HR_DIGNITY"],
  [/risk degerlend/,"HSE_RISK_ASSESSMENT"],
  [/acil durum|yangin|tahliye|fire|emergency/,"HSE_EMERGENCY_FIRE"],
  [/isg egitim|health.*safety.*training|yetkinlik/,"HSE_TRAINING"],
  [/saglik muayene|saglik gozet|isyeri hekimi|ilk yard|occupational health/,"HSE_OCC_HEALTH"],
  [/is kaz|ramak kala|meslek hast|incident/,"HSE_INCIDENTS"],
  [/\bkkd\b|ppe|koruyucu ekipman/,"HSE_PPE"],
  [/elektrik|topraklama|paratoner|pano/,"HSE_ELECTRICAL"],
  [/makine|ekipman|basincli kap|kompresor|forklift|transpalet|kaldirma|periyodik kontrol/,"HSE_EQUIPMENT_SAFETY"],
  [/kimyasal envanter|sds|msds|\bcas\b|etiketleme/,"CHEM_INVENTORY_SDS"],
  [/mrsl|zdhc|incheck|chemcheck|gateway/,"CHEM_MRSL"],
  [/kimyasal.*depol|chemical storage/,"CHEM_STORAGE"],
  [/atik su|wastewater|desarj|aritma/,"ENV_WASTEWATER"],
  [/emisyon|air emission/,"ENV_AIR_EMISSIONS"],
  [/atik yonet|tehlikeli atik|waste management|bertaraf/,"ENV_WASTE"],
  [/enerji|energy|sera gazi|ghg|su izleme|water use|resource use/,"ENV_RESOURCE_USE"],
  [/cev(re|resel).*izin|ced|environmental permit|muafiyet/,"ENV_PERMITS"],
  [/cevre yonet|environmental management|environment\b/,"ENV_MANAGEMENT"],
  [/rusvet|yolsuz|bribery|corruption|ethical business|etik is/,"GOV_ETHICS"],
  [/veri gizl|bilgi guven|data privacy|information security/,"GOV_DATA_PRIVACY"],
  [/capa|duzeltici|corrective action|root cause|kok neden|iyilestirme/,"GOV_CAPA"],
  [/yonetim sistemi|management system|politika.*prosedur|ic kontrol/,"GOV_MANAGEMENT_SYSTEM"],
  [/kalite|quality control|quality management/,"QUALITY_MANAGEMENT"],
  [/isyeri.*ruhsat|faaliyet belgesi|ticaret sicil|sanayi sicil|capacity report|yapi kullanim/,"FACILITY_LEGAL"],
  [/tesis profili|facility profile|supplier profile|calisan sayisi.*proses/,"FACILITY_PROFILE"],
  [/is sagligi|health.*safety|ohs|isg/,"HSE_MANAGEMENT"]
 ];
 for(const [rx,key] of rules)if(rx.test(n))return[key];
 return[];
}

async function tableAvailable(c:Context<AppEnv>,name:string){try{const r=await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first<Row>();return Boolean(r?.name)}catch{return false}}
async function tablesReady(c:Context<AppEnv>){return(await tableAvailable(c,"compliance_controls"))&&(await tableAvailable(c,"compliance_requirement_controls"))&&(await tableAvailable(c,"compliance_document_controls"))}

export async function ensureComplianceSharedEvidence(c:Context<AppEnv>,slug:string){
 if(!slug||!(await tablesReady(c)))return false;
 const ts=now();
 const count=await c.env.DB.prepare("SELECT COUNT(*) n FROM compliance_controls WHERE main_company_slug=?").bind(slug).first<Row>();
 if(Number(count?.n||0)<CONTROL_SEEDS.length){
  for(const row of CONTROL_SEEDS){
   const [key,title,domain,description,cycleDays,owner]=row;
   await c.env.DB.prepare("INSERT OR IGNORE INTO compliance_controls(id,main_company_slug,control_key,title,domain,description,evidence_types,cycle_days,warning_days,critical_days,owner_department,is_active,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,'[\"DOCUMENT\"]',?,30,7,?,1,'{\"canonical\":true}',?,?)").bind(crypto.randomUUID(),slug,key,title,domain,description,cycleDays||null,owner,ts,ts).run();
  }
 }
 const controls=await c.env.DB.prepare("SELECT id,control_key FROM compliance_controls WHERE main_company_slug=? AND is_active=1").bind(slug).all<Row>();
 const controlByKey=new Map((controls.results||[]).map((x:Row)=>[text(x.control_key),text(x.id)]));
 const reqs=await c.env.DB.prepare("SELECT r.id,r.code,r.title,r.category,p.code profile_code FROM compliance_requirements r LEFT JOIN compliance_profiles p ON p.id=r.profile_id WHERE r.main_company_slug=? AND COALESCE(r.is_active,1)=1").bind(slug).all<Row>();
 const existing=await c.env.DB.prepare("SELECT requirement_id,control_id FROM compliance_requirement_controls WHERE main_company_slug=?").bind(slug).all<Row>();
 const reqWithMap=new Set((existing.results||[]).map((x:Row)=>text(x.requirement_id)));
 for(const r of reqs.results||[]){
  if(reqWithMap.has(text(r.id)))continue;
  const keys=inferComplianceControlKeys(r.title,r.category,r.code);
  for(const key of keys){
   const controlId=controlByKey.get(key); if(!controlId)continue;
   await c.env.DB.prepare("INSERT OR IGNORE INTO compliance_requirement_controls(id,main_company_slug,requirement_id,control_id,relation_type,confidence,source,created_at,updated_at) VALUES(?,?,?,?, 'EQUIVALENT',0.85,'CANONICAL_INFERENCE',?,?)").bind(crypto.randomUUID(),slug,r.id,controlId,ts,ts).run();
  }
 }
 const propagated=await c.env.DB.prepare("SELECT dr.document_id,rc.control_id FROM compliance_document_requirements dr JOIN compliance_requirement_controls rc ON rc.main_company_slug=dr.main_company_slug AND rc.requirement_id=dr.requirement_id WHERE dr.main_company_slug=?").bind(slug).all<Row>();
 const docExisting=await c.env.DB.prepare("SELECT document_id,control_id FROM compliance_document_controls WHERE main_company_slug=?").bind(slug).all<Row>();
 const docKeys=new Set((docExisting.results||[]).map((x:Row)=>text(x.document_id)+"|"+text(x.control_id)));
 for(const x of propagated.results||[]){
  const k=text(x.document_id)+"|"+text(x.control_id); if(docKeys.has(k))continue;
  await c.env.DB.prepare("INSERT OR IGNORE INTO compliance_document_controls(id,main_company_slug,document_id,control_id,is_primary,confidence,source,created_at,updated_at) VALUES(?,?,?,?,0,0.9,'REQUIREMENT_PROPAGATION',?,?)").bind(crypto.randomUUID(),slug,x.document_id,x.control_id,ts,ts).run();
  docKeys.add(k);
 }
 return true;
}

export async function sharedCoveredRequirementIds(c:Context<AppEnv>,slug:string,activeDocumentIds:string[]){
 if(!(await ensureComplianceSharedEvidence(c,slug)))return new Set<string>();
 const active=new Set(activeDocumentIds.map(text).filter(Boolean));
 const systemReady=await tableAvailable(c,"compliance_system_evidence");
 const [docReq,reqControls,docControls,systemEvidence]=await Promise.all([
  c.env.DB.prepare("SELECT document_id,requirement_id FROM compliance_document_requirements WHERE main_company_slug=?").bind(slug).all<Row>(),
  c.env.DB.prepare("SELECT requirement_id,control_id FROM compliance_requirement_controls WHERE main_company_slug=?").bind(slug).all<Row>(),
  c.env.DB.prepare("SELECT document_id,control_id FROM compliance_document_controls WHERE main_company_slug=?").bind(slug).all<Row>(),
  systemReady?c.env.DB.prepare("SELECT control_id,expires_at FROM compliance_system_evidence WHERE main_company_slug=? AND UPPER(status)='VERIFIED'").bind(slug).all<Row>():Promise.resolve({results:[]})
 ]);
 const direct=new Set((docReq.results||[]).filter((x:Row)=>active.has(text(x.document_id))).map((x:Row)=>text(x.requirement_id)));
 const today=now().slice(0,10);
 const coveredControls=new Set((docControls.results||[]).filter((x:Row)=>active.has(text(x.document_id))).map((x:Row)=>text(x.control_id)));
 for(const x of systemEvidence.results||[]){const exp=text(x.expires_at).slice(0,10);if(!exp||exp>=today)coveredControls.add(text(x.control_id))}
 const reqMap=new Map<string,string[]>();
 for(const x of reqControls.results||[]){const rid=text(x.requirement_id),cid=text(x.control_id);if(!reqMap.has(rid))reqMap.set(rid,[]);reqMap.get(rid)!.push(cid);if(direct.has(rid))coveredControls.add(cid)}
 const covered=new Set<string>(direct);
 for(const [rid,cids] of reqMap.entries())if(cids.length&&cids.every(cid=>coveredControls.has(cid)))covered.add(rid);
 return covered;
}

async function systemEvidenceCandidates(c:Context<AppEnv>,slug:string){
 await ensureComplianceSharedEvidence(c,slug);
 const controls=await c.env.DB.prepare("SELECT id,control_key,title,cycle_days FROM compliance_controls WHERE main_company_slug=? AND is_active=1").bind(slug).all<Row>();
 const byKey=new Map((controls.results||[]).map((x:Row)=>[text(x.control_key),x]));
 const out:Row[]=[];
 const add=(key:string,sourceModule:string,sourceRef:string,title:string,snapshot:Row,periodStart?:string,periodEnd?:string,confidence=.8)=>{
  const control=byKey.get(key);if(!control)return;
  let expiresAt:null|string=null;const cycle=Number(control.cycle_days||0);
  if(periodEnd&&cycle>0){const t=Date.parse(periodEnd+"T00:00:00Z");if(Number.isFinite(t))expiresAt=new Date(t+cycle*86400000).toISOString().slice(0,10)}
  out.push({controlId:control.id,controlKey:key,controlTitle:control.title,sourceModule,sourceType:"ERP_DATA",sourceRef,title,periodStart:periodStart||null,periodEnd:periodEnd||null,expiresAt,confidence,snapshot});
 };
 if(await tableAvailable(c,"hr_daily_attendance")){
  try{
   const r=await c.env.DB.prepare("SELECT COUNT(*) n,COUNT(DISTINCT a.employee_id) employees,MIN(a.work_date) period_start,MAX(a.work_date) period_end FROM hr_daily_attendance a JOIN hr_daily_employees e ON e.id=a.employee_id WHERE e.main_company_id=? AND (a.day_shift=1 OR a.night_shift=1) AND a.work_date>=date('now','-45 day')").bind(slug).first<Row>();
   if(Number(r?.n||0)>0)add("HR_TIME_ATTENDANCE","IK_PDKS","hr_daily_attendance:last45","Son 45 günlük puantaj / çalışma süresi kayıtları",{recordCount:Number(r.n),employeeCount:Number(r.employees)},text(r.period_start),text(r.period_end),.95);
  }catch{}
 }
 if(await tableAvailable(c,"hr_daily_payments")){
  try{
   const r=await c.env.DB.prepare("SELECT COUNT(*) n,COUNT(DISTINCT employee_id) employees,MIN(period_start) period_start,MAX(period_end) period_end,SUM(total_amount_cents) total_cents FROM hr_daily_payments WHERE main_company_id=? AND UPPER(status)='PAID' AND period_end>=date('now','-90 day')").bind(slug).first<Row>();
   if(Number(r?.n||0)>0)add("HR_WAGES_PAYMENTS","IK_ODEME","hr_daily_payments:last90","Son 90 günlük ödeme kayıtları",{paymentCount:Number(r.n),employeeCount:Number(r.employees),totalAmountCents:Number(r.total_cents||0)},text(r.period_start),text(r.period_end),.75);
  }catch{}
 }
 if(await tableAvailable(c,"ik_leave_plans")){
  try{
   const r=await c.env.DB.prepare("SELECT COUNT(*) n,MIN(start_date) period_start,MAX(end_date) period_end FROM ik_leave_plans WHERE main_company_id=? AND start_date>=date('now','start of year')").bind(slug).first<Row>();
   if(Number(r?.n||0)>0)add("HR_LEAVE","IK_IZIN","ik_leave_plans:currentYear","Cari yıl izin planı ve izin kayıtları",{recordCount:Number(r.n)},text(r.period_start),text(r.period_end),.8);
  }catch{}
 }
 if(await tableAvailable(c,"hr_daily_employees")){
  try{
   const r=await c.env.DB.prepare("SELECT COUNT(*) n FROM hr_daily_employees WHERE main_company_id=?").bind(slug).first<Row>();
   if(Number(r?.n||0)>0)add("HR_EMPLOYMENT_FILES","IK_PERSONEL","hr_daily_employees:current","ERP personel ana listesi",{employeeCount:Number(r.n)},undefined,undefined,.65);
  }catch{}
 }
 if(await tableAvailable(c,"products")){
  try{
   const r=await c.env.DB.prepare("SELECT COUNT(*) n FROM products WHERE main_company_slug=? AND COALESCE(is_active,1)=1 AND deleted_at IS NULL").bind(slug).first<Row>();
   if(Number(r?.n||0)>0)add("CHEM_INVENTORY_SDS","BOYAHANE","products:active","Boyahane aktif kimyasal/ürün envanteri — SDS uygunluğu ayrıca doğrulanmalı",{productCount:Number(r.n)},undefined,undefined,.55);
  }catch{}
 }
 if(await tableAvailable(c,"compliance_system_evidence")){
  const verified=await c.env.DB.prepare("SELECT control_id,source_module,source_ref,period_start,period_end,expires_at FROM compliance_system_evidence WHERE main_company_slug=? AND UPPER(status)='VERIFIED'").bind(slug).all<Row>();
  const today=now().slice(0,10);
  const live=new Set((verified.results||[]).filter((x:Row)=>!text(x.expires_at)||text(x.expires_at).slice(0,10)>=today).map((x:Row)=>[text(x.control_id),upper(x.source_module),text(x.source_ref),text(x.period_start),text(x.period_end)].join("|")));
  return out.filter((x:Row)=>!live.has([text(x.controlId),upper(x.sourceModule),text(x.sourceRef),text(x.periodStart),text(x.periodEnd)].join("|")));
 }
 return out;
}

export function registerComplianceSharedEvidenceRoutes(app:Hono<AppEnv>){

 app.get("/api/compliance/applicability",async c=>{const s=await scope(c);if(!s.ok)return scopeError(c,s);if(!(await tableAvailable(c,"compliance_requirement_applicability")))return c.json({ok:true,data:[]});const r=await c.env.DB.prepare("SELECT * FROM compliance_requirement_applicability WHERE main_company_slug=? ORDER BY updated_at DESC").bind(s.slug).all<Row>();return c.json({ok:true,data:r.results||[]})});
 app.patch("/api/compliance/requirements/:id/applicability",async c=>{
  const b=await bodyOf(c),s=await scope(c,b,true);if(!s.ok)return scopeError(c,s);
  if(!(await tableAvailable(c,"compliance_requirement_applicability")))return c.json(err("MIGRATION_REQUIRED","Uygulanabilirlik migration henüz uygulanmamış."),409);
  const requirementId=c.req.param("id"),req=await c.env.DB.prepare("SELECT id FROM compliance_requirements WHERE id=? AND main_company_slug=?").bind(requirementId,s.slug).first<Row>();
  if(!req)return c.json(err("NOT_FOUND","Gereklilik bulunamadı."),404);
  const state=upper(b.state||"APPLICABLE"),allowed=new Set(["APPLICABLE","REVIEW","EXEMPT","NOT_APPLICABLE"]);
  if(!allowed.has(state))return c.json(err("INVALID_APPLICABILITY","Geçersiz uygulanabilirlik durumu."),422);
  const reason=text(b.reason);
  if(["EXEMPT","NOT_APPLICABLE"].includes(state)&&!reason)return c.json(err("REASON_REQUIRED","Muaf veya uygulanmaz kararı için gerekçe zorunludur."),422);
  const ts=now(),old=await c.env.DB.prepare("SELECT id FROM compliance_requirement_applicability WHERE main_company_slug=? AND requirement_id=?").bind(s.slug,requirementId).first<Row>(),id=text(old?.id)||crypto.randomUUID();
  if(old)await c.env.DB.prepare("UPDATE compliance_requirement_applicability SET state=?,reason=?,evidence_file_asset_id=?,decided_by=?,decided_at=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(state,reason||null,text(b.evidenceFileAssetId)||null,text(s.user?.id)||null,ts,ts,id,s.slug).run();
  else await c.env.DB.prepare("INSERT INTO compliance_requirement_applicability(id,main_company_slug,requirement_id,state,reason,evidence_file_asset_id,decided_by,decided_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,s.slug,requirementId,state,reason||null,text(b.evidenceFileAssetId)||null,text(s.user?.id)||null,ts,ts,ts).run();
  await event(c,s.slug,"REQUIREMENT_APPLICABILITY_SET","REQUIREMENT",requirementId,text(s.user?.id),{state,reason});
  return c.json({ok:true,data:{id,state}});
 });
 app.get("/api/compliance/controls",async c=>{const s=await scope(c);if(!s.ok)return scopeError(c,s);await ensureComplianceSharedEvidence(c,s.slug);const r=await c.env.DB.prepare("SELECT c.*,(SELECT COUNT(*) FROM compliance_requirement_controls rc WHERE rc.main_company_slug=c.main_company_slug AND rc.control_id=c.id) requirement_count,(SELECT COUNT(*) FROM compliance_document_controls dc WHERE dc.main_company_slug=c.main_company_slug AND dc.control_id=c.id) evidence_count FROM compliance_controls c WHERE c.main_company_slug=? AND c.is_active=1 ORDER BY c.domain,c.title").bind(s.slug).all<Row>();return c.json({ok:true,data:(r.results||[]).map((x:Row)=>({...x,evidence_types:JSON.parse(x.evidence_types||'[]'),metadata:jsonObject(x.metadata)}))})});
 app.post("/api/compliance/controls",async c=>{const b=await bodyOf(c),s=await scope(c,b,true);if(!s.ok)return scopeError(c,s);const key=upper(b.controlKey||b.key).replace(/[^A-Z0-9_]+/g,"_"),title=text(b.title);if(!key||!title)return c.json(err("CONTROL_REQUIRED","Kontrol anahtarı ve adı zorunludur."),422);const id=crypto.randomUUID(),ts=now();try{await c.env.DB.prepare("INSERT INTO compliance_controls(id,main_company_slug,control_key,title,domain,description,evidence_types,cycle_days,warning_days,critical_days,owner_department,applicability_rule,is_active,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)").bind(id,s.slug,key,title,text(b.domain)||"Özel",text(b.description)||null,JSON.stringify(Array.isArray(b.evidenceTypes)?b.evidenceTypes:["DOCUMENT"]),b.cycleDays==null?null:Number(b.cycleDays),Number(b.warningDays??30),Number(b.criticalDays??7),text(b.ownerDepartment)||null,text(b.applicabilityRule)||null,JSON.stringify(jsonObject(b.metadata)),ts,ts).run()}catch{return c.json(err("CONTROL_EXISTS","Bu ortak kontrol anahtarı zaten mevcut."),409)}await event(c,s.slug,"CONTROL_CREATED","CONTROL",id,text(s.user?.id),{controlKey:key});return c.json({ok:true,data:{id,controlKey:key}},201)});
 app.post("/api/compliance/requirements/:id/controls",async c=>{const b=await bodyOf(c),s=await scope(c,b,true);if(!s.ok)return scopeError(c,s);await ensureComplianceSharedEvidence(c,s.slug);const rid=c.req.param("id"),req=await c.env.DB.prepare("SELECT id FROM compliance_requirements WHERE id=? AND main_company_slug=?").bind(rid,s.slug).first<Row>();if(!req)return c.json(err("NOT_FOUND","Gereklilik bulunamadı."),404);const keys=(Array.isArray(b.controlKeys)?b.controlKeys:[b.controlKey]).map((x:any)=>upper(x)).filter(Boolean),ts=now();let linked=0;for(const key of keys){const control=await c.env.DB.prepare("SELECT id FROM compliance_controls WHERE main_company_slug=? AND control_key=? AND is_active=1").bind(s.slug,key).first<Row>();if(!control)continue;await c.env.DB.prepare("INSERT OR IGNORE INTO compliance_requirement_controls(id,main_company_slug,requirement_id,control_id,relation_type,confidence,source,created_at,updated_at) VALUES(?,?,?,?, 'EQUIVALENT',1,'MANUAL',?,?)").bind(crypto.randomUUID(),s.slug,rid,control.id,ts,ts).run();linked++}await event(c,s.slug,"REQUIREMENT_CONTROLS_LINKED","REQUIREMENT",rid,text(s.user?.id),{controlKeys:keys,linked});return c.json({ok:true,data:{linked}})});
 app.post("/api/compliance/documents/:id/controls",async c=>{const b=await bodyOf(c),s=await scope(c,b,true);if(!s.ok)return scopeError(c,s);await ensureComplianceSharedEvidence(c,s.slug);const did=c.req.param("id"),doc=await c.env.DB.prepare("SELECT id FROM compliance_documents WHERE id=? AND main_company_slug=? AND archived_at IS NULL").bind(did,s.slug).first<Row>();if(!doc)return c.json(err("NOT_FOUND","Evrak bulunamadı."),404);const keys=(Array.isArray(b.controlKeys)?b.controlKeys:[b.controlKey]).map((x:any)=>upper(x)).filter(Boolean),ts=now();let linked=0;for(const key of keys){const control=await c.env.DB.prepare("SELECT id FROM compliance_controls WHERE main_company_slug=? AND control_key=? AND is_active=1").bind(s.slug,key).first<Row>();if(!control)continue;await c.env.DB.prepare("INSERT OR IGNORE INTO compliance_document_controls(id,main_company_slug,document_id,control_id,is_primary,confidence,source,created_at,updated_at) VALUES(?,?,?,?,0,1,'MANUAL',?,?)").bind(crypto.randomUUID(),s.slug,did,control.id,ts,ts).run();linked++}await event(c,s.slug,"DOCUMENT_CONTROLS_LINKED","DOCUMENT",did,text(s.user?.id),{controlKeys:keys,linked});return c.json({ok:true,data:{linked}})});

 app.get("/api/compliance/system-evidence-candidates",async c=>{const s=await scope(c);if(!s.ok)return scopeError(c,s);return c.json({ok:true,data:await systemEvidenceCandidates(c,s.slug)})});
 app.get("/api/compliance/system-evidence",async c=>{const s=await scope(c);if(!s.ok)return scopeError(c,s);if(!(await tableAvailable(c,"compliance_system_evidence")))return c.json({ok:true,data:[]});const r=await c.env.DB.prepare("SELECT e.*,c.control_key,c.title control_title FROM compliance_system_evidence e JOIN compliance_controls c ON c.id=e.control_id WHERE e.main_company_slug=? ORDER BY e.verified_at DESC,e.created_at DESC").bind(s.slug).all<Row>();return c.json({ok:true,data:(r.results||[]).map((x:Row)=>({...x,snapshot:jsonObject(x.snapshot)}))})});
 app.post("/api/compliance/system-evidence/verify",async c=>{
  const b=await bodyOf(c),s=await scope(c,b,true);if(!s.ok)return scopeError(c,s);
  await ensureComplianceSharedEvidence(c,s.slug);
  if(!(await tableAvailable(c,"compliance_system_evidence")))return c.json(err("MIGRATION_REQUIRED","Ortak kanıt migration henüz uygulanmamış."),409);
  const controlKey=upper(b.controlKey),control=await c.env.DB.prepare("SELECT id FROM compliance_controls WHERE main_company_slug=? AND control_key=? AND is_active=1").bind(s.slug,controlKey).first<Row>();
  if(!control)return c.json(err("CONTROL_NOT_FOUND","Ortak kontrol bulunamadı."),404);
  const sourceModule=upper(b.sourceModule)||"ERP",sourceRef=text(b.sourceRef),title=text(b.title)||controlKey;
  if(!sourceRef)return c.json(err("SOURCE_REF_REQUIRED","Kanıt kaynak referansı zorunludur."),422);
  const periodStart=text(b.periodStart).slice(0,10)||null,periodEnd=text(b.periodEnd).slice(0,10)||null,verifiedAt=now(),expiresAt=text(b.expiresAt).slice(0,10)||null;
  const old=await c.env.DB.prepare("SELECT id FROM compliance_system_evidence WHERE main_company_slug=? AND control_id=? AND source_module=? AND source_ref=? AND COALESCE(period_start,'')=COALESCE(?,'') AND COALESCE(period_end,'')=COALESCE(?,'')").bind(s.slug,control.id,sourceModule,sourceRef,periodStart,periodEnd).first<Row>();
  const id=text(old?.id)||crypto.randomUUID();
  if(old)await c.env.DB.prepare("UPDATE compliance_system_evidence SET title=?,status='VERIFIED',confidence=?,snapshot=?,verified_by=?,verified_at=?,expires_at=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(title,Number(b.confidence??.8),JSON.stringify(jsonObject(b.snapshot)),text(s.user?.id)||null,verifiedAt,expiresAt,verifiedAt,id,s.slug).run();
  else await c.env.DB.prepare("INSERT INTO compliance_system_evidence(id,main_company_slug,control_id,source_module,source_type,source_ref,title,period_start,period_end,status,confidence,snapshot,verified_by,verified_at,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'VERIFIED',?,?,?,?,?,?,?)").bind(id,s.slug,control.id,sourceModule,upper(b.sourceType)||"ERP_DATA",sourceRef,title,periodStart,periodEnd,Number(b.confidence??.8),JSON.stringify(jsonObject(b.snapshot)),text(s.user?.id)||null,verifiedAt,expiresAt,verifiedAt,verifiedAt).run();
  await event(c,s.slug,"SYSTEM_EVIDENCE_VERIFIED","CONTROL",text(control.id),text(s.user?.id),{controlKey,sourceModule,sourceRef});
  return c.json({ok:true,data:{id}});
 });
 app.get("/api/compliance/shared-evidence",async c=>{const s=await scope(c);if(!s.ok)return scopeError(c,s);await ensureComplianceSharedEvidence(c,s.slug);const r=await c.env.DB.prepare("SELECT c.control_key,c.title,c.domain,COUNT(DISTINCT rc.requirement_id) requirement_count,COUNT(DISTINCT dc.document_id) evidence_count,COUNT(DISTINCT p.id) profile_count FROM compliance_controls c LEFT JOIN compliance_requirement_controls rc ON rc.main_company_slug=c.main_company_slug AND rc.control_id=c.id LEFT JOIN compliance_requirements r ON r.id=rc.requirement_id LEFT JOIN compliance_profiles p ON p.id=r.profile_id LEFT JOIN compliance_document_controls dc ON dc.main_company_slug=c.main_company_slug AND dc.control_id=c.id WHERE c.main_company_slug=? AND c.is_active=1 GROUP BY c.id ORDER BY profile_count DESC,requirement_count DESC,c.title").bind(s.slug).all<Row>();return c.json({ok:true,data:r.results||[]})});
 app.get("/api/compliance/external-refs",async c=>{const s=await scope(c);if(!s.ok)return scopeError(c,s);const entityType=upper(c.req.query("entityType")),entityId=text(c.req.query("entityId")),where=["main_company_slug=?"],args:any[]=[s.slug];if(entityType){where.push("entity_type=?");args.push(entityType)}if(entityId){where.push("entity_id=?");args.push(entityId)}const r=await c.env.DB.prepare("SELECT * FROM compliance_external_refs WHERE "+where.join(" AND ")+" ORDER BY provider").bind(...args).all<Row>();return c.json({ok:true,data:(r.results||[]).map((x:Row)=>({...x,metadata:jsonObject(x.metadata)}))})});
 app.post("/api/compliance/external-refs",async c=>{const b=await bodyOf(c),s=await scope(c,b,true);if(!s.ok)return scopeError(c,s);const entityType=upper(b.entityType),entityId=text(b.entityId),provider=upper(b.provider);if(!entityType||!entityId||!provider)return c.json(err("EXTERNAL_REF_REQUIRED","entityType, entityId ve provider zorunludur."),422);const ts=now(),old=await c.env.DB.prepare("SELECT id FROM compliance_external_refs WHERE main_company_slug=? AND entity_type=? AND entity_id=? AND provider=?").bind(s.slug,entityType,entityId,provider).first<Row>();const id=text(old?.id)||crypto.randomUUID();if(old)await c.env.DB.prepare("UPDATE compliance_external_refs SET external_id=?,external_url=?,status=?,valid_until=?,last_synced_at=?,metadata=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(text(b.externalId)||null,text(b.externalUrl)||null,upper(b.status)||null,text(b.validUntil).slice(0,10)||null,text(b.lastSyncedAt)||null,JSON.stringify(jsonObject(b.metadata)),ts,id,s.slug).run();else await c.env.DB.prepare("INSERT INTO compliance_external_refs(id,main_company_slug,entity_type,entity_id,provider,external_id,external_url,status,valid_until,last_synced_at,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,s.slug,entityType,entityId,provider,text(b.externalId)||null,text(b.externalUrl)||null,upper(b.status)||null,text(b.validUntil).slice(0,10)||null,text(b.lastSyncedAt)||null,JSON.stringify(jsonObject(b.metadata)),ts,ts).run();await event(c,s.slug,"EXTERNAL_REF_UPSERTED",entityType,entityId,text(s.user?.id),{provider});return c.json({ok:true,data:{id}})});
}
