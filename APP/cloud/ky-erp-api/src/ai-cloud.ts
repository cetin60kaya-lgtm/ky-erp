// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const CONVERSATION_SCOPE = "KYERP_AI_CONVERSATION";
const ACTION_SCOPE = "KYERP_AI_ACTION";
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_HISTORY_MESSAGES = 14;
const MAX_CONTEXT_ROWS = 70;
const MAX_FILE_CONTEXT_ROWS = 80;

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const nowIso = () => new Date().toISOString();

function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Row : {}; }
  catch { return {}; }
}
async function bodyOf(c: Context<AppEnv>): Promise<Row> { try { const value=await c.req.json(); return value&&typeof value==="object"&&!Array.isArray(value)?value as Row:{}; } catch { return {}; } }
function slugOf(c: Context<AppEnv>, body: Row = {}) { return text(body.mainCompanySlug||body.main_company_slug||body.pageContext?.mainCompanySlug||c.req.query("mainCompanySlug")||c.req.query("mainCompanyId")||"mecit-hakan"); }
function cleanMessages(value: unknown) { return (Array.isArray(value)?value:[]).filter(row=>row&&typeof row==="object").map((row:Row)=>({id:text(row.id||crypto.randomUUID()),role:["user","assistant","tool"].includes(text(row.role))?text(row.role):"assistant",content:text(row.content),createdAt:text(row.createdAt||nowIso()),actions:Array.isArray(row.actions)?row.actions:[],sourceCount:Number(row.sourceCount||0)})).filter(row=>row.content); }
function isOwner(user:Row){return ["ADMIN","SUPER_ADMIN"].includes(upper(user?.role));}
function normalizeModuleKey(value:unknown){const key=upper(value);if(key==="URETIM"||key==="ÜRETİM")return"IMALAT";if(key==="ASISTAN")return"ASISTAN";return key;}
function userCanView(user:Row,moduleKey:unknown){if(isOwner(user))return true;const key=normalizeModuleKey(moduleKey);return Array.isArray(user?.permissions)&&user.permissions.some((p:Row)=>normalizeModuleKey(p.moduleKey||p.module_key)===key&&Boolean(p.canView??p.can_view));}
function allowedFileEntities(user:Row){
  if(isOwner(user))return null;
  const entities=new Set<string>();
  const add=(...values:string[])=>values.forEach(v=>entities.add(v));
  if(userCanView(user,"DESEN"))add("MODEL","MODEL_TEAMMATE","OUTGOING_PACKAGE");
  if(userCanView(user,"IMALAT"))add("PRODUCTION","PRODUCTION_ORDER","MODEL","MODEL_TEAMMATE");
  if(userCanView(user,"BOYAHANE"))add("DYE_RECIPE","DYE_BATCH","LOT","STOCK_ITEM","MODEL");
  if(userCanView(user,"MUHASEBE"))add("DOCUMENT","INVOICE");
  if(userCanView(user,"ISNET"))add("DOCUMENT","INVOICE");
  if(userCanView(user,"IK"))add("PERSONNEL","EMPLOYEE");
  return [...entities];
}

async function conversationGet(c:Context<AppEnv>,id:string,slug:string){ const row=await c.env.DB.prepare(`SELECT id,file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL) ORDER BY updated_at DESC LIMIT 1`).bind(CONVERSATION_SCOPE,id,slug).first<Row>(); if(!row)return null; const data=objectOf(row.data); return {...data,id:text(data.id||row.file_name),storeId:text(row.id),title:text(data.title||"KY ERP Sohbeti"),messages:cleanMessages(data.messages),createdAt:text(data.createdAt||row.created_at),updatedAt:text(data.updatedAt||row.updated_at)}; }
async function conversationPut(c:Context<AppEnv>,id:string,slug:string,data:Row){ const current=await c.env.DB.prepare(`SELECT id,created_at FROM json_store WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL) ORDER BY updated_at DESC LIMIT 1`).bind(CONVERSATION_SCOPE,id,slug).first<Row>(); const now=nowIso(); const payload={...data,id,messages:cleanMessages(data.messages),createdAt:text(data.createdAt||current?.created_at||now),updatedAt:now}; if(current?.id){await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?").bind(JSON.stringify(payload),now,current.id).run();return payload;} await c.env.DB.prepare(`INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),CONVERSATION_SCOPE,slug||null,id,JSON.stringify(payload),now,now).run(); return payload; }
async function conversationList(c:Context<AppEnv>,slug:string){ const result=await c.env.DB.prepare(`SELECT file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND (main_company_slug=? OR main_company_slug IS NULL) ORDER BY updated_at DESC LIMIT 80`).bind(CONVERSATION_SCOPE,slug).all<Row>(); return (result.results||[]).map(row=>{const data=objectOf(row.data);return{id:text(data.id||row.file_name),title:text(data.title||"KY ERP Sohbeti"),createdAt:text(data.createdAt||row.created_at),updatedAt:text(data.updatedAt||row.updated_at),messageCount:cleanMessages(data.messages).length};}); }

function moduleScopePatterns(moduleKey:unknown){const module=text(moduleKey).toLocaleLowerCase("tr-TR");if(module==="boyahane")return["BOYAHANE_%"];if(module==="desen")return["DESEN_%"];if(module==="isnet")return["ISNET_%"];if(module==="muhasebe")return["MUHASEBE_%","ACCOUNTING_%","COMPANY_%"];if(module==="uretim"||module==="imalat")return["PRODUCTION_%","IMALAT_%","MODEL_%"];if(module==="ik")return["IK_%","HR_%"];return[];}
function compactSourceRow(row:Row){const data=objectOf(row.data);const allow=["id","modelName","companyName","orderNo","colorName","pantone","colorHex","paintType","dyeType","productName","lotNo","remainingKg","status","version","totalPreparedKg","amount","documentNo","invoiceNo","sourceType","referenceCode","action","description","note","createdAt","updatedAt"];const summary:Row={scope:text(row.scope),key:text(row.file_name)};for(const key of allow){const value=data[key];if(value!==undefined&&value!==null&&value!=="")summary[key]=value;}if(Array.isArray(data.lines))summary.lines=data.lines.slice(0,8).map((line:Row)=>({productName:text(line.productName||line.productNameSnapshot),referenceGram:Number(line.referenceGram??line.totalGr??line.trialTotalGr??0),lotNo:text(line.lotNo||line.lotNoSnapshot)}));return summary;}
async function sourceContext(c:Context<AppEnv>,slug:string,moduleKey:unknown,user:Row){
  const permissionKey=normalizeModuleKey(moduleKey);
  if(!permissionKey||permissionKey==="ASISTAN"||!userCanView(user,permissionKey))return{rows:[],count:0,degraded:false};
  const patterns=moduleScopePatterns(moduleKey);if(!patterns.length)return{rows:[],count:0,degraded:false};
  const clauses=patterns.map(()=>"scope LIKE ?").join(" OR ");
  try{const result=await c.env.DB.prepare(`SELECT scope,file_name,data,updated_at FROM json_store WHERE (${clauses}) AND (main_company_slug=? OR main_company_slug IS NULL) ORDER BY updated_at DESC LIMIT ?`).bind(...patterns,slug,MAX_CONTEXT_ROWS).all<Row>();const rows=result.results||[];return{rows:rows.map(compactSourceRow),count:rows.length,degraded:false};}catch(error){console.error("KY ERP AI tenant context read failed",error);return{rows:[],count:0,degraded:true};}
}

function fileKeywords(message:string){return message.toLocaleUpperCase("tr-TR").split(/[^A-Z0-9ÇĞİÖŞÜ._-]+/).filter(x=>x.length>=3).slice(0,12);}
async function fileHubContext(c:Context<AppEnv>,slug:string,message:string,moduleKey:unknown,user:Row){
  try{
    const allowedEntities=allowedFileEntities(user);
    if(Array.isArray(allowedEntities)&&!allowedEntities.length)return{rows:[],count:0,degraded:false};
    const words=fileKeywords(message),conditions:string[]=[],args:any[]=[slug];
    for(const word of words){conditions.push("(UPPER(a.file_name) LIKE ? OR UPPER(COALESCE(a.logical_key,'')) LIKE ? OR UPPER(COALESCE(l.relative_path,'')) LIKE ? OR UPPER(COALESCE(r.entity_id,'')) LIKE ?)");const like=`%${word}%`;args.push(like,like,like,like);}
    let access="";
    if(Array.isArray(allowedEntities)){access=`AND r.entity_type IN (${allowedEntities.map(()=>"?").join(",")})`;args.push(...allowedEntities);}
    const where=conditions.length?`AND (${conditions.join(" OR ")})`:"";
    const module=normalizeModuleKey(moduleKey),limit=MAX_FILE_CONTEXT_ROWS;
    const result=await c.env.DB.prepare(`SELECT a.id,a.file_name,a.extension,a.status,a.logical_key,a.sha256,a.size_bytes,a.updated_at,l.relative_path,l.location_role,c.provider_type,c.name provider_name,r.entity_type,r.entity_id,r.relation_type FROM file_hub_assets a LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug AND l.location_role='PRIMARY' LEFT JOIN file_hub_connections c ON c.id=l.storage_connection_id LEFT JOIN file_hub_relations r ON r.file_asset_id=a.id AND r.main_company_slug=a.main_company_slug WHERE a.main_company_slug=? ${where} ${access} ORDER BY CASE WHEN UPPER(COALESCE(r.entity_type,''))=? THEN 0 ELSE 1 END,a.updated_at DESC LIMIT ?`).bind(...args,module,limit).all<Row>();
    const rows=(result.results||[]).map(row=>({fileId:row.id,fileName:row.file_name,extension:row.extension,status:row.status,logicalKey:row.logical_key,provider:row.provider_type,providerName:row.provider_name,path:row.relative_path,locationRole:row.location_role,entityType:row.entity_type,entityId:row.entity_id,relationType:row.relation_type,updatedAt:row.updated_at}));
    return{rows,count:rows.length,degraded:false};
  }catch(error){console.error("KY ERP AI File Hub context read failed",error);return{rows:[],count:0,degraded:true};}
}

function systemPrompt(pageContext:Row,sourceCount:number,fileCount:number){const module=text(pageContext?.module||"ERP"),route=text(pageContext?.route||"");return `Sen KY ERP'nin şirket içi operasyon asistanısın. Türkçe, kısa, doğrudan ve uygulanabilir cevap ver.
Aktif modül: ${module}. Aktif rota: ${route||"belirtilmedi"}. Bu turda ${sourceCount} canlı tenant kaydı ve ${fileCount} yetkili File Hub dosya/ilişki satırı bağlama alındı.
Kurallar:
- Canlı kayıtta olmayan rakamı, stok miktarını, lotu, Pantone'u, reçeteyi veya dosya varlığını uydurma.
- Dosya sorularında File Hub bağlamını esas al. status=MISSING ise dosyanın kaydı vardır ama fiziksel ana kaynakta bulunamadığını açıkça söyle.
- provider/path/relationType/entityId alanlarını kullanarak PSD, PDF, görsel, model takımı ve belge ilişkilerini cevapla.
- Aynı entityId ile ilişkili birden çok dosya/model varsa bunları birlikte kullanım/takım bağlamında özetleyebilirsin; ilişki yoksa tahmin etme.
- File Hub bağlamı kullanıcının modül yetkileriyle filtrelenmiştir; görünmeyen dosyalar hakkında çıkarım yapma.
- Boyahane renginde HEX/Pantone benzerliği fiziksel boya sonucu garantisi değildir; kumaş, baz, ürün ve proses farkını belirt.
- Kullanıcı açıkça istemedikçe stok düşme, üretim kaydı, belge gönderme veya silme yapma.
- Bu endpoint doğrudan write işlemi çalıştırmaz. Gerekli write için kullanıcıya hangi işlemin onaylanması gerektiğini açıkla.
- Kaynak bağlamıyla kullanıcının mesajı çelişirse kaynak kaydını esas al ve belirsizliği açıkça söyle.
- Hassas teknik sırları, token veya parola isteme/gösterme.`;}
function aiText(result:unknown){if(typeof result==="string")return result.trim();if(!result||typeof result!=="object")return"";const row=result as Row;for(const candidate of[row.response,row.text,row.result?.response,row.result?.text,row.output_text]){const value=text(candidate);if(value)return value;}return"";}
function titleFrom(message:string){const clean=message.replace(/\s+/g," ").trim();return clean.length>52?`${clean.slice(0,49)}...`:clean||"KY ERP Sohbeti";}

export function registerAiCloudRoutes(app:Hono<AppEnv>){
  app.get("/api/ai/status",async c=>c.json({ok:true,success:true,enabled:Boolean(c.env.AI),model:MODEL,provider:"Cloudflare Workers AI",persistentConversations:true,fileHubAware:true,fileHubPermissionAware:true}));
  app.get("/api/ai/conversations",async c=>{const slug=slugOf(c);return c.json({ok:true,success:true,conversations:await conversationList(c,slug)});});
  app.get("/api/ai/conversations/:id",async c=>{const slug=slugOf(c),conversation=await conversationGet(c,c.req.param("id"),slug);if(!conversation)return c.json({ok:false,error:{code:"NOT_FOUND",message:"Konuşma bulunamadı."}},404);return c.json({ok:true,success:true,conversation});});
  app.delete("/api/ai/conversations/:id",async c=>{const slug=slugOf(c);await c.env.DB.prepare(`DELETE FROM json_store WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL)`).bind(CONVERSATION_SCOPE,c.req.param("id"),slug).run();return c.json({ok:true,success:true});});

  app.post("/api/ai/chat",async c=>{
    const user=await getAuthenticatedUser(c) as Row|null;
    if(!user)return c.json({ok:false,error:{code:"UNAUTHORIZED",message:"Oturum gerekli."}},401);
    const body=await bodyOf(c),slug=slugOf(c,body),message=text(body.message);if(!message)return c.json({ok:false,error:{code:"MESSAGE_REQUIRED",message:"Mesaj boş olamaz."}},400);if(!c.env.AI)return c.json({ok:false,error:{code:"AI_BINDING_MISSING",message:"Cloudflare Workers AI bağlantısı yapılandırılmamış."}},503);
    const conversationId=text(body.conversationId||crypto.randomUUID()),current=await conversationGet(c,conversationId,slug),previous=cleanMessages(current?.messages).filter(row=>row.role!=="tool"),pageContext=objectOf(body.pageContext);
    const [source,files]=await Promise.all([sourceContext(c,slug,pageContext.module,user),fileHubContext(c,slug,message,pageContext.module,user)]);
    const compactContext=JSON.stringify(source.rows).slice(0,22000),fileContext=JSON.stringify(files.rows).slice(0,22000),history=previous.slice(-MAX_HISTORY_MESSAGES).map(row=>({role:row.role,content:row.content}));
    const messages=[{role:"system",content:systemPrompt(pageContext,source.count,files.count)},{role:"system",content:`Canlı KY ERP iş bağlamı (JSON, sadece bu tenant ve yetkili modül): ${compactContext||"[]"}`},{role:"system",content:`File Hub dosya/ilişki bağlamı (JSON, sadece bu tenant ve kullanıcının yetkili olduğu modüller): ${fileContext||"[]"}`},...history,{role:"user",content:message}];
    let result:unknown;try{result=await c.env.AI.run(MODEL,{messages,temperature:0.2,max_tokens:1600});}catch(error){console.error("KY ERP Workers AI error",error);return c.json({ok:false,error:{code:"AI_PROVIDER_ERROR",message:"KY ERP AI şu anda yanıt üretemedi. Biraz sonra tekrar deneyin."}},502);}
    const answer=aiText(result)||"KY ERP AI yanıt üretemedi.",ts=nowIso(),totalSources=source.count+files.count,nextMessages=[...previous,{id:crypto.randomUUID(),role:"user",content:message,createdAt:ts,actions:[],sourceCount:0},{id:crypto.randomUUID(),role:"assistant",content:answer,createdAt:ts,actions:[],sourceCount:totalSources}];
    const saved=await conversationPut(c,conversationId,slug,{...current,id:conversationId,title:current?.title||titleFrom(message),pageContext,messages:nextMessages});
    return c.json({ok:true,success:true,conversationId,answer,actions:[],sourceCount:totalSources,fileHubSourceCount:files.count,sourceContextDegraded:source.degraded||files.degraded,usage:(result as Row)?.usage||null,model:MODEL,provider:"Cloudflare Workers AI",updatedAt:saved.updatedAt});
  });

  app.post("/api/ai/actions/confirm",async c=>{const body=await bodyOf(c),slug=slugOf(c,body),actionId=text(body.actionId);if(!actionId)return c.json({ok:false,error:{code:"ACTION_REQUIRED",message:"İşlem kimliği zorunludur."}},400);const row=await c.env.DB.prepare(`SELECT data FROM json_store WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL) ORDER BY updated_at DESC LIMIT 1`).bind(ACTION_SCOPE,actionId,slug).first<Row>();if(!row)return c.json({ok:false,error:{code:"ACTION_NOT_FOUND",message:"Onaylanacak AI işlemi bulunamadı."}},404);return c.json({ok:false,error:{code:"ACTION_EXECUTOR_DISABLED",message:"Bu AI işlemi otomatik yürütmeye açık değil; ilgili ERP ekranından onaylayın."}},409);});
  app.post("/api/ai/actions/cancel",async c=>{const body=await bodyOf(c),slug=slugOf(c,body),actionId=text(body.actionId);if(actionId)await c.env.DB.prepare(`DELETE FROM json_store WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL)`).bind(ACTION_SCOPE,actionId,slug).run();return c.json({ok:true,success:true});});
}
