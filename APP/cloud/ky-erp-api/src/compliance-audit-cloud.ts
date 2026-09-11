// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { archiveFileToCloudConnection } from "./file-hub-cloud-oauth";
import { checkCompanyAiAllowance, recordCompanyAiUsage } from "./company-billing-cloud";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_WARNING_DAYS = 10;
const DAY_MS = 86400000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["PDF","JPG","JPEG","PNG","WEBP","XLS","XLSX","DOC","DOCX","ZIP","CSV","TXT"]);

const text = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toUpperCase().replace(/İ/g, "I");
const lower = (v: unknown) => text(v).toLocaleLowerCase("tr-TR");
const nowIso = () => new Date().toISOString();
const dateOnly = (v: unknown) => text(v).slice(0, 10);
const jsonObject = (v: unknown): Row => {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Row;
  if (!text(v)) return {};
  try { const p = JSON.parse(text(v)); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch { return {}; }
};
const errorBody = (code: string, message: string, details?: unknown) => ({ ok:false, error:{ code, message, ...(details === undefined ? {} : { details }) } });
const isOwner = (role: unknown) => ["ADMIN","SUPER_ADMIN"].includes(upper(role));
const isAuditRole = (role: unknown) => upper(role) === "DENETIM";
const permissionFor = (user: Row, moduleKey: string) => Array.isArray(user?.permissions)
  ? user.permissions.find((p:Row) => upper(p.moduleKey || p.module_key) === upper(moduleKey))
  : null;
const userCanView = (user: Row) => isOwner(user?.role) || isAuditRole(user?.role) || Boolean(permissionFor(user,"DENETIM")?.canView ?? permissionFor(user,"DENETIM")?.can_view);
const userCanWrite = (user: Row) => {
  if (isOwner(user?.role)) return true;
  if (isAuditRole(user?.role)) return false;
  const p = permissionFor(user,"DENETIM");
  return Boolean((p?.canCreate ?? p?.can_create) || (p?.canUpdate ?? p?.can_update));
};
const safeSegment = (v: unknown) => text(v).replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").trim().slice(0,80) || "Genel";
const normalizePath = (v: unknown) => text(v).replace(/\\/g,"/").replace(/^\/+|\/+$/g,"");
const parseCsvIds = (v: unknown) => Array.isArray(v) ? v.map(text).filter(Boolean) : text(v).split(",").map(x=>x.trim()).filter(Boolean);
const bodyOf = async (c: Context<AppEnv>): Promise<Row> => { try { const b=await c.req.json(); return b&&typeof b==="object"&&!Array.isArray(b)?b as Row:{}; } catch { return {}; } };

async function secureContext(c: Context<AppEnv>, body: Row = {}, write = false) {
  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user) return { ok:false, status:401, response:errorBody("UNAUTHORIZED","Oturum gerekli.") };
  if (!userCanView(user)) return { ok:false, status:403, response:errorBody("DENETIM_FORBIDDEN","Denetim & Uygunluk modülüne erişim yetkiniz yok.") };
  if (write && !userCanWrite(user)) return { ok:false, status:403, response:errorBody("DENETIM_READ_ONLY","Bu hesap denetim verilerini yalnız görüntüleyebilir.") };
  const requested = lower(body.mainCompanySlug || body.main_company_slug || c.req.query("mainCompanySlug") || c.req.header("X-KYERP-Tenant-Slug"));
  const own = lower(user?.mainCompanySlug || user?.security?.main_company_slug);
  if (!isOwner(user?.role)) {
    if (!own) return { ok:false, status:403, response:errorBody("TENANT_CONTEXT_REQUIRED","Kullanıcının ana firma bağlamı bulunamadı.") };
    if (requested && requested !== own) return { ok:false, status:403, response:errorBody("TENANT_FORBIDDEN","Başka firmanın denetim kayıtlarına erişemezsiniz.") };
    return { ok:true, user, slug:own };
  }
  const slug = requested || own;
  if (!slug) return { ok:false, status:400, response:errorBody("TENANT_CONTEXT_REQUIRED","Denetim işlemi için aktif firma seçilmelidir.") };
  const company = await c.env.DB.prepare("SELECT slug FROM main_companies WHERE slug=? LIMIT 1").bind(slug).first<Row>();
  if (!company) return { ok:false, status:404, response:errorBody("TENANT_NOT_FOUND","Seçilen firma bulunamadı.") };
  return { ok:true, user, slug };
}

const PROFILE_SEEDS = [
  { code:"GENEL_UYGUNLUK", name:"Genel Yasal / İSG / Çevre", version:"HKN-2026.1", description:"İşletmenin temel yasal, İSG, çevre ve periyodik kontrol evrak takibi.", sourceUrl:"", meta:{template:"Hakan Emprime saha klasörleri"} },
  { code:"SEDEX_SMETA7", name:"Sedex / SMETA 7", version:"7", description:"SMETA 7 işçilik, sağlık-güvenlik, çevre ve iş etiği hazırlık profili.", sourceUrl:"https://www.sedex.com/solutions/smeta-audit/", meta:{officialSource:true} },
  { code:"DISNEY_ILS_FAMA", name:"Disney ILS / FAMA", version:"2026", description:"Disney ILS tesis yetkilendirme, FAMA, denetim raporu ve düzeltici faaliyet takibi.", sourceUrl:"https://impact.disney.com/resources/ils-program-manual-english/", meta:{officialSource:true} },
  { code:"LCW_SOCIAL", name:"LCW Sosyal Uygunluk", version:"2026", description:"Müşteri sosyal uygunluk denetimi ve düzeltici faaliyet planı.", sourceUrl:"", meta:{customerTemplate:true} },
];

const GENERAL_REQUIREMENTS = [
  ["WORKPLACE_LICENSE","İşyeri çalışma ruhsatı","YASAL","DOCUMENT",null],
  ["FIRE_REPORT","İtfaiye raporu","YASAL","DOCUMENT",null],
  ["OCCUPANCY_PERMIT","Yapı kullanım izni","YASAL","DOCUMENT",null],
  ["BUILDING_LICENSE","Yapı ruhsatı","YASAL","DOCUMENT",null],
  ["TAX_PLATE","Vergi levhası","YASAL","DOCUMENT",null],
  ["ACTIVITY_CERTIFICATE","Faaliyet belgesi","YASAL","DOCUMENT",null],
  ["INDUSTRIAL_REGISTRY","Sanayi sicil belgesi","YASAL","DOCUMENT",null],
  ["CAPACITY_REPORT","Kapasite raporu","YASAL","DOCUMENT",null],
  ["TRADE_REGISTRY","Ticaret sicil gazetesi","YASAL","DOCUMENT",null],
  ["EIA_STATUS","ÇED görüşü / muafiyet","CEVRE","DOCUMENT",null],
  ["ENVIRONMENT_PERMIT","Çevre izni / muafiyet yazısı","CEVRE","DOCUMENT",null],
  ["SOLID_WASTE_CONTRACT","Katı atık sözleşmesi","CEVRE","DOCUMENT",null],
  ["ENV_INTERNAL_AUDIT","Çevre iç tetkik raporu","CEVRE","DOCUMENT",365],
  ["ENV_ASPECT_ANALYSIS","Çevre boyut analizi","CEVRE","DOCUMENT",365],
  ["ENV_POLICY","Çevre politikası","CEVRE","DOCUMENT",null],
  ["ENV_CONSULTANT","Çevre danışmanı anlaşması","CEVRE","DOCUMENT",null],
  ["ECBS_REGISTRATION","EÇBS kayıt formu","CEVRE","DOCUMENT",null],
  ["ENV_TRAINING","Çevre eğitimi","CEVRE","TRAINING",365],
  ["ENV_MONTHLY_REPORT","Aylık çevre faaliyet raporu","CEVRE","DOCUMENT",30],
  ["SOCIAL_COMPLIANCE_TRAINING","Çalışan sosyal uygunluk eğitimi","SOSYAL","TRAINING",365],
  ["SUPPLIER_LIST","Tedarikçi listesi","TEDARIK","DOCUMENT",365],
  ["SUPPLIER_EVALUATION","Tedarikçi değerlendirmesi","TEDARIK","DOCUMENT",365],
  ["DRINKING_WATER_ANALYSIS","İçme suyu analizi","HIJYEN","CONTROL",180],
  ["HYGIENE_TRAINING","Hijyen eğitimleri","HIJYEN","TRAINING",null],
  ["FIRST_AID_CERTIFICATES","İlk yardım sertifikaları","ISG","DOCUMENT",null],
  ["FIRE_DRILL","Yangın tatbikatı","ISG","CONTROL",180],
  ["COMPRESSOR_INSPECTION","Kompresör fenni / periyodik kontrolü","PERIYODIK","CONTROL",365],
  ["STEAM_BOILER_INSPECTION","Buhar kazanı fenni / periyodik kontrolü","PERIYODIK","CONTROL",365],
  ["GENERATOR_INSPECTION","Jeneratör fenni / periyodik kontrolü","PERIYODIK","CONTROL",365],
  ["ELEVATOR_INSPECTION","Asansör fenni / periyodik kontrolü","PERIYODIK","CONTROL",365],
  ["PALLET_TRUCK_INSPECTION","Transpalet fenni / periyodik kontrolü","PERIYODIK","CONTROL",365],
  ["FIRE_SYSTEM_INSPECTION","Yangın tesisatı fenni / periyodik kontrolü","PERIYODIK","CONTROL",365],
  ["MEASUREMENT_REPORTS","Ortam / teknik ölçüm raporları","ISG","DOCUMENT",null],
  ["EMPLOYEE_REP_MINUTES","Çalışan temsilcisi tutanakları","ISG","DOCUMENT",null],
  ["CATERING_CONTRACT","Yemek hizmeti sözleşmesi","HIJYEN","DOCUMENT",null],
  ["PEST_CONTROL","Böcek ilaçlama kayıtları","HIJYEN","CONTROL",null],
  ["MACHINE_PERIODIC_CONTROL","Makinelerin periyodik kontrolü","PERIYODIK","CONTROL",365],
  ["OHS_EXPERT_CONTRACT","İSG uzmanı sözleşmesi","ISG","DOCUMENT",null],
  ["WORKPLACE_PHYSICIAN_CONTRACT","İşyeri hekimi sözleşmesi","ISG","DOCUMENT",null],
  ["RISK_ASSESSMENT","Risk analizi","ISG","DOCUMENT",null],
  ["EMERGENCY_PLAN","Acil durum eylem planı","ISG","DOCUMENT",null],
  ["ANNUAL_TRAINING_PLAN","Yıllık eğitim planı","ISG","DOCUMENT",365],
  ["ANNUAL_EVALUATION","Yıllık değerlendirme planı / raporu","ISG","DOCUMENT",365],
  ["TRAINING_ATTENDANCE","Eğitim katılım belgeleri","ISG","DOCUMENT",null],
  ["EMERGENCY_TEAMS","Acil durum görevlileri yazısı","ISG","DOCUMENT",null],
  ["EMERGENCY_TRAINING","Acil durum görevli eğitimleri","ISG","TRAINING",null],
  ["DETECTION_RECOMMENDATION_BOOK","Tespit öneri defteri","ISG","DOCUMENT",null],
  ["BOARD_DECISION_BOOK","Kurul kararı defteri","ISG","DOCUMENT",null]
];

const SEDEX_REQUIREMENTS = [
  ["LABOUR_FORCED","Zorla çalıştırma / özgür çalışma kanıtları","ISG_SOSYAL","EVIDENCE",null],
  ["LABOUR_RECRUITMENT","Etik işe alım ve çalışma hakkı kayıtları","ISG_SOSYAL","EVIDENCE",null],
  ["LABOUR_CHILD","Çocuk / genç işçi kontrolleri","ISG_SOSYAL","EVIDENCE",null],
  ["LABOUR_CONTRACTS","İş sözleşmeleri ve düzenli istihdam kayıtları","ISG_SOSYAL","EVIDENCE",null],
  ["LABOUR_WAGES","Ücret, bordro ve ödeme kanıtları","ISG_SOSYAL","EVIDENCE",null],
  ["LABOUR_HOURS","Çalışma saatleri, fazla mesai ve dinlenme kayıtları","ISG_SOSYAL","EVIDENCE",null],
  ["LABOUR_REPRESENTATION","Çalışan temsilcisi / sendika / şikâyet mekanizması","ISG_SOSYAL","EVIDENCE",null],
  ["LABOUR_NONDISCRIMINATION","Ayrımcılık ve kötü muamele önleme kayıtları","ISG_SOSYAL","EVIDENCE",null],
  ["HS_RISK_EMERGENCY","Risk, yangın ve acil durum sistemi","SAGLIK_GUVENLIK","EVIDENCE",null],
  ["HS_MACHINE_PPE","Makine güvenliği, KKD ve periyodik kontroller","SAGLIK_GUVENLIK","EVIDENCE",null],
  ["HS_CHEMICALS","Kimyasal yönetimi / SDS / depolama","SAGLIK_GUVENLIK","EVIDENCE",null],
  ["ENV_PERMITS_WASTE","Çevre izinleri, atık ve tehlikeli atık kayıtları","CEVRE","EVIDENCE",null],
  ["ENV_WATER_ENERGY","Su, atık su, enerji ve emisyon kayıtları","CEVRE","EVIDENCE",null],
  ["BUSINESS_ETHICS","İş etiği / rüşvet-yolsuzluk önleme sistemi","IS_ETIGI","EVIDENCE",null],
  ["MANAGEMENT_SYSTEM","SMETA yönetim sistemi kanıtları ve sürekli iyileştirme","YONETIM","EVIDENCE",null],
  ["CAPA","Düzeltici faaliyet planı ve kapanış kanıtları","CAPA","EVIDENCE",null]
];

const DISNEY_REQUIREMENTS = [
  ["FACILITY_DECLARATION","Üretim tesisi / alt yüklenici tesis bildirimi","TESIS","EVIDENCE",null],
  ["FAMA","FAMA / tesis yetkilendirme kaydı","TESIS","DOCUMENT",null],
  ["QUALIFIED_ILS_AUDIT","Nitelikli ILS / kabul edilen sosyal uygunluk denetim raporu","DENETIM","DOCUMENT",null],
  ["AUDIT_FULL_REPORT","Tam denetim raporu ve ekleri","DENETIM","DOCUMENT",null],
  ["CAPA","Düzeltici faaliyet planı ve kapanış kanıtları","CAPA","EVIDENCE",null],
  ["FOLLOW_UP","Takip denetimi / doğrulama kayıtları","DENETIM","DOCUMENT",null],
  ["SUPPLY_CHAIN_CODE","Tedarik zinciri davranış kuralları / politika kanıtı","POLITIKA","EVIDENCE",null],
  ["WORKING_CONDITIONS","Çalışma koşulları / ücret / saat / işçi hakları kanıtları","SOSYAL","EVIDENCE",null],
  ["ENVIRONMENTAL_COMPLIANCE","Çevresel uygunluk kanıtları","CEVRE","EVIDENCE",null]
];

const LCW_REQUIREMENTS = [
  ["AUDIT_REPORT","Sosyal uygunluk denetim raporu","DENETIM","DOCUMENT",null],
  ["CORRECTIVE_ACTION_PLAN","Düzeltici faaliyet planı","CAPA","DOCUMENT",null],
  ["FINDING_EVIDENCE","Uygunsuzluk kanıtları","CAPA","EVIDENCE",null],
  ["CLOSURE_EVIDENCE","Kapanış kanıtları / fotoğraflar","CAPA","EVIDENCE",null],
  ["PERSONNEL_EVIDENCE","Personel / bordro / puantaj uygunluk kanıtları","SOSYAL","EVIDENCE",null],
  ["HS_EVIDENCE","İSG / periyodik kontrol kanıtları","SAGLIK_GUVENLIK","EVIDENCE",null]
];

function seedRowsForProfile(code:string) {
  if (code === "GENEL_UYGUNLUK") return GENERAL_REQUIREMENTS;
  if (code === "SEDEX_SMETA7") return SEDEX_REQUIREMENTS;
  if (code === "DISNEY_ILS_FAMA") return DISNEY_REQUIREMENTS;
  if (code === "LCW_SOCIAL") return LCW_REQUIREMENTS;
  return [];
}

async function ensureDefaults(c: Context<AppEnv>, slug: string) {
  const existing = await c.env.DB.prepare("SELECT COUNT(*) n FROM compliance_profiles WHERE main_company_slug=?").bind(slug).first<Row>();
  if (Number(existing?.n || 0) > 0) return;
  const ts = nowIso();
  for (const profile of PROFILE_SEEDS) {
    const profileId = `${slug}:compliance-profile:${profile.code}`;
    await c.env.DB.prepare(`INSERT OR IGNORE INTO compliance_profiles
      (id,main_company_slug,code,name,version,description,source_url,is_active,metadata,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(profileId,slug,profile.code,profile.name,profile.version,profile.description,profile.sourceUrl,1,JSON.stringify(profile.meta||{}),ts,ts).run();
    const rows = seedRowsForProfile(profile.code);
    for (let i=0;i<rows.length;i+=1) {
      const [code,title,category,requirementType,cycleDays] = rows[i];
      const requirementId = `${profileId}:req:${code}`;
      const meta = cycleDays ? { cycleDerived:true, note:"Periyot firma başlangıç varsayılanıdır; belge/mevzuat gereğine göre değiştirilebilir." } : {};
      await c.env.DB.prepare(`INSERT OR IGNORE INTO compliance_requirements
        (id,main_company_slug,profile_id,code,title,category,requirement_type,mandatory,cycle_days,warning_days,critical_days,owner_department,sort_order,metadata,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(requirementId,slug,profileId,code,title,category,requirementType,1,cycleDays,DEFAULT_WARNING_DAYS,3,null,i+1,JSON.stringify(meta),ts,ts).run();
    }
  }
}

function addDays(date:string, days:number) {
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? new Date(ms + days*DAY_MS).toISOString().slice(0,10) : "";
}
function daysUntil(date:string) {
  const target = Date.parse(`${date}T23:59:59Z`);
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - Date.now()) / DAY_MS);
}
function requirementState(row:Row) {
  const mandatory = Number(row.mandatory ?? 1) !== 0;
  const hasDocument = Boolean(row.document_id);
  let dueDate = dateOnly(row.expires_at);
  if (!dueDate && hasDocument && Number(row.cycle_days||0)>0 && dateOnly(row.issue_date)) dueDate = addDays(dateOnly(row.issue_date),Number(row.cycle_days));
  const remaining = dueDate ? daysUntil(dueDate) : null;
  let state = "VALID";
  if (!hasDocument) state = mandatory ? "MISSING" : "OPTIONAL_MISSING";
  else if (remaining !== null && remaining < 0) state = "EXPIRED";
  else if (remaining !== null && remaining <= Number(row.critical_days ?? 3)) state = "CRITICAL";
  else if (remaining !== null && remaining <= Number(row.warning_days ?? DEFAULT_WARNING_DAYS)) state = "DUE_SOON";
  return { ...row, mandatory, hasDocument, dueDate:dueDate||null, daysRemaining:remaining, state, metadata:jsonObject(row.metadata), aiExtractedData:jsonObject(row.ai_extracted_data) };
}

async function requirementRows(c:Context<AppEnv>,slug:string,profileId="") {
  const args:any[]=[slug,slug];
  let profileWhere="";
  if (profileId) { profileWhere=" AND r.profile_id=?"; args.push(profileId); }
  const result=await c.env.DB.prepare(`
    SELECT r.*,p.code profile_code,p.name profile_name,
           d.id document_id,d.title document_title,d.issue_date,d.expires_at,d.status document_status,
           d.file_asset_id,d.ai_status,d.ai_confidence,d.ai_extracted_data
      FROM compliance_requirements r
      JOIN compliance_profiles p ON p.id=r.profile_id AND p.main_company_slug=r.main_company_slug
      LEFT JOIN compliance_document_requirements dr
        ON dr.main_company_slug=r.main_company_slug AND dr.requirement_id=r.id
       AND dr.document_id=(
         SELECT dr2.document_id
           FROM compliance_document_requirements dr2
           JOIN compliance_documents d2 ON d2.id=dr2.document_id AND d2.main_company_slug=dr2.main_company_slug
          WHERE dr2.main_company_slug=? AND dr2.requirement_id=r.id
            AND d2.archived_at IS NULL AND UPPER(COALESCE(d2.status,'ACTIVE'))<>'ARCHIVED'
          ORDER BY COALESCE(d2.expires_at,d2.issue_date,d2.created_at) DESC,d2.updated_at DESC LIMIT 1)
      LEFT JOIN compliance_documents d ON d.id=dr.document_id AND d.main_company_slug=dr.main_company_slug
     WHERE r.main_company_slug=? AND p.is_active=1 ${profileWhere}
     ORDER BY p.name,r.category,r.sort_order,r.title`).bind(...args).all<Row>();
  return (result.results||[]).map(requirementState);
}

function scoreRequirements(rows:Row[]) {
  const mandatory=rows.filter(r=>r.mandatory);
  if (!mandatory.length) return 100;
  const weight=(state:string)=>state==="VALID"?1:state==="DUE_SOON"?0.75:state==="CRITICAL"?0.4:0;
  return Math.round((mandatory.reduce((sum,row)=>sum+weight(row.state),0)/mandatory.length)*100);
}

async function logEvent(c:Context<AppEnv>,slug:string,user:Row,eventType:string,entityType="",entityId="",detail:Row={}) {
  try { await c.env.DB.prepare(`INSERT INTO compliance_events (id,main_company_slug,event_type,entity_type,entity_id,actor_user_id,detail,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),slug,eventType,entityType||null,entityId||null,text(user?.id)||null,JSON.stringify(detail),nowIso()).run(); } catch {}
}

async function fileHubTarget(c:Context<AppEnv>,slug:string) {
  let row=await c.env.DB.prepare(`SELECT b.storage_connection_id,b.root_path,b.write_enabled,c.provider_type,c.sync_mode,c.name
      FROM file_hub_bindings b JOIN file_hub_connections c ON c.id=b.storage_connection_id
     WHERE b.main_company_slug=? AND b.module_code='DENETIM' AND b.purpose_code='COMPLIANCE_DOCUMENT'
       AND b.write_enabled=1 AND c.is_active=1 LIMIT 1`).bind(slug).first<Row>();
  if(!row) row=await c.env.DB.prepare(`SELECT c.id storage_connection_id,'' root_path,1 write_enabled,c.provider_type,c.sync_mode,c.name
      FROM file_hub_connections c WHERE c.main_company_slug=? AND c.is_active=1 AND c.is_primary=1 LIMIT 1`).bind(slug).first<Row>();
  return row||null;
}
async function sha256Hex(bytes:ArrayBuffer) { const hash=await crypto.subtle.digest("SHA-256",bytes); return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join(""); }

async function saveUploadedFile(c:Context<AppEnv>,slug:string,user:Row,file:File,category:string,documentId:string) {
  if (file.size<=0) throw Object.assign(new Error("Dosya boş."),{code:"EMPTY_FILE",status:422});
  if (file.size>MAX_UPLOAD_BYTES) throw Object.assign(new Error("Evrak 25 MB sınırını aşıyor."),{code:"FILE_TOO_LARGE",status:413});
  const ext=upper(file.name.split(".").pop());
  if(!ALLOWED_EXTENSIONS.has(ext)) throw Object.assign(new Error("Bu dosya türü denetim evrakına yüklenemez."),{code:"UNSUPPORTED_FILE",status:415});
  const bytes=await file.arrayBuffer(),hash=await sha256Hex(bytes),assetId=crypto.randomUUID(),ts=nowIso();
  const safeName=file.name.replace(/[\\/:*?"<>|]+/g,"-").slice(0,180);
  const target=await fileHubTarget(c,slug),year=dateOnly(ts).slice(0,4),root=normalizePath(target?.root_path),folder=[root,"Denetim",year,safeSegment(category)].filter(Boolean).join("/");
  let sourceType="COMPLIANCE_STAGING",previewKey="",providerFileId="",connectionId=text(target?.storage_connection_id),relativePath=`${folder}/${safeName}`.replace(/\/+/g,"/");
  let providerType=upper(target?.provider_type),archived=false,webUrl="";
  if(target && upper(target.sync_mode)==="CLOUD_API" && ["GOOGLE_DRIVE","ONEDRIVE","SHAREPOINT"].includes(providerType)){
    const result=await archiveFileToCloudConnection(c,slug,connectionId,{relativePath:folder,fileName:safeName,mimeType:file.type||"application/octet-stream",bytes});
    sourceType=providerType;providerFileId=text(result.id);webUrl=text(result.webUrl);archived=true;
  } else {
    previewKey=`file-hub/compliance-staging/${slug}/${assetId}/${safeName}`;
    await c.env.FILES.put(previewKey,bytes,{httpMetadata:{contentType:file.type||"application/octet-stream"},customMetadata:{fileAssetId:assetId,mainCompanySlug:slug,documentId}});
  }
  const meta={module:"DENETIM",purpose:"COMPLIANCE_DOCUMENT",documentId,temporary:!archived,requiresCanonicalArchive:!archived,webUrl:webUrl||null};
  await c.env.DB.prepare(`INSERT INTO file_hub_assets
    (id,main_company_slug,logical_key,file_name,extension,mime_type,sha256,size_bytes,status,source_type,preview_status,preview_storage_key,metadata,first_seen_at,last_seen_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(assetId,slug,`DENETIM:${documentId}`,safeName,ext,file.type||null,hash,file.size,"AVAILABLE",sourceType,previewKey?"READY":"NONE",previewKey||null,JSON.stringify(meta),ts,ts,ts,ts).run();
  if(archived && connectionId) await c.env.DB.prepare(`INSERT INTO file_hub_locations
    (id,main_company_slug,file_asset_id,storage_connection_id,provider_file_id,relative_path,location_role,is_available,provider_modified_at,last_seen_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,1,?,?,?,?)`).bind(crypto.randomUUID(),slug,assetId,connectionId,providerFileId||null,relativePath,"PRIMARY",ts,ts,ts,ts).run();
  await c.env.DB.prepare(`INSERT INTO file_hub_relations
    (id,main_company_slug,file_asset_id,entity_type,entity_id,relation_type,is_primary,confidence,source,metadata,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,assetId,"AUDIT_DOCUMENT",documentId,"ATTACHMENT",1,1,"DENETIM_UPLOAD","{}",ts,ts).run();
  await c.env.DB.prepare(`INSERT INTO file_hub_revisions
    (id,main_company_slug,file_asset_id,revision_no,sha256,size_bytes,provider_modified_at,metadata,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,assetId,1,hash,file.size,ts,JSON.stringify({initial:true,module:"DENETIM"}),ts).run();
  await c.env.DB.prepare(`INSERT INTO file_hub_events
    (id,main_company_slug,storage_connection_id,file_asset_id,event_type,actor_type,actor_id,device_name,details,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),slug,connectionId||null,assetId,archived?"COMPLIANCE_ARCHIVED":"COMPLIANCE_STAGED","USER",text(user.id)||null,null,JSON.stringify({documentId,relativePath,requiresCanonicalArchive:!archived}),ts).run();
  return {assetId,archived,sourceType,relativePath,previewKey,requiresCanonicalArchive:!archived};
}

async function createDocument(c:Context<AppEnv>,slug:string,user:Row,input:Row,file?:File|null) {
  const id=crypto.randomUUID(),ts=nowIso(),title=text(input.title)||text(file?.name)||"Denetim evrakı",category=upper(input.category)||"GENEL";
  await c.env.DB.prepare(`INSERT INTO compliance_documents
    (id,main_company_slug,title,category,document_type,issuer,document_no,issue_date,valid_from,expires_at,reminder_days,owner_department,responsible_user_id,status,file_asset_id,revision_parent_id,notes,ai_status,ai_confidence,ai_extracted_data,created_by,created_at,updated_at,archived_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,slug,title,category,upper(input.documentType)||"DOCUMENT",text(input.issuer)||null,text(input.documentNo)||null,dateOnly(input.issueDate)||null,dateOnly(input.validFrom)||null,dateOnly(input.expiresAt)||null,Number(input.reminderDays||DEFAULT_WARNING_DAYS),text(input.ownerDepartment)||null,text(input.responsibleUserId)||null,"ACTIVE",null,text(input.revisionParentId)||null,text(input.notes)||null,"NOT_CHECKED",null,"{}",text(user.id)||null,ts,ts,null).run();
  const requirementIds=parseCsvIds(input.requirementIds||input.requirementId);
  for(let i=0;i<requirementIds.length;i+=1){
    const req=await c.env.DB.prepare("SELECT id FROM compliance_requirements WHERE id=? AND main_company_slug=? LIMIT 1").bind(requirementIds[i],slug).first<Row>();
    if(!req)continue;
    await c.env.DB.prepare(`INSERT OR IGNORE INTO compliance_document_requirements (id,main_company_slug,document_id,requirement_id,is_primary,confidence,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),slug,id,requirementIds[i],i===0?1:0,1,"MANUAL",ts,ts).run();
  }
  let upload=null;
  if(file){ upload=await saveUploadedFile(c,slug,user,file,category,id); await c.env.DB.prepare("UPDATE compliance_documents SET file_asset_id=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(upload.assetId,nowIso(),id,slug).run(); }
  await logEvent(c,slug,user,"DOCUMENT_CREATED","AUDIT_DOCUMENT",id,{title,category,requirementIds,file:Boolean(file),upload});
  return {id,title,category,fileAssetId:upload?.assetId||null,upload};
}

async function overviewSnapshot(c:Context<AppEnv>,slug:string) {
  const rows=await requirementRows(c,slug),counts=rows.reduce((acc:Row,row:Row)=>{acc[row.state]=(acc[row.state]||0)+1;return acc;},{});
  const docCount=await c.env.DB.prepare("SELECT COUNT(*) n FROM compliance_documents WHERE main_company_slug=? AND archived_at IS NULL").bind(slug).first<Row>();
  const findings=await c.env.DB.prepare(`SELECT COUNT(*) n,SUM(CASE WHEN due_date IS NOT NULL AND due_date<date('now') THEN 1 ELSE 0 END) overdue FROM compliance_findings WHERE main_company_slug=? AND UPPER(status) NOT IN ('CLOSED','CANCELLED')`).bind(slug).first<Row>();
  const audits=await c.env.DB.prepare(`SELECT id,name,planned_date,status FROM compliance_audits WHERE main_company_slug=? AND UPPER(status) NOT IN ('COMPLETED','CANCELLED') ORDER BY COALESCE(planned_date,'9999-12-31') LIMIT 10`).bind(slug).all<Row>();
  const categories:Row={};for(const row of rows){const key=text(row.category)||"GENEL";if(!categories[key])categories[key]={total:0,ready:0,attention:0};categories[key].total+=1;if(row.state==="VALID")categories[key].ready+=1;else categories[key].attention+=1;}
  const rank:Row={EXPIRED:0,MISSING:1,CRITICAL:2,DUE_SOON:3};
  const attention=rows.filter(r=>["MISSING","EXPIRED","CRITICAL","DUE_SOON"].includes(r.state)).sort((a,b)=>(rank[a.state]??9)-(rank[b.state]??9)||Number(a.daysRemaining??9999)-Number(b.daysRemaining??9999)).slice(0,50);
  const ai=await c.env.DB.prepare("SELECT * FROM compliance_ai_scans WHERE main_company_slug=? ORDER BY created_at DESC LIMIT 1").bind(slug).first<Row>();
  return { score:scoreRequirements(rows),requirementCount:rows.length,documentCount:Number(docCount?.n||0),missing:Number(counts.MISSING||0),expired:Number(counts.EXPIRED||0),critical:Number(counts.CRITICAL||0),dueSoon:Number(counts.DUE_SOON||0),valid:Number(counts.VALID||0),openFindings:Number(findings?.n||0),overdueFindings:Number(findings?.overdue||0),attention,categories:Object.entries(categories).map(([category,value])=>({category,...value as Row})),upcomingAudits:audits.results||[],lastAiScan:ai?{...ai,result:jsonObject(ai.result_json)}:null };
}

function aiText(result:unknown){if(typeof result==="string")return result.trim();if(!result||typeof result!=="object")return"";const r=result as Row;for(const c of[r.response,r.text,r.result?.response,r.result?.text,r.output_text]){if(text(c))return text(c)}return"";}
function parseAiJson(value:string){const clean=value.replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();try{return JSON.parse(clean)}catch{const match=clean.match(/\{[\s\S]*\}/);if(match)try{return JSON.parse(match[0])}catch{}return{summary:clean,priorityActions:[],missingEvidence:[],suspectedIssues:[]}}}

async function runAiReview(c:Context<AppEnv>,slug:string,user:Row,reason="MANUAL") {
  const snapshot=await overviewSnapshot(c,slug),allowance=await checkCompanyAiAllowance(c.env.DB,slug);
  if(!allowance.allowed)return{ok:false,code:allowance.code||"AI_USAGE_BLOCKED",message:allowance.message||"Firma AI kullanımına kapalı.",snapshot};
  if(!c.env.AI)return{ok:false,code:"AI_BINDING_MISSING",message:"Workers AI bağlantısı aktif değil.",snapshot};
  const openFindings=await c.env.DB.prepare(`SELECT id,title,severity,due_date,status,description,corrective_action FROM compliance_findings WHERE main_company_slug=? AND UPPER(status) NOT IN ('CLOSED','CANCELLED') ORDER BY CASE UPPER(severity) WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,due_date LIMIT 80`).bind(slug).all<Row>();
  const input={readinessScore:snapshot.score,counts:{missing:snapshot.missing,expired:snapshot.expired,critical:snapshot.critical,dueSoon:snapshot.dueSoon,openFindings:snapshot.openFindings,overdueFindings:snapshot.overdueFindings},attention:snapshot.attention.slice(0,60).map((r:Row)=>({requirementId:r.id,profile:r.profile_name,code:r.code,title:r.title,category:r.category,state:r.state,dueDate:r.dueDate,daysRemaining:r.daysRemaining,documentTitle:r.document_title||null})),findings:openFindings.results||[]};
  const prompt=`Sen KY ERP Denetim & Uygunluk modülünün şirket içi kontrol asistanısın. Sadece verilen JSON verisini analiz et. Olmayan evrakı, mevzuatı veya tarihi uydurma. Hukuki uygunluk garantisi verme. Amaç: kullanıcının uğraşmasını azaltmak; eksik, süresi geçmiş, 10 gün içinde bitecek, açık/termini geçmiş düzeltici faaliyetleri önceliklendir. Çıktıyı SADECE JSON olarak ver: {"summary":"kısa özet","priorityActions":[{"severity":"CRITICAL|HIGH|MEDIUM|INFO","title":"","why":"","dueDate":null,"requirementId":null}],"missingEvidence":[{"title":"","reason":"","requirementId":null}],"suspectedIssues":[{"title":"","reason":"","confidence":0.0}],"nextCheckDays":1}. Veri: ${JSON.stringify(input).slice(0,45000)}`;
  const result=await c.env.AI.run(AI_MODEL,{messages:[{role:"user",content:prompt}],temperature:0.1,max_tokens:1800},{gateway:{id:text((c.env as Row)?.AI_GATEWAY_ID)||"default",skipCache:true,collectLog:false,metadata:{app:"KY_ERP",tenant:slug,module:"DENETIM",reason,requestId:text(c.get?.("requestId"))}}});
  const usage=(result as Row)?.usage||null;try{await recordCompanyAiUsage(c.env.DB,{mainCompanySlug:slug,usage,sourceRef:text(c.get?.("requestId"))||crypto.randomUUID(),actorUserId:text(user.id),model:AI_MODEL,note:`Denetim autonomous review ${reason}`});}catch{}
  const parsed=parseAiJson(aiText(result)||"{}"),id=crypto.randomUUID(),ts=nowIso();
  await c.env.DB.prepare(`INSERT INTO compliance_ai_scans (id,main_company_slug,scan_type,status,score,summary,result_json,model,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,slug,reason==="AUTO"?"AUTONOMOUS_REVIEW":"MANUAL_REVIEW","COMPLETED",snapshot.score,text(parsed.summary)||"Akıllı kontrol tamamlandı.",JSON.stringify(parsed),AI_MODEL,text(user.id)||null,ts).run();
  await logEvent(c,slug,user,"AI_REVIEW_COMPLETED","AI_SCAN",id,{reason,score:snapshot.score});
  return{ok:true,id,createdAt:ts,score:snapshot.score,result:parsed};
}

async function maybeAutoAi(c:Context<AppEnv>,slug:string,user:Row,lastScan:Row|null) {
  if(!c.env.AI || !userCanWrite(user))return;
  const last=Date.parse(text(lastScan?.created_at||lastScan?.createdAt));if(Number.isFinite(last)&&Date.now()-last<24*60*60*1000)return;
  const task=runAiReview(c,slug,user,"AUTO").catch(error=>console.error("KY ERP compliance autonomous AI review failed",error));
  try{c.executionCtx.waitUntil(task)}catch{void task}
}

export function registerComplianceAuditRoutes(app:Hono<AppEnv>) {
  app.get("/api/denetim/overview",async c=>{
    const scope=await secureContext(c);if(!scope.ok)return c.json(scope.response,scope.status as any);await ensureDefaults(c,scope.slug);
    const snapshot=await overviewSnapshot(c,scope.slug);await maybeAutoAi(c,scope.slug,scope.user,snapshot.lastAiScan);
    return c.json({ok:true,data:{...snapshot,automation:{enabled:true,defaultWarningDays:DEFAULT_WARNING_DAYS,aiAutoCheck:Boolean(c.env.AI),aiCheckCadenceHours:24}}});
  });
  app.get("/api/denetim/profiles",async c=>{
    const scope=await secureContext(c);if(!scope.ok)return c.json(scope.response,scope.status as any);await ensureDefaults(c,scope.slug);
    const r=await c.env.DB.prepare(`SELECT p.*,(SELECT COUNT(*) FROM compliance_requirements q WHERE q.main_company_slug=p.main_company_slug AND q.profile_id=p.id) requirement_count FROM compliance_profiles p WHERE p.main_company_slug=? ORDER BY p.name`).bind(scope.slug).all<Row>();
    return c.json({ok:true,data:(r.results||[]).map((x:Row)=>({...x,metadata:jsonObject(x.metadata)}))});
  });
  app.get("/api/denetim/requirements",async c=>{
    const scope=await secureContext(c);if(!scope.ok)return c.json(scope.response,scope.status as any);await ensureDefaults(c,scope.slug);const rows=await requirementRows(c,scope.slug,text(c.req.query("profileId")));return c.json({ok:true,data:rows,score:scoreRequirements(rows)});
  });
  app.get("/api/denetim/documents",async c=>{
    const scope=await secureContext(c);if(!scope.ok)return c.json(scope.response,scope.status as any);const q=text(c.req.query("q")),status=upper(c.req.query("status")),take=Math.min(500,Math.max(1,Number(c.req.query("take")||200))),where=["d.main_company_slug=?","d.archived_at IS NULL"],args:any[]=[scope.slug];if(q){where.push("(d.title LIKE ? OR d.document_no LIKE ? OR d.issuer LIKE ?)");const like=`%${q}%`;args.push(like,like,like)}if(status){where.push("UPPER(d.status)=?");args.push(status)}args.push(take);
    const r=await c.env.DB.prepare(`SELECT d.*,a.file_name,a.source_type,a.preview_status,a.preview_storage_key,a.status file_status,(SELECT GROUP_CONCAT(requirement_id) FROM compliance_document_requirements x WHERE x.main_company_slug=d.main_company_slug AND x.document_id=d.id) requirement_ids FROM compliance_documents d LEFT JOIN file_hub_assets a ON a.id=d.file_asset_id AND a.main_company_slug=d.main_company_slug WHERE ${where.join(" AND ")} ORDER BY COALESCE(d.expires_at,'9999-12-31'),d.updated_at DESC LIMIT ?`).bind(...args).all<Row>();
    return c.json({ok:true,data:(r.results||[]).map((row:Row)=>({...row,requirementIds:text(row.requirement_ids).split(",").filter(Boolean),aiExtractedData:jsonObject(row.ai_extracted_data)}))});
  });
  app.post("/api/denetim/documents",async c=>{const b=await bodyOf(c),scope=await secureContext(c,b,true);if(!scope.ok)return c.json(scope.response,scope.status as any);await ensureDefaults(c,scope.slug);return c.json({ok:true,data:await createDocument(c,scope.slug,scope.user,b,null)},201);});
  app.post("/api/denetim/documents/upload",async c=>{
    const user=await getAuthenticatedUser(c) as Row|null;if(!user)return c.json(errorBody("UNAUTHORIZED","Oturum gerekli."),401);const form=await c.req.formData(),b:Row={};for(const [k,v] of form.entries())if(k!=="file")b[k]=typeof v==="string"?v:"";const scope=await secureContext(c,b,true);if(!scope.ok)return c.json(scope.response,scope.status as any);await ensureDefaults(c,scope.slug);const file=form.get("file");if(!(file instanceof File))return c.json(errorBody("FILE_REQUIRED","Evrak dosyası seçilmelidir."),422);try{return c.json({ok:true,data:await createDocument(c,scope.slug,scope.user,b,file)},201)}catch(error){return c.json(errorBody(text((error as Row)?.code)||"UPLOAD_FAILED",error instanceof Error?error.message:"Evrak yüklenemedi."),Number((error as Row)?.status||500) as any)}
  });
  app.patch("/api/denetim/documents/:id",async c=>{
    const b=await bodyOf(c),scope=await secureContext(c,b,true);if(!scope.ok)return c.json(scope.response,scope.status as any);const id=c.req.param("id"),old=await c.env.DB.prepare("SELECT * FROM compliance_documents WHERE id=? AND main_company_slug=? LIMIT 1").bind(id,scope.slug).first<Row>();if(!old)return c.json(errorBody("NOT_FOUND","Evrak bulunamadı."),404);const ts=nowIso();
    await c.env.DB.prepare(`UPDATE compliance_documents SET title=?,category=?,document_type=?,issuer=?,document_no=?,issue_date=?,valid_from=?,expires_at=?,reminder_days=?,owner_department=?,responsible_user_id=?,notes=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(text(b.title||old.title),upper(b.category||old.category),upper(b.documentType||old.document_type),text(b.issuer??old.issuer)||null,text(b.documentNo??old.document_no)||null,dateOnly(b.issueDate??old.issue_date)||null,dateOnly(b.validFrom??old.valid_from)||null,dateOnly(b.expiresAt??old.expires_at)||null,Number(b.reminderDays??old.reminder_days??DEFAULT_WARNING_DAYS),text(b.ownerDepartment??old.owner_department)||null,text(b.responsibleUserId??old.responsible_user_id)||null,text(b.notes??old.notes)||null,ts,id,scope.slug).run();
    if(b.requirementIds!==undefined){await c.env.DB.prepare("DELETE FROM compliance_document_requirements WHERE main_company_slug=? AND document_id=?").bind(scope.slug,id).run();const ids=parseCsvIds(b.requirementIds);for(let i=0;i<ids.length;i+=1)await c.env.DB.prepare(`INSERT OR IGNORE INTO compliance_document_requirements(id,main_company_slug,document_id,requirement_id,is_primary,confidence,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),scope.slug,id,ids[i],i===0?1:0,1,"MANUAL",ts,ts).run()}
    await logEvent(c,scope.slug,scope.user,"DOCUMENT_UPDATED","AUDIT_DOCUMENT",id,{});return c.json({ok:true});
  });
  app.get("/api/denetim/findings",async c=>{const scope=await secureContext(c);if(!scope.ok)return c.json(scope.response,scope.status as any);const r=await c.env.DB.prepare(`SELECT f.*,a.name audit_name,r.title requirement_title FROM compliance_findings f LEFT JOIN compliance_audits a ON a.id=f.audit_id AND a.main_company_slug=f.main_company_slug LEFT JOIN compliance_requirements r ON r.id=f.requirement_id AND r.main_company_slug=f.main_company_slug WHERE f.main_company_slug=? ORDER BY CASE UPPER(f.status) WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END,CASE UPPER(f.severity) WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,COALESCE(f.due_date,'9999-12-31')`).bind(scope.slug).all<Row>();return c.json({ok:true,data:r.results||[]});});
  app.post("/api/denetim/findings",async c=>{const b=await bodyOf(c),scope=await secureContext(c,b,true);if(!scope.ok)return c.json(scope.response,scope.status as any);const id=crypto.randomUUID(),ts=nowIso();await c.env.DB.prepare(`INSERT INTO compliance_findings (id,main_company_slug,audit_id,requirement_id,title,severity,description,corrective_action,responsible_user_id,due_date,status,evidence_file_asset_id,closed_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,scope.slug,text(b.auditId)||null,text(b.requirementId)||null,text(b.title)||"Uygunsuzluk",upper(b.severity)||"MEDIUM",text(b.description)||null,text(b.correctiveAction)||null,text(b.responsibleUserId)||null,dateOnly(b.dueDate)||null,"OPEN",text(b.evidenceFileAssetId)||null,null,text(scope.user.id)||null,ts,ts).run();await logEvent(c,scope.slug,scope.user,"FINDING_CREATED","FINDING",id,{severity:upper(b.severity)||"MEDIUM",dueDate:dateOnly(b.dueDate)});return c.json({ok:true,data:{id}},201);});
  app.patch("/api/denetim/findings/:id",async c=>{const b=await bodyOf(c),scope=await secureContext(c,b,true);if(!scope.ok)return c.json(scope.response,scope.status as any);const id=c.req.param("id"),old=await c.env.DB.prepare("SELECT * FROM compliance_findings WHERE id=? AND main_company_slug=? LIMIT 1").bind(id,scope.slug).first<Row>();if(!old)return c.json(errorBody("NOT_FOUND","Uygunsuzluk bulunamadı."),404);const status=upper(b.status||old.status),ts=nowIso();await c.env.DB.prepare(`UPDATE compliance_findings SET title=?,severity=?,description=?,corrective_action=?,responsible_user_id=?,due_date=?,status=?,evidence_file_asset_id=?,closed_at=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(text(b.title??old.title),upper(b.severity??old.severity),text(b.description??old.description)||null,text(b.correctiveAction??old.corrective_action)||null,text(b.responsibleUserId??old.responsible_user_id)||null,dateOnly(b.dueDate??old.due_date)||null,status,text(b.evidenceFileAssetId??old.evidence_file_asset_id)||null,status==="CLOSED"?(text(old.closed_at)||ts):null,ts,id,scope.slug).run();await logEvent(c,scope.slug,scope.user,"FINDING_UPDATED","FINDING",id,{status});return c.json({ok:true});});
  app.get("/api/denetim/audits",async c=>{const scope=await secureContext(c);if(!scope.ok)return c.json(scope.response,scope.status as any);const r=await c.env.DB.prepare(`SELECT a.*,p.code profile_code,p.name profile_name,(SELECT COUNT(*) FROM compliance_findings f WHERE f.audit_id=a.id AND f.main_company_slug=a.main_company_slug AND UPPER(f.status) NOT IN ('CLOSED','CANCELLED')) open_findings FROM compliance_audits a LEFT JOIN compliance_profiles p ON p.id=a.profile_id AND p.main_company_slug=a.main_company_slug WHERE a.main_company_slug=? ORDER BY COALESCE(a.planned_date,'9999-12-31'),a.created_at DESC`).bind(scope.slug).all<Row>();return c.json({ok:true,data:r.results||[]});});
  app.post("/api/denetim/audits",async c=>{const b=await bodyOf(c),scope=await secureContext(c,b,true);if(!scope.ok)return c.json(scope.response,scope.status as any);const id=crypto.randomUUID(),ts=nowIso(),profileId=text(b.profileId)||null;let readiness:number|null=null;if(profileId)readiness=scoreRequirements(await requirementRows(c,scope.slug,profileId));await c.env.DB.prepare(`INSERT INTO compliance_audits (id,main_company_slug,profile_id,name,audit_type,planned_date,completed_date,auditor_name,status,readiness_score,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,scope.slug,profileId,text(b.name)||"Yeni denetim",upper(b.auditType)||"CUSTOMER",dateOnly(b.plannedDate)||null,null,text(b.auditorName)||null,"PLANNED",readiness,text(b.notes)||null,text(scope.user.id)||null,ts,ts).run();await logEvent(c,scope.slug,scope.user,"AUDIT_CREATED","AUDIT",id,{profileId,plannedDate:dateOnly(b.plannedDate),readiness});return c.json({ok:true,data:{id,readinessScore:readiness}},201);});
  app.post("/api/denetim/ai/check",async c=>{const b=await bodyOf(c),scope=await secureContext(c,b,true);if(!scope.ok)return c.json(scope.response,scope.status as any);await ensureDefaults(c,scope.slug);const outcome=await runAiReview(c,scope.slug,scope.user,"MANUAL");if(!outcome.ok)return c.json(errorBody(outcome.code,outcome.message,{snapshot:outcome.snapshot}),outcome.code==="AI_MONTHLY_LIMIT_REACHED"?429:503);return c.json({ok:true,data:outcome});});
  app.get("/api/denetim/ai/latest",async c=>{const scope=await secureContext(c);if(!scope.ok)return c.json(scope.response,scope.status as any);const row=await c.env.DB.prepare("SELECT * FROM compliance_ai_scans WHERE main_company_slug=? ORDER BY created_at DESC LIMIT 1").bind(scope.slug).first<Row>();return c.json({ok:true,data:row?{...row,result:jsonObject(row.result_json)}:null});});
  app.get("/api/denetim/file/:assetId",async c=>{const scope=await secureContext(c);if(!scope.ok)return c.json(scope.response,scope.status as any);const assetId=c.req.param("assetId"),row=await c.env.DB.prepare(`SELECT a.file_name,a.mime_type,a.preview_storage_key,a.source_type FROM file_hub_assets a JOIN file_hub_relations r ON r.file_asset_id=a.id AND r.main_company_slug=a.main_company_slug WHERE a.id=? AND a.main_company_slug=? AND r.entity_type='AUDIT_DOCUMENT' LIMIT 1`).bind(assetId,scope.slug).first<Row>();if(!row)return c.json(errorBody("NOT_FOUND","Denetim evrakı bulunamadı."),404);if(!text(row.preview_storage_key))return c.json(errorBody("FILE_REMOTE_ONLY","Bu evrak ana bulut arşivinde. File Hub üzerinden açılmalıdır."),409);const object=await c.env.FILES.get(text(row.preview_storage_key));if(!object)return c.json(errorBody("FILE_MISSING","Evrak önizlemesi bulunamadı."),404);const headers=new Headers();headers.set("Content-Type",text(row.mime_type)||object.httpMetadata?.contentType||"application/octet-stream");headers.set("Content-Disposition",`inline; filename="${text(row.file_name).replace(/"/g,"")}"`);headers.set("Cache-Control","private, max-age=60");return new Response(object.body,{status:200,headers});});
}
