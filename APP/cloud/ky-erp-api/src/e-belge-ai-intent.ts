// Only suggestion normalization. No accounting data access, provider operation or write.
import {parseDirectCommand} from "./e-belge-command-core.ts";
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const canonical=(v:string)=>v.normalize("NFC").toLocaleLowerCase("tr-TR");
export function validateInterpretation(raw:unknown,result:unknown){
 const original=text(raw);
 if(!original||original.length>500)throw Error("Komut boş veya çok uzun.");
 const r=typeof result==="string"?JSON.parse(result):result;
 if(!r||typeof r!=="object"||Array.isArray(r)||Object.keys(r).some(k=>k!=="command"&&k!=="question"))throw Error("AI önerisi beklenen yapıda değil.");
 const x=r as Record<string,unknown>,command=text(x.command),question=text(x.question);
 if(!command)return {command:"",question:question.slice(0,250)||"Cari, model, miktar ve belge türünü netleştirin."};
 const source=canonical(original);
 if(/irsaliyeden|irsaliyeyi|irsaliyesinden|bu belge|kaynak belge|bedelsiz|iskonto|indirim|istisna|iade|iptal|gönder|sil|döviz|usd|eur/.test(source)||/(?:^|\s)-\d/.test(source))throw Error("Kaynak belge veya özel koşullu işlem ortak editörde doğrulanmalıdır.");
 const intent=parseDirectCommand(command);
 if(!source.includes(canonical(intent.party))||!source.includes(canonical(intent.item)))throw Error("AI cari/model bilgisini komuttan doğrulayamadı.");
 // Verify numeric roles, not just the presence of a number anywhere in the command.
 const quantities=[...source.matchAll(/(?:^|[^\d.,-])(\d+(?:[,.]\d+)?)\s*(adet|kg|metre|m²)(?![\p{L}\d])/gu)].map(m=>Number(m[1]!.replace(",",".")));
 const prices=[...source.matchAll(/(?:^|[^\d.,-])(\d+(?:[,.]\d+)?)\s*tl(?![\p{L}\d])/gu)].map(m=>Number(m[1]!.replace(",",".")));
 if(quantities.length!==1||quantities[0]!==Number(intent.quantity)||prices.length>1||(prices.length===1?(!intent.price||prices[0]!==Number(intent.price)):Boolean(intent.price)))throw Error("AI miktar/fiyatı komuttan doğrulayamadı.");
 const labels:Record<string,RegExp>={C62:/\badet\b/,KGM:/\bkg\b/,MTR:/\bmetre\b/,MTK:/m²/};
 if(!labels[intent.unit]?.test(source)||(intent.price&&!/\btl\b/i.test(original)))throw Error("Birim veya para birimi açık değil.");
 if(intent.kind==="INVOICE"?!/fatura/.test(source):!/irsaliye|sevk/.test(source))throw Error("Belge türü açık değil.");
 return {command,question:""};
}
