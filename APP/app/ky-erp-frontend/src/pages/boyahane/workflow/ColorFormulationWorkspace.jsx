import { useState } from "react";
import { listBoyahaneProducts } from "../../../services/boyahaneWorkflowApi";
import { linkedPigmentPct, recipeBudget, solveColor, weighRecipe, makeModel, linearHex, colorLab, hexLinear } from "../../../boyahane/colorFormulation";

const START = [
  ["LİMON KLC","#FAF520",0.99784],["GOLD KFT","#FFD500",0.0367],["KIRMIZI KGC","#B02B36",2.58425],
  ["ORANJ KG","#FF6900",18.79266],["KARMEN KBD","#A90045",0.03598],["FUŞYA KB","#AA3569",2.15766],
  ["MAVİ KBT","#194C8C",2.6786],["YEŞİL KB","#236F5B",2.49252],["SİYAH KNG","#494647",17.22225],
  ["LACİVERT KRL-E","#1E2D5E",1.60487],["MOR KRL","#5A3F6E",8.45822],["GOLD PG 2805","#DB710D",0.52382],
];
const norm = value => String(value || "").toLocaleUpperCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]+/g," ").trim();
const nameOf = p => p?.productName || p?.tradeName || p?.name || p?.code || "";
const valid = h => /^#[0-9a-f]{6}$/i.test(h || "");
const fmt = x => Number(x).toLocaleString("tr-TR",{maximumFractionDigits:4});
const codeOf = x => String(x || "").trim().toUpperCase().replace(/\s+(TPG|TCX)$/,"");
const inputStyle = {width:"100%",minWidth:0};
const fieldStyle = {display:"grid",gap:4};
const gridStyle = {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:12};
function seedFor(p) {
  const n=norm(nameOf(p));
  return START.find(s => (" "+n+" ").includes(" "+norm(s[0])+" "));
}
function typeOf(p) {
  const n=norm(nameOf(p));
  if (/\bS\s*10\b/.test(n)) return "clear";
  if (/\bS\s*20\b/.test(n)) return "white";
  if (/\bACILIM\b/.test(n)||String(nameOf(p)).includes("%")) return "dilution";
  if (/\b(FLO|FOSFOR|SIM|SEDEF|SLC|SILIKON|SW|RETARDER|PAT)\b/.test(n)) return "special";
  return "pigment";
}
export default function ColorFormulationWorkspace({activeMainCompany,rows,onClose,onDraft}) {
  const cacheKey = activeMainCompany?.slug && activeMainCompany?.id ? "kyerp-boyahane-formulasyon-v1:"+activeMainCompany.slug+":"+activeMainCompany.id : "";
  const [stored] = useState(()=>{try{return cacheKey?JSON.parse(localStorage.getItem(cacheKey)||"{}"):{};}catch{return {};}});
  const [products,setProducts]=useState([]);
  const [palette,setPalette]=useState([]);
  const [catalog,setCatalog]=useState(()=>stored.catalog&&typeof stored.catalog==="object"?stored.catalog:{});
  const [pantone,setPantone]=useState("");
  const [target,setTarget]=useState("#FAF520");
  const [mass,setMass]=useState(100);
  const [white,setWhite]=useState(40);
  const [load,setLoad]=useState(5);
  const [power,setPower]=useState(()=>Number.isFinite(stored.power)&&stored.power>0?stored.power:1);
  const [link,setLink]=useState(false);
  const [ground,setGround]=useState("");
  const [model,setModel]=useState("");
  const [colorName,setColorName]=useState("");
  const [reference,setReference]=useState("");
  const [clearId,setClearId]=useState("");
  const [whiteId,setWhiteId]=useState("");
  const [result,setResult]=useState(null);
  const [error,setError]=useState("");
  const [info,setInfo]=useState("");
  const [busy,setBusy]=useState(false);
  const [tint,setTint]=useState("");
  const [stockLoaded,setStockLoaded]=useState(false);
  const invalidate=()=>{setResult(null);setError("");};
  async function loadProducts(){
    setBusy(true);invalidate();
    try {
      const raw=await listBoyahaneProducts(activeMainCompany);
      const approved=(Array.isArray(raw)?raw:[]).filter(p=>(p.approvalStatus==="APPROVED"||p.isApproved===true)&&p.isActive!==false&&p.active!==false&&p.id);
      setProducts(approved);
      setClearId(String(approved.find(p=>typeOf(p)==="clear")?.id||""));
      setWhiteId(String(approved.find(p=>typeOf(p)==="white")?.id||""));
      setPalette(approved.filter(p=>typeOf(p)==="pigment"||typeOf(p)==="special").map(p=>{
        const seed=seedFor(p), special=typeOf(p)==="special";
        const saved=Array.isArray(stored.palette)?stored.palette.find(x=>x.id===String(p.id)&&x.name===nameOf(p)&&valid(x.hex)&&Number.isFinite(x.strength)&&x.strength>0):null;
        return {id:String(p.id),name:nameOf(p),hex:saved?.hex||seed?.[1]||"",strength:saved?.strength||seed?.[2]||1,enabled:!special&&Boolean(saved?saved.enabled:seed),special,source:saved?"Bu tarayıcıda kaydedilen ayar":seed?"Başlangıç tahmini":"Kalibrasyon yok"};
      }));
      setStockLoaded(true);setInfo("Yalnız seçili firmanın onaylı aktif ürünleri yüklendi. Özel efektler otomatik hesapta kapalıdır.");
    } catch(e){setError(e.message||"Ürünler okunamadı.");setStockLoaded(false);}
    finally{setBusy(false);}
  }
  function lookup(code,library=catalog){
    const key=codeOf(code);
    const exact=rows.filter(r=>codeOf(r.pantone)===key&&valid(r.colorHex)&&(!r.sourceType||r.sourceType==="PANTONE"));
    const candidates=[...new Set(exact.map(r=>r.colorHex.toUpperCase()))];
    const entry=library[key];
    const h=Array.isArray(entry)?entry[1]:entry?.hex;
    if(valid(h)){setTarget(h.toUpperCase());setInfo("İçe aktarılan dijital Pantone referansı.");}
    else if(candidates.length===1){setTarget(candidates[0]);setInfo("Mevcut renk kartındaki dijital referans.");}
    else {setTarget("");setInfo("Tekil renk referansı bulunamadı. HEX girin veya yetkili kataloğu içe aktarın.");}
  }
  async function importCatalog(event){
    const file=event.target.files?.[0]; if(!file)return;
    try {
      if(file.size>2000000)throw Error("Katalog dosyası en fazla 2 MB olabilir.");
      const data=JSON.parse(await file.text()),source=data.colors||data;
      const next={};
      for(const [code,entry] of Object.entries(source)){
        const h=Array.isArray(entry)?entry[1]:entry?.hex;
        if(/^\d{2}-\d{4}$/.test(code)&&valid(h))next[code]=entry;
      }
      if(!Object.keys(next).length)throw Error("Geçerli Pantone/HEX kaydı bulunamadı.");
      setCatalog(next);invalidate();if(pantone)lookup(pantone,next);else setInfo(Object.keys(next).length+" dijital renk yüklendi.");
    }catch(e){setError(e.message);}
  }
  function saveLocalConfig(){
    try{if(!cacheKey)throw Error("Firma kimliği doğrulanamadı; ayar saklanmadı.");if(!Number.isFinite(power)||power<=0)throw Error("Beyaz kuvveti geçersiz.");const safe=palette.filter(p=>valid(p.hex)&&Number.isFinite(p.strength)&&p.strength>0).map(({id,name,hex,strength,enabled})=>({id,name,hex,strength,enabled}));localStorage.setItem(cacheKey,JSON.stringify({catalog,power,palette:safe.length?safe:stored.palette||[]}));setInfo("Kalibrasyon ve katalog bu firma için yalnız bu tarayıcıda saklandı; sunucuya gönderilmedi.");}catch(e){setError(e.message);}
  }
  function editPigment(id,patch){setPalette(old=>old.map(p=>p.id===id?{...p,...patch}:p));invalidate();}
  function changeWhite(v){
    try{if(link){const b=recipeBudget(mass,white,load);if(!b.white)throw Error("Sıfır beyazlı referans: bağlantıyı kapatın.");setLoad(linkedPigmentPct(b.pigment/b.white,v));}setWhite(v);invalidate();}
    catch(e){setError(e.message);}
  }
  function calculate(){
    invalidate();
    try {
      if(!stockLoaded)throw Error("Önce firma ürünlerini yükleyin.");
      if(!ground.trim())throw Error("Baskı zeminini belirtin.");
      const active=palette.filter(p=>p.enabled);
      if(active.some(p=>p.special||!valid(p.hex)||!Number.isFinite(p.strength)||p.strength<=0))throw Error("Kalibre edilmemiş veya özel efekt pigmenti seçilemez.");
      const solved=solveColor({target,palette:active,mass,whitePct:white,pigmentPct:load,whitePower:power});
      setResult({...solved,active,dilutions:active.map(()=>100),dilutionIds:active.map(()=>""),target});
    }catch(e){setError(e.message);}
  }
  function editGram(i,value){
    if(!result||!Number.isFinite(value)||value<0)return;
    const total=result.budget.pigment;
    if(value>total)return;
    const others=result.grams.reduce((s,g,j)=>s+(j===i?0:g),0);
    if(result.grams.length===1&&Math.abs(value-total)>1e-8)return;
    const grams=result.grams.map((g,j)=>j===i?value:others>0?g*(total-value)/others:(total-value)/(result.grams.length-1));
    const rgb=makeModel(result.active,power)(grams,result.budget.white);
    const a=colorLab(rgb),b=colorLab(hexLinear(result.target));
    setResult({...result,grams,hex:linearHex(rgb),delta:Math.hypot(...a.map((v,j)=>v-b[j]))});
  }
  let weighing=null,weighError="";
  if(result){try{weighing=weighRecipe(result.budget,result.active,result.grams,result.dilutions);}catch(e){weighError=e.message;}}
  const dilutionProducts=products.filter(p=>typeOf(p)==="dilution");
  function dilutionOptions(p){
    return dilutionProducts.filter(d=>(" "+norm(nameOf(d))+" ").includes(" "+norm(seedFor(p)?.[0]||p.name)+" ")).map(d=>({p:d,ratio:Number(String(nameOf(d)).match(/%\s*(\d+(?:[.,]\d+)?)| (\d+(?:[.,]\d+)?)\s*%/)?.slice(1).find(Boolean)?.replace(",","."))})).filter(d=>d.ratio>0&&d.ratio<100);
  }
  function chooseDilution(i,id){
    const option=dilutionOptions(result.active[i]).find(d=>String(d.p.id)===id);
    setResult({...result,dilutionIds:result.dilutionIds.map((v,j)=>i===j?id:v),dilutions:result.dilutions.map((v,j)=>i===j?(option?.ratio||100):v)});
  }
  async function draft(){
    if(!weighing||!result)return;
    if((weighing.clear>0&&!clearId)||(weighing.white>0&&!whiteId)){setError("S10 ve S20 stok ürünlerini eşleştirin.");return;}
    const lines=[];
    for(const [id,g] of [[clearId,weighing.clear],[whiteId,weighing.white]])if(g>1e-9)lines.push({productId:id,inventoryId:id,productName:nameOf(products.find(p=>String(p.id)===id)),referenceGram:g});
    result.active.forEach((p,i)=>{
      if(result.grams[i]<=1e-9)return;
      const id=result.dilutionIds[i]||p.id, product=products.find(x=>String(x.id)===id);
      if(!product)throw Error("Stok ürünü eşleşmedi.");
      lines.push({productId:id,inventoryId:id,productName:nameOf(product),referenceGram:result.grams[i]*100/result.dilutions[i]});
    });
    await onDraft({pantone:codeOf(pantone),colorName:colorName.trim(),colorHex:target,model,reference,ground,lines,products,note:"Deneysel formülasyon / model: "+model+" / referans: "+reference+" / zemin: "+ground+" / hedef: "+target+" / tahmin: "+result.hex+" / ΔE76: "+fmt(result.delta)});
  }
  const tintPig=palette.find(p=>p.id===tint&&valid(p.hex)&&Number.isFinite(p.strength)&&p.strength>0);
  return <section className="bh-operation-intro" style={{display:"grid",gap:16}}>
    <div><small>RENK & REÇETE / FORMÜLASYON</small><h2>Sıfırdan Renk Oluştur</h2><p>Arşiv reçetesi kopyalanmaz. Sabit baz ve pigment bütçesiyle yeni dağılım hesaplanır.</p><button className="bh-btn" type="button" onClick={onClose}>Kayıtlı renklere dön</button></div>
    <div className="bh-notice">Deneysel RGB/Kubelka–Munk yaklaşımı. Kumaş zemini kayıt amaçlıdır; optik etkisi, beyaz örtücülüğü, floresan ve fikse henüz kalibre değil. Numune onayı olmadan üretime kullanmayın.</div>
    <div style={gridStyle}>
      <label style={fieldStyle}>Pantone<input style={inputStyle} value={pantone} onChange={e=>{setPantone(e.target.value);invalidate();lookup(e.target.value);}} placeholder="13-0858" /></label>
      <label style={fieldStyle}>Hedef HEX<input style={inputStyle} value={target} onChange={e=>{setTarget(e.target.value);invalidate();}} placeholder="#RRGGBB"/></label>
      <label style={fieldStyle}>Renk adı<input style={inputStyle} value={colorName} onChange={e=>setColorName(e.target.value)} placeholder="Sarı, yeşil..."/></label>
      <label style={fieldStyle}>Model / iş referansı<input style={inputStyle} value={model} onChange={e=>setModel(e.target.value)}/></label>
      <label style={fieldStyle}>Müşteri renk referansı<input style={inputStyle} value={reference} onChange={e=>setReference(e.target.value)}/></label>
      <label style={fieldStyle}>Kumaş zemini<input style={inputStyle} value={ground} onChange={e=>{setGround(e.target.value);invalidate();}} placeholder="Beyaz, ekru, siyah..."/></label>
      <label style={fieldStyle}>Yetkili Pantone JSON kataloğu<input type="file" accept=".json,application/json" onChange={importCatalog}/></label>
      <label style={fieldStyle}>Toplam gram<input type="number" min="0.01" step="0.01" value={mass} onChange={e=>{setMass(e.target.valueAsNumber);invalidate();}}/></label>
      <label style={fieldStyle}>Baz içinde S20 (%)<input type="number" min="0" max="100" value={white} onChange={e=>changeWhite(e.target.valueAsNumber)}/></label>
      <label style={fieldStyle}>Toplam gerçek pigment (%)<input type="number" min="0" max="99.99" step=".01" value={load} onChange={e=>{setLoad(e.target.valueAsNumber);invalidate();}}/></label>
      <label style={fieldStyle}>S20 göreli kuvvet<input type="number" min=".001" step=".1" value={power} onChange={e=>{setPower(e.target.valueAsNumber);invalidate();}}/></label>
      <label style={fieldStyle}><span>Beyaz değişiminde pigment/beyaz oranını koru</span><input type="checkbox" checked={link} onChange={e=>setLink(e.target.checked)}/></label>
    </div>
    <div className="bh-row-actions"><button type="button" className="bh-btn" onClick={loadProducts} disabled={busy}>{busy?"Yükleniyor…":"Firma pigment ve stok ürünlerini yükle"}</button><button type="button" className="bh-btn primary" onClick={calculate} disabled={busy}>Yeni reçeteyi hesapla</button></div>
    <div className="bh-row-actions"><button type="button" className="bh-btn" onClick={saveLocalConfig}>Katalog ve kalibrasyonu bu tarayıcıda sakla</button></div>
    {info&&<p>{info}</p>}{error&&<div role="alert" className="bh-notice danger">{error}</div>}
    {result&&<div style={{display:"grid",gap:12}}>
      <div style={gridStyle}>{[[result.target,"Hedef"],[result.hex,"Tahmini sonuç"]].map(([h,l])=><div key={l}><div style={{background:h,height:70,border:"1px solid #cbd5e1",borderRadius:8}}/><strong>{l} {h}</strong></div>)}</div>
      <p>ΔE76: {fmt(result.delta)} · {result.delta>3?"Sabit oranlar içinde hedefe tam uyum bulunamadı.":"Dijital tahmin; gerçek numuneyi kontrol edin."}</p>
      <p>S10 toplam {fmt(result.budget.clear)} g · S20 {fmt(result.budget.white)} g · Gerçek pigment {fmt(result.budget.pigment)} g</p>
      <div style={{overflowX:"auto"}}><table style={{width:"100%"}}><thead><tr><th>Pigment</th><th>Gerçek pigment g</th><th>Stok ürünü</th><th>Tartım g</th></tr></thead><tbody>{result.active.map((p,i)=><tr key={p.id}><td>{p.name}</td><td><input type="number" min="0" max={result.budget.pigment} step=".0001" value={Number(result.grams[i].toFixed(4))} onChange={e=>editGram(i,e.target.valueAsNumber)}/></td><td><select value={result.dilutionIds[i]} onChange={e=>chooseDilution(i,e.target.value)}><option value="">Saf</option>{dilutionOptions(p).map(d=><option key={d.p.id} value={String(d.p.id)}>{nameOf(d.p)}</option>)}</select></td><td>{fmt(result.grams[i]*100/result.dilutions[i])}</td></tr>)}</tbody></table></div>
      <div style={gridStyle}>{[["clear",clearId,setClearId,"S10 doğrudan",weighing?.clear],["white",whiteId,setWhiteId,"S20 beyaz",weighing?.white]].map(([type,id,set,label,g])=><label key={type} style={fieldStyle}>{label} — {g==null?"—":fmt(g)+" g"}<select value={id} onChange={e=>set(e.target.value)}><option value="">Seçin</option>{products.filter(p=>typeOf(p)===type).map(p=><option key={p.id} value={String(p.id)}>{nameOf(p)}</option>)}</select></label>)}</div>
      {weighError&&<div className="bh-notice danger">{weighError}</div>}
      <button type="button" className="bh-btn primary" disabled={!weighing||busy} onClick={async()=>{setBusy(true);try{await draft();}catch(e){setError(e.message);}finally{setBusy(false);}}}>Renk kartına düzenlenebilir taslak aktar</button>
      <small>Yeni kart veya model referansı için açık teyit alınır. Reçete numune akışında onaylanır. Bu işlem stok tüketmez, otomatik onay vermez.</small>
    </div>}
    <details open><summary>Ana pigmentler ve kalibrasyon</summary><p>Beş operatör referansı ve diğer başlangıç tahminleri kesin fiziksel ölçüm değildir. Diğer onaylı ürünlere ölçülmüş HEX/kuvvet girerek açın. Floresan ve efektler bu modelde kapalıdır.</p><div style={{overflowX:"auto"}}><table style={{width:"100%"}}><thead><tr><th>Ürün</th><th>HEX</th><th>Kuvvet</th><th>Hesaba kat</th><th>Durum</th></tr></thead><tbody>{palette.map(p=><tr key={p.id}><td>{p.name}</td><td><input value={p.hex} onChange={e=>editPigment(p.id,{hex:e.target.value})} placeholder="#RRGGBB" style={{borderLeft:"12px solid "+(valid(p.hex)?p.hex:"#ddd")}}/></td><td><input type="number" min=".001" step=".01" value={p.strength} onChange={e=>editPigment(p.id,{strength:e.target.valueAsNumber})}/></td><td><input type="checkbox" checked={p.enabled} disabled={p.special} onChange={e=>editPigment(p.id,{enabled:e.target.checked})}/></td><td>{p.special?"Özel model gerekli":p.source}</td></tr>)}</tbody></table></div></details>
    <details><summary>S20 beyaz açma deneyi · 10 g pigment</summary><select value={tint} onChange={e=>setTint(e.target.value)}><option value="">Pigment seçin</option>{palette.filter(p=>valid(p.hex)&&!p.special).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{tintPig&&Number.isFinite(power)&&power>0&&<div style={gridStyle}>{[0,5,10,20,40].map(w=>{const h=linearHex(makeModel([tintPig],power)([10],w));return <div key={w}><div style={{height:55,background:h,borderRadius:5}}/>{w} g beyaz · {h}</div>;})}</div>}</details>
  </section>;
}
