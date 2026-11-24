/* Runs only in the portal's authenticated browser tab; no credential access. */
(()=>{
"use strict";
const C=globalThis.KYIsnetCore;
if(location.origin!=="https://nettefatura.isnet.net.tr"||!C||window.top!==window)return;
const source=C.source(location.pathname);
if(!source)return;
if(document.getElementById("ky-isnet-widget"))return;
const host=document.createElement("div");host.id="ky-isnet-widget";
const shadow=host.attachShadow({mode:"closed"});
const style=document.createElement("style");
style.textContent=":host{all:initial!important;position:fixed!important;right:20px!important;bottom:22px!important;z-index:2147483000!important;font:14px Arial,sans-serif!important;color:#21344a!important}*{box-sizing:border-box}button{font:inherit;cursor:pointer;padding:9px 12px;border:1px solid #adbed0;border-radius:7px;background:#fff;color:#173650}button.primary{background:#164775;color:#fff;border-color:#164775}button:disabled{opacity:.5;cursor:not-allowed}#launch{box-shadow:0 5px 20px #0003;font-weight:700}#panel{width:min(620px,calc(100vw - 42px));max-height:80vh;overflow:auto;border:1px solid #c7d4e2;border-radius:12px;background:white;box-shadow:0 6px 35px #0004;padding:16px}.head,.bar{display:flex;align-items:center;gap:8px;justify-content:space-between}.bar{justify-content:flex-start;flex-wrap:wrap}h2{font-size:17px;margin:0}p{line-height:1.5;margin:9px 0;color:#54667a;font-size:12px}.table{max-height:290px;overflow:auto;margin:10px 0;border-top:1px solid #dbe4ec}.row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:start;padding:10px 2px;border-bottom:1px solid #e1e9ef;cursor:pointer}.row span{overflow-wrap:anywhere}.meta{color:#64748b;font-size:11px;display:block;margin-top:3px}.notice{padding:10px;background:#f0f5fa;border-radius:7px;line-height:1.5;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.bad{background:#fff0ee;color:#942a23}.good{background:#e8f6ee;color:#226140}.hidden{display:none!important}a{color:#164775;font-weight:600}input{margin-top:2px}";
shadow.append(style);
const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n};
const launch=el("button","KY ERP · Belge Aktar","primary");launch.id="launch";
const panel=el("section");panel.id="panel";panel.className="hidden";
const head=el("div",undefined,"head");head.append(el("h2","KY ERP · NetteFatura Aktarım"));const close=el("button","Kapat");head.append(close);
const direction=(source.dir==="incoming"?"Gelen":"Giden")+" "+(source.kind==="invoice"?"Faturalar":"İrsaliyeler");
const info=el("p",direction+" — Portalın mevcut tarih filtresini ve açık sayfadaki kayıtları kullanır. İlk gerçek kabulde en fazla 2 belge seçilir.");
const bar=el("div",undefined,"bar"),scan=el("button","Açık listeyi oku"),download=el("button","XML + PDF paketi hazırla","primary"),reset=el("button","Seçimi temizle");bar.append(scan,download,reset);
const list=el("div",undefined,"table"),status=el("div","Önce portalda tarih aralığını seçip listeyi açın.","notice");
const next=el("p");next.append("Paket oluştuktan sonra KY ERP'de yetkili firma seçimini kontrol ederek mevcut belge yükleme ekranını kullanın. ");
const link=el("a","KY ERP Arşiv & Çıktı");link.href="https://kyerp.net/e-belge/arsiv-cikti";link.target="_blank";link.rel="noopener noreferrer";next.append(link);
panel.append(head,info,bar,list,status,next);shadow.append(launch,panel);document.documentElement.append(host);
let rows=[],selected=new Set(),busy=false,scanVersion=0;
function note(msg,cls=""){status.textContent=msg;status.className="notice "+cls}
function controls(){scan.disabled=busy;download.disabled=busy||!selected.size;reset.disabled=busy;close.disabled=busy}
function render(){
 list.replaceChildren();
 for(const r of rows){
  const label=el("label",undefined,"row"),cb=el("input");cb.type="checkbox";cb.checked=selected.has(r.id);cb.disabled=busy||(!cb.checked&&selected.size>=2);
  cb.addEventListener("change",()=>{if(cb.checked&&selected.size<2)selected.add(r.id);else selected.delete(r.id);render()});
  const details=el("span",r.number);details.append(el("span",r.partner||"—","meta"));label.append(cb,details,el("span",r.date||"","meta"));list.append(label);
 }
 download.textContent="XML + PDF paketi ("+selected.size+"/2)";controls()
}
async function readRows(){
 if(busy)return;busy=true;rows=[];selected.clear();scanVersion++;render();note("Gerçek portal tablosu okunuyor…");
 try{
  const reply=await chrome.runtime.sendMessage({type:"KY_ISNET_READ_VISIBLE_ROWS"});
  if(!reply?.ok)throw Error("Açık portal tablosu doğrulanamadı. NetteFatura belge listesinde tarih filtresini uygulayıp tekrar deneyin.");
  rows=reply.rows.map(r=>C.normalize(r,source)).filter(Boolean);
  note(rows.length?rows.length+" gerçek portal satırı bulundu. Test için 1–2 belge seçin.":"Açık sayfada doğrulanabilir belge bulunamadı.",rows.length?"good":"");
 }catch(e){note(e.message||"Liste okunamadı.","bad")}finally{busy=false;render()}
}
function same(a,b){return a&&b&&a.id===b.id&&a.number===b.number&&a.kind===b.kind&&a.dir===b.dir}
async function fetchFile(row,format){
 const path=C.downloadPath(row,format);
 const url=new URL(path,location.origin);if(url.origin!==location.origin)throw Error("Dosya adresi geçersiz.");
 const r=await fetch(url,{credentials:"same-origin",method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(30000),headers:{Accept:format==="xml"?"application/xml,text/xml,application/octet-stream":"application/pdf,application/octet-stream"}});
 if(!r.ok)throw Error(format.toUpperCase()+" HTTP "+r.status);
 if(Number(r.headers.get("content-length")||0)>C.MAX_FILE)throw Error("Dosya 20 MB sınırını aşıyor.");
 if(!r.body)throw Error("Dosya yanıtı boş.");
 const reader=r.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>C.MAX_FILE)throw Error("Dosya 20 MB sınırını aşıyor.");chunks.push(value)}}catch(e){await reader.cancel().catch(()=>{});throw e}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
 return C.validate(bytes,format,row.kind,row.number,xml=>new DOMParser().parseFromString(xml,"application/xml"))
}
async function saveSelected(){
 if(busy||!selected.size)return;
 const chosen=rows.filter(r=>selected.has(r.id)),version=scanVersion;
 if(chosen.length>2)return;
 busy=true;render();let files=[],total=0;
 try{
  // Confirm that the chosen rows remain visible in the user's current portal list.
  const current=await chrome.runtime.sendMessage({type:"KY_ISNET_READ_VISIBLE_ROWS"});
  const now=current?.ok?current.rows.map(x=>C.normalize(x,source)).filter(Boolean):[];
  if(version!==scanVersion||chosen.some(r=>!now.some(n=>same(r,n))))throw Error("Portal listesi değişti. Listeyi yeniden okuyun.");
  for(const [i,row] of chosen.entries()){
   const stem=C.fileStem(row);
   for(const format of ["xml","pdf"]){
    note((i+1)+"/"+chosen.length+" belge: "+format.toUpperCase()+" alınıyor…");
    const bytes=await fetchFile(row,format);total+=bytes.byteLength;if(total>C.MAX_BATCH)throw Error("Paket 100 MB sınırını aşıyor.");
    files.push({name:stem+"."+format,data:bytes});
   }
  }
  const blob=C.zip(files),url=URL.createObjectURL(blob),a=el("a");
  a.href=url;a.download="KYERP_ISNET_"+source.dir+"_"+source.kind+"_"+new Date().toISOString().replace(/[:.]/g,"-")+".zip";shadow.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  note(chosen.length+" belge, "+files.length+" orijinal XML/PDF dosyası doğrulandı; ZIP indirme başlatıldı.\nERP'ye henüz kayıt yapılmadı. Paketi açarak belge çiftlerini kontrol edin.", "good");
 }catch(e){note("Aktarım tamamlanmadı; kısmi paket oluşturulmadı. "+(e.message||"Dosya alınamadı."),"bad")}finally{files=[];busy=false;render()}
}
launch.addEventListener("click",()=>{panel.classList.remove("hidden");launch.classList.add("hidden");if(!rows.length)void readRows()});
close.addEventListener("click",()=>{panel.classList.add("hidden");launch.classList.remove("hidden")});
scan.addEventListener("click",readRows);reset.addEventListener("click",()=>{selected.clear();render()});download.addEventListener("click",saveSelected);
chrome.runtime.onMessage.addListener(m=>{if(m?.type==="KY_ISNET_SHOW_PANEL"&&!busy)launch.click()});
render();
})();