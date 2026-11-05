/** Interprets OCR text from placement PDF labels. Advisory only; NEVER automatically
 * writes D1 measurements or derives garment sizes as print dimensions.
 * This intentionally ignores placement offsets, sewing allowance and PDF page sizes.
 */
export type PlacementObservation = {
  artworkPart: string;
  widthCm: number;
  heightCm: number;
  garmentSizes: string[];
  allGarmentSizes: boolean;
  source: "OCR_UNVERIFIED";
};
const normalize = (value: string) => value.toUpperCase()
  .replace(/İ/g,"I").replace(/İ/g,"I").replace(/Ş/g,"S").replace(/Ğ/g,"G")
  .replace(/Ü/g,"U").replace(/Ö/g,"O").replace(/Ç/g,"C");
const number = (value:string) => Number(value.replace(",","."));
const BAD=/\b(CEKME|DIKIS|PAYI|KALIP|YAKA|OMUZ|PACADAN|MESAFE|KAGIT)\b/;
const PRINT=/\b(DESEN|BASKI|TIMSAH|KUYRUK|MOTIF|LOGO|RESIM)\b/;
const G=/\b(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/g;
const DIM=/\b([A-Z]{3,20})\s+(ENI?|BOYU?)\s*[:=]?\s*(\d{1,4}(?:[.,]\d{1,3})?)\s*CM\b/g;
function productGroup(line:string) {
  if (/\b(TUM|BUTUN)\s+BEDENLER(?:DE|INDE|I)?\b/.test(line))return {all:true,garments:[] as string[]};
  if (!/\b(AY|YAS|BEDEN)\b/.test(line) || !/\b(ICIN|BEDENLER|GRUBU)\b/.test(line)) return null;
  const unit=/\bYAS\b/.test(line)?"yaş":/\bAY\b/.test(line)?"ay":"";
  const garments:string[]=[];
  for(const found of line.matchAll(G)) {
    const value=found[1]+"-"+found[2]+(unit?" "+unit:"");
    if (!garments.includes(value))garments.push(value);
  }
  if(garments.length)return {all:false,garments};
  return null;
}
export function interpretPlacementText(text:unknown):PlacementObservation[] {
  const raw=String(text||"").slice(0,30_000);
  const lines=raw.split(/[\r\n]+/).map(value=>normalize(value).replace(/[*_]/g," ").replace(/\s+/g," ").trim()).filter(Boolean);
  let all=false,garments:string[]=[];
  let pieces=new Map<string,{widthCm?:number;heightCm?:number}>();
  const results:PlacementObservation[]=[];
  const flush=()=>{
    for(const [artworkPart,dim] of pieces) if(dim.widthCm&&dim.heightCm) {
      const exact={artworkPart:artworkPart==="DESEN"||artworkPart==="BASKI"?"Ana desen":artworkPart,
        widthCm:dim.widthCm,heightCm:dim.heightCm,
        garmentSizes:[...garments],allGarmentSizes:all,source:"OCR_UNVERIFIED" as const};
      if(!results.some(row=>row.artworkPart===exact.artworkPart&&row.widthCm===exact.widthCm&&
        row.heightCm===exact.heightCm&&row.allGarmentSizes===all&&row.garmentSizes.join("|")===garments.join("|"))) results.push(exact);
    }
    pieces=new Map();
  };
  for(let index=0;index<lines.length;index++){
    const line=lines[index];
    const group=productGroup(line);
    if(group){flush();all=group.all;garments=group.garments;continue;}
    if(BAD.test(line))continue;
    // Both directions may occur on one OCR line; do not treat "3-6 AY" as a measurement.
    for(const found of line.matchAll(DIM)) {
      const kind=found[1];
      if(BAD.test(kind)||!PRINT.test(kind))continue;
      const cm=number(found[3]);
      if(!Number.isFinite(cm)||cm<=0||cm>2000)continue;
      const part=kind==="DESEN"||kind==="BASKI"?"DESEN":kind;
      const item=pieces.get(part)||{};
      if(found[2].startsWith("EN"))item.widthCm=cm;
      else item.heightCm=cm;
      pieces.set(part,item);
    }
  }
  flush();
  return results;
}
