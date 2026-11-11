/** One legal company for one validated VKN/TCKN. Never merge by similar name. */
type Row=Record<string,unknown>;
const value=(v:unknown)=>v==null?"":String(v).trim();
export const exactTaxNo=(v:unknown)=>value(v).replace(/\D/g,"");
export function chooseExactCompanyByTax(rows:Row[], taxNo:unknown){
  const tax=exactTaxNo(taxNo);
  if(!/^(?:\d{10}|\d{11})$/.test(tax))return{status:"TAX_REVIEW_REQUIRED" as const,company:null,reason:"Vergi/kimlik numarası eksik veya geçersiz."};
  const matches=rows.filter(row=>exactTaxNo(row.tax_no||row.taxNo)===tax);
  if(matches.length===1)return{status:"EXACT_VKN" as const,company:matches[0],reason:""};
  if(matches.length>1)return{status:"DUPLICATE_VKN_REVIEW" as const,company:null,reason:"Aynı VKN/TCKN ile birden fazla firma kartı var; kullanıcı birleştirmeli."};
  return{status:"NOT_FOUND" as const,company:null,reason:"VKN/TCKN için firma kartı bulunamadı; isim benzerliğinden otomatik bağlanamaz."};
}
export function verifiedContactEmail(input:unknown){
  const candidate=value(input).split(/[;,\s]+/).find(Boolean)||"";
  return /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(candidate)&&candidate.length<=160?candidate:"";
}
export function verifiedContactPhone(input:unknown){
  const candidate=value(input).slice(0,80);
  return /^[+\d\s().-]{7,80}$/.test(candidate)&&candidate.replace(/\D/g,"").length>=7?candidate:"";
}
