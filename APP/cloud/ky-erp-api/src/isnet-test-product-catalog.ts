// Registered synthetic products only. Never copy production product records into TEST drafts.
export const testProductCatalog=[
 {id:"TEST_EMPRIME",description:"TEST Emprime baskı",unit:"ADET",freeKind:""},
 {id:"TEST_NUMUNE",description:"Test numunesi",unit:"ADET",freeKind:"TEST_NUMUNESI"},
 {id:"TEST_KUMAS",description:"Kumaş sakatı",unit:"ADET",freeKind:"KUMAS_SAKATI"},
 {id:"TEST_BASKI",description:"Baskı sakatı",unit:"ADET",freeKind:"BASKI_SAKATI"},
] as const;
type Row=Record<string,any>;
export function resolveTestProductAction(state:Row,a:Row){
 if(!["SAVE_DISPATCH","SAVE_INVOICE"].includes(a.kind))return a;
 const old=state.drafts.find((d:Row)=>d.id===a.id);
 // Source documents and linked dispatch lines keep their own identity.
 if(old?.providerSource||old?.dispatchId||(!old&&(a.sourceRef||a.dispatchId))||(old?.source||a.source)==="DEMO_INCOMING")return a;
 const raw=a.lines;
 if(!Array.isArray(raw)||!raw.length||raw.length>50)throw Error("Kayıtlı TEST ürün kalemini seçin.");
 const previous=old?.lines?.length?old.lines:old?[old]:[];
 return {...a,lines:raw.map((l:Row)=>{
  const p=testProductCatalog.find(p=>p.id===l.productId);
  if(p)return {...l,productId:p.id,description:p.description,unit:p.unit,freeKind:p.freeKind};
  // Preserve an existing legacy description; do not allow new free-text items.
  const legacy=previous.find((v:Row)=>!v.productId&&v.description===l.description&&v.unit===l.unit&&(v.freeKind||"")===(l.freeKind||""));
  if(old&&!l.productId&&legacy)return l;
  throw Error("Kayıtlı TEST ürün kalemini seçin. Serbest ürün adı kullanılamaz.");
 })};
}
