import { useState } from "react";
import {apiGet} from "../../../utils/api";
import "./isnetOfficialWorkspace.css";
import IsnetTestDraftWorkspace from "./IsnetTestDraftWorkspace";
import IsnetSoapReadWorkspace from "./IsnetSoapReadWorkspace";
import {ISNET_FAMILIES, KYERP_DOCUMENT_FLOW} from "./isnetOperatorFamilies";

// Operator uses the canonical KYERP document pool. Technical sandbox is opt-in.
// The WSDL catalogue is read-only; a listed operation never grants send permission.
const documents = [
  ["Gelen Faturalar","gelen-faturalar","Alış belgeleri"],
  ["Giden Faturalar","giden-faturalar","Satış belgeleri"],
  ["Gelen İrsaliyeler","gelen-irsaliyeler","Müşteri / tedarikçi sevkleri"],
  ["Giden İrsaliyeler","giden-irsaliyeler","Sevk ve fatura ilişkileri"],
];
const groups = ISNET_FAMILIES;
const unwrap=v=>v?.data?.data??v?.data??v;
export default function IsnetOfficialWorkspace({openModule,onOpenSync,onOpenRules,onOpenTest,onOpenProfile,enabled,slug}) {
 const [technical,setTechnical]=useState(false);
 const [familyId,setFamilyId]=useState("invoice");
 const [methodQuery,setMethodQuery]=useState("");
 const family=groups.find(g=>g.id===familyId)||groups[0];
 const canNavigate=Boolean(slug&&openModule);
 const [technicalView,setTechnicalView]=useState("read");
 const [catalog,setCatalog]=useState(null),[catalogBusy,setCatalogBusy]=useState(false),[catalogError,setCatalogError]=useState("");
 const navigate=tabKey=>openModule?.("e-belge",{tabKey});
 async function readContract(){
  setCatalogBusy(true);setCatalogError("");setCatalog(null);
  try{const data=unwrap(await apiGet("/muhasebe/isnet-provider-catalog",{mainCompanySlug:slug},{forceFresh:true,timeoutMs:45000}));
   if(data?.source!=="ISNET_LIVE_WSDL"||data.environment!=="TEST"||!Array.isArray(data.services))throw Error("Servis sözleşmesi doğrulanamadı.");
   setCatalog(data);
  }catch(e){setCatalogError(e?.message||"Servis sözleşmesi alınamadı.");}finally{setCatalogBusy(false);}
 }
 const discovered=(catalog?.services||[]).filter(s=>s.status==="WSDL_DISCOVERED");
 const hits=method=>discovered.flatMap(s=>(s.operations||[]).filter(op=>op===method).map(op=>s.service+" / "+op));
 const mapped=new Set(groups.flatMap(g=>g.methods));
 return <section className="isow" aria-label="KYERP İşNet işlem merkezi">
  <header className="isow-head"><div><small>KYERP / e-BELGE / İŞNET</small><h3>İşNet · Belge İşlem Merkezi</h3><p>Gelen ve giden belgeler, sevk ilişkileri, muhasebe kontrolü ve orijinal dosyalar tek merkezde.</p></div><span className="isow-state">{enabled?"Firma entegrasyonu seçili · SOAP canlı kabulü bekliyor":"Firma entegrasyonu pasif"}</span></header>
  <div className="isow-docs">{documents.map(([label,tabKey,detail])=><button type="button" key={tabKey} disabled={!canNavigate} onClick={()=>navigate(tabKey)}>{label}<small>{detail} · KYERP belge havuzu</small></button>)}</div>
  <div className="isow-flow" aria-label="KYERP belge işlem zinciri">{KYERP_DOCUMENT_FLOW.map(([no,title,detail])=><div key={no}><span>{no}</span><strong>{title}</strong><small>{detail}</small></div>)}</div>
  <section className="isow-operator"><div className="isow-section-head"><h4>Günlük işlemler</h4><small>Mevcut KYERP kayıtları</small></div><div className="isow-actions">
   <button type="button" className="isow-primary" disabled={!enabled||!slug||!onOpenSync} onClick={onOpenSync}>Belgeleri al · XML + PDF</button>
   <button type="button" disabled={!canNavigate} onClick={()=>navigate("gelen-irsaliyeler")}>İrsaliye ve fatura kontrolü</button>
   <button type="button" disabled={!canNavigate} onClick={()=>navigate("eslestirmeler")}>Belge eşleştirmeleri</button>
   <button type="button" disabled={!canNavigate} onClick={()=>navigate("belge-havuzu")}>Belge yükle / havuz</button>
   <button type="button" disabled={!canNavigate} onClick={()=>navigate("arsiv-cikti")}>Arşiv / çıktı</button>
   <button type="button" disabled={!canNavigate} onClick={()=>navigate("onay-sorunlar")}>Muhasebe onayları</button>
  </div></section>
  <section className="isow-operator"><div className="isow-section-head"><h4>Belge ve servis aileleri</h4><small>İşNet sözleşmesi · KYERP iş akışı</small></div>
   <div className="isow-family-nav" role="group" aria-label="Belge ailesi">{groups.map(g=><button key={g.id} type="button" aria-pressed={familyId===g.id} onClick={()=>setFamilyId(g.id)}>{g.title}</button>)}</div>
   <div className="isow-family-content"><h4>{family.title}</h4><p>{family.detail}</p>
    <div className="isow-operation-grid">{family.actions.map(([label,tabKey,detail])=><div className="isow-operation" key={label}><div><strong>{label}</strong><small>{detail}</small></div>{tabKey?<button type="button" disabled={!canNavigate} onClick={()=>navigate(tabKey)}>KYERP'de aç</button>:<span className="isow-pending">Servis kabulü bekliyor</span>}</div>)}</div>
   </div>
   <p className="isow-note">KYERP iç kayıtları ile İşNet'in resmî belge işlemleri ayrıdır. Sağlayıcı gönderimi, yanıt, iptal ve diğer bağlanmamış işlemler açık kabul olmadan etkinleştirilmez.</p>
  </section>
  <section className="isow-operator"><h4>Belge oluşturma ve gönderim</h4><p>Resmî belge üretimi ve gönderimi için doğrulanmış UBL, firma/etiket yetkisi ve sağlayıcı kabulü gerekir.</p><div className="isow-actions">
   {["Yeni e-Fatura","Yeni e-İrsaliye","Yeni e-Arşiv"].map(label=><button type="button" key={label} disabled title="Sağlayıcı gönderim kabulü bekliyor">{label}</button>)}
  </div></section>
  <section className="isow-operator"><h4>Ayarlar ve dosya kontrolü</h4><div className="isow-actions">
   <button type="button" disabled={!enabled||!onOpenRules} onClick={onOpenRules}>Gelişmiş iş kuralları</button>
   <button type="button" disabled={!enabled||!onOpenTest} onClick={onOpenTest}>Dosya kontrolü</button>
   <button type="button" disabled={!onOpenProfile} onClick={onOpenProfile}>Entegrasyonu düzenle</button>
   <button type="button" aria-expanded={technical} onClick={()=>setTechnical(v=>!v)}>{technical?"Teknik kabulü kapat":"Servis sözleşmesi ve teknik kabul"}</button>
  </div></section>
  {technical&&<section className="isow-technical" aria-label="İşNet teknik kabul alanı">
   <h4>İşNet TEST · teknik kabul</h4><p>Günlük işlerden ayrı. Yalnız sağlayıcının izin verdiği TEST belgeleri ve sentetik taslaklar; resmî gönderim yapılmaz.</p>
   <div className="isow-actions">
    <button type="button" aria-pressed={technicalView==="read"} disabled={!enabled||!slug} onClick={()=>setTechnicalView("read")}>TEST belge erişimi</button>
    <button type="button" aria-pressed={technicalView==="draft"} disabled={!enabled||!slug} onClick={()=>setTechnicalView("draft")}>TEST taslakları</button>
    <button type="button" aria-pressed={technicalView==="contract"} disabled={!enabled||!slug} onClick={()=>setTechnicalView("contract")}>Servis metotları / senaryolar</button>
   </div>
   {enabled&&slug&&technicalView==="read"&&<IsnetSoapReadWorkspace key={slug} slug={slug} onDrafts={()=>setTechnicalView("draft")}/>}
   {enabled&&slug&&technicalView==="draft"&&<IsnetTestDraftWorkspace key={slug} slug={slug}/>}
   {enabled&&slug&&technicalView==="contract"&&<div>
    <button type="button" disabled={catalogBusy} onClick={readContract}>{catalogBusy?"Sözleşme okunuyor…":"Güncel WSDL sözleşmesini oku"}</button>
    {catalogError&&<p role="alert">{catalogError}</p>}
    <label className="isow-method-search">Metot ara<input type="search" value={methodQuery} onChange={e=>setMethodQuery(e.target.value)} placeholder="Örn. SearchInvoice"/></label><p className="isow-note">Metot adı yalnız resmî sözleşme kapsamını gösterir. WSDL varlığı firma yetkisi, başarılı çağrı veya gönderim izni değildir. e-MM için SOAP bulunmuyor; e-Dekont sözleşmesi doğrulanmadı.</p>
    {catalog&&<div>{(catalog.services||[]).map(s=><p key={s.service}>{s.service}: {s.status} · {(s.operations||[]).length} metot</p>)}
     {groups.filter(g=>g.methods.some(m=>m.toLowerCase().includes(methodQuery.trim().toLowerCase()))).map(g=><details key={g.title}><summary>{g.title}</summary><table><thead><tr><th>Dokümandaki metot</th><th>Canlı WSDL eşleşmesi (TEST)</th></tr></thead><tbody>{g.methods.filter(m=>m.toLowerCase().includes(methodQuery.trim().toLowerCase())).map(m=><tr key={m}><td>{m}</td><td>{hits(m).join(", ")||"Bu sorguda doğrulanmadı"}</td></tr>)}</tbody></table></details>)}
     {discovered.map(s=><details key={s.service}><summary>{s.service} · tam metot ve enum listesi</summary><ul>{(s.operations||[]).filter(op=>op.toLowerCase().includes(methodQuery.trim().toLowerCase())).map(op=><li key={op}>{op}{!mapped.has(op)?" · ek sözleşme incelemesi gerekli":""}</li>)}</ul>{(s.enums||[]).map(e=><details key={e.namespace+"#"+e.name}><summary>{e.name} ({e.values.length})</summary><p>{e.values.join(" · ")}</p></details>)}</details>)}
    </div>}
   </div>}
  </section>}
 </section>;
}
