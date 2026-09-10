// @ts-nocheck
import type { Context, Hono } from "hono";
import { resolveProductLotPolicy } from "./accounting-lot-reconciliation-core";
import { registerEBelgeLotToolRoutes } from "./e-belge-lot-tools";
import {
  eBelgeProductRouting,
  getEBelgeProduct,
  getEBelgeSupplierProfile,
  listEBelgeProducts,
  resolveEBelgeExpenseCategory,
  saveEBelgeExpenseRule,
  saveEBelgeProductAlias,
} from "./e-belge-product-store";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const now=()=>new Date().toISOString();
const slugOf=(c:Context<AppEnv>,b:Row={})=>text(b.mainCompanySlug||b.main_company_slug||b.mainCompanyId||c.req.query("mainCompanySlug")||c.req.query("mainCompanyId")||c.req.header("X-KYERP-Tenant-Slug"));
const json=(v:unknown)=>{if(v&&typeof v==="object"&&!Array.isArray(v))return v as Row;try{const p=JSON.parse(text(v)||"{}");return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}catch{return{}}};

async function resolveIfClean(c:Context<AppEnv>,slug:string,documentId:string){
  const lines=(await c.env.DB.prepare(`SELECT product_id,raw_metadata FROM accounting_document_lines WHERE main_company_slug=? AND document_id=?`).bind(slug,documentId).all<Row>()).results||[];
  const productMissing=lines.some((line)=>{const raw=json(line.raw_metadata),routing=text(raw.routingType||"EXPENSE").toUpperCase();return !text(line.product_id)&&(routing!=="EXPENSE"||raw.lotPolicy==="REQUIRED"||raw.lotRequired===true||raw.chemical===true)});
  if(!productMissing)await c.env.DB.prepare(`UPDATE accounting_document_issues SET is_resolved=1,resolved_at=? WHERE main_company_slug=? AND document_id=? AND issue_code='PRODUCT_UNMATCHED' AND is_resolved=0`).bind(now(),slug,documentId).run();
  const lotMissing=lines.some((line)=>{const raw=json(line.raw_metadata);const required=raw.lotPolicy==="REQUIRED"||raw.lotRequired===true;return required&&!text(raw.lotNo)});
  if(!lotMissing)await c.env.DB.prepare(`UPDATE accounting_document_issues SET is_resolved=1,resolved_at=? WHERE main_company_slug=? AND document_id=? AND issue_code='LOT_REQUIRED' AND is_resolved=0`).bind(now(),slug,documentId).run();
}

export function registerEBelgeLineToolRoutes(app:Hono<AppEnv>){
  registerEBelgeLotToolRoutes(app);

  app.get("/api/e-belge/products",async c=>{
    const slug=slugOf(c),q=text(c.req.query("q"));
    if(q.length<1)return c.json({ok:true,data:[]});
    return c.json({ok:true,data:await listEBelgeProducts(c,slug,q)});
  });

  app.patch("/api/e-belge/documents/:id/lines/:lineId",async c=>{
    const slug=slugOf(c),documentId=c.req.param("id"),lineId=c.req.param("lineId"),body=await c.req.json<Row>().catch(()=>({}));
    const [line,doc]=await Promise.all([c.env.DB.prepare(`SELECT * FROM accounting_document_lines WHERE id=? AND document_id=? AND main_company_slug=? LIMIT 1`).bind(lineId,documentId,slug).first<Row>(),c.env.DB.prepare(`SELECT party_company_id FROM accounting_documents WHERE id=? AND main_company_slug=? LIMIT 1`).bind(documentId,slug).first<Row>()]);
    if(!line)return c.json({ok:false,error:{code:"LINE_NOT_FOUND",message:"Belge kalemi bulunamadı."}},404);
    let product:Row|null=null;
    if(text(body.productId)){
      product=await getEBelgeProduct(c,slug,text(body.productId));
      if(!product)return c.json({ok:false,error:{code:"PRODUCT_NOT_FOUND",message:"Ürün kartı bulunamadı."}},404);
    }
    const raw={...json(line.raw_metadata)};
    if(product){
      const supplierProfile=await getEBelgeSupplierProfile(c,slug,text(doc?.party_company_id));
      const routing=eBelgeProductRouting(product,line,supplierProfile);
      const lotPolicy=resolveProductLotPolicy(product,routing.routing);
      raw.routingType=routing.routing;
      raw.chemical=routing.chemical;
      raw.lotPolicy=lotPolicy;
      raw.lotRequired=lotPolicy==="REQUIRED";
      const expense=routing.routing==="EXPENSE"?await resolveEBelgeExpenseCategory(c,slug,{companyId:text(doc?.party_company_id),productId:text(product.id),description:text(line.description),fallbackId:routing.expenseCategoryId,fallbackName:routing.expenseCategoryName}):null;
      raw.expenseCategoryId=expense?.categoryId||routing.expenseCategoryId||null;
      raw.expenseCategoryName=expense?.categoryName||routing.expenseCategoryName||null;
      raw.expenseCategorySource=expense?.source||null;
      raw.expenseRuleId=expense?.ruleId||null;
      raw.warehouse=routing.warehouse||null;
      raw.productMatchSource="MANUAL";
      raw.productName=text(product.name||product.productName);
    }
    if(body.lotNo!==undefined)raw.lotNo=text(body.lotNo);
    if(body.warehouse!==undefined)raw.warehouse=text(body.warehouse);
    if(body.productionDate!==undefined)raw.productionDate=text(body.productionDate);
    if(body.expiryDate!==undefined)raw.expiryDate=text(body.expiryDate);
    if(body.unitCode!==undefined)raw.correctedUnitCode=text(body.unitCode);
    if(body.expenseCategoryName!==undefined&&text(raw.routingType||"EXPENSE").toUpperCase()==="EXPENSE"){
      raw.expenseCategoryName=text(body.expenseCategoryName)||"Mal ve Hizmet Alımı";
      raw.expenseCategoryId=text(body.expenseCategoryId)||raw.expenseCategoryId||null;
      raw.expenseCategorySource="USER";
      if(body.rememberExpenseRule===true){
        const savedRule=await saveEBelgeExpenseRule(c,slug,{companyId:text(doc?.party_company_id),productId:text(product?.id||line.product_id),description:text(line.description),categoryId:text(raw.expenseCategoryId),categoryName:text(raw.expenseCategoryName),source:"E_BELGE_REVIEW"});
        raw.expenseRuleId=savedRule.id||raw.expenseRuleId||null;
        raw.expenseCategorySource="EXPENSE_RULE";
      }
    }
    await c.env.DB.prepare(`UPDATE accounting_document_lines SET product_id=COALESCE(?,product_id),unit_code=CASE WHEN ?<>'' THEN ? ELSE unit_code END,match_status=CASE WHEN COALESCE(?,product_id) IS NOT NULL THEN 'MANUAL' ELSE match_status END,match_confidence=CASE WHEN COALESCE(?,product_id) IS NOT NULL THEN 1 ELSE match_confidence END,raw_metadata=?,updated_at=? WHERE id=? AND document_id=? AND main_company_slug=?`).bind(product?.id||null,text(body.unitCode),text(body.unitCode),product?.id||null,product?.id||null,JSON.stringify(raw),now(),lineId,documentId,slug).run();
    await resolveIfClean(c,slug,documentId);
    return c.json({ok:true,data:{lineId,productId:product?.id||line.product_id||null,lotNo:raw.lotNo||"",lotPolicy:raw.lotPolicy||null,routingType:raw.routingType||"",expenseCategoryId:raw.expenseCategoryId||null,expenseCategoryName:raw.expenseCategoryName||null,expenseCategorySource:raw.expenseCategorySource||null,expenseRuleId:raw.expenseRuleId||null}});
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
