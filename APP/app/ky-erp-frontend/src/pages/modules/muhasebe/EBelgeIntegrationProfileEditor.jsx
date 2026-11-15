import {useEffect,useState} from "react";
import {Save,Settings2,ShieldAlert} from "lucide-react";
import {saveCompanyEBelgeAdapterProfile} from "../../../services/eBelgeAdapterApi";

const defaults={defaultDays:7,workflow:"READ_ONLY",output:"XML",fileNamePattern:"{direction}-{type}-{number}"};
export default function EBelgeIntegrationProfileEditor({adapter,company,profile,onSaved}){
 const [form,setForm]=useState({...defaults});
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{setForm({...defaults,...profile});setMessage("")},[adapter?.key,profile]);
 const update=(key,value)=>{setForm(s=>({...s,[key]:value}));setMessage("")};
 const submit=async(e)=>{
  e.preventDefault();if(busy||!profile)return;
  setBusy(true);setMessage("");
  try{
   const {displayName,serviceUrl,defaultDays,workflow,output,fileNamePattern,description}=form;
   const result=await saveCompanyEBelgeAdapterProfile(company,adapter.key,{
    displayName,serviceUrl,defaultDays:Number(defaultDays),workflow,output,fileNamePattern,description});
   onSaved(result);setMessage("Çalışma tercihleri bu firma için kaydedildi. API bağlantısının çalıştığı ayrıca Belge Test Merkezi'nde doğrulanır.");
  }catch(err){setMessage(err?.message||"Ayarlar kaydedilemedi.");}
  finally{setBusy(false)}
 };
 return <form className="eip" onSubmit={submit}>
  <div className="eip-head"><Settings2 size={20}/><div><h3>Entegrasyonu Düzenle</h3>
   <p>Sağlayıcı ayarlarını ve çalışma tercihlerini kod değiştirmeden firma bazında düzenleyin.</p></div></div>
  <div className="eip-fields">
   <label>Görünen ad<input maxLength={90} required minLength={2} value={form.displayName||""}
    onChange={e=>update("displayName",e.target.value)}/></label>
   <label>Servis bağlantısı / URL <input type="url" value={form.serviceUrl||""}
    placeholder={adapter.key==="MANUAL"?"Manuel XML yüklemede URL gerekmez":"https://entegrator.example"}
    disabled={adapter.key==="MANUAL"} onChange={e=>update("serviceUrl",e.target.value)}/></label>
   <label>Varsayılan test aralığı (gün)<input type="number" min={1} max={31} required value={form.defaultDays||7}
    onChange={e=>update("defaultDays",e.target.value)}/></label>
   <label>Çalışma modu<select value={form.workflow||"READ_ONLY"} onChange={e=>update("workflow",e.target.value)}>
    <option value="READ_ONLY">Salt okunur belge kontrolü</option>
    <option value="MANUAL_REVIEW">Manuel kontrol / onay bekle</option>
    <option value="DISABLED">Test bağlantısını pasife al</option>
   </select></label>
   <label>Varsayılan çıktı<select value={form.output||"XML"} onChange={e=>update("output",e.target.value)}>
    <option value="XML">Orijinal XML</option><option value="PDF">Kontrol PDF'i</option>
   </select></label>
   <label>Dosya adı düzeni<input value={form.fileNamePattern||""} maxLength={95}
    onChange={e=>update("fileNamePattern",e.target.value)}/></label>
   <label className="eip-wide">Firma / iş notu<textarea rows={3} maxLength={350} value={form.description||""}
    onChange={e=>update("description",e.target.value)}/></label>
  </div>
  <p className="eip-help"><ShieldAlert size={16}/>
   URL yalnız güvenli HTTPS sağlayıcı adresi olarak kaydedilir; bilinmeyen adrese API tokenı veya şifre gönderilmez.
   İşNet'in resmî servisi güvenlik nedeniyle doğrulanmış alan adına sınırlıdır. Logo/Mikro/Paraşüt bağlantı sürücüsü geliştirilmeden bu form onları canlıya almaz.
   Çalışma modu program kodu değiştirmez, belge işlemleri için güvenli tercihtir.</p>
  <button type="submit" disabled={!profile||busy}><Save size={16}/>{busy?"Kaydediliyor...":"Firma Ayarlarını Kaydet"}</button>
  {message&&<p className="eip-message" role="status">{message}</p>}
 </form>;
}
