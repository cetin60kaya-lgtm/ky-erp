// Canonical outgoing draft calculations. No tax exemption or GIB acceptance inferred.
export type DraftKind = "INVOICE" | "DISPATCH";
const clean = (v:unknown,max=500) => typeof v==="string" ? v.trim().slice(0,max) : "";
const digits = (v:unknown,scale:number,maxWhole:number):bigint => {
  const s=String(v??"").trim().replace(",",".");
  if(!new RegExp("^\\d{1,"+maxWhole+"}(?:\\.\\d{1,"+scale+"})?$").test(s)) throw new Error("Geçersiz veya fazla hassas sayısal alan.");
  const [whole,fraction=""]=s.split(".");
  return BigInt(whole+fraction.padEnd(scale,"0"));
};
const round=(n:bigint,d:bigint)=>(n+d/2n)/d;
const decimal=(n:bigint,scale:number)=>{const s=n.toString().padStart(scale+1,"0");return s.slice(0,-scale)+"."+s.slice(-scale)};
const date=(v:unknown)=>{const s=clean(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+"T00:00:00Z"))||new Date(s+"T00:00:00Z").toISOString().slice(0,10)!==s)throw new Error("Geçerli belge tarihi gerekir.");return s;};
export function normalizeDraft(value:unknown,kind:DraftKind) {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Taslak verisi gerekli.");
  const x=value as Record<string,any>;
  const issueDate=date(x.issueDate),partyId=clean(x.partyId,100),currency=clean(x.currency,3).toUpperCase()||"TRY";
  if(!partyId)throw new Error("Kayıtlı cari seçin.");
  if(!["TRY","USD","EUR","GBP"].includes(currency))throw new Error("Desteklenmeyen para birimi.");
  const invoice=kind==="INVOICE";
  const scenario=clean(x.scenario,30);
  if(!(invoice?["TEMELFATURA","TICARIFATURA","EARSIVFATURA"]:["TEMELIRSALIYE"]).includes(scenario))throw new Error("Belge senaryosu geçersiz.");
  if(!Array.isArray(x.lines)||!x.lines.length||x.lines.length>200)throw new Error("1–200 belge kalemi gerekir.");
  let net=0n,vat=0n;
  const lines=x.lines.map((raw:Record<string,unknown>,i:number)=>{
    if(!raw||typeof raw!=="object")throw new Error("Geçersiz kalem.");
    const description=clean(raw.description,500),unit=clean(raw.unit,20);
    if(!description||!unit)throw new Error((i+1)+". kalemin adı ve birimi gerekli.");
    const quantity=digits(raw.quantity,3,7);
    if(quantity<=0n)throw new Error("Adet sıfırdan büyük olmalı.");
    const freeKind=clean(raw.freeKind,30);
    if(freeKind&&!["SAMPLE","FABRIC_DEFECT","PRINT_DEFECT"].includes(freeKind))throw new Error("Bedelsiz kalem tipi geçersiz.");
    const price=invoice?digits(raw.price,4,7):0n;
    const rate=invoice?digits(raw.vatRate,2,3):0n;
    const discount=invoice?digits(raw.discountRate??"0",2,3):0n;
    if(rate>10000n||discount>10000n)throw new Error("Yüzde 0–100 aralığında olmalı.");
    if(freeKind&&price!==0n)throw new Error("Bedelsiz kalemde fiyat sıfır olmalı.");
    const gross=round(quantity*price,100000n);
    const lineNet=gross-round(gross*discount,10000n);
    const lineVat=round(lineNet*rate,10000n);
    net+=lineNet;vat+=lineVat;
    const catalogId=clean(raw.catalogId,150);
    if(catalogId&&!/^(MODEL|PRODUCT|HISTORY):.+$/.test(catalogId))throw Error("Geçersiz katalog kimliği.");
    return {catalogId,description,unit,quantity:decimal(quantity,3),price:decimal(price,4),vatRate:decimal(rate,2),discountRate:decimal(discount,2),freeKind,note:clean(raw.note,500),net:decimal(lineNet,2),vat:decimal(lineVat,2)};
  });
  const deliveryAddress=clean(x.deliveryAddress,500),driver=clean(x.driver,160),plate=clean(x.plate,32),carrier=clean(x.carrier,160),dispatchDate=invoice?"":date(x.dispatchDate),dispatchTime=invoice?"":clean(x.dispatchTime,5);
  if(!invoice&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(dispatchTime)||!deliveryAddress))throw new Error("Sevk saati ve teslim adresi gerekli.");
  const warnings:string[]=[];
  if(invoice&&lines.some((l:typeof lines[number])=>l.freeKind))warnings.push("Bedelsiz kalemlerin vergi/istisna kabulü ayrı doğrulanmalıdır.");
  if(invoice&&lines.some((l:typeof lines[number])=>l.vatRate==="0.00"&&!l.freeKind))warnings.push("Sıfır KDV için yasal dayanak doğrulanmalıdır.");
  if(!invoice&&(!driver||!plate))warnings.push("Sürücü/plaka veya uygun taşıma istisnası doğrulanmalıdır.");
  if(invoice&&currency!=="TRY")warnings.push("Döviz kuru ve yasal dönüşüm kontrolü tamamlanmalıdır.");
  return {issueDate,partyId,currency,scenario,note:clean(x.note,2000),lines,deliveryAddress,driver,plate,carrier,dispatchDate,dispatchTime,net:decimal(net,2),vat:decimal(vat,2),total:decimal(net+vat,2),warnings};
}
