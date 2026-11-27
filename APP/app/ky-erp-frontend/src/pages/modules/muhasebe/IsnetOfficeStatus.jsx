import {useEffect,useState} from "react";
import {apiGet} from "../../../utils/api";
export default function IsnetOfficeStatus({slug}){
 const [result,setResult]=useState(null),[error,setError]=useState("");
 useEffect(()=>{
  let live=true,working=false;
  async function load(){
   if(working||!slug)return;working=true;
   try{
    const raw=await apiGet("/isnet/office/status",{mainCompanySlug:slug},{forceFresh:true});
    const v=raw?.ok===true?raw.data:raw;
    if(!v||typeof v.configured!=="boolean"||!Array.isArray(v.devices)||v.providerAuthorized!==false||v.sendEnabled!==false)throw Error("Bağlantı durumu doğrulanamadı.");
    if(live){setResult(v);setError("")}
   }catch(e){if(live){setResult(null);setError(e.message||"Bağlantı durumu okunamadı.")}}finally{working=false}
  }
  void load();const timer=setInterval(load,30000);
  return()=>{live=false;clearInterval(timer)};
 },[slug]);
 return <section className="ebo-workspace" aria-label="İşNet ofis bağlantısı">
  <h3>Statik IP · Ofis cihazları</h3>
  <p>Telefon ve dış ağdaki kullanıcılar normal KYERP oturumuyla çalışır. İşNet bağlantısı yetkili ofis cihazı üzerinden gerçekleşir. Resmî gönderim henüz kapalıdır.</p>
  {error?<p role="alert">{error}</p>:!result?<p role="status">Bağlantı durumu kontrol ediliyor…</p>:<>
   <p role="status">{!result.configured?"Yetkili ofis cihazı tanımlanmadı.":result.online?"Ofis bağlantısı var; sağlayıcı kabulü ayrı.":"Ofis cihazları çevrimdışı."}</p>
   {result.devices.length>0&&<div className="ebo-table-scroll"><table className="ebo-draft-table"><thead><tr><th>Cihaz</th><th>Görev</th><th>Son bağlantı</th></tr></thead><tbody>{result.devices.map(d=><tr key={d.deviceId}><td>{d.deviceId}</td><td>{d.role==="LEADER"?"Aktif":d.role==="STANDBY"?"Yedek":"Çevrimdışı"}</td><td>{d.lastSeenAt?new Date(d.lastSeenAt).toLocaleString("tr-TR"):"—"}</td></tr>)}</tbody></table></div>}
  </>}
 </section>;
}
