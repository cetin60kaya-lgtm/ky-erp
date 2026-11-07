/** Print artwork variants are dimensions (cm); garment sizing is a separate applicability map.
 * Never create model names from a PSD or rename the source file.
 */
export type PlateSize = string;
export type PlateEntry = {
  modelId: string;
  sizeCode: PlateSize; // Artwork variation key, NOT garment size.
  sizeLabel: string; // Small, original, large, variation 3... as locally named.
  printArea: string;
  artworkPart: string;
  widthCm: number | null;
  heightCm: number | null;
  garmentSizes: string[]; // e.g. ["1-3 ay","3-6 ay"], ["S","M"]
  allGarmentSizes: boolean; // Same physical artwork size on every garment.
  isReferenceSize: boolean; // Original/reference dimensions can be middle/small/large.
};
export type SizeHint = {sizeCode: string; sizeLabel: string};

export function canonicalPlateText(input: unknown): string {
  return String(input ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİ]/g, "I").replace(/[çÇ]/g, "C").replace(/[ğĞ]/g, "G")
    .replace(/[öÖ]/g, "O").replace(/[şŞ]/g, "S").replace(/[üÜ]/g, "U")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Do NOT infer print-size variants from XS/S/M/XL or child ages: those are garment sizes. */
export function suggestedPlateSizes(segment: string): SizeHint[] {
  const key = " " + canonicalPlateText(segment) + " ";
  const out: SizeHint[] = [];
  const add = (sizeCode:string,sizeLabel:string) => {
    if (!out.some(entry => entry.sizeCode === sizeCode)) out.push({sizeCode,sizeLabel});
  };
  // Use *explicit* K/B boy notation only. "3 BOY" alone describes a possible
  // quantity; it never specifies three validated artwork dimensions.
  const pair = /\b(K B|K VE B|KUCUK BUYUK|BUYUK KUCUK)\s*(BOY|EBAT)?\b/.test(key);
  const small = /\b(KUCUK|K BOY|K EBAT|SMALL)\b/.test(key);
  const large = /\b(BUYUK|B BOY|B EBAT|LARGE)\b/.test(key);
  if (pair || (small && large)) {
    add("SMALL","Küçük desen");
    add("LARGE","Büyük desen");
  } else if (small) add("SMALL","Küçük desen");
  else if (large) add("LARGE","Büyük desen");
  else if (/\b(TEK BOY|TEK EBAT|ONE SIZE)\b/.test(key)) add("ONE_SIZE","Tek desen ebadı");
  return out.length ? out : [{sizeCode:"UNSPECIFIED",sizeLabel:"Desen ölçüsü doğrulanmadı"}];
}

/** Filename suggestions list only known model records. Every measurement stays unverified. */
export function suggestPlateMembership(
  originalFileName: string,
  models: readonly {modelId: string; modelName: string}[],
): ({modelId: string; printArea: string; evidence: string} & SizeHint)[] {
  const stem = String(originalFileName).replace(/\.(psd|psb|pdf|ai)$/i, "");
  const hay = " " + canonicalPlateText(stem) + " ";
  const found = models.map(model => {
    const key = canonicalPlateText(model.modelName);
    const at = key ? hay.indexOf(" " + key + " ") : -1;
    return {...model,key,at:at<0?-1:at+1};
  }).filter(row=>row.at>=0).sort((a,b)=>a.at-b.at||b.key.length-a.key.length);
  const matches: typeof found = [];
  for (const candidate of found) {
    if (matches.some(other=>candidate.at<other.at+other.key.length&&other.at<candidate.at+candidate.key.length))continue;
    matches.push(candidate);
  }
  const result: ReturnType<typeof suggestPlateMembership> = [];
  matches.forEach((model,i)=>{
    const segment=hay.slice(model.at+model.key.length,matches[i+1]?.at??hay.length);
    const area=/\b(ARKA|BACK)\b/.test(segment)?"BACK":/\b(ON|FRONT)\b/.test(segment)?"FRONT":"";
    for(const hint of suggestedPlateSizes(segment))result.push({
      modelId:model.modelId,...hint,printArea:area,evidence:"FILENAME_SUGGESTION"
    });
  });
  return result;
}

/** Locale-friendly cm input. These are physical print measurements, not PDF page sizes. */
export function cm(value:unknown):number|null {
  if(value===undefined||value===null||String(value).trim()==="")return null;
  const source=String(value).trim().replace(",",".");
  if(!/^\d{1,4}(?:\.\d{1,3})?$/.test(source))return NaN;
  const amount=Number(source);
  return Number.isFinite(amount)&&amount>0&&amount<=2000?Math.round(amount*1000)/1000:NaN;
}

export function scaleRelativeToReference(reference:Pick<PlateEntry,"widthCm"|"heightCm">,
  changed:Pick<PlateEntry,"widthCm"|"heightCm">): {widthChangePercent:number;heightChangePercent:number;uniform:boolean}|null {
  if(!reference.widthCm||!reference.heightCm||!changed.widthCm||!changed.heightCm)return null;
  const x=(changed.widthCm/reference.widthCm-1)*100;
  const y=(changed.heightCm/reference.heightCm-1)*100;
  return {widthChangePercent:Math.round(x*100)/100,heightChangePercent:Math.round(y*100)/100,uniform:Math.abs(x-y)<0.5};
}

export function validatePlateEntries(raw:unknown):
  {ok:true;entries:PlateEntry[]}|{ok:false;error:string} {
  if(!Array.isArray(raw))return {ok:false,error:"Kalıp ölçüleri dizi olmalıdır."};
  // Payload limit protects D1; artwork variant count is NOT restricted to 1, 2 or 3.
  if(JSON.stringify(raw).length>256_000)return {ok:false,error:"Kalıp kaydı çok büyük."};
  const entries:PlateEntry[]=[];
  const seen=new Set<string>();
  const references=new Set<string>();
  for(const row of raw) {
    if(!row||typeof row!=="object"||Array.isArray(row))return {ok:false,error:"Geçersiz kalıp satırı."};
    const modelId=String(row.modelId??"").trim();
    const sizeCode=String(row.sizeCode??"").trim().toUpperCase();
    const sizeLabel=String(row.sizeLabel??"").trim();
    const artworkPart=String(row.artworkPart??"").trim();
    const printArea=String(row.printArea??"").trim().toUpperCase();
    const widthCm=cm(row.widthCm);
    const heightCm=cm(row.heightCm);
    const allGarmentSizes=row.allGarmentSizes===true;
    const isReferenceSize=row.isReferenceSize===true;
    const garmentSizesRaw=row.garmentSizes??[];
    if(!Array.isArray(garmentSizesRaw))return {ok:false,error:"Ürün bedenleri bir liste olmalı."};
    const garmentSizes=garmentSizesRaw.map((v:unknown)=>String(v??"").trim()).filter(Boolean);
    if(!/^[a-zA-Z0-9-]{8,90}$/.test(modelId)||
      !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(sizeCode)||
      !sizeLabel||sizeLabel.length>80||artworkPart.length>80||
      printArea.length>40||!/^[A-Z0-9_]*$/.test(printArea)||
      Number.isNaN(widthCm)||Number.isNaN(heightCm)||
      (widthCm===null)!==(heightCm===null)||
      garmentSizes.some((v:string)=>v.length>60)||
      garmentSizes.length!==new Set(garmentSizes.map((v:string)=>canonicalPlateText(v))).size||
      (allGarmentSizes&&garmentSizes.length>0))
        return {ok:false,error:"Model, desen en-boy (cm), baskı parçası veya ürün bedenleri hatalı."};
    const key=[modelId,sizeCode,canonicalPlateText(artworkPart),printArea].join("|");
    if(seen.has(key))return {ok:false,error:"Aynı model, desen ölçü varyantı ve baskı parçası iki kez eklenemez."};
    seen.add(key);
    if(isReferenceSize) {
      const referenceKey=[modelId,canonicalPlateText(artworkPart),printArea].join("|");
      if(references.has(referenceKey))return {ok:false,error:"Aynı model ve baskı parçası için yalnız bir orijinal ebat seçilebilir."};
      references.add(referenceKey);
    }
    entries.push({modelId,sizeCode,sizeLabel,printArea,artworkPart,
      widthCm,heightCm,garmentSizes,allGarmentSizes,isReferenceSize});
  }
  return {ok:true,entries};
}

export function describeSharedPlate(entries:readonly PlateEntry[],modelId:string) {
  const groups = new Map<string, Set<string>>();
  for (const row of entries.filter(item => item.modelId === modelId)) {
    // Ana desen ve kuyruk aynı iki beden grubunu kullanabilir; 4 sayılmaz.
    const part = canonicalPlateText(row.artworkPart) + "|" + row.printArea;
    if (!groups.has(part)) groups.set(part,new Set());
    const key = row.widthCm && row.heightCm ? row.widthCm+"x"+row.heightCm : row.sizeCode;
    groups.get(part)!.add(key);
  }
  return {
    modelSizeCount:Math.max(0,...[...groups.values()].map(rows=>rows.size)),
    sharedModelCount:new Set(entries.map(row=>row.modelId)).size,
  };
}


/** Desen ebat sıralaması yalnız EN x BOY karşılaştırmasıyla yapılır.
 * S, M, L, yaş, ay ve diğer ürün bedenleri asla bu sıralamaya girmez.
 * En küçülürken boy büyüyorsa, "küçük/büyük" demek güvenilir değildir.
 */
export function rankPrintVariants(entries: readonly PlateEntry[]): (string|null)[] {
  const ranks:(string|null)[]=Array(entries.length).fill(null);
  const groups=new Map<string,number[]>();
  entries.forEach((row,i)=>{
    const key=[row.modelId,canonicalPlateText(row.artworkPart),row.printArea].join("|");
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key)!.push(i);
  });
  for (const indices of groups.values()) {
    const dimensions=new Map<string,{width:number;height:number;indices:number[]}>();
    for (const i of indices) {
      const row=entries[i];
      if(!(Number(row.widthCm)>0&&Number(row.heightCm)>0))continue;
      const key=String(row.widthCm)+"|"+String(row.heightCm);
      if(!dimensions.has(key))dimensions.set(key,{width:Number(row.widthCm),height:Number(row.heightCm),indices:[]});
      dimensions.get(key)!.indices.push(i);
    }
    const sorted=[...dimensions.values()].sort((a,b)=>a.width-b.width||a.height-b.height);
    const count=sorted.length;
    // A single measurement (even for 20 garment sizes) is ONE print size.
    if (!count) continue;
    const contradictory=sorted.some((item,i)=>i>0&&item.height+0.001<sorted[i-1].height);
    sorted.forEach((item,i)=>{
      let label:string;
      if(contradictory)label="En–boy oranı karşılaştırılmalı";
      else if(count===1)label="Tek desen ebadı";
      else if(count===2)label=i===0?"Küçük desen":"Büyük desen";
      else if(count===3)label=["Küçük desen","Orta desen","Büyük desen"][i];
      else label=String(i+1)+"/"+count+" desen ebadı"+(i===0?" (en küçük)":i===count-1?" (en büyük)":"");
      for (const index of item.indices)ranks[index]=label;
    });
  }
  return ranks;
}
