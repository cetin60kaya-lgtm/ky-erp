import React,{useMemo,useState} from "react";
import {Database,FolderOpen,ShieldAlert} from "lucide-react";
import {parseStageCopySnapshot} from "./stageCopyView.mjs";
const stripTime=v=>String(v||"").slice(0,5);
export default function StageCopyExplorer({snapshot,onSnapshot,tabId="today",search=""}){
  const [error,setError]=useState("");
  const [filter,setFilter]=useState("all");
  const [day,setDay]=useState("");
  const load=async file=>{
    if(!file)return;
    try{
      if(file.size>12_000_000||file.size<100)throw Error("COPY_FILE_SIZE_INVALID");
      const data=parseStageCopySnapshot(await file.text());
      onSnapshot(data);setError("");
      setDay("");
    }catch(e){onSnapshot(null);setError(String(e?.message||"Dosya doğrulanamadı"));}
  };
  const peopleTab=["people","cards","employment"].includes(tabId);
  const eventTab=["punches","history","live","exceptions","attention"].includes(tabId);
  const q=String(search).toLocaleLowerCase("tr-TR").trim();
  const rows=useMemo(()=>{
    if(!snapshot)return[];
    if(peopleTab)return snapshot.people.filter(p=>!q||[p.fullName,p.cardNo,p.group]
      .some(v=>String(v||"").toLocaleLowerCase("tr-TR").includes(q)));
    const data=eventTab?snapshot.events:snapshot.days;
    return data.filter(r=>(!day||r.date===day)&&(!q||
      [r.person,r.name,r.cardNo,r.date,r.direction]
        .some(v=>String(v||"").toLocaleLowerCase("tr-TR").includes(q)))&&
      (filter==="all"||(!eventTab?filter==="unpaired"&&
        (r.entry.length===0||r.exit.length===0):r.direction===filter)));
  },[snapshot,peopleTab,eventTab,q,day,filter]);
  return <section className="pdk-u-stage-explorer" aria-label="Gerçek kopya Firebird personel ve kart inceleme">
    <div className="pdk-u-live-head"><div>
      <strong><Database size={17}/> Yerel Firebird Kopyası · Gerçek Kayıt İncelemesi</strong>
      <p>İzole gbak kopyasından alınmış personel ve GIRCIK okuması. Canlı terminal, Cloud veya yıllık TNF onayı değildir.</p>
    </div><span className="pdk-u-chip">Salt okunur</span></div>
    <div className="pdk-u-stage-import">
      <label><FolderOpen size={15}/> Kopya FDB JSON dosyasını seç
        <input type="file" accept=".json,application/json"
          aria-label="Yerel Firebird kopya verisini aç"
          onChange={event=>{const file=event.target.files?.[0];if(file)void load(file);}}/>
      </label>
      <span>Dosya yalnız bu uygulamanın belleğinde açılır. Sunucuya yüklenmez.</span>
      {snapshot&&<button className="pdk-u-btn" type="button"
        onClick={()=>{onSnapshot(null);setError("");setDay("");}}>Veriyi kapat</button>}
    </div>
    {error&&<p className="pdk-u-live-note is-alert" role="alert"><ShieldAlert size={16}/>
      Kaynak dosyası reddedildi: {error}</p>}
    {!snapshot?<div className="pdk-u-live-empty">
      Önce izole Firebird kopyasından üretilen JSON dosyasını seçin. Gerçek personel bilgileri olmadan sayı ve saat uydurulmaz.
    </div>:<>
      <div className="pdk-u-stage-facts">
        <span><b>{snapshot.people.length}</b> kartlı personel</span>
        <span><b>{snapshot.events.length}</b> kayıt tarafı</span>
        <span><b>{snapshot.days.length}</b> kişi × gün</span>
        <span><b>{snapshot.unknownCards}</b> eşleşmeyen kart tarafı</span>
        <span><b>{snapshot.invalidSourcePunchCount}</b> bozuk kaynak saati</span>
      </div>
      <div className="pdk-u-stage-controls">
        <span>Kaynak aralığı: {snapshot.start} – {snapshot.end}</span>
        {!peopleTab&&<label>Tarih <input aria-label="Kaynak günü filtrele"
          type="date" value={day} min={snapshot.start} max={snapshot.end}
          onChange={event=>setDay(event.target.value)}/></label>}
        {!peopleTab&&<label>Görünüm <select value={filter}
          onChange={event=>setFilter(event.target.value)}>
          <option value="all">Tüm kaynak kayıtları</option>
          {eventTab?<><option value="IN">Sadece giriş</option>
            <option value="OUT">Sadece çıkış</option></>:
            <option value="unpaired">Tek tarafı bulunan günler</option>}
        </select></label>}
        <span>{rows.length} kayıt gösteriliyor</span>
      </div>
      <div className="pdk-u-table-scroll" role="region" tabIndex={0}
        aria-label="Kopya Firebird gerçek kayıt tablosu">
        <table className="pdk-u-table"><thead><tr>
          {(peopleTab?["Kart No","Personel","Grup","İşe Giriş","İşten Çıkış","Kaynak"]:
            eventTab?["Tarih","Kart No","Personel","Saat","Yön","Legacy Tür","Kanıt"]:
            ["Tarih","Kart No","Personel","Giriş","Çıkış","Legacy E","Durum"])
            .map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>
          {rows.slice(0,500).map((r)=><tr key={peopleTab?r.cardNo:eventTab?r.eventId:r.cardNo+"|"+r.date}>
            {(peopleTab?[r.cardNo,r.fullName,r.group,r.employmentStart,r.employmentEnd,"KIMLIK · KOPYA"]:
              eventTab?[r.date,r.cardNo,r.person,stripTime(r.time),r.direction,r.legacyType,
                "GIRCIK · KOPYA"]:
              [r.date,r.cardNo,r.name,r.entry.map(stripTime).join(", ")||"—",
                r.exit.map(stripTime).join(", ")||"—",r.legacyE,
                "Fiziksel terminal doğrulanmadı"]).map((v,index)=>
              <td key={index}>{v??"—"}</td>)}
          </tr>)}</tbody></table>
      </div>
      {rows.length>500&&<p className="pdk-u-live-note">
        İlk 500 kayıt gösteriliyor. Tarih ve arama filtrelerini daraltın.</p>}
      <p className="pdk-u-live-note"><ShieldAlert size={16}/>
        Kopya FDB'de kayıt görünmesi, personelin bugün işyerine geldiği veya geç kaldığına tek başına kanıt değildir.
        İzin, vardiya, gerçek terminal RAW ve yıllık TNF ayrıca doğrulanmalıdır.</p>
    </>}
  </section>;
}
