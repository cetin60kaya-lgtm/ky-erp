/**
 * Deterministic e-Belge product selection. Similar names are NEVER sufficient.
 * A package (30 kg / 60 kg) belongs to the document line; it is not a second
 * physical stock receipt and it must not silently replace the base product unit.
 */
type Item = Record<string, any>;
const txt = (value: unknown) => value == null ? "" : String(value).trim();
export const exactProductKey = (value: unknown) => txt(value)
  .toLocaleUpperCase("tr-TR").replace(/İ/g,"I").replace(/ı/g,"I")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ").trim();

const positive = (value: unknown): number => {
  const n = Number(txt(value).replace(",","."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function exactPackageKg(input: unknown): number {
  const text = txt(input);
  // Unambiguous package-size indicators only. The invoice line quantity is separate.
  const match = text.match(/(?:^|[^0-9])(?:NET\s*(?:AGIRLIK|AĞIRLIK|KG)\s*[:=]?\s*)?(\d+(?:[.,]\d+)?)\s*(?:KG|KILOGRAM|KİLOGRAM|KILO|KİLO)(?![A-Z])/i);
  return match ? positive(match[1]) : 0;
}

function packageOf(p: Item): number {
  const raw=p.raw && typeof p.raw==="object" ? p.raw : {};
  return positive(p.packageWeightKg||p.package_weight_kg||raw.packageWeightKg||
    raw.package_weight_kg||raw.packageKg||raw.packaging?.weightKg) ||
    exactPackageKg(p.name||p.productName);
}
function samePack(a: number,b: number) {
  return Math.abs(a-b) < 0.00001;
}
export type ExactProductChoice = {
  product: Item|null;
  source: "EXACT_CODE"|"EXACT_NAME"|"PACKAGING_REVIEW"|"AMBIGUOUS"|"PACKAGE_CONFLICT"|"NONE";
  reason: string;
  packageWeightKg: number;
};
export function chooseExactEBelgeProduct(products:Item[],line:Item):ExactProductChoice {
  const invoicePack=positive(line.packageWeightKg)||exactPackageKg(line.description);
  const customerCode=exactProductKey(line.productCode);
  const supplierCode=exactProductKey(line.supplierProductCode);
  const keys=[...new Set([customerCode,supplierCode].filter(Boolean))];
  const name=exactProductKey(line.description);
  const seen=new Map<string,Item>();
  for(const candidate of products){
    const id=txt(candidate.id);
    if(id&&!seen.has(id))seen.set(id,candidate);
  }
  const list=[...seen.values()];
  const byCode = (key:string)=>list.filter(p=>
    [p.code,p.legacy_id,p.productCode].some(v=>exactProductKey(v)===key));
  const codeGroups=keys.map(byCode).filter(arr=>arr.length);
  let found:Item[]=[];
  let source:ExactProductChoice["source"]="NONE";
  if(codeGroups.length){
    source="EXACT_CODE";
    // If buyer and seller codes point to different canonical products, require review.
    const union=new Map<string,Item>();
    for(const group of codeGroups)for(const p of group)union.set(txt(p.id),p);
    if(codeGroups.length>1 && codeGroups.every(g=>g.length===1)
      && txt(codeGroups[0][0].id)!==txt(codeGroups[1][0].id)) {
      return {product:null,source:"AMBIGUOUS",reason:"Fatura alıcı/satıcı ürün kodları farklı kartlara işaret ediyor.",packageWeightKg:invoicePack};
    }
    found=[...union.values()];
  }else if(name){
    source="EXACT_NAME";
    found=list.filter(p=>exactProductKey(p.name||p.productName)===name);
  }
  if(!found.length)return{product:null,source:"NONE",reason:"Kesin ürün kodu veya tam ürün adı eşleşmedi.",packageWeightKg:invoicePack};
  const withPack=found.filter(p=>packageOf(p)>0);
  if(invoicePack && withPack.length){
    found=found.filter(p=>samePack(packageOf(p),invoicePack));
    if(!found.length)return{product:null,source:"PACKAGE_CONFLICT",reason:"Ürün kodu/adı eşleşiyor ancak ambalaj kilogramı farklı; 30 kg ile 60 kg karıştırılamaz.",packageWeightKg:invoicePack};
  }
  if(found.length!==1)return{product:null,source:"AMBIGUOUS",reason:"Aynı kesin ürün kimliğinde birden fazla kart var; manuel seçim gerekiyor.",packageWeightKg:invoicePack};
  const product=found[0],catalogPack=packageOf(product);
  if((invoicePack&&!catalogPack)||(!invoicePack&&catalogPack))
    return{product,source:"PACKAGING_REVIEW",reason:"Ürün kesin eşleşti ancak katalogdaki ambalaj bilgisi eksik; stok birimi ve kilogram dönüşümü kontrol edilmeli.",packageWeightKg:invoicePack};
  return {product,source,reason:"",packageWeightKg:invoicePack};
}
