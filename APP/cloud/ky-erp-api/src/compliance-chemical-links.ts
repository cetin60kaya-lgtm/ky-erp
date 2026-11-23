// @ts-nocheck
/**
 * Merkezi denetim kanıtı ↔ Boyahane ürün kartı ilişkisi.
 * Orijinal tek File Hub asset'te kalır, birden fazla üründe ilişki olarak görünür.
 * ZDHC/GOTS ortak listesi için ürün adının listede gerçekten yer aldığı insan
 * tarafından doğrulanmadan "VERIFIED" onayı verilemez.
 */
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toLocaleUpperCase("tr-TR").replace(/İ/g,"I");
const error=(code:string,message:string)=>({ok:false,success:false,error:{code,message}});
const kinds=new Set(["MSDS","TDS","ZDHC","GOTS","LCW_DECLARATION","LCW_INVENTORY","TEST_REPORT"]);
const parse=(v:unknown)=>{try{return typeof v==="string"?JSON.parse(v):v||{}}catch{return{}}};
const own=(u:Row)=>text(u.mainCompanySlug||u.main_company_slug||u.security?.main_company_slug).toLocaleLowerCase("tr-TR");
const admin=(u:Row)=>["SUPER_ADMIN","ADMIN","COMPANY_ADMIN"].includes(upper(u.role));
async function permit(c:Context<AppEnv>,write=false){
 const user=await getAuthenticatedUser(c) as Row|null;
 if(!user)return {error:c.json(error("UNAUTHORIZED","Giriş gerekli."),401)};
 const slug=own(user);
 if(!slug)return {error:c.json(error("COMPANY_REQUIRED","Firma oturumu gerekli."),403)};
 const perm=(Array.isArray(user.permissions)?user.permissions:[]).find((p:Row)=>upper(p.moduleKey||p.module_key)==="COMPLIANCE");
 if(!admin(user)&&!(write?(perm?.canUpdate||perm?.canCreate||perm?.can_update||perm?.can_create):(perm?.canView||perm?.can_view)))return{error:c.json(error("COMPLIANCE_FORBIDDEN","Denetim yetkisi gerekli."),403)};
 return {slug,user};
}
async function productOf(c:Context<AppEnv>,slug:string,id:string){
 const r=await c.env.DB.prepare("SELECT id,data FROM json_store WHERE scope='BOYAHANE_APPROVED_PRODUCT' AND main_company_slug=? AND file_name=? LIMIT 1").bind(slug,id).first<Row>();
 return r?{id:r.id,data:parse(r.data)}:null;
}
async function assetOf(c:Context<AppEnv>,slug:string,id:string){
 return c.env.DB.prepare(`SELECT a.id,a.file_name,a.sha256,a.status,l.is_available,l.provider_file_id,l.relative_path
 FROM file_hub_assets a LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id
 AND l.main_company_slug=a.main_company_slug AND l.location_role='PRIMARY'
 WHERE a.main_company_slug=? AND a.id=? LIMIT 1`).bind(slug,id).first<Row>();
}
export function registerComplianceChemicalRoutes(app:Hono<AppEnv>){
 app.get("/api/compliance/chemicals",async c=>{
   const a=await permit(c);if(a.error)return a.error;
   const q=text(c.req.query("q")).toLocaleLowerCase("tr-TR");
   const r=await c.env.DB.prepare("SELECT file_name,data FROM json_store WHERE main_company_slug=? AND scope='BOYAHANE_APPROVED_PRODUCT' ORDER BY updated_at DESC LIMIT 1000").bind(a.slug).all<Row>();
   const data=(r.results||[]).map(x=>({...parse(x.data),id:text(parse(x.data).id||x.file_name)}))
   .filter(x=>!q||[x.name,x.productName,x.code,x.supplierName].join(" ").toLocaleLowerCase("tr-TR").includes(q));
   return c.json({ok:true,data});
 });
 app.get("/api/compliance/chemicals/:productId/evidence",async c=>{
   const a=await permit(c);if(a.error)return a.error;
   const product=await productOf(c,a.slug,c.req.param("productId"));
   if(!product)return c.json(error("PRODUCT_NOT_FOUND","Ürün bulunamadı."),404);
   const r=await c.env.DB.prepare(`SELECT r.id,r.relation_type,r.metadata,a.id file_asset_id,a.file_name,a.mime_type,a.status,a.sha256,l.relative_path,l.is_available,
     l.storage_connection_id
     FROM file_hub_relations r JOIN file_hub_assets a ON a.id=r.file_asset_id AND a.main_company_slug=r.main_company_slug
     LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug AND l.location_role='PRIMARY'
     WHERE r.main_company_slug=? AND r.entity_type='BOYAHANE_PRODUCT' AND r.entity_id=? ORDER BY r.created_at DESC`).bind(a.slug,c.req.param("productId")).all<Row>();
   return c.json({ok:true,data:{product:product.data,documents:(r.results||[]).map(x=>({...x,metadata:parse(x.metadata),archiveVerified:Number(x.is_available)===1&&Boolean(x.sha256)}))}});
 });
 app.post("/api/compliance/chemicals/:productId/evidence",async c=>{
   const a=await permit(c,true);if(a.error)return a.error;
   const b=await c.req.json().catch(()=>({})) as Row, id=c.req.param("productId"),kind=upper(b.kind),assetId=text(b.fileAssetId);
   if(!kinds.has(kind)||!assetId)return c.json(error("INVALID_INPUT","Kanıt türü ve mevcut File Hub dosyası zorunludur."),422);
   const product=await productOf(c,a.slug,id);
   if(!product)return c.json(error("PRODUCT_NOT_FOUND","Boyahane ürün kartı bulunamadı."),404);
   const asset=await assetOf(c,a.slug,assetId);
   if(!asset)return c.json(error("FILE_NOT_FOUND","Bu firmanın File Hub evrakı bulunamadı."),404);
   const listed=text(b.listedProductName),shared=["ZDHC","GOTS","LCW_INVENTORY"].includes(kind);
   if(shared&&!listed)return c.json(error("LIST_PRODUCT_REQUIRED","Ortak ürün listesinde eşleştirilecek ürün adı zorunludur."),422);
   const ts=new Date().toISOString(),meta={verificationStatus:"PENDING_REVIEW",listProductName:listed||null,sourceRevision:text(b.sourceRevision)||null,
    zdhcLevel:text(b.zdhcLevel)||null,evidenceKind:kind,supplierName:text(product.data.supplierName)||null,linkedBy:text(a.user.id)||null,linkedAt:ts};
   await c.env.DB.prepare(`INSERT OR IGNORE INTO file_hub_relations
   (id,main_company_slug,file_asset_id,entity_type,entity_id,relation_type,is_primary,confidence,source,metadata,created_at,updated_at)
   VALUES(?,?,?,'BOYAHANE_PRODUCT',?,?,0,NULL,'COMPLIANCE_CENTER',?,?,?)`)
   .bind(crypto.randomUUID(),a.slug,assetId,id,kind,JSON.stringify(meta),ts,ts).run();
   const docs=Array.isArray(product.data.documents)?product.data.documents:[];
   if(!docs.some(x=>text(x.fileHubAssetId)===assetId&&upper(x.name)===kind)){
      docs.push({name:kind,fileHubAssetId:assetId,fileName:asset.file_name,status:"AVAILABLE",verificationStatus:"PENDING_REVIEW",listProductName:listed,
        sourceRevision:text(b.sourceRevision),zdhcLevel:text(b.zdhcLevel)});
      const updated={...product.data,documents:docs,updatedAt:ts};
      await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(JSON.stringify(updated),ts,product.id,a.slug).run();
   }
   return c.json({ok:true,data:{kind,fileAssetId:assetId,status:"PENDING_REVIEW",archiveVerified:Number(asset.is_available)===1&&Boolean(asset.sha256)}});
 });
 app.post("/api/compliance/chemicals/:productId/evidence/:assetId/verify",async c=>{
   const a=await permit(c,true);if(a.error)return a.error;
   if(!admin(a.user))return c.json(error("APPROVAL_FORBIDDEN","Kanıt doğrulaması firma yöneticisi onayı gerektirir."),403);
   const productId=c.req.param("productId"),assetId=c.req.param("assetId"),product=await productOf(c,a.slug,productId);
   if(!product)return c.json(error("PRODUCT_NOT_FOUND","Ürün bulunamadı."),404);
   const asset=await assetOf(c,a.slug,assetId);
   if(!asset||Number(asset.is_available)!==1||!text(asset.sha256)||upper(asset.status)==="MISSING")
     return c.json(error("FILE_HUB_NOT_VERIFIED","Dosyanın gerçek File Hub konumu doğrulanmadan onay verilmez."),409);
   const relation=await c.env.DB.prepare("SELECT * FROM file_hub_relations WHERE main_company_slug=? AND file_asset_id=? AND entity_type='BOYAHANE_PRODUCT' AND entity_id=? LIMIT 1").bind(a.slug,assetId,productId).first<Row>();
   if(!relation)return c.json(error("RELATION_NOT_FOUND","Ürün/kanıt bağlantısı bulunamadı."),404);
   const meta=parse(relation.metadata),kind=upper(relation.relation_type),b=await c.req.json().catch(()=>({})) as Row;
   if(["ZDHC","GOTS","LCW_INVENTORY"].includes(kind)){
     const listed=text(meta.listProductName),productName=text(product.data.productName||product.data.name);
     if(!listed||!productName||upper(listed)!==upper(productName)&&upper(listed)!==upper(product.data.code))
       return c.json(error("LIST_PRODUCT_MISMATCH","Ortak listedeki ürün ile Boyahane ürününü birebir doğrulayın."),409);
     if(b.listConfirmed!==true)return c.json(error("LIST_CONFIRMATION_REQUIRED","Ortak listenin ürün satırı yetkili tarafından doğrulanmalıdır."),422);
   }
   const ts=new Date().toISOString();meta.verificationStatus="VERIFIED";meta.verifiedAt=ts;meta.verifiedBy=text(a.user.id);
   await c.env.DB.prepare("UPDATE file_hub_relations SET metadata=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(JSON.stringify(meta),ts,relation.id,a.slug).run();
   const docs=(Array.isArray(product.data.documents)?product.data.documents:[]).map(x=>text(x.fileHubAssetId)===assetId&&upper(x.name)===kind?{...x,verificationStatus:"VERIFIED",verifiedAt:ts,verifiedBy:text(a.user.id)}:x);
   await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(JSON.stringify({...product.data,documents:docs}),ts,product.id,a.slug).run();
   return c.json({ok:true,data:{kind,productId,assetId,verificationStatus:"VERIFIED",productApprovalUnchanged:true}});
 });
}
