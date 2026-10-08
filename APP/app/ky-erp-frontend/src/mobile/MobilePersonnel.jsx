import { useCallback, useEffect, useState } from "react";
import { personnelRequest, trustedPersonnelDevice, registerPersonnelDevice } from "../services/employeePortalApi";
import { mobileLogout } from "./mobileApi";

const box={background:"#fff",border:"1px solid #dce5ed",borderRadius:16,padding:16,marginBottom:12};
const button={border:0,borderRadius:10,background:"#1453a3",color:"#fff",padding:"12px 16px",fontWeight:700,cursor:"pointer"};
const subtle={color:"#5a6879",fontSize:13};
function fmt(date) {return date?String(date).split("-").reverse().join("."):"-";}
export default function MobilePersonnel() {
  const [account,setAccount]=useState(null);
  const [device,setDevice]=useState(null);
  const [info,setInfo]=useState(null);
  const [work,setWork]=useState(null);
  const [tab,setTab]=useState("info");
  const [kind,setKind]=useState("MOBILE");
  const [label,setLabel]=useState("");
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [model,setModel]=useState("");
  const [quantity,setQuantity]=useState("");
  const [fabric,setFabric]=useState("0");
  const [print,setPrint]=useState("0");
  const [shift,setShift]=useState("Gündüz");
  const [region,setRegion]=useState("Ön");
  const reload=useCallback(async()=>{
    setLoading(true);setMessage("");
    try {
      const a=await personnelRequest("employee-portal/account");
      setAccount(a);
      const local=await trustedPersonnelDevice(a);
      setDevice(local);
      const authorized=local&&a.accountApproved&&a.devices.some(d=>d.id===local.deviceId&&d.status==="APPROVED");
      if(authorized) {
        const [person,forms]=await Promise.all([personnelRequest("employee-portal/me",{device:local}),personnelRequest("employee-portal/work",{device:local})]);
        setInfo(person);setWork(forms);
      } else {setInfo(null);setWork(null);}
    }catch(e){setInfo(null);setMessage(e.message||"Personel bilgileri alinamadi.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{reload();},[reload]);
  async function register() {
    setLoading(true);setMessage("");
    try {
      const current=await personnelRequest("employee-portal/account");
      const result=await registerPersonnelDevice(current,kind,label.trim()||("Personel "+(kind==="MOBILE"?"telefonu":"isyeri bilgisayari")));
      setMessage("Cihaz kaydedildi. Firma sahibi veya yetkili onayi bekleniyor. Cihaz kimligi: "+result.id.slice(0,8));
      await reload();
    }catch(e){setMessage(e.message||"Cihaz kaydedilemedi.");}
    finally{setLoading(false);}
  }
  async function saveMachineProduction() {
    const total=Number(quantity),fabricQty=Number(fabric),printQty=Number(print);
    if(!model||!device||!Number.isInteger(total)||total<=0||![fabricQty,printQty].every(Number.isInteger)||fabricQty<0||printQty<0||fabricQty+printQty>total) {
      setMessage("Model secin; adet ve sakat miktarlarini kontrol edin.");return;
    }
    if(!window.confirm("Bu modele "+total+" adet uretim kaydi islenecek. Onayliyor musunuz?"))return;
    setLoading(true);setMessage("");
    try {
      const saved=await personnelRequest("employee-portal/work/machine-production",{method:"POST",device,body:{modelId:model,quantity:total,fabricDefectQty:fabricQty,printDefectQty:printQty,shift,printRegion:region}});
      setQuantity("");setFabric("0");setPrint("0");setModel("");
      await reload();
      setMessage("Uretim kaydi tamamlandi: "+saved.modelName+" · "+saved.quantity+" adet. Kayit ortak modele islendi.");
    }catch(e){setMessage("Hata: "+e.message);}
    finally{setLoading(false);}
  }
  const activeDevice=account?.devices?.find(d=>d.id===device?.deviceId);
  const authorized=!!info;
  const gross=Number(quantity||0),defects=Number(fabric||0)+Number(print||0),valid=gross>0&&Number(fabric)>=0&&Number(print)>=0&&defects<=gross;
  return <div style={{minHeight:"100dvh",background:"#f1f5f9",color:"#1b2a3c",fontFamily:"system-ui,sans-serif",padding:14,paddingBottom:40}}>
    <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
      <div><div style={{fontSize:11,color:"#60758c",fontWeight:700}}>KY ERP / PERSONEL</div><h2 style={{margin:"3px 0"}}>Personel Panelim</h2><span style={subtle}>Firma ve cihaz bazli erisim</span></div>
      <button type="button" style={{...button,background:"#64748b",padding:"9px 12px"}} onClick={mobileLogout}>Cikis</button>
    </header>
    {message?<div style={{...box,color:"#a14419"}} role="status">{message}</div>:null}
    {!account?<div style={box}>{loading?"Yukleniyor...":"Hesap acilamadi. Firma personel yetkilisine basvurun."}<p><button type="button" onClick={reload}>Yenile</button></p></div>:null}
    {account&&!authorized?<section style={box}>
      <h3 style={{marginTop:0}}>Ilk cihaz onayi</h3>
      <p style={subtle}>Personel hesabi: {account.occupation}. Bu ekrana sadece size ait kayitli cihaz onaylandiktan sonra erisilir.</p>
      {device&&activeDevice?.status==="PENDING"?<p><strong>Cihaziniz onay bekliyor.</strong> Firma yetkilinizden onay isteyin.</p>:null}
      {device&&activeDevice?.status==="APPROVED"&&account.accountApproved?<p>Cihaz onaylandi. <button type="button" onClick={reload}>Bilgilerimi Ac</button></p>:null}
      {device&&["REVOKED","DENIED"].includes(activeDevice?.status)?<p>Eski cihaz yetkisi sona erdi. Firma yetkilinizle gorusup yeni cihaz kaydi olusturun.</p>:null}
      {!device||!activeDevice||["REVOKED","DENIED"].includes(activeDevice.status)?<div style={{display:"grid",gap:10}}>
        <label>Cihaz turu <select value={kind} onChange={e=>setKind(e.target.value)} style={{display:"block",width:"100%",padding:10}}><option value="MOBILE">Kisisel telefon</option>{account.workplaceEnabled?<option value="WORKPLACE">Isyeri bilgisayari</option>:null}</select></label>
        <label>Cihaz adi <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Orn. Cuma Samsung telefon" maxLength={100} style={{display:"block",width:"100%",padding:10}} /></label>
        <button type="button" disabled={loading} onClick={register} style={button}>Bu Cihazi Tanit</button>
      </div>:null}
      <p style={{...subtle,marginTop:14}}>Yeni cihazda yeniden onay gerekir. Biyometrik giris (WebAuthn) bir sonraki guvenlik asamasinda eklenecek.</p>
      <button type="button" disabled={loading} onClick={reload}>Onay Durumunu Yenile</button>
    </section>:null}
    {authorized?<div>
      <div style={{...box,display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
        <div><strong>{info.person.fullName}</strong><div style={subtle}>{info.person.code} · {info.person.occupation} · {device?.kind==="WORKPLACE"?"Isyeri bilgisayari":"Telefon"}</div></div>
        <span style={{fontSize:12,color:"#177245"}}>Cihaz onayli</span>
      </div>
      <div style={{display:"flex",gap:9,marginBottom:14}}>
        <button type="button" onClick={()=>setTab("info")} style={{...button,flex:1,background:tab==="info"?"#1453a3":"#64748b"}}>Kendi Bilgilerim</button>
        <button type="button" onClick={()=>setTab("work")} style={{...button,flex:1,background:tab==="work"?"#1453a3":"#64748b"}}>Is Formum</button>
      </div>
      {tab==="info"?<>
        <section style={box}>
          <h3 style={{marginTop:0}}>Yillik izin durumum</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            {[["Bu yil hak edis",info.annualLeave.entitlement+" gun"],["Gecen yildan devir",info.annualLeave.carryover+" gun"],["Bu yil kullanilan",info.annualLeave.usedThisYear+" gun"],["Kalan izin",info.annualLeave.remaining+" gun"],["Gecen yil kullanilan",info.annualLeave.usedPreviousYear+" gun"],["Siradaki hak edis",fmt(info.annualLeave.nextEntitlementDate)]].map(([name,value])=><div key={name} style={{background:"#f3f6f9",borderRadius:8,padding:10}}><div style={subtle}>{name}</div><strong>{value}</strong></div>)}
          </div>
          <h4>Izin gecmisim</h4>
          {info.annualLeave.history.length?info.annualLeave.history.map((x,i)=><div key={i} style={{padding:"7px 0",borderBottom:"1px solid #e5e7eb"}}>{fmt(x.startDate)} – {fmt(x.endDate)} · {x.days} gun</div>):<p style={subtle}>Bu iki yila ait kayitli yillik izin bulunmuyor.</p>}
        </section>
        <section style={box}>
          <h3 style={{marginTop:0}}>Kart basma saatlerim</h3>
          <p style={subtle}>PDKS'den kayitli gercek kart okutma saatleri. Tek basim varsa ikinci saati tahmin etmiyoruz.</p>
          {info.attendance.length?info.attendance.map((day,i)=><div key={i} style={{padding:"9px 0",borderBottom:"1px solid #edf0f2",display:"flex",justifyContent:"space-between",gap:12}}><strong>{fmt(day.date)}</strong><span>{day.stamps.join(" · ")||"Kayit yok"} {day.incomplete?"(tek basim)":""}</span></div>):<p style={subtle}>Bu yil icin kayitli kart basimi yok.</p>}
        </section>
        <p style={subtle}>Maas, bordro, avans ve odeme bilgileri bu panelde yer almaz.</p>
      </>:<>
        <section style={box}>
          <h3 style={{marginTop:0}}>Vasifima atanan is formu</h3>
          {work?.form==="MACHINE_ENTRY"?<>
            <p style={subtle}>Makinaci ve makine kartinizdan otomatik belirlenir. {work.machineId?"Makine: "+work.machineId:"Makine atamasi bekleniyor."}</p>
            <label>Model <select value={model} onChange={e=>setModel(e.target.value)} style={{display:"block",width:"100%",padding:11,margin:"5px 0 13px"}}><option value="">Model seciniz</option>{(work.models||[]).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            {[["Toplam baski",quantity,setQuantity],["Kumas sakati",fabric,setFabric],["Baski sakati",print,setPrint]].map(([label,value,set])=><label key={label} style={{display:"block",marginBottom:12}}>{label}<input type="number" min="0" value={value} onChange={e=>set(e.target.value)} style={{display:"block",padding:11,width:"100%",marginTop:5,boxSizing:"border-box"}}/></label>)}
            <div style={{display:"flex",gap:8}}>
              <label style={{flex:1}}>Vardiya<select value={shift} onChange={e=>setShift(e.target.value)} style={{display:"block",width:"100%",padding:10}}><option>Gündüz</option><option>Gece</option></select></label>
              <label style={{flex:1}}>Baski bolgesi<select value={region} onChange={e=>setRegion(e.target.value)} style={{display:"block",width:"100%",padding:10}}><option>Ön</option><option>Arka</option><option>Kol</option><option>Diğer</option></select></label>
            </div>
            <p>Net saglam: <strong>{valid?gross-defects:"Kontrol edin"}</strong></p>
            <button type="button" style={button} disabled={loading||!valid||!model||!work.machineId} onClick={saveMachineProduction}>Uretimi Tamamla</button>
            <p style={subtle}>Uretim ortak model kaydina eklenir; bu islem fatura kesmez.</p>
          </>:<p style={subtle}>{info.person.occupation==="BOYACI"?"Boyaciya ozel is formu firma tarafindan tanimlanacak.":info.person.occupation==="NUMUNECI"?"Numuneciye ozel is formu firma tarafindan tanimlanacak.":"Bu vasif icin ozel is formu henuz atanmis degil."}</p>}
        </section>
      </>}
      <button type="button" onClick={reload} disabled={loading} style={{...button,background:"#576b7e"}}>Kayitlarimi Yenile</button>
    </div>:null}
  </div>;
}
