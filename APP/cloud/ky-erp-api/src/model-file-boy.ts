/** Tek canonical PSD/BOY sözleşmesi: File Hub relation.metadata.variants korunur. */
const str=(v:unknown)=>v==null?"":String(v).normalize("NFKC").trim().replace(/[\u0000-\u001F]/g," ").replace(/\s+/g," ");
const key=(v:unknown)=>str(v).toLocaleUpperCase("tr-TR").normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").replace(/İ/g,"I").replace(/[^A-Z0-9]+/g," ").trim();
const AREAS=new Set(["FRONT","BACK","ARM","NECK","NECK_LABEL","LEFT_SLEEVE","RIGHT_SLEEVE","LEFT_LEG","RIGHT_LEG","POCKET","COLLAR","FRONT_HEM","BACK_HEM","HOOD","SIDE_PANEL","STRIP","OTHER"]);
const alias:Record<string,string>={"ON":"FRONT","ARKA":"BACK","KOL":"ARM","YAKA":"NECK","SOL KOL":"LEFT_SLEEVE","SAG KOL":"RIGHT_SLEEVE","SOL PACA":"LEFT_LEG","SAG PACA":"RIGHT_LEG","CEP":"POCKET"};
export function normalizeModelBoy(input:unknown):string{
  const label=str(input);
  if(!label)return "";
  if(label.length>80)throw new Error("BOY açıklaması 80 karakteri aşamaz.");
  const k=key(label);
  if(["KUCUK","KUCUK BOY","K BOY","KBOY"].includes(k))return "Küçük Boy";
  if(["BUYUK","BUYUK BOY","B BOY","BBOY"].includes(k))return "Büyük Boy";
  if(k==="OZEL BOY"||k==="OZEL")throw new Error("Özel BOY için ölçü veya ayırt edici açıklama zorunludur.");
  if(k.startsWith("OZEL BOY ")){
    const detail=label.replace(/^özel\s*boy\s*[:\-]?\s*/iu,"").trim();
    if(!detail||key(detail)==="OLCU")throw new Error("Özel BOY ölçüsü girilmelidir.");
    return "Özel Boy: "+detail;
  }
  // Önceden kullanılan özel BOY adları kaybolmaz; beden diye dönüştürülmez.
  return label;
}
export function normalizeModelPrintArea(input:unknown):string{
  const value=str(input);
  if(!value)return "";
  const code=key(value).replace(/ /g,"_");
  const result=alias[key(value)]||code;
  if(!AREAS.has(result))throw new Error("Bilinmeyen baskı bölgesi: kullanıcı seçiminden doğrulanmalı.");
  return result;
}
