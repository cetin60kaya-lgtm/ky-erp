import {useEffect,useState} from "react";
import {canonicalCompanySlug} from "../../../utils/companyIdentity";
import {getCompanyEBelgeAdapters} from "../../../services/eBelgeAdapterApi";
import EBelgeIsnetPortalSync from "./EBelgeIsnetPortalSync";
import IsnetOfficeStatus from "./IsnetOfficeStatus";
import "./eBelgeOperator.css";
export default function EBelgeReceiveWorkspace({activeMainCompany,openModule}){
 const slug=canonicalCompanySlug(activeMainCompany);
 const [data,setData]=useState(null),[error,setError]=useState(""),[retry,setRetry]=useState(0),[show,setShow]=useState(false);
 useEffect(()=>{let live=true;if(!slug)return;setShow(false);setError("");getCompanyEBelgeAdapters({slug}).then(r=>{
  if(!live)return;if(String(r.mainCompanySlug).toLowerCase()!==String(slug).toLowerCase()||!Array.isArray(r.companyAdapters))throw Error("Firma kapsamı doğrulanamadı.");
  setData(r);
 }).catch(e=>{if(live)setError(e.message||"Entegrasyonlar okunamadı.");});return()=>{live=false;};},[slug,retry]);
 const scoped=String(data?.mainCompanySlug||"").toLowerCase()===String(slug||"").toLowerCase()?data:null;
 const isnet=scoped?.companyAdapters.find(x=>x.key==="ISNET"&&x.selected===true&&x.enabled===true);
 const nav=tabKey=>openModule?.("e-belge",{tabKey});
 return <section className="ebo-workspace">
  <h3>Belge Aktarım Kaynakları</h3>
  <div className="ebo-actions">
   <button type="button" onClick={()=>nav("dosya-kutusu")}>Dosya Kutusu</button><button type="button" onClick={()=>nav("belge-havuzu")}>XML / PDF Yükleme</button>
   <button type="button" onClick={()=>nav("entegrasyonlar")}>Entegrasyon Yönetimi</button>
   <button type="button" onClick={()=>{setData(null);setError("");setShow(false);setRetry(v=>v+1)}}>Yenile</button>
  </div>
  {error?<p role="alert">{error}</p>:!scoped?<p role="status">Firma bağlantıları okunuyor…</p>:<div>
   {(scoped.companyAdapters||[]).filter(x=>x.selected).map(x=><p key={x.key}><strong>{scoped.systemCatalog?.find(a=>a.key===x.key)?.label||x.key}</strong> · {x.enabled!==true?"Pasif":x.key==="ISNET"?"Yerel servis kontrolü gerekli":x.key==="MANUAL"?"Dosya yükleme":"Belge aktarım servisi henüz doğrulanmadı"}</p>)}
   {isnet&&<><p>Yerel İşNet oturumu KYERP firma seçiminden bağımsızdır. Aktarım öncesinde aynı firmanın yetkili portal hesabını ve arşivini doğrulayın.</p>
   <button type="button" onClick={()=>setShow(v=>!v)}>{show?"İşNet Aktarım Panelini Kapat":"İşNet Aktarım Panelini Aç"}</button></>}
  </div>}
  {isnet&&<IsnetOfficeStatus key={slug} slug={slug} compact/>}
  {isnet&&show&&<EBelgeIsnetPortalSync key={slug} activeMainCompany={activeMainCompany} openModule={openModule} enabled={true}/>}
 </section>;
}
