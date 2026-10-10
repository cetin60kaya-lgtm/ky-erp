import React,{useEffect,useMemo,useState} from "react";
import {Database,FolderOpen,ShieldAlert,Download} from "lucide-react";
import {parseStageCopySnapshot} from "./stageCopyView.mjs";
const stripTime=v=>String(v||"").slice(0,5);
export default function StageCopyExplorer({snapshot,onSnapshot,tabId="today",search="",selectedCard="",onSelectedCard=()=>{}}){
  const [error,setError]=useState("");
  const [filter,setFilter]=useState("all");
  const [day,setDay]=useState("");
  const [autoInfo,setAutoInfo]=useState("");
  const [autoDisabled,setAutoDisabled]=useState(false);
  useEffect(()=>{
    if(snapshot||autoDisabled||window.location.hostname!=="ky-pdks-test.local")return;
    const controller=new AbortController();
    fetch("/__local-copy/latest.json",{cache:"no-store",signal:controller.signal})
      .then(response=>response.ok?response.text():null)
      .then(raw=>{
        if(!raw||controller.signal.aborted)return;
        const parsed=parseStageCopySnapshot(raw);
        onSnapshot(parsed);
        setAutoInfo("Yerel kopya verisi otomatik açıldı. Canlı bağlantı değildir.");
        setError("");
      })
      .catch(error=>{
        if(!controller.signal.aborted)setAutoInfo(
          "Otomatik kaynak doğrulanamadı: "+String(error?.message||"Bilinmeyen hata"));
      });
    return ()=>controller.abort();
  },[onSnapshot,snapshot,autoDisabled]);

  const load=async file=>{
    if(!file)return;
    try{
      if(file.size>12_000_000||file.size<100)throw Error("COPY_FILE_SIZE_INVALID");
      const data=parseStageCopySnapshot(await file.text());
      onSnapshot(data);setError("");
      setAutoDisabled(false);
      setDay("");
    }catch(e){onSnapshot(null);setError(String(e?.message||"Dosya doğrulanamadı"));}
  };
  const peopleTab=["people","cards","employment"].includes(tabId);
  const reviewTab=["exceptions","attention","violations","signatures","validation"].includes(tabId);
  const filteredPairReview=reviewTab && !["signatures"].includes(tabId);
  const monthlyTab=tabId==="monthly"||tabId==="timesheets";
  const eventTab=["punches","history"].includes(tabId);
  const sourceOnlyNote=["today","live","daily","monthly","attendance","timesheets"].includes(tabId);
  const monthlyRows=useMemo(()=>{
    if(!snapshot)return[];
    const groups=new Map();
    for(const person of snapshot.people)groups.set(person.cardNo,{
      cardNo:person.cardNo,name:person.fullName,days:0,paired:0,unpaired:0,e:0});
    for(const day of snapshot.days){
      if(!groups.has(day.cardNo))groups.set(day.cardNo,{
        cardNo:day.cardNo,name:day.name,days:0,paired:0,unpaired:0,e:0});
      const row=groups.get(day.cardNo);
      row.days++;
      const paired=day.sideCountMatched;
      if(paired)row.paired++;else row.unpaired++;
      row.e+=day.legacyE;
    }
    return [...groups.values()].sort((a,b)=>a.cardNo.localeCompare(b.cardNo));
  },[snapshot]);
  const q=String(search).toLocaleLowerCase("tr-TR").trim();
  const chosen=snapshot?.people.find(person=>person.cardNo===selectedCard)||null;
  const chosenEvents=snapshot?.events.filter(event=>event.cardNo===selectedCard)||[];
  const rows=useMemo(()=>{
    if(!snapshot)return[];
    if(peopleTab)return snapshot.people.filter(p=>(!selectedCard||p.cardNo===selectedCard)&&(!q||[p.fullName,p.cardNo,p.group]
      .some(v=>String(v||"").toLocaleLowerCase("tr-TR").includes(q))));
    const data=monthlyTab?monthlyRows:eventTab?snapshot.events:snapshot.days;
    return data.filter(r=>(!selectedCard||r.cardNo===selectedCard)&&(monthlyTab||!day||r.date===day)&&
      (!filteredPairReview||monthlyTab||!r.sideCountMatched)&&(!q||
      [r.person,r.name,r.cardNo,r.date,r.direction]
        .some(v=>String(v||"").toLocaleLowerCase("tr-TR").includes(q)))&&
      (filter==="all"||(!eventTab?filter==="unpaired"&&
        !r.sideCountMatched:r.direction===filter)));
  },[snapshot,peopleTab,eventTab,monthlyTab,monthlyRows,filteredPairReview,q,day,filter,selectedCard]);
  const columns=peopleTab?["Kart No","Personel","Grup","İşe Giriş","İşten Çıkış","Kaynak"]:
    monthlyTab?["Kart No","Personel","Kayıtlı Gün","Çift Taraflı Gün","Eksik Taraflı Gün","E Tarafı","Bordro Onayı"]:
    eventTab?["Tarih","Kart No","Personel","Saat","Yön","Legacy Tür","Kanıt"]:
    ["Tarih","Kart No","Personel","Giriş","Çıkış","Legacy E","Durum"];
  const values=r=>peopleTab?[r.cardNo,r.fullName,r.group,r.employmentStart,r.employmentEnd,"KIMLIK · KOPYA"]:
    monthlyTab?[r.cardNo,r.name,r.days,r.paired,r.unpaired,r.e,"Hesaplanmadı"]:
    eventTab?[r.date,r.cardNo,r.person,stripTime(r.time),r.direction,r.legacyType,"GIRCIK · KOPYA"]:
    [r.date,r.cardNo,r.name,r.entry.map(stripTime).join(", ")||"—",
      r.exit.map(stripTime).join(", ")||"—",r.legacyE,
      !r.sideCountMatched?"Taraf sayısı eşleşmiyor — inceleme":"FDB taraf sayısı eşit"];
  const exportCsv=()=>{
    if(!rows.length)return;
    const cell=v=>{
      const text=String(v??"").replace(/^[=+@\-\t\r]/,match=>"'"+match);
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const csv="\uFEFF"+[columns,...rows.map(values)]
      .map(line=>line.map(cell).join(";")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");
    a.href=url;a.download="KY_PDKS_KOPYA_"+tabId+".csv";a.click();
    URL.revokeObjectURL(url);
  };
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
      {autoInfo&&<span role="status">{autoInfo}</span>}
      {snapshot&&<button className="pdk-u-btn" type="button"
        onClick={()=>{setAutoDisabled(true);onSnapshot(null);setError("");setDay("");setAutoInfo("Yerel veri kullanıcı tarafından kapatıldı.");}}>Veriyi kapat</button>}
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
        <span><b>{snapshot.unmatchedDayCount}</b> taraf adedi uyuşmayan kişi-gün</span>
      </div>
      <div className="pdk-u-stage-controls">
        <span>Kaynak aralığı: {snapshot.start} – {snapshot.end}</span>
        {!peopleTab&&!monthlyTab&&<label>Tarih <input aria-label="Kaynak günü filtrele"
          type="date" value={day} min={snapshot.start} max={snapshot.end}
          onChange={event=>setDay(event.target.value)}/></label>}
        {!peopleTab&&!monthlyTab&&!reviewTab&&<label>Görünüm <select value={filter}
          onChange={event=>setFilter(event.target.value)}>
          <option value="all">Tüm kaynak kayıtları</option>
          {eventTab?<><option value="IN">Sadece giriş</option>
            <option value="OUT">Sadece çıkış</option></>:
            <option value="unpaired">Tek tarafı bulunan günler</option>}
        </select></label>}
        {selectedCard&&<button type="button" className="pdk-u-btn" onClick={()=>onSelectedCard("")}>Kart filtresini kaldır ({selectedCard})</button>}
        <span>{rows.length} kayıt gösteriliyor</span>
        <button type="button" className="pdk-u-btn" onClick={exportCsv} disabled={!rows.length}>
          <Download size={15}/> CSV
        </button>
      </div>
      <div className="pdk-u-table-scroll" role="region" tabIndex={0}
        aria-label="Kopya Firebird gerçek kayıt tablosu">
        <table className="pdk-u-table"><thead><tr>
          {columns.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>
          {rows.slice(0,500).map((r)=><tr key={peopleTab||monthlyTab?r.cardNo:eventTab?r.eventId:r.cardNo+"|"+r.date}
            onClick={()=>onSelectedCard(r.cardNo)}
            onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelectedCard(r.cardNo);}}}
            tabIndex={0} aria-selected={selectedCard===r.cardNo}
            className={selectedCard===r.cardNo?"is-selected":""}>
            {values(r).map((v,index)=>
              <td key={index}>{v??"—"}</td>)}
          </tr>)}</tbody></table>
      </div>
      {chosen&&<div className="pdk-u-stage-person-detail" aria-label="Seçilen personelin kopya kayıtları">
        <strong>Seçili kart: {chosen.cardNo} · {chosen.fullName}</strong>
        <p>Grup: {chosen.group||"—"} · İşe giriş: {chosen.employmentStart||"—"} · İşten çıkış: {chosen.employmentEnd||"—"}</p>
        <p>Seçili kartta {chosenEvents.length} kaynak hareket tarafı bulundu.
          Kaynak yalnızca Firebird kopyasıdır; gerçek terminal ve maaş onayı değildir.</p>
        <div className="pdk-u-table-scroll" role="region" tabIndex={0}
          aria-label="Seçili kartın gerçek kaynak hareketleri">
          <table className="pdk-u-table"><thead><tr>
            <th>Tarih</th><th>Saat</th><th>Yön</th><th>Tür</th>
          </tr></thead><tbody>
            {chosenEvents.slice(0,150).map(event=><tr key={event.eventId}>
              <td>{event.date}</td><td>{stripTime(event.time)}</td>
              <td>{event.direction}</td><td>{event.legacyType||"—"}</td>
            </tr>)}
          </tbody></table>
        </div>
      </div>}
      {rows.length>500&&<p className="pdk-u-live-note">
        İlk 500 kayıt gösteriliyor. Tarih ve arama filtrelerini daraltın.</p>}
      {sourceOnlyNote&&<p className="pdk-u-live-note">
        Bu ekran yalnız seçilen kopya FDB döneminin ham taraf sayılarını gösterir.
        Çalışılan gün, mesai, ücret, devamsızlık veya geç kalma hesaplanmadı.
      </p>}
      {reviewTab&&<p className="pdk-u-live-note">
        Eksik taraf yalnızca inceleme işaretidir; gerçek kart ihlali veya imzalı düzeltme kararı değildir.
        İmza alanı ve personel onayı, yetkili kanıt olmadan oluşturulmaz.
      </p>}
      <p className="pdk-u-live-note"><ShieldAlert size={16}/>
        Kopya FDB'de kayıt görünmesi, personelin bugün işyerine geldiği veya geç kaldığına tek başına kanıt değildir.
        İzin, vardiya, gerçek terminal RAW ve yıllık TNF ayrıca doğrulanmalıdır.</p>
    </>}
  </section>;
}
