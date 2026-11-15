import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { accountingAccess, accountingTenantReadAllowed, accountingTenantCandidates } from "./accounting-access-policy";
import { inspectUblVisual, visualLayout, visualOutputFormat, visualProfileKey } from "./e-belge-visual-profile-core";
type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const SCOPE="EBELGE_VISUAL_PROFILE_V1";
const text=(x:unknown)=>String(x??"").trim();
const fail=(code:string,message:string)=>({ok:false,error:{code,message}});
function tenantOf(c:Context<AppEnv>) {
 const values=accountingTenantCandidates(text(c.req.query("mainCompanySlug")),text(c.req.header("X-KYERP-Tenant-Slug")),{});
 return values.length===1?values[0]:"";
}
async function authorize(c:Context<AppEnv>,method:string) {
 const user=await getAuthenticatedUser(c);
 const slug=tenantOf(c);
 if(!user?.id||!accountingTenantReadAllowed(user,slug)||!accountingAccess(user,method,c.req.path))
  return {slug:"",allowed:false};
 return {slug,allowed:true};
}
function profileName(issuer:string,kind:string){return visualProfileKey(issuer,kind as "INVOICE"|"DISPATCH");}
async function load(c:Context<AppEnv>,tenant:string,key:string):Promise<Row|null> {
 const row=await c.env.DB.prepare("SELECT data FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? ORDER BY updated_at DESC LIMIT 1").bind(SCOPE,tenant,key).first<Row>();
 if(!row)return null;
 try{return JSON.parse(text(row.data)) as Row;}catch{return null}
}
async function write(c:Context<AppEnv>,tenant:string,key:string,body:Row){
 const ts=new Date().toISOString();
 const prev=await load(c,tenant,key);
 const value={...body,tenant,profileKey:key,revision:Number(prev?.revision||0)+1,
  createdAt:prev?.createdAt||ts,updatedAt:ts};
 if(prev){
  await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE scope=? AND main_company_slug=? AND file_name=?").bind(JSON.stringify(value),ts,SCOPE,tenant,key).run();
 }else{
  await c.env.DB.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),SCOPE,tenant,key,JSON.stringify(value),ts,ts).run();
 }
 return value;
}
function publicProfile(r:Row){
 const {tenant,referenceKey,sourceXmlKey,...safe}=r;
 return {...safe,hasReference:Boolean(referenceKey),hasOriginalXml:Boolean(sourceXmlKey)};
}
const MAX_SAMPLE=20*1024*1024;
function referenceKind(file:File,buffer:Uint8Array) {
 const ext=file.name.toLowerCase().split(".").pop();
 if(ext==="pdf"&&String.fromCharCode(...buffer.slice(0,5))==="%PDF-")return {ext:"pdf",mime:"application/pdf"};
 if((ext==="jpg"||ext==="jpeg")&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return {ext:"jpeg",mime:"image/jpeg"};
 if(ext==="png"&&buffer[0]===137&&buffer[1]===80&&buffer[2]===78&&buffer[3]===71)return {ext:"png",mime:"image/png"};
 throw new Error("Referans yalnız gerçek PDF/JPEG/PNG dosyası olabilir.");
}
async function sha(bytes:Uint8Array) {
 const owned=new Uint8Array(new ArrayBuffer(bytes.byteLength));
 owned.set(bytes);
 const hash=await crypto.subtle.digest("SHA-256",owned.buffer);
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function registerEBelgeVisualProfileRoutes(app:Hono<AppEnv>){
 app.get("/api/e-belge/visual-profiles",async c=>{
  const permit=await authorize(c,"GET");
  if(!permit.allowed)return c.json(fail("FORBIDDEN","Bu firmanın görsel şablonları için yetki yok."),403);
  const rows=await c.env.DB.prepare("SELECT data FROM json_store WHERE scope=? AND main_company_slug=? ORDER BY updated_at DESC LIMIT 200").bind(SCOPE,permit.slug).all<Row>();
  const items=(rows.results||[]).flatMap(r=>{try{return [publicProfile(JSON.parse(text(r.data)))]}catch{return []}});
  return c.json({ok:true,data:{items}});
 });
 app.post("/api/e-belge/visual-profiles/sample",async c=>{
  const permit=await authorize(c,"POST");
  if(!permit.allowed)return c.json(fail("FORBIDDEN","Görsel şablon tanıtma yetkisi yok."),403);
  const b=await c.req.parseBody({all:true});
  const xml=b.sampleXml,reference=b.referenceFile;
  if(!(xml instanceof File)||!(reference instanceof File))return c.json(fail("SAMPLE_REQUIRED","Bir orijinal XML ve aynı belgeye ait PDF/JPEG/PNG örneği seçin."),400);
  if(xml.size===0||reference.size===0||xml.size>MAX_SAMPLE||reference.size>MAX_SAMPLE)
   return c.json(fail("SAMPLE_TOO_LARGE","Örneklerin her biri 20 MB altında ve dolu olmalıdır."),413);
  const approval=text(b.confirmedSameDocument)==="true";
  if(!approval)return c.json(fail("PAIR_CONFIRMATION_REQUIRED","XML ve referans görselin aynı belgeye ait olduğunu onaylayın."),409);
  const input=new TextDecoder("utf-8",{fatal:false}).decode(await xml.arrayBuffer());
  let identity:ReturnType<typeof inspectUblVisual>;
  try{identity=inspectUblVisual(input)}catch(e:any){return c.json(fail("INVALID_UBL_SAMPLE",text(e.message)),400)}
  const bytes=new Uint8Array(await reference.arrayBuffer());
  let ref:{ext:string;mime:string};
  try{ref=referenceKind(reference,bytes)}catch(e:any){return c.json(fail("INVALID_REFERENCE",text(e.message)),400)}
  const filename=(name:string)=>name.replace(/\.[^.]+$/,"").toLowerCase();
  if(filename(xml.name)!==filename(reference.name))
    return c.json(fail("REFERENCE_NAME_MISMATCH","Örnek XML ve PDF/JPEG/PNG dosya adlarının belge numarası aynı olmalıdır."),409);
  const key=identity.profileKey;
  let config:Row={};
  try{config=JSON.parse(text(b.layout)||"{}")}catch{return c.json(fail("INVALID_LAYOUT","Yerleşim ayarı okunamadı."),400)}
  let outputFormat:"PDF"|"JPEG"|"PNG";
  try{outputFormat=visualOutputFormat(b.outputFormat)}catch(e:any){return c.json(fail("INVALID_FORMAT",e.message),400)}
  const saved=await load(c,permit.slug,key);
  const version=Number(saved?.revision||0)+1;
  const prefix="e-belge/visual-profiles/"+permit.slug+"/"+key.replace(":","/")+"/v"+version+"-"+crypto.randomUUID();
  const sourceKey=prefix+"/sample.xml";
  const referenceKey=prefix+"/reference."+ref.ext;
  // Original bytes are never written to GitHub or document logs. Templates
  // reference only a private R2 key, scoped by current authenticated tenant.
  await c.env.FILES.put(sourceKey,new TextEncoder().encode(input),{httpMetadata:{contentType:"application/xml"}});
  await c.env.FILES.put(referenceKey,bytes,{httpMetadata:{contentType:ref.mime}});
  const record=await write(c,permit.slug,key,{
   issuerTaxNo:identity.issuerTaxNo,kind:identity.kind,
   sampleDocumentNo:identity.documentNo,sampleUuid:identity.documentUuid,
   sourceHasEmbeddedXslt:identity.hasDocumentXslt,
   outputFormat,layout:visualLayout(config),
   sourceXmlKey:sourceKey,referenceKey,referenceMime:ref.mime,
   xmlHash:await sha(new TextEncoder().encode(input)),
   referenceHash:await sha(bytes),
   referenceMatchDeclared:true,
   visualOutputVerified:false,approved:false,
   status:"REFERENCE_SAVED_REVIEW_REQUIRED",
  });
  return c.json({ok:true,data:publicProfile(record)},201);
 });
 app.patch("/api/e-belge/visual-profiles/:issuer/:kind",async c=>{
  const permit=await authorize(c,"PATCH");
  if(!permit.allowed)return c.json(fail("FORBIDDEN","Görsel şablon güncelleme yetkisi yok."),403);
  let key:string;
  try{key=profileName(c.req.param("issuer"),c.req.param("kind"))}
  catch{return c.json(fail("INVALID_PROFILE","VKN/TCKN veya belge türü yanlış."),400)}
  const old=await load(c,permit.slug,key);
  if(!old)return c.json(fail("NOT_FOUND","Bu firmaya ait şablon henüz tanıtılmadı."),404);
  const body:Row=await c.req.json<Row>().catch(():Row=>({}));
  let format:"PDF"|"JPEG"|"PNG";
  try{format=visualOutputFormat(body.outputFormat??old.outputFormat)}
  catch(e:any){return c.json(fail("INVALID_FORMAT",e.message),400)}
  const layout=visualLayout(body.layout??old.layout);
  // Configuration edits invalidate prior visual sign-off; approval only after
  // an actual current-document PDF/JPEG preview has been visually compared.
  const value=await write(c,permit.slug,key,{
   ...old,outputFormat:format,layout,approved:false,visualOutputVerified:false,
   status:"REFERENCE_SAVED_REVIEW_REQUIRED",
  });
  return c.json({ok:true,data:publicProfile(value)});
 });
 app.post("/api/e-belge/visual-profiles/:issuer/:kind/approve",async c=>{
  const permit=await authorize(c,"POST");
  if(!permit.allowed)return c.json(fail("FORBIDDEN","Şablon kabul yetkisi yok."),403);
  let key:string;
  try{key=profileName(c.req.param("issuer"),c.req.param("kind"))}
  catch{return c.json(fail("INVALID_PROFILE","Geçersiz firma şablonu."),400)}
  const old=await load(c,permit.slug,key);
  if(!old)return c.json(fail("NOT_FOUND","Henüz tanıtılmış şablon bulunamadı."),404);
  const body:Row=await c.req.json<Row>().catch(():Row=>({}));
  if(body.visualChecked!==true || text(body.sampleDocumentNo)!==text(old.sampleDocumentNo) ||
     Number(body.expectedRevision)!==Number(old.revision) || !old.referenceKey || !old.sourceXmlKey)
   return c.json(fail("VISUAL_ACCEPTANCE_REQUIRED","Aynı belgeye ait orijinal ve üretilen önizlemeyi gözle karşılaştırıp güncel sürümde onaylamalısınız."),409);
  const user=await getAuthenticatedUser(c);
  const approved=await write(c,permit.slug,key,{...old,approved:true,visualOutputVerified:true,
   acceptedAt:new Date().toISOString(),acceptedBy:text(user?.id),status:"VISUAL_ACCEPTED_BY_USER"});
  return c.json({ok:true,data:publicProfile(approved)});
 });
 app.get("/api/e-belge/visual-profiles/:issuer/:kind/sample-xml",async c=>{
  const permit=await authorize(c,"GET");
  if(!permit.allowed)return c.json(fail("FORBIDDEN","Bu firmanın kayıtlı örnek XML'ini okuma yetkisi yok."),403);
  let key:string;
  try{key=profileName(c.req.param("issuer"),c.req.param("kind"))}
  catch{return c.json(fail("INVALID_PROFILE","Firma ve belge türü geçersiz."),400)}
  const profile=await load(c,permit.slug,key);
  if(!profile?.sourceXmlKey)return c.json(fail("NOT_FOUND","Kayıtlı örnek XML bulunamadı."),404);
  const blob=await c.env.FILES.get(text(profile.sourceXmlKey));
  if(!blob)return c.json(fail("NOT_FOUND","Kayıtlı orijinal XML arşivden okunamadı."),404);
  return new Response(blob.body,{headers:{
   "Content-Type":"application/xml; charset=utf-8",
   "Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff",
   "Content-Disposition":"inline; filename=sample.xml"
  }});
 });
 app.get("/api/e-belge/visual-profiles/:issuer/:kind/reference",async c=>{
  const permit=await authorize(c,"GET");
  if(!permit.allowed)return c.json(fail("FORBIDDEN","Referans görseli görme yetkisi yok."),403);
  let key:string;
  try{key=profileName(c.req.param("issuer"),c.req.param("kind"))}
  catch{return c.json(fail("INVALID_PROFILE","Şablon anahtarı yanlış."),400)}
  const record=await load(c,permit.slug,key);
  if(!record?.referenceKey)return c.json(fail("NOT_FOUND","Referans görsel bulunamadı."),404);
  const file=await c.env.FILES.get(text(record.referenceKey));
  if(!file)return c.json(fail("NOT_FOUND","Örnek arşivde bulunamadı."),404);
  return new Response(file.body,{headers:{"Content-Type":text(record.referenceMime)||"application/pdf",
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
   "Content-Disposition":"inline; filename=reference."+String(record.referenceMime).split("/").pop()}});
 });
}
