import {useEffect,useState} from "react";
import {apiGet} from "../../../utils/api";
import {openModel360Card} from "../../../components/shared/model360Bridge";
const num=(v,d=2)=>v==null||v===""?"—":Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d,maximumFractionDigits:d});
const unit=v=>["C62","AD","ADET","PCS","PCE"].includes(String(v||"").toUpperCase())?"ADET":String(v||"").toUpperCase();
export default function EBelgeCommercialHistory({slug,partyId,catalogId,issueDate,currency,line,onUsePrice}){
 const [reference,setReference]=useState(""),[result,setResult]=useState(null),[error,setError]=useState("");
 const scope=JSON.stringify([slug,partyId,catalogId,issueDate,reference]);
 const model=catalogId.startsWith("MODEL:");
 useEffect(()=>{let active=true;if(!partyId||!catalogId||!issueDate)return;
  apiGet("/e-belge/operator-commercial-history",{mainCompanySlug:slug,partyId,catalogId,asOf:issueDate,referenceModelId:reference},{forceFresh:true}).then(v=>v?.ok===true?v.data:v).then(v=>{
   if(!active)return;if(String(v?.mainCompanySlug||"").toLowerCase()!==String(slug).toLowerCase()||v.partyId!==partyId||v.catalogId!==catalogId||v.asOf!==issueDate||!Array.isArray(v.items)||!Array.isArray(v.repeats)||reference&&v.referenceModelId!==reference)throw Error("Geçmiş kapsamı doğrulanamadı.");
   setResult({scope,data:v});setError("");
  }).catch(e=>{if(active){setError(e.message||"Fiyat geçmişi okunamadı.");setResult({scope,data:null})}});return()=>{active=false};
 },[slug,partyId,catalogId,issueDate,reference,scope]);
 const data=result?.scope===scope?result.data:null;
 const current=String(line.price??"").trim().replace(",",".");
 const comparable=x=>x.currency===currency&&unit(x.unit)===unit(line.unit)&&!line.freeKind;
 const diff=x=>comparable(x)&&/^\d{1,7}(?:\.\d{1,4})?$/.test(current)&&Number(current)>0?num(Number(current)-Number(x.unitPrice),4):"—";
 return <section className="ebo-commercial-history">
  <div className="ebo-heading"><div><strong>Model / ürün geçmişi</strong><small>Seçili cari · belge tarihine kadar · XML kaynaklı</small></div>{model&&<button type="button" onClick={()=>openModel360Card({modelId:catalogId.slice(6),tab:"general",source:"e-belge"})}>Model 360 Kartı</button>}</div>
  {!partyId?<p>Fiyat geçmişi için önce cari seçin.</p>:result?.scope!==scope?<p role="status">Geçmiş okunuyor…</p>:error&&!data?<p role="alert">{error}</p>:data&&<>
    <p>{data.item.description}{data.item.modelCode?" · "+data.item.modelCode:""}{data.item.status?" · "+data.item.status:""}</p>
    {model&&data.repeats.length>0&&<label>Aynı müşteri ve model kodu · repet adayı (otomatik birleştirilmez)<select value={reference} onChange={e=>setReference(e.target.value)}><option value="">Bu modelin geçmişi</option>{data.repeats.map(x=><option key={x.id} value={x.id}>{x.description} · {x.modelCode} · {x.id.slice(-8)}</option>)}</select></label>}
    {reference&&<p>Seçilen repet adayının fiyatları gösteriliyor. Model kimlikleri ayrı kalır. <button type="button" onClick={()=>openModel360Card({modelId:reference,tab:"history",source:"e-belge-repet"})}>Önceki model kartını aç</button></p>}
    <small>{data.source==="MANUAL_PRODUCT_MATCH"?"Yalnız elle doğrulanmış ürün eşleşmesi.":data.source==="EXACT_HISTORICAL_LINE"?"Yalnız seçili geçmiş kalem.":"Yalnız kesin model-kalem bağlantısı."} Resmî teslim/gönderim durumu ayrıca teyit edilir.</small>
    {data.items.length?<div className="ebo-table-scroll"><table><thead><tr><th>Tarih / Fatura</th><th>Miktar</th><th>Birim fiyat</th><th>İskonto tutarı</th><th>KDV %</th><th>Yeni fiyat farkı / birim</th><th>İşlem</th></tr></thead><tbody>{data.items.map(x=><tr key={x.documentId+":"+x.lineId}><td>{x.issueDate} · {x.documentNo}</td><td>{num(x.quantity,3)} {unit(x.unit)}</td><td>{num(x.unitPrice,4)} {x.currency}</td><td>{num(x.discountTotal)}</td><td>{num(x.taxRate)}</td><td>{diff(x)}</td><td><button type="button" disabled={!comparable(x)||!/^(?:\d{1,7})(?:\.\d{1,4})?$/.test(String(x.unitPrice))} onClick={()=>onUsePrice(String(x.unitPrice))}>Fiyatı Kullan</button></td></tr>)}</tbody></table></div>:<p>Doğrulanmış fiyatlı fatura kalemi bulunamadı. İsim benzerliğinden fiyat atanmadı.</p>}
    {data.truncated&&<p>En yeni 100 uygun kalem gösteriliyor.</p>}
  </>}
 </section>
}
