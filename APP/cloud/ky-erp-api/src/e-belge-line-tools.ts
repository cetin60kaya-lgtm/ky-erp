// @ts-nocheck
import type { Context, Hono } from "hono";
import {
  eBelgeProductRouting,
  getEBelgeProduct,
  listEBelgeProducts,
  saveEBelgeProductAlias,
} from "./e-belge-product-store";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const now=()=>new Date().toISOString();
const slugOf=(c:Context<AppEnv>,b:Row={})=>text(b.mainCompanySlug||b.main_company_slug||b.mainCompanyId||c.req.query("mainCompanySlug")||c.req.query("mainCompanyId")||c.req.header("X-KYERP-Tenant-Slug"));
const json=(v:unknown)=>{if(v&&typeof v==="object"&&!Array.isArray(v))return v as Row;try{const p=JSON.parse(text(v)||"{}");return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}catch{return{}}};

async function resolveIfClean(c:Context<AppEnv>,slug:string,documentId:string){
  const unmatched=await c.env.DB.prepare(`SELECT COUNT(*) n FROM accounting_document_lines WHERE main_company_slug=? AND document_id=? AND product_id IS NULL`).bind(slug,documentId).first<Row>();
  if(Number(unmatched?.n||0)===0)await c.env.DB.prepare(`UPDATE accounting_document_issues SET is_resolved=1,resolved_at=? WHERE main_company_slug=? AND document_id=? AND issue_code='PRODUCT_UNMATCHED' AND is_resolved=0`).bind(now(),slug,documentId).run();
  const lines=(await c.env.DB.prepare(`SELECT raw_metadata FROM accounting_document_lines WHERE main_company_slug=? AND document_id=?`).bind(slug,documentId).all<Row>()).results||[];
  const lotMissing=lines.some((line)=>{const raw=json(line.raw_metadata);return raw.chemical&&!text(raw.lotNo)});
  if(!lotMissing)await c.env.DB.prepare(`UPDATE accounting_document_issues SET is_resolved=1,resolved_at=? WHERE main_company_slug=? AND document_id=? AND issue_code='LOT_REQUIRED' AND is_resolved=0`).bind(now(),slug,documentId).run();
}

export function registerEBelgeLineToolRoutes(app:Hono<AppEnv>){
  app.get("/api/e-belge/products",async c=>{
    const slug=slugOf(c),q=text(c.req.query("q"));
    if(q.length<1)return c.json({ok:true,data:[]});
    return c.json({ok:true,data:await listEBelgeProducts(c,slug,q)});
  });

  app.patch("/api/e-belge/documents/:id/lines/:lineId",async c=>{
    const slug=slugOf(c),documentId=c.req.param("id"),lineId=c.req.param("lineId"),body=await c.req.json<Row>().catch(()=>({}));
    const line=await c.env.DB.prepare(`SELECT * FROM accounting_document_lines WHERE id=? AND document_id=? AND main_company_slug=? LIMIT 1`).bind(lineId,documentId,slug).first<Row>();
    if(!line)return c.json({ok:false,error:{code:"LINE_NOT_FOUND",message:"Belge kalemi bulunamadı."}},404);
    let product:Row|null=null;
    if(text(body.productId)){
      product=await getEBelgeProduct(c,slug,text(body.productId));
      if(!product)return c.json({ok:false,error:{code:"PRODUCT_NOT_FOUND",message:"Ürün kartı bulunamadı."}},404);
    }
    const raw={...json(line.raw_metadata)};
    if(product){
      const routing=eBelgeProductRouting(product,line);
      raw.routingType=routing.routing;
      raw.chemical=routing.chemical;
      raw.productMatchSource="MANUAL";
      raw.productName=text(product.name||product.productName);
    }
    if(body.lotNo!==undefined)raw.lotNo=text(body.lotNo);
    await c.env.DB.prepare(`UPDATE accounting_document_lines SET product_id=COALESCE(?,product_id),match_status=CASE WHEN COALESCE(?,product_id) IS NOT NULL THEN 'MANUAL' ELSE match_status END,match_confidence=CASE WHEN COALESCE(?,product_id) IS NOT NULL THEN 1 ELSE match_confidence END,raw_metadata=?,updated_at=? WHERE id=? AND document_id=? AND main_company_slug=?`).bind(product?.id||null,product?.id||null,product?.id||null,JSON.stringify(raw),now(),lineId,documentId,slug).run();
    await resolveIfClean(c,slug,documentId);
    return c.json({ok:true,data:{lineId,productId:product?.id||line.product_id||null,lotNo:raw.lotNo||"",routingType:raw.routingType||""}});
  });

  app.post("/api/e-belge/products/:productId/aliases",async c=>{
    const slug=slugOf(c),productId=c.req.param("productId"),body=await c.req.json<Row>().catch(()=>({})),alias=text(body.alias);
    const product=await getEBelgeProduct(c,slug,productId);
    if(!product)return c.json({ok:false,error:{code:"PRODUCT_NOT_FOUND",message:"Ürün kartı bulunamadı."}},404);
    const documentId=text(body.documentId);
    let companyId=text(body.companyId);
    if(!companyId&&documentId){
      const doc=await c.env.DB.prepare(`SELECT party_company_id FROM accounting_documents WHERE id=? AND main_company_slug=? LIMIT 1`).bind(documentId,slug).first<Row>();
      companyId=text(doc?.party_company_id);
    }
    try{
      const saved=await saveEBelgeProductAlias(c,slug,{companyId,productId,productName:text(product.name||product.productName),rawName:alias});
      return c.json({ok:true,data:{productId,alias,companyId,saved}});
    }catch(error:any){
      return c.json({ok:false,error:{code:text(error?.code)||"ALIAS_SAVE_FAILED",message:text(error?.message)||"Alias kaydedilemedi."}},400);
    }
  });
}
