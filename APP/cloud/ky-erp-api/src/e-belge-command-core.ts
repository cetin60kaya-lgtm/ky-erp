// REV3 deterministic allowlist. No LLM, SQL, provider or write operation in this module.
import type {DraftKind} from "./e-belge-draft-core";
type Row=Record<string,unknown>;
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
export type DirectIntent={kind:DraftKind;party:string;item:string;quantity:string;unit:string;price:string};
export function parseDirectCommand(raw:unknown):DirectIntent{
 const s=text(raw).normalize("NFC");
 if(!s||s.length>500)throw Error("En fazla 500 karakterlik işlem komutu girin.");
 // Deliberately require an explicit model and unambiguous unit. No unconsumed tokens.
 const m=s.match(/^(.{2,100}?) için (.{2,100}?) (?:modelinden |ürününden )?(\d{1,7}(?:[,.]\d{1,3})?) (adet|kg|metre|m²)(?: (\d{1,7}(?:[,.]\d{1,4})?) TL(?:['’]den| birim fiyatla))? doğrudan (fatura|irsaliye) oluştur$/iu);
 if(!m)throw Error("Doğrudan işlem biçimi: Cari için Model 100 adet 10 TL’den doğrudan fatura oluştur. Kaynak irsaliye işlemlerinde Sevk ve Faturalandırma ekranını kullanın.");
 const [,party,item,quantity,unit,price,kind]=m;
 if(!party||!item||!quantity||!unit||!kind||Number(quantity.replace(",","."))<=0)throw Error("Cari, model ve pozitif miktar gerekli.");
 const units:Record<string,string>={adet:"C62",kg:"KGM",metre:"MTR","m²":"MTK"};
 const k:DraftKind=kind.toLocaleLowerCase("tr-TR")==="fatura"?"INVOICE":"DISPATCH";
 if(k==="DISPATCH"&&price)throw Error("İrsaliyede fiyat kullanılmaz.");
 return {kind:k,party,item,quantity:quantity.replace(",","."),unit:units[unit.toLowerCase()]||"",price:(price||"").replace(",",".")};
}
export function resolveDirectFields(intent:DirectIntent,item:{partyId:string;description:string;catalogId:string;unit:string},defaults:Row,answers:Row,date:string){
 const missing:{field:string;question:string}[]=[],provenance:Record<string,string>={quantity:"Komut",partyId:"Kayıtlı cari",catalogId:"Kayıtlı katalog",unit:"Kayıtlı katalog ve komut"};
 const take=(key:string,question:string,explicit="")=>{
  const approved=text(defaults[key]),answer=text(answers[key]),value=explicit||answer||approved;
  if(!value)missing.push({field:key,question});else provenance[key]=explicit?"Komut":answer?"Kullanıcı":"Onaylı firma/cari/model varsayılanı";
  return value;
 };
 const aliases:Record<string,string>={ADET:"C62",AD:"C62",KG:"KGM",METRE:"MTR","M²":"MTK"};
 const unit=aliases[item.unit.toUpperCase()]||item.unit.toUpperCase();
 if(unit!==intent.unit)missing.push({field:"unit",question:"Komuttaki birim kayıtlı ürün birimiyle uyuşmuyor; komutu düzeltin."});
 const invoice=intent.kind==="INVOICE";
 const price=invoice?take("price","Birim fiyat nedir?",intent.price):"0";
 const vatRate=invoice?take("vatRate","KDV oranı nedir?"):"0";
 const scenario=invoice?take("scenario","Belge senaryosu: TEMELFATURA, TICARIFATURA veya EARSIVFATURA?"):"TEMELIRSALIYE";
 const currency=invoice?take("currency","Para birimi nedir?"):"TRY";
 const driver=invoice?"":take("driver","Sürücü adı soyadı?");
 const plate=invoice?"":take("plate","Araç plakası?");
 const deliveryAddress=invoice?"":take("deliveryAddress","Teslimat adresi?");
 const dispatchTime=invoice?"":take("dispatchTime","Fiili sevk saati (SS:DD)?");
 const dispatchDate=invoice?"":take("dispatchDate","Fiili sevk tarihi (YYYY-AA-GG)?");
 // An explicit price can form a working draft, never an automatically approved submission.
 return {missing,provenance,payload:{partyId:item.partyId,issueDate:date,scenario,currency,lines:[{catalogId:item.catalogId,description:item.description,unit,quantity:intent.quantity,price,vatRate,discountRate:"0",freeKind:"",note:""}],driver,plate,deliveryAddress,dispatchTime,dispatchDate,carrier:text(defaults.carrier),note:""}};
}
