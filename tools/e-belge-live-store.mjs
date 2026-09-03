import fs from "node:fs";

function rewrite(path, edit) {
  const before = fs.readFileSync(path, "utf8");
  const after = edit(before);
  if (after === before) throw new Error(`${path}: beklenen değişiklik uygulanmadı`);
  fs.writeFileSync(path, after);
}

rewrite("APP/cloud/ky-erp-api/src/e-belge-center-cloud.ts", (source) => {
  source = source.replace(
    'import { reconcileEBelgeInvoice } from "./e-belge-match-engine";',
    'import { reconcileEBelgeInvoice } from "./e-belge-match-engine";\nimport { eBelgeProductRouting, getEBelgeProduct, matchEBelgeProduct, recordEBelgeChemicalReceipt } from "./e-belge-product-store";',
  );
  source = source.replace(
    'return{text(doc.id),duplicate:true,attached:asset.ext}',
    'return{documentId:text(doc.id),duplicate:true,attached:asset.ext}',
  );
  source = source.replace(
    /async function productMatch\([^\n]+\nfunction productRouting\([^\n]+\n/,
    'async function productMatch(c:Context<AppEnv>,slug:string,line:Row,companyId=""){return matchEBelgeProduct(c,slug,line,companyId)}\nfunction productRouting(product:Row|null,line:Row){return eBelgeProductRouting(product,line)}\n',
  );
  source = source.replace('pm=await productMatch(c,slug,l),routing=productRouting(pm.product,l)', 'pm=await productMatch(c,slug,l,match.companyId),routing=productRouting(pm.product,l)');
  source = source.replace(
    /async function routeStockAndLots\([^\n]+\n\nfunction poolFilter/,
    `async function routeStockAndLots(c:Context<AppEnv>,slug:string,doc:Row,lines:Row[]){
  if(upper(doc.direction)!=="INCOMING"||!isInvoice(doc.document_type))return{stockMovements:0,lots:0};
  let stockMovements=0,lots=0;
  for(const l of lines){
    if(!text(l.product_id))continue;
    const raw=safeJson(l.raw_metadata),routing=upper(raw.routingType);
    if(!["STOCK","BOYAHANE"].includes(routing))continue;
    if(routing==="STOCK"&&await tableExists(c,"stock_movements")){
      const existing=await c.env.DB.prepare(\`SELECT id FROM stock_movements WHERE main_company_slug=? AND document_line_id=? AND movement_type='PURCHASE_IN' LIMIT 1\`).bind(slug,l.id).first<Row>();
      if(!existing){
        await insertDynamic(c,"stock_movements",{id:crypto.randomUUID(),main_company_slug:slug,product_id:l.product_id,firm_id:doc.party_company_id,document_id:doc.id,document_line_id:l.id,movement_type:"PURCHASE_IN",source_type:"CANONICAL_DOCUMENT",date:doc.issue_date||now(),quantity:numberValue(l.quantity),unit:l.unit_code,unit_price:numberValue(l.unit_price),total_amount:numberValue(l.line_total),lot_no:text(raw.lotNo)||null,note:\`${'${text(doc.document_no)||"Fatura"}'} stok girişi\`,active:1,raw:{eBelge:true,routingType:routing},created_at:now(),updated_at:now()});
        stockMovements++;
      }
    }
    if(routing==="BOYAHANE"){
      if(!text(raw.lotNo))throw Object.assign(new Error(\`${'${text(l.description)||"Kimyasal ürün"}'} için LOT zorunludur.\`),{code:"LOT_REQUIRED"});
      const product=await getEBelgeProduct(c,slug,text(l.product_id));
      if(!product)throw Object.assign(new Error(\`${'${text(l.description)||"Ürün"}'} ürün kartı bulunamadı.\`),{code:"PRODUCT_NOT_FOUND"});
      const receipt=await recordEBelgeChemicalReceipt(c,slug,{document:doc,line:l,product,lotNo:text(raw.lotNo)});
      if(receipt.movementCreated)stockMovements++;
      if(receipt.created)lots++;
    }
  }
  return{stockMovements,lots};
}

function poolFilter`,
  );
  return source;
});

rewrite("APP/app/ky-erp-frontend/src/services/eBelgeApi.js", (source) =>
  source.replace(
    'export const saveEBelgeProductAlias = (productId, alias) =>\n  apiPost(`/e-belge/products/${encodeURIComponent(productId)}/aliases`, { alias }).then(unwrap);',
    'export const saveEBelgeProductAlias = (productId, alias, documentId = "") =>\n  apiPost(`/e-belge/products/${encodeURIComponent(productId)}/aliases`, { alias, documentId }).then(unwrap);',
  )
);

rewrite("APP/app/ky-erp-frontend/src/pages/modules/muhasebe/EBelgeLineReview.jsx", (source) =>
  source.replace('await saveEBelgeProductAlias(selected.id, line.description.trim());', 'await saveEBelgeProductAlias(selected.id, line.description.trim(), documentId);')
);

console.log("e-Belge canlı ürün/alias/LOT uyumluluğu uygulandı.");
