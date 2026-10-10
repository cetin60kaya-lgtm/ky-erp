import React, {useMemo, useState} from "react";
import {CircleAlert, Clock3, RefreshCw, ShieldCheck} from "lucide-react";

const label={
  GIRIS_KAYDI:"Giriş kaydı var",GEC_GIRIS:"Geç giriş",GEC_GIRIS_CIKTI:"Geç geldi · çıktı",
  CIKIS_KAYDI:"Çıkış kaydı var",CIKIS_KAYDI_YOK:"Çıkış kaydı yok",
  KART_KAYDI_YOK:"Kart kaydı yok",YON_BELIRSIZ:"Yön doğrulanmadı",
  IZINLI:"İzin kaydı var",
};
const filters=[
  ["all","Tüm kartlı personel"],
  ["arrived","Gelenler"],
  ["late","Geç gelenler"],
  ["unrecorded","Kart kaydı olmayanlar"],
  ["exited","Çıkış yapanlar"],
  ["missing","Eksik / yön belirsiz"],
  ["leave","İzinliler"],
];
const matches=(person,filter)=>{
  switch(filter){
    case "arrived":return Boolean(person.entry);
    case "late":return Number(person.lateMinutes)>0;
    case "unrecorded":return person.status==="KART_KAYDI_YOK";
    case "exited":return Boolean(person.exit);
    case "missing":return ["CIKIS_KAYDI_YOK","YON_BELIRSIZ"].includes(person.status);
    case "leave":return person.status==="IZINLI";
    default:return true;
  }
};
const show=(value)=>value===0?"0":value||"—";

export default function LiveAttendancePanel({snapshot,loading=false,previewOnly=false,
  search="",compact=false,onRefresh}){
  const [filter,setFilter]=useState("all");
  const usable=!previewOnly&&snapshot?.complete===true&&Array.isArray(snapshot.roster);
  const people=useMemo(()=>usable?snapshot.roster:[],[usable,snapshot]);
  const filtered=useMemo(()=>{
    const q=String(search).toLocaleLowerCase("tr-TR").trim();
    return people.filter((person)=>matches(person,filter)&&(!q||
      [person.fullName,person.cardNo,person.department,person.status]
        .some(v=>String(v||"").toLocaleLowerCase("tr-TR").includes(q))));
  },[people,filter,search]);
  const metrics=snapshot?.metrics||{};
  const totals=[
    {id:"arrived",name:"Giriş kaydı",value:metrics.arrived},
    {id:"unrecorded",name:"Kart kaydı yok",value:metrics.noRecord},
    {id:"late",name:"Geç gelen",value:metrics.late},
    {id:"exited",name:"Çıkış yapan",value:metrics.exited},
    {id:"missing",name:"Eksik / belirsiz",value:(metrics.missingExit??0)+(metrics.unknownDirection??0)},
    {id:"leave",name:"İzinli",value:metrics.leave},
  ];
  return <section className="pdk-u-live" aria-label="Günlük canlı personel devam kontrolü">
    <div className="pdk-u-live-head">
      <div><strong>Günlük kart kontrolü · {usable?snapshot.date:"Canlı kaynak bekleniyor"}</strong>
        <p>Kaynak: Cloud D1 kart hareketleri. Fiziksel terminal, Firebird ve TNF mutabakatı tamamlanmış sayılmaz.</p>
      </div>
      {onRefresh&&<button className="pdk-u-btn" type="button" disabled={loading||previewOnly}
        onClick={onRefresh}><RefreshCw size={15}/> Yenile</button>}
    </div>
    {loading&&<p className="pdk-u-live-note"><Clock3 size={14}/> Günlük kayıtlar yenileniyor…</p>}
    {!usable?<div className="pdk-u-live-empty"><CircleAlert size={19}/>
      {previewOnly?"Tasarım incelemesinde gerçek personel veya kart verisi gösterilmez.":
        "Yetkili günlük kart verisi henüz doğrulanmadı. Gelmedi/geç geldi sayıları tahmin edilmiyor."}
    </div>:<>
      <div className="pdk-u-live-metrics">
        {totals.map(item=><button key={item.id} type="button"
          className={filter===item.id?"is-active":""}
          onClick={()=>setFilter(filter===item.id?"all":item.id)}>
          <span>{item.name}</span><strong>{show(item.value)}</strong>
        </button>)}
      </div>
      <div className="pdk-u-live-filters">
        <label>Görünüm <select aria-label="Devam durumu filtresi"
          value={filter} onChange={event=>setFilter(event.target.value)}>
          {filters.map(([id,name])=><option value={id} key={id}>{name}</option>)}
        </select></label>
        <span>{filtered.length} / {people.length} personel</span>
        <span>Son kaynak sorgusu: {show(snapshot.asOf?.slice(11,16))}</span>
      </div>
      <div className="pdk-u-table-scroll" role="region" aria-label="Günlük personel kart listesi" tabIndex={0}>
        <table className="pdk-u-table"><thead><tr>
          {["Kart No","Personel","Bölüm","Giriş","Çıkış","Durum","Geç (dk)","Kanıt"].map(v=><th key={v}>{v}</th>)}
        </tr></thead><tbody>
          {(compact?filtered.slice(0,12):filtered).map(person=><tr key={person.employeeId}>
            <td>{show(person.cardNo)}</td><td>{show(person.fullName)}</td>
            <td>{show(person.department)}</td><td>{show(person.entry)}</td>
            <td>{show(person.exit)}</td><td>{label[person.status]||person.status}</td>
            <td>{person.lateMinutes===null?"Doğrulanmadı":show(person.lateMinutes)}</td>
            <td>{person.eventCount} D1</td>
          </tr>)}
        </tbody></table>
      </div>
      {filtered.length===0&&<p className="pdk-u-live-note">Bu filtrede doğrulanmış kart kaydı bulunmadı.</p>}
      <p className="pdk-u-live-note"><ShieldCheck size={14}/>
        “Kart kaydı yok”, personelin kesin gelmediği anlamına gelmez; cihaz senkronu, izin, vardiya ve fiziksel kaynak ayrıca teyit edilmelidir.
      </p>
    </>}
  </section>;
}
