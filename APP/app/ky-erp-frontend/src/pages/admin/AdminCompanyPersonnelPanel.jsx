import { useCallback, useEffect, useState } from "react";
import { listUsers } from "../../services/adminApi";
import { managerPersonnelRequest } from "../../services/employeePortalApi";
const ROLES=[["PERSONEL","Personel"],["MAKINACI","Makinacı"],["NUMUNECI","Numuneci"],["BOYACI","Boyacı"]];
const rows=value=>Array.isArray(value)?value:Array.isArray(value?.items)?value.items:Array.isArray(value?.data)?value.data:[];
export default function AdminCompanyPersonnelPanel({companySlug}) {
  const [employees,setEmployees]=useState([]);
  const [pending,setPending]=useState([]);
  const [approvedDevices,setApprovedDevices]=useState([]);
  const [users,setUsers]=useState([]);
  const [selected,setSelected]=useState("");
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [occupation,setOccupation]=useState("PERSONEL");
  const [machineId,setMachineId]=useState("");
  const [workplace,setWorkplace]=useState(false);
  const [approverId,setApproverId]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    if(!companySlug)return;
    setBusy(true);
    try {
      const [result,allUsers]=await Promise.all([managerPersonnelRequest("employees",{companySlug}),listUsers()]);
      setEmployees(result.employees||[]);
      setPending(result.pendingDevices||[]);
      setApprovedDevices(result.approvedDevices||[]);
      setUsers(rows(allUsers).filter(u=>String(u.mainCompanySlug)===String(companySlug)&&u.isActive!==false&&u.role!=="PERSONNEL"));
    }catch(e){setMessage("Hata: "+e.message);}
    finally{setBusy(false);}
  },[companySlug]);
  useEffect(()=>{refresh();},[refresh]);
  async function create(e) {
    e.preventDefault();
    if(!selected||!username.trim()||password.length<10)return setMessage("Personel, kullanici adi ve en az 10 karakter parola gerekli.");
    setBusy(true);setMessage("");
    try {
      await managerPersonnelRequest("accounts",{method:"POST",body:{companySlug,employeeId:selected,username:username.trim(),password,occupation,machineId,workplaceEnabled:workplace,mobileEnabled:true}});
      setMessage("Personel hesabi olusturuldu. Hesap ve cihaz ayri ayri onaylanmalidir.");
      setSelected("");setUsername("");setPassword("");await refresh();
    }catch(e){setMessage("Hata: "+e.message);}finally{setBusy(false);}
  }
  async function decideAccount(userId,decision) {
    if(decision==="REVOKE"&&!window.confirm("Personel hesap onayi ve mevcut cihaz yetkileri iptal edilsin mi?"))return;
    setBusy(true);
    try {
      await managerPersonnelRequest("accounts/"+encodeURIComponent(userId)+"/decision",{method:"POST",body:{companySlug,decision}});
      setMessage(decision==="APPROVE"?"Personel hesabi onaylandi. Cihaz icin ayrica onay gerekir.":"Hesap onayi ve cihaz erisimleri kaldirildi.");
      await refresh();
    }catch(e){setMessage("Hata: "+e.message);}finally{setBusy(false);}
  }
  async function decide(id,decision) {
    setBusy(true);
    try {
      await managerPersonnelRequest("devices/"+encodeURIComponent(id)+"/decision",{method:"POST",body:{companySlug,decision}});
      setMessage(decision==="APPROVE"?"Yalniz cihaz onaylandi. Hesap icin ayri onay gereklidir.":decision==="REVOKE"?"Cihaz erisimi iptal edildi.":"Cihaz reddedildi.");
      await refresh();
    }catch(e){setMessage("Hata: "+e.message);}finally{setBusy(false);}
  }
  async function toggle(row,field,value) {
    setBusy(true);
    try {
      await managerPersonnelRequest("accounts/"+encodeURIComponent(row.accountUserId),{method:"PATCH",body:{companySlug,[field]:value}});
      setMessage("Personel cihaz izinleri guncellendi.");await refresh();
    }catch(e){setMessage("Hata: "+e.message);}finally{setBusy(false);}
  }
  async function delegate() {
    setBusy(true);
    try {
      await managerPersonnelRequest("approvers",{method:"POST",body:{companySlug,userId:approverId,enabled:true}});
      setMessage("Cihaz onaylama yetkisi verildi (muhasebe/modul yetkisi eklenmedi).");
      setApproverId("");
    }catch(e){setMessage("Hata: "+e.message);}finally{setBusy(false);}
  }
  const active=employees.filter(e=>e.accountUserId);
  return <section className="admpro-card" style={{marginTop:18}}>
    <div className="admpro-card-head"><div><h3>Firma Personeli · Telefon ve İşyeri Cihazları</h3><p>Muhasebe ve yonetim kullanicilarindan ayridir. Tek kaynak: IK Aylik personel karti.</p></div><button type="button" disabled={busy} onClick={refresh}>Yenile</button></div>
    {message?<div className={"admpro-notice "+(message.startsWith("Hata")?"warn":"success")} role="status">{message}</div>:null}
    <div className="admpro-grid-2">
      <form onSubmit={create} className="admpro-card" style={{boxShadow:"none"}}>
        <h4>Personel Girişi Tanımla</h4>
        <div className="admpro-form-grid">
          <label>İK Personel Kartı<select value={selected} onChange={e=>setSelected(e.target.value)} required><option value="">Personel seçiniz</option>{employees.filter(e=>!e.accountUserId).map(e=><option key={e.employeeId} value={e.employeeId}>{e.fullName} · {e.code||e.department}</option>)}</select></label>
          <label>Vasıf<select value={occupation} onChange={e=>setOccupation(e.target.value)}>{ROLES.map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
          <label>Kullanıcı Adı<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="or. cuma.ozkop" required /></label>
          <label>İlk Şifre<input type="password" minLength={10} value={password} onChange={e=>setPassword(e.target.value)} placeholder="En az 10 karakter" required /></label>
          {occupation==="MAKINACI"?<label>Atanmış Makine ID<input value={machineId} onChange={e=>setMachineId(e.target.value)} required /></label>:null}
          <label className="admpro-check"><input type="checkbox" checked={workplace} onChange={e=>setWorkplace(e.target.checked)} /> İşyeri bilgisayarına da izin ver</label>
        </div>
        <div className="admpro-actions"><button type="submit" className="primary" disabled={busy}>Personel Hesabı Aç</button></div>
        <p style={{fontSize:12}}>Giriş: firma seçimi + kullanıcı adı + şifre. Cihaz ilk kullanımda ayrıca onaylanır; kişisel e-posta zorunlu değildir.</p>
      </form>
      <div className="admpro-card" style={{boxShadow:"none"}}>
        <h4>Yeni Cihaz Onayları ({pending.length})</h4>
        {!pending.length?<p>Bekleyen cihaz bulunmuyor.</p>:pending.map(d=><div key={d.id} style={{padding:"10px 0",borderBottom:"1px solid #e1e7ec"}}><strong>{d.full_name}</strong><div style={{fontSize:12}}>{d.label} · {d.kind==="WORKPLACE"?"İşyeri bilgisayarı":"Telefon"} · {String(d.created_at).slice(0,16)}</div><div className="admpro-actions"><button className="primary" type="button" disabled={busy} onClick={()=>decide(d.id,"APPROVE")}>Cihazı Onayla</button><button type="button" disabled={busy} onClick={()=>decide(d.id,"DENY")}>Reddet</button></div></div>)}
        <h4>Onaylı Cihazlar ({approvedDevices.length})</h4>
        {!approvedDevices.length?<p>Henüz onaylı cihaz yok.</p>:approvedDevices.map(d=><div key={d.id} style={{padding:"8px 0",borderBottom:"1px solid #e1e7ec"}}><strong>{d.full_name}</strong><div style={{fontSize:12}}>{d.label} · {d.kind==="WORKPLACE"?"İşyeri PC":"Telefon"}</div><button type="button" disabled={busy} onClick={()=>{if(window.confirm("Bu cihazın erişimini iptal etmek istiyor musunuz?"))decide(d.id,"REVOKE");}}>Cihaz Yetkisini İptal Et</button></div>)}
        <h4>Cihaz Onaylamaya Yetkili Kullanıcı</h4>
        <label>Firma sahibi cihaz onay yetkisini devredebilir<select value={approverId} onChange={e=>setApproverId(e.target.value)}><option value="">Kullanıcı seçiniz</option>{users.map(u=><option key={u.id} value={u.id}>{u.fullName||u.username} · {u.role}</option>)}</select></label>
        <div className="admpro-actions"><button type="button" disabled={busy||!approverId} onClick={delegate}>Onay Yetkisi Ver</button></div>
      </div>
    </div>
    <h4>Personel Hesapları ({active.length})</h4>
    <div className="admpro-table"><table><thead><tr><th>Personel</th><th>Vasıf</th><th>Giris</th><th>Telefon</th><th>İşyeri PC</th><th>Durum</th></tr></thead><tbody>
      {active.map(row=><tr key={row.accountUserId}><td>{row.fullName}<br/><small>{row.code}</small></td><td>{row.occupation}{row.machineId?" · "+row.machineId:""}</td><td>{companySlug+"--"+row.username}</td><td><label><input type="checkbox" checked={row.mobileEnabled} disabled={busy} onChange={e=>toggle(row,"mobileEnabled",e.target.checked)}/> Açık</label></td><td><label><input type="checkbox" checked={row.workplaceEnabled} disabled={busy} onChange={e=>toggle(row,"workplaceEnabled",e.target.checked)}/> Açık</label></td><td>{row.approved?"Hesap onaylı":"Hesap onayı bekliyor"} · {row.active?"Aktif":"Pasif"}<div className="admpro-actions">{row.approved?<button type="button" disabled={busy} onClick={()=>decideAccount(row.accountUserId,"REVOKE")}>Hesap Onayını Kaldır</button>:<button type="button" className="primary" disabled={busy||!row.active} onClick={()=>decideAccount(row.accountUserId,"APPROVE")}>Hesabı Onayla</button>}<button type="button" disabled={busy} onClick={()=>toggle(row,"isActive",!row.active)}>{row.active?"Hesabı Kapat":"Hesabı Aç"}</button></div></td></tr>)}
      {!active.length?<tr><td colSpan="6">Firma personeli icin henuz mobil hesap yok.</td></tr>:null}
    </tbody></table></div>
  </section>;
}
