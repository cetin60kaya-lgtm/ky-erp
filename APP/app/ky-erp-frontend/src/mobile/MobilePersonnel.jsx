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
      const payload={modelId:model,quantity:total,fabricDefectQty:fabricQty,printDefectQty:printQty,shift,printRegion:region};
      const pendingKey="kyerp-personnel-production-pending";
      const fingerprint=JSON.stringify({userId:account.userId,deviceId:device.deviceId,payload});
      let old=null;try{old=JSON.parse(sessionStorage.getItem(pendingKey)||"null");}catch{old=null;}
      const requestId=old?.fingerprint===fingerprint&&old?.requestId?old.requestId:crypto.randomUUID();
      sessionStorage.setItem(pendingKey,JSON.stringify({fingerprint,requestId}));
      const saved=await personnelRequest("employee-portal/work/machine-production",{method:"POST",device,body:{...payload,requestId}});
      sessionStorage.removeItem(pendingKey);
      setQuantity("");setFabric("0");setPrint("0");setModel("");
      await reload();
      setMessage("Üretim kaydı tamamlandı: "+saved.modelName+" · "+saved.quantity+" adet. Kayıt ortak modele işlendi.");
    }catch(e){setMessage("Hata: "+e.message);}
    finally{setLoading(false);}
  }
  const activeDevice=account?.devices?.find(d=>d.id===device?.deviceId);
  const authorized=!!info;
  const gross=Number(quantity||0),defects=Number(fabric||0)+Number(print||0),valid=gross>0&&Number(fabric)>=0&&Number(print)>=0&&defects<=gross;
  return <div style={{minHeight:"100dvh",background:"#f1f5f9",color:"#1b2a3c",fontFamily:"system-ui,sans-serif",padding:14,paddingBottom:40}}>
    <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
      <div><div style={{fontSize:11,color:"#60758c",fontWeight:700}}>KY ERP / PERSONEL</div><h2 style={{margin:"3px 0"}}>Personel Panelim</h2><span style={subtle}>Firma ve cihaz bazlı erişim</span></div>
      <button type="button" style={{...button,background:"#64748b",padding:"9px 12px"}} onClick={mobileLogout}>Çıkış</button>
    </header>
    {message?<div style={{...box,color:"#a14419"}} role="status">{message}</div>:null}
    {!account?<div style={box}>{loading?"Yukleniyor...":"Hesap acilamadi. Firma personel yetkilisine basvurun."}<p><button type="button" onClick={reload}>Yenile</button></p></div>:null}
    {account&&!authorized?<section style={box}>
      <h3 style={{marginTop:0}}>Hesap ve Cihaz Onayı</h3>
      <p style={subtle}>Personel hesabı: {account.occupation}. Bilgileriniz yalnızca onaylı cihazınızda açılır.</p>
      {!account.accountApproved?<p><strong>Personel hesabınız ayrıca onay bekliyor.</strong> Cihaz onaylanmış olsa da hesap onayı olmadan bilgiler açılmaz.</p>:null}
      {device&&activeDevice?.status==="PENDING"?<p><strong>Cihazınız onay bekliyor.</strong> Firma yetkilinizden onay isteyin.</p>:null}
      {device&&activeDevice?.status==="APPROVED"&&account.accountApproved?<p>Cihaz onaylandı. <button type="button" onClick={reload}>Bilgilerimi Aç</button></p>:null}
      {device&&["REVOKED","DENIED"].includes(activeDevice?.status)?<p>Eski cihaz yetkisi sona erdi. Firma yetkilinizle gorusup yeni cihaz kaydi olusturun.</p>:null}
      {!device||!activeDevice||["REVOKED","DENIED"].includes(activeDevice.status)?<div style={{display:"grid",gap:10}}>
        <label>Cihaz turu <select value={kind} onChange={e=>setKind(e.target.value)} style={{display:"block",width:"100%",padding:10}}><option value="MOBILE">Kişisel telefon</option>{account.workplaceEnabled?<option value="WORKPLACE">İşyeri bilgisayarı</option>:null}</select></label>
        <label>Cihaz adı <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Orn. Cuma Samsung telefon" maxLength={100} style={{display:"block",width:"100%",padding:10}} /></label>
        <button type="button" disabled={loading} onClick={register} style={button}>Bu Cihazı Tanıt</button>
      </div>:null}
      <p style={{...subtle,marginTop:14}}>Yeni cihazda yeniden onay gerekir. Biyometrik giriş (WebAuthn) bir sonraki güvenlik aşamasında eklenecek.</p>
      <button type="button" disabled={loading} onClick={reload}>Onay Durumunu Yenile</button>
    </section>:null}
    {authorized?<div>
      <div style={{...box,display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
        <div><strong>{info.person.fullName}</strong><div style={subtle}>{info.person.code} · {info.person.occupation} · {device?.kind==="WORKPLACE"?"İşyeri bilgisayarı":"Telefon"}</div></div>
        <span style={{fontSize:12,color:"#177245"}}>Cihaz onaylı</span>
      </div>
      <div style={{display:"flex",gap:9,marginBottom:14}}>
        <button type="button" onClick={()=>setTab("info")} style={{...button,flex:1,background:tab==="info"?"#1453a3":"#64748b"}}>Kendi Bilgilerim</button>
        <button type="button" onClick={()=>setTab("work")} style={{...button,flex:1,background:tab==="work"?"#1453a3":"#64748b"}}>İş Formum</button>
      </div>
      {tab==="info"?<>
        <section style={box}>
          <h3 style={{marginTop:0}}>Yıllık İzin Durumum</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            {[["Bu Yıl Hak Edişi",info.annualLeave.entitlement+" gun"],["Geçen Yıldan Devir",info.annualLeave.carryover+" gun"],["Bu Yıl Kullanılan",info.annualLeave.usedThisYear+" gun"],["Kalan İzin",info.annualLeave.remaining+" gun"],["Geçen Yıl Kullanılan",info.annualLeave.usedPreviousYear+" gun"],["Sonraki Hak Ediş",fmt(info.annualLeave.nextEntitlementDate)]].map(([name,value])=><div key={name} style={{background:"#f3f6f9",borderRadius:8,padding:10}}><div style={subtle}>{name}</div><strong>{value}</strong></div>)}
          </div>
          <h4>İzin Geçmişim</h4>
          {info.annualLeave.history.length?info.annualLeave.history.map((x,i)=><div key={i} style={{padding:"7px 0",borderBottom:"1px solid #e5e7eb"}}>{fmt(x.startDate)} – {fmt(x.endDate)} · {x.days} gun</div>):<p style={subtle}>Son iki yılda kayıtlı yıllık izin bulunmuyor.</p>}
        </section>
        <section style={box}>
          <h3 style={{marginTop:0}}>Kart Basma Saatlerim</h3>
          <p style={subtle}>PDKS'den kayıtlı gerçek kart okutma saatleri. Tek basım varsa ikinci saat tahmin edilmez.</p>
          {info.attendance.length?info.attendance.map((day,i)=><div key={i} style={{padding:"9px 0",borderBottom:"1px solid #edf0f2",display:"flex",justifyContent:"space-between",gap:12}}><strong>{fmt(day.date)}</strong><span>{day.stamps.join(" · ")||"Kayit yok"} {day.incomplete?"(tek basım)":""}</span></div>):<p style={subtle}>Bu yıl için kayıtlı kart basımı yok.</p>}
        </section>
        <p style={subtle}>Maaş, bordro, avans ve ödeme bilgileri bu panelde yer almaz.</p>
      </>:<>
        <section style={box}>
          <h3 style={{marginTop:0}}>Vasıfıma Atanan İş Formu</h3>
          {work?.form==="MACHINE_ENTRY"?<>
            <p style={subtle}>Makinacı ve makine kartınızdan otomatik belirlenir. {work.machineId?"Makine: "+work.machineId:"Makine ataması bekleniyor."}</p>
            <label>Model <select value={model} onChange={e=>setModel(e.target.value)} style={{display:"block",width:"100%",padding:11,margin:"5px 0 13px"}}><option value="">Model seçiniz</option>{(work.models||[]).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            {[["Toplam Baskı",quantity,setQuantity],["Kumaş Sakatı",fabric,setFabric],["Baskı Sakatı",print,setPrint]].map(([label,value,set])=><label key={label} style={{display:"block",marginBottom:12}}>{label}<input type="number" min="0" value={value} onChange={e=>set(e.target.value)} style={{display:"block",padding:11,width:"100%",marginTop:5,boxSizing:"border-box"}}/></label>)}
            <div style={{display:"flex",gap:8}}>
              <label style={{flex:1}}>Vardiya<select value={shift} onChange={e=>setShift(e.target.value)} style={{display:"block",width:"100%",padding:10}}><option>Gündüz</option><option>Gece</option></select></label>
              <label style={{flex:1}}>Baskı Bölgesi<select value={region} onChange={e=>setRegion(e.target.value)} style={{display:"block",width:"100%",padding:10}}><option>Ön</option><option>Arka</option><option>Kol</option><option>Diğer</option></select></label>
            </div>
            <p>Net Sağlam: <strong>{valid?gross-defects:"Kontrol edin"}</strong></p>
            <button type="button" style={button} disabled={loading||!valid||!model||!work.machineId} onClick={saveMachineProduction}>Üretimi Tamamla</button>
            <p style={subtle}>Üretim ortak model kaydına eklenir; bu işlem fatura kesmez.</p>
          </>:<p style={subtle}>{info.person.occupation==="BOYACI"?"Boyacıya özel iş formu firma tarafından tanımlanacak.":info.person.occupation==="NUMUNECI"?"Numuneciye özel iş formu firma tarafından tanımlanacak.":"Bu vasıf için henüz özel iş formu atanmadı."}</p>}
        </section>
      </>}
      <button type="button" onClick={reload} disabled={loading} style={{...button,background:"#576b7e"}}>Kayıtlarımı Yenile</button>
    </div>:null}
  </div>;
}
