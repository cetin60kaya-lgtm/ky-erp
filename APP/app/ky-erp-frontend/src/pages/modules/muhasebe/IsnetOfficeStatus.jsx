import {useEffect,useState} from "react";
import {apiGet} from "../../../utils/api";
import "./eBelgeOperator.css";
const serviceLabels={WSDL_DISCOVERED:"Servis tanımı okundu",HTTP_ERROR:"HTTP hatası",NETWORK_UNAVAILABLE:"Ağ erişimi yok",REDIRECT_REJECTED:"Yönlendirme reddedildi",INVALID_WSDL:"Servis tanımı doğrulanamadı",SIZE_LIMIT:"Servis yanıtı sınırı aşıldı"};
export default function IsnetOfficeStatus({slug,compact=false,refreshKey=0}){
 const [result,setResult]=useState(null),[error,setError]=useState("");
 useEffect(()=>{
  let live=true,working=false;
  async function load(){
   if(working||!slug)return;working=true;
   try{
    const raw=await apiGet("/isnet/office/status",{mainCompanySlug:slug},{forceFresh:true});
    const v=raw?.ok===true?raw.data:raw;
    if(!v||String(v.mainCompanySlug).toLowerCase()!==String(slug).toLowerCase()||typeof v.configured!=="boolean"||!Array.isArray(v.devices)||v.providerAuthorized!==false||v.sendEnabled!==false)throw Error("Bağlantı durumu doğrulanamadı.");
    if(live){setResult(v);setError("")}
   }catch(e){if(live){setResult(null);setError(e.message||"Bağlantı durumu okunamadı.")}}finally{working=false}
  }
  setResult(null);setError("");void load();const timer=setInterval(load,30000);
  return()=>{live=false;clearInterval(timer)};
 },[slug,refreshKey]);
 return <section className="ebo-workspace" aria-label="İşNet ofis bağlantısı">
  <h3>{compact?"İşNet bağlantısı":"İşNet · Canlı servis ve ofis cihazları"}</h3>
  {!compact&&<p>Canlı servis adresleri tanımlıdır. Sağlayıcı sözleşmesi ve firma yetkisi ayrı doğrulanır. Telefon ve dış ağ kullanıcıları normal KYERP oturumuyla çalışır.</p>}
  {error?<p role="alert">{error}</p>:!result?<p role="status">Bağlantı durumu kontrol ediliyor…</p>:<>
   <div className="ebo-connection-grid" role="status"><div><small>Ofis cihazı</small><strong>{!result.configured?"Tanımlanmadı":result.online?"Bağlı":"Çevrimdışı"}</strong></div><div><small>İşNet canlı servis</small><strong>{result.devices.some(d=>d.online&&d.liveProbe?.services?.length>0&&d.liveProbe.services.every(s=>s.status==="WSDL_DISCOVERED"))?"Servis tanımı okundu":"Doğrulanmadı"}</strong></div><div><small>Firma yetkisi</small><strong>Doğrulanmadı</strong></div><div><small>Resmî gönderim</small><strong>Kapalı</strong></div></div>{<p className="ebo-send-note">{!result.configured?"Sonraki adım: yetkili ofis cihazı kaydı.":!result.online?"Sonraki adım: ofis cihazı bağlantısını kontrol edin.":!result.devices.some(d=>d.online&&d.liveProbe?.services?.length>0&&d.liveProbe.services.every(s=>s.status==="WSDL_DISCOVERED"))?"Sonraki adım: İşNet canlı servis erişimini doğrulayın.":"Sonraki adım: firma yetkisi ve resmî gönderim kabulü."}</p>}
   {!compact&&result.liveEndpoints&&<details><summary>Canlı servis adresleri</summary>{Object.entries(result.liveEndpoints).map(([name,url])=><p key={name}><strong>{name}</strong> <code style={{overflowWrap:"anywhere"}}>{url}</code></p>)}<p>Başlangıç: {new Date(result.liveNotBefore).toLocaleString("tr-TR",{timeZone:"Europe/Istanbul"})}</p></details>}
   {!compact&&result.devices.length>0&&<div className="ebo-table-scroll"><table className="ebo-draft-table"><thead><tr><th>Cihaz</th><th>Görev</th><th>Son bağlantı</th><th>Canlı WSDL (cihaz bildirimi)</th></tr></thead><tbody>{result.devices.map(d=><tr key={d.deviceId}><td data-label="Cihaz">{d.deviceId}</td><td data-label="Görev">{d.role==="LEADER"?"Aktif":d.role==="STANDBY"?"Yedek":"Çevrimdışı"}</td><td data-label="Son bağlantı">{d.lastSeenAt?new Date(d.lastSeenAt).toLocaleString("tr-TR"):"—"}</td><td data-label="Canlı servis">{d.liveProbe?.services?.map(s=><div key={s.service}>{s.service}: {s.status==="WSDL_DISCOVERED"?`${s.operationCount} işlem bulundu`:(serviceLabels[s.status]||"Kontrol gerekli")} {s.httpStatus&&s.status!=="WSDL_DISCOVERED"?`(HTTP ${s.httpStatus})`:""}</div>)||"Kontrol bekliyor"}{d.liveProbe&&<small>{new Date(d.liveProbe.checkedAt).toLocaleString("tr-TR")}</small>}</td></tr>)}</tbody></table></div>}
  </>}
 </section>;
}
