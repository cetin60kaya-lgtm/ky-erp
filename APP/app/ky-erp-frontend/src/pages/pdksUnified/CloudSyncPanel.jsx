import React,{useEffect,useState} from "react";
import {AlertTriangle,Cloud,RefreshCw,ShieldAlert,ShieldCheck} from "lucide-react";
const labels={PENDING:"Beklemede",CLAIMED:"Agent teslim aldı",
  ACKED:"ACK onaylandı",FAILED:"Hata"};
const summaryKeys=["PENDING","CLAIMED","ACKED","FAILED"];
export default function CloudSyncPanel({company="",previewOnly=true,
  profileReady=false,audit=false}){
  const [result,setResult]=useState(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const permitted=Boolean(company)&&!previewOnly&&profileReady&&!audit;
  useEffect(()=>{
    let cancelled=false;
    setResult(null);setError("");
    if(!permitted)return undefined;
    const check=async()=>{
      setLoading(true);
      try{
        const service=await import("./readService.js");
        const data=await service.readCloudSyncStatus({mainCompanyId:company});
        if(cancelled)return;
        if(data?.complete!==true||data?.source!=="D1_UNIFIED_OUTBOX_ONLY"||
           !data?.status||!Array.isArray(data?.recent)||
           data.productionApproved!==false||data.terminalRawCertified!==false)
          throw Error("Cloud senkron yanıtı güvenle doğrulanamadı.");
        setResult(data);setError("");
      }catch(reason){
        if(cancelled)return;
        setResult(null);
        setError(String(reason?.message||"Cloud senkron okunamadı."));
      }finally{if(!cancelled)setLoading(false);}
    };
    void check();
    const timer=setInterval(()=>void check(),45000);
    return ()=>{cancelled=true;clearInterval(timer);};
  },[company,permitted,refresh]);
  return <section className="pdk-u-cloud-sync" aria-label="Cloud Windows Agent teslimat durumu">
    <div className="pdk-u-live-head"><div>
      <strong><Cloud size={16}/> Cloud / Windows Agent senkron durumu</strong>
      <p>Cloud D1 komut kuyruğu görünümü. Terminal, Firebird, TNF ve gerçek Agent çevrimiçi kanıtı ayrı gereklidir.</p>
    </div><button className="pdk-u-btn" type="button" disabled={!permitted||loading}
      onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={15}/> Yenile</button></div>
    {!permitted?<div className="pdk-u-live-empty"><ShieldAlert size={17}/>
      {previewOnly?"Tasarım önizlemesinde canlı Cloud ve Windows Agent bilgisi gösterilmez.":
      audit?"Bu görünüm yalnız yetkili PDKS FULL hesabında kullanılabilir.":
      "Firma veya PDKS yetkili oturumu doğrulanmadı."}
    </div>:<>
      {loading&&<p className="pdk-u-live-note">Cloud komut kuyruğu okunuyor…</p>}
      {error&&<p className="pdk-u-live-note is-alert" role="alert"><AlertTriangle size={16}/>{error}
        {" "}Geçişler başarıyla tamamlandı varsayılmıyor.</p>}
      {result&&<>
        <div className="pdk-u-live-metrics pdk-u-cloud-metrics">
          {summaryKeys.map(code=><div key={code} className="pdk-u-cloud-counter">
            <span>{labels[code]}</span><strong>{result.status[code]??"—"}</strong>
          </div>)}
          <div className="pdk-u-cloud-counter">
            <span>Kayıtlı / aktif cihaz kimliği</span>
            <strong>{result.devices?.enabled??"—"} / {result.devices?.registered??"—"}</strong>
          </div>
        </div>
        <p className="pdk-u-live-note"><ShieldCheck size={16}/>
          Agent'ın şu anda çalıştığı doğrulanmadı. ACK, geçmiş Cloud komut teslimatıdır;
          fiziksel PDKS cihaz verisi veya yıllık TNF onayı değildir. Son okuma: {result.asOf||"—"}
        </p>
        <div className="pdk-u-table-scroll" tabIndex={0} role="region" aria-label="Cloud Agent komut günlüğü">
          <table className="pdk-u-table"><thead><tr>
            {["Komut","İşlem","Durum","Deneme","Oluşturma","Sonraki Deneme","ACK","Hata Kodu"].map(x=><th key={x}>{x}</th>)}
          </tr></thead><tbody>{result.recent.map(item=><tr key={item.id}>
            <td>{item.id}</td><td>{item.action||item.eventType||"—"}</td>
            <td>{labels[item.state]||"Bilinmiyor"}</td>
            <td>{item.attempts}</td><td>{item.createdAt||"—"}</td>
            <td>{item.nextAttemptAt||"—"}</td>
            <td>{item.acknowledgedAt||"—"}</td><td>{item.errorCode||"—"}</td>
          </tr>)}</tbody></table>
        </div>
        {!result.recent.length&&<p className="pdk-u-live-note">
          Bu firma için görüntülenecek Cloud komut günlüğü yok. Bu, cihazın çevrimiçi olduğu anlamına gelmez.
        </p>}
        <div className="pdk-u-transfer-state"><ShieldAlert size={16}/>
          <span>Bu ekran salt okunurdur. Yeniden deneme, silme, sıraya yeni komut ekleme
            veya üretim Cloudflare geçişi yapmaz.</span>
        </div>
      </>}
    </>}
  </section>;
}
