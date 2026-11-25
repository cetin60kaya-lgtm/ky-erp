// @ts-nocheck
import type { Context, Hono } from "hono";
import { storeSnapshot, storeGuard, storeUpdate, storeInsert, stableStoreId, commitStoreBatch, type StoreSnapshot } from "./atomic-json-store.ts";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const LOT_SCOPE = "BOYAHANE_LOT";
const MOVEMENT_SCOPE = "BOYAHANE_STOCK_MOVEMENT";
const text = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const now = () => new Date().toISOString();
const json = (value: unknown): Row => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  try {
    const parsed = JSON.parse(text(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
const slugOf = (c: Context<AppEnv>, body: Row = {}) => text(
  body.mainCompanySlug || body.main_company_slug || body.mainCompanyId ||
  c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") ||
  c.req.header("X-KYERP-Tenant-Slug"),
);

export type BoyahaneLotMovementReason =
  | "PRODUCTION"
  | "SAMPLE"
  | "FIRE"
  | "RETURN"
  | "OUT"
  | "IN"
  | "ADJUSTMENT_OUT"
  | "ADJUSTMENT_IN"
  | "CORRECTION_OUT"
  | "CORRECTION_IN";

export function normalizeBoyahaneMovementReason(value: unknown): BoyahaneLotMovementReason | null {
  const raw = upper(value).replace(/\s+/g, "_");
  const aliases: Record<string, BoyahaneLotMovementReason> = {
    PRODUCTION: "PRODUCTION", URETIM: "PRODUCTION", "ÜRETİM": "PRODUCTION",
    SAMPLE: "SAMPLE", NUMUNE: "SAMPLE", TEST: "SAMPLE",
    FIRE: "FIRE", "FİRE": "FIRE", WASTE: "FIRE", HURDA: "FIRE",
    RETURN: "RETURN", IADE: "RETURN", "İADE": "RETURN",
    OUT: "OUT", CIKIS: "OUT", "ÇIKIŞ": "OUT",
    IN: "IN", GIRIS: "IN", "GİRİŞ": "IN",
    ADJUSTMENT_OUT: "ADJUSTMENT_OUT", SAYIM_EKSIGI: "ADJUSTMENT_OUT", "SAYIM_EKSİĞİ": "ADJUSTMENT_OUT",
    ADJUSTMENT_IN: "ADJUSTMENT_IN", SAYIM_FAZLASI: "ADJUSTMENT_IN",
    CORRECTION_OUT: "CORRECTION_OUT", DUZELTME_CIKIS: "CORRECTION_OUT", "DÜZELTME_ÇIKIŞ": "CORRECTION_OUT",
    CORRECTION_IN: "CORRECTION_IN", DUZELTME_GIRIS: "CORRECTION_IN", "DÜZELTME_GİRİŞ": "CORRECTION_IN",
  };
  return aliases[raw] || null;
}

export function movementDirection(reason: BoyahaneLotMovementReason) {
  return ["IN", "ADJUSTMENT_IN", "CORRECTION_IN"].includes(reason) ? "IN" : "OUT";
}

function lotUnitCost(lot: Row) {
  const explicit = num(lot.unitCost || lot.unitPrice);
  if (explicit > 0) return explicit;
  const docs = Array.isArray(lot.financialDocuments) ? lot.financialDocuments : [];
  const quantity = docs.reduce((sum: number, row: Row) => sum + Math.max(0, num(row.quantity)), 0);
  const total = docs.reduce((sum: number, row: Row) => sum + num(row.totalAmount), 0);
  return quantity > 0 ? total / quantity : 0;
}

function balances(lot: Row) {
  const entry = num(lot.entryKg || lot.quantity);
  return { entry, remaining: num(lot.remainingKg ?? lot.remainingQuantity ?? entry) };
}
function movementError(code:string,message:string){return Object.assign(new Error(message),{code});}
async function applyMovement(c:Context<AppEnv>,slug:string,snapshot:StoreSnapshot,body:Row,reason:BoyahaneLotMovementReason,original:StoreSnapshot|null=null){
  const db=c.env.DB,lot=snapshot.value,quantity=num(body.quantity),direction=movementDirection(reason);
  if(quantity<=0)throw movementError("INVALID_QUANTITY","Hareket miktarı sıfırdan büyük olmalıdır.");
  const lotId=snapshot.fileName;
  const movementId=original?await stableStoreId("BYR:",[slug,original.fileName]):
    text(body.requestId || body.id)?await stableStoreId("BYM2:",[slug,text(body.requestId || body.id)]):crypto.randomUUID();
  const payloadHash=await stableStoreId("",[lotId,reason,quantity,text(body.recipeId),text(body.productionId),text(body.modelId),text(body.source),text(body.note),original?.fileName || ""]);
  const replay=()=>storeSnapshot(db,MOVEMENT_SCOPE,slug,movementId);
  const previous=await replay();
  if(previous){
    if(previous.value.payloadHash!==payloadHash)throw movementError("MOVEMENT_REQUEST_CONFLICT","İşlem kimliği farklı hareketle kullanıldı.");
    return {movement:previous.value,lot:(await storeSnapshot(db,LOT_SCOPE,slug,lotId))?.value || lot,idempotent:true};
  }
  const current=balances(lot),at=now();
  const rfProduct=direction==="OUT" && !original && upper(lot.source)==="RF_PREPARED"?await storeSnapshot(db,"BOYAHANE_APPROVED_PRODUCT",slug,text(lot.productId || lot.inventoryId)):null;
  if(direction==="OUT" && !original && upper(lot.source)==="RF_PREPARED" && (rfProduct?.value.approvalStatus!=="APPROVED" || rfProduct.value.isActive===false))throw movementError("RF_APPROVAL_REQUIRED","RF ürün onayı tamamlanmamış.");
  if(direction==="OUT" && quantity>current.remaining+1e-9)throw movementError("INSUFFICIENT_STOCK","LOT bakiyesi hareket miktarından düşük.");
  if(direction==="OUT" && !original && !["AVAILABLE","ACTIVE"].includes(upper(lot.status)))throw movementError("LOT_NOT_AVAILABLE","LOT kullanıma açık değil.");
  const nextEntry=direction==="IN"?current.entry+quantity:current.entry;
  // A reversal of an inbound receipt reduces both entry and remaining; a
  // reversal of an outbound movement restores remaining, not a new receipt.
  const entry=original?(upper(original.value.type)==="IN"?current.entry-quantity:current.entry):nextEntry;
  const remaining=Math.max(0,current.remaining+(direction==="IN"?quantity:-quantity));
  if(entry<0||remaining>entry+1e-9)throw movementError("LOT_BALANCE_REVIEW","LOT toplamı ve kalan miktarı uzlaştırma gerektiriyor.");
  const unitCost=original?num(original.value.unitCostAtMovement ?? lotUnitCost(lot)):lotUnitCost(lot);
  const priorStatus=upper(lot.status);
  const nextLot={...lot,entryKg:entry,quantity:entry,remainingKg:remaining,remainingQuantity:remaining,usedKg:Math.max(0,entry-remaining),status:remaining<=0?"DEPLETED":["QUARANTINE","INACTIVE"].includes(priorStatus)?priorStatus:"AVAILABLE",lastMovementAt:at,updatedAt:at};
  const movement={id:movementId,payloadHash,lotId,productId:text(lot.productId || lot.inventoryId),productName:text(lot.productName),lotNo:text(lot.lotNo),type:direction,movementType:reason,reason,quantity,quantityKg:quantity,unit:text(lot.unit || "KG"),remainingKg:remaining,unitCostAtMovement:unitCost,costAmount:quantity*unitCost,source:original?"REVERSAL":text(body.source || "MANUAL"),modelId:text(body.modelId)||null,modelName:text(body.modelName)||null,recipeId:text(body.recipeId)||null,productionId:text(body.productionId)||null,actor:"KY ERP",note:text(body.note || body.description || reason+" LOT hareketi"),originalMovementId:original?.fileName || null,reversalOf:original?.fileName || null,createdAt:at,updatedAt:at};
  const guards=[storeGuard(db,snapshot),...(rfProduct?[storeGuard(db,rfProduct)]:[])],writes=[storeUpdate(db,snapshot,nextLot,at),storeInsert(db,MOVEMENT_SCOPE,slug,movementId,movement,at)];
  if(original){guards.push(storeGuard(db,original));writes.push(storeUpdate(db,original,{...original.value,reversedAt:at,reversedByMovementId:movementId,reversalReason:text(body.note || "Ters hareket")},at));}
  try{await commitStoreBatch(db,guards,writes);}catch{
    const winner=await replay();
    if(winner?.value.payloadHash===payloadHash)return{movement:winner.value,lot:(await storeSnapshot(db,LOT_SCOPE,slug,lotId))?.value || lot,idempotent:true};
    throw movementError("LOT_MOVEMENT_CONFLICT","LOT veya hareket değişti; işlem birlikte geri alındı. Yenileyin.");
  }
  return {movement,lot:nextLot,idempotent:false};
}
export function registerBoyahaneLotMovementV2Routes(app:Hono<AppEnv>){
  app.post("/api/boyahane/workflow/lots/:id/movements-v2",async(c)=>{
    const body=await c.req.json<Row>().catch(()=>({})),slug=slugOf(c,body);
    const reason=normalizeBoyahaneMovementReason(body.reason || body.movementType || body.type);
    if(!reason)return c.json({ok:false,error:{code:"INVALID_MOVEMENT",message:"Hareket türü tanınmadı."}},400);
    const lot=await storeSnapshot(c.env.DB,LOT_SCOPE,slug,c.req.param("id"));
    if(!lot)return c.json({ok:false,error:{code:"NOT_FOUND",message:"Firma kapsamındaki LOT bulunamadı."}},404);
    try{const result=await applyMovement(c,slug,lot,body,reason);return c.json({ok:true,success:true,data:result.lot,movement:result.movement,idempotent:result.idempotent},result.idempotent?200:201);}
    catch(error:any){return c.json({ok:false,error:{code:text(error?.code)||"MOVEMENT_FAILED",message:text(error?.message)||"LOT hareketi kaydedilemedi."}},409);}
  });
  app.post("/api/boyahane/workflow/lots/:id/movements-v2/:movementId/reverse",async(c)=>{
    const body=await c.req.json<Row>().catch(()=>({})),slug=slugOf(c,body);
    const [lot,original]=await Promise.all([storeSnapshot(c.env.DB,LOT_SCOPE,slug,c.req.param("id")),storeSnapshot(c.env.DB,MOVEMENT_SCOPE,slug,c.req.param("movementId"))]);
    if(!lot || !original || text(original.value.lotId)!==lot.fileName)return c.json({ok:false,error:{code:"MOVEMENT_NOT_FOUND",message:"LOT veya hareket bulunamadı."}},404);
    if(original.value.reversedByMovementId)return c.json({ok:true,success:true,data:lot.value,idempotent:true,reversedByMovementId:original.value.reversedByMovementId});
    if(original.value.productionId || original.value.documentId || original.value.physicalDocumentId || original.value.reversalOf || original.value.originalMovementId)return c.json({ok:false,error:{code:"LINKED_MOVEMENT_REVIEW",message:"Bağlı üretim/belge veya ters hareket tek başına iptal edilemez; bütün kayıt zinciri uzlaştırılmalı."}},409);
    const reason=upper(original.value.type)==="IN"?"CORRECTION_OUT":"CORRECTION_IN";
    try{const result=await applyMovement(c,slug,lot,{...body,quantity:num(original.value.quantity || original.value.quantityKg)},reason,original);return c.json({ok:true,success:true,data:result.lot,movement:result.movement,reversedMovementId:original.fileName,idempotent:result.idempotent},result.idempotent?200:201);}
    catch(error:any){return c.json({ok:false,error:{code:text(error?.code)||"REVERSE_FAILED",message:text(error?.message)||"Ters hareket kaydedilemedi."}},409);}
  });
}
