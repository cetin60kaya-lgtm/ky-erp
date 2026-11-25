import { useEffect, useState } from "react";
import { apiGet, apiPut } from "../../../utils/api";
import { blankProfile, selectProfile } from "./isnetWorkflowDefaults";
import "./isnetPartialWorkflow.css";

const unwrap = v=>v?.data?.data??v?.data??v;
export default function IsnetWorkflowDefaultsEditor({slug,companyId="",companies=[],onApply}) {
  const [data,setData]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [editing,setEditing]=useState(null),[selected,setSelected]=useState(""),[query,setQuery]=useState("TEST"),[products,setProducts]=useState([]);
  useEffect(()=>{let alive=true;apiGet("/muhasebe/isnet-workflow-defaults",{mainCompanySlug:slug},{forceFresh:true}).then(raw=>{
    if(!alive)return;const d=unwrap(raw);setData(d);const p=selectProfile(d.profiles||[],companyId);setSelected(p?.id||"");onApply?.(p||{...blankProfile(),...d.legacy});
  }).catch(e=>{if(alive)setError(e?.message||"Varsayılanlar yüklenemedi.");});return()=>{alive=false;};},[slug,companyId,onApply]);
  const available=(data?.profiles||[]).filter(p=>!onApply||!p.companyId||p.companyId===companyId);
  function apply(id){setSelected(id);const p=available.find(x=>x.id===id);if(p)onApply?.(p);else if(!id&&data)onApply?.({...blankProfile(),...data.legacy});}
  const edit=(key,value)=>setEditing(p=>({...p,[key]:value}));
  async function searchProducts(){try{const v=unwrap(await apiGet("/muhasebe/isnet-workflow-defaults/products",{mainCompanySlug:slug,q:query},{forceFresh:true}));setProducts(v.rows||[]);}catch(e){setError(e?.message||"Ürünler okunamadı.");}}
  async function save(){if(!editing||!data||busy)return;setBusy(true);setError("");try{
    const p={...editing,id:editing.id||crypto.randomUUID()};
    const profiles=(data.profiles||[]).filter(x=>x.id!==p.id).map(x=>p.isDefault&&x.companyId===p.companyId?{...x,isDefault:false}:x).concat(p);
    const result=unwrap(await apiPut("/muhasebe/isnet-workflow-defaults?mainCompanySlug="+encodeURIComponent(slug),{mainCompanySlug:slug,version:data.version,profiles}));
    setData(result);setEditing(null);setSelected(p.id);onApply?.(result.profiles.find(x=>x.id===p.id)||p);
  }catch(e){setError(e?.message||"Varsayılan kaydedilemedi.");}finally{setBusy(false);}}
  return <section className="isp-root"><h3>İşNet · Varsayılan işlem profilleri</h3><p>Firma genelinde veya cari özelinde kaydet; her yeni işlemde otomatik yüklenir. Mevcut taşıyıcı ayarı yedek olarak kullanılır.</p>
    {error&&<p role="alert">{error}</p>}
    {!data?<p>Varsayılanlar yükleniyor…</p>:<><div className="isp-fields"><label>Profil<select value={selected} onChange={e=>apply(e.target.value)}><option value="">Mevcut genel taşıyıcı / standart</option>{available.map(p=><option key={p.id} value={p.id}>{p.name}{p.isDefault?" · Varsayılan":""}</option>)}</select></label></div>
    <button type="button" disabled={busy} onClick={()=>setEditing({...blankProfile(),...data.legacy,companyId})}>Yeni profil</button>
    <button type="button" disabled={busy||!selected} onClick={()=>setEditing({...available.find(p=>p.id===selected)})}>Profili düzenle</button>
    {editing&&<><div className="isp-fields">
      <label>Profil adı<input value={editing.name} onChange={e=>edit("name",e.target.value)}/></label>
      <label>Cari kapsamı<select value={editing.companyId} onChange={e=>edit("companyId",e.target.value)}><option value="">Tüm cariler</option>{companyId&&!companies.some(c=>String(c.id)===companyId)&&<option value={companyId}>Bu müşteri</option>}{companies.map(c=><option key={c.id} value={c.id}>{c.name||c.companyName||c.title||c.id}</option>)}</select></label>
      <label><span>Otomatik varsayılan</span><input type="checkbox" checked={editing.isDefault} onChange={e=>edit("isDefault",e.target.checked)}/></label>
      {[["driver","Şoför"],["driverId","Şoför kimlik no"],["carrierTaxNo","Taşıyıcı vergi no"],["plate","Plaka"],["carrierName","Taşıyıcı"],["trailerPlate","Dorse plakası"],["deliveryAddress","Teslim adresi"],["dispatchNote","İrsaliye notu"],["invoiceNote","Fatura notu"],["sampleReason","Bedelsiz numune açıklaması"],["sampleCode","Resmî muafiyet kodu (doğrulama bekler)"],["sampleQuantity","Önerilen numune miktarı"]].map(([k,label])=><label key={k}>{label}<input value={editing[k]??""} onChange={e=>edit(k,e.target.value)}/></label>)}
      <label>KDV %<input type="number" min="0" max="100" value={editing.vat} onChange={e=>edit("vat",e.target.value)}/></label>
      <label>Fatura senaryosu<select value={editing.scenario} onChange={e=>edit("scenario",e.target.value)}><option value="TICARI">Ticari</option><option value="TEMEL">Temel</option></select></label>
      <label>Teslim şekli<select value={editing.deliveryMethod} onChange={e=>edit("deliveryMethod",e.target.value)}><option value="ELDEN_TESLIM">Elden teslim</option><option value="NAKLIYE">Nakliye</option><option value="KARGO">Kargo</option></select></label>
    </div><div className="isp-fields"><label>KYERP ürün kartında numune ara<input value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="button" onClick={searchProducts}>Ürünleri ara</button><label>Numune ürünü<select value={editing.sampleProductId} onChange={e=>edit("sampleProductId",e.target.value)}><option value="">Seçilmedi</option>{editing.sampleProductId&&!products.some(p=>p.id===editing.sampleProductId)&&<option value={editing.sampleProductId}>{editing.sampleProductName||"Kayıtlı ürün"}</option>}{products.map(p=><option key={p.id} value={p.id}>{p.name} / {p.unit}</option>)}</select></label></div>
    <p>Numune kaydı fatura satırına kendiliğinden eklenmez. İşNet ürün kodu, muafiyet ve resmî şema ayrıca kabul edilecek.</p><button type="button" disabled={busy||!editing.name.trim()} onClick={save}>{busy?"Kaydediliyor…":"Profili kaydet"}</button><button type="button" disabled={busy} onClick={()=>setEditing(null)}>Vazgeç</button></>}
    </>}
  </section>;
}
