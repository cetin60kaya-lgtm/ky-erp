import { useCallback, useEffect, useMemo, useState } from "react";
import EBelgeCenterPage from "./muhasebe/EBelgeCenterPage";
import LegacyIsnetPage from "./LegacyIsnetPage";
import { getEBelgeDetail, getEBelgePool } from "../../services/eBelgeApi";
import "./eBelgeRoute.css";

const TAB_TO_VIEW={
  "e-belge-genel":"overview",
  "e-belge-gelen-faturalar":"invoices",
  "e-belge-gelen-irsaliyeler":"dispatches",
  "e-belge-yukleme":"upload",
  "e-belge-eslestirmeler":"matching",
  "e-belge-onay-sorunlar":"issues",
  "e-belge-entegrasyonlar":"integrations",
  "e-belge-gecmis":"history",
};
const VIEW_INDEX={overview:0,invoices:1,dispatches:2,upload:3,matching:4,integrations:5,issues:6,history:7};
const titleFor=tab=>({
  "e-belge-giden-faturalar":"Giden Faturalar",
  "e-belge-giden-irsaliyeler":"Giden İrsaliyeler",
}[tab]||"e-Belge Merkezi");
const filterFor=tab=>tab==="e-belge-giden-faturalar"?"OUTGOING_INVOICE":"OUTGOING_DISPATCH";
const today=()=>new Date().toISOString().slice(0,10);
const sixtyDaysAgo=()=>{const d=new Date();d.setDate(d.getDate()-62);return d.toISOString().slice(0,10)};
const money=(value,currency="TRY")=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:currency||"TRY",maximumFractionDigits:2}).format(Number(value||0));
const dateText=value=>value?new Date(value).toLocaleDateString("tr-TR"):"-";
const statusLabel=value=>({INGESTED:"Yeni",REVIEW_REQUIRED:"Kontrol Bekliyor",READY_FOR_APPROVAL:"Onaya Hazır",APPROVED:"Onaylandı",POSTED:"Muhasebeleşti",REJECTED:"Reddedildi",ERROR:"Hata"})[String(value||"").toUpperCase()]||value||"-";

function RoutedCenter({activeTab,...props}){
 const view=TAB_TO_VIEW[activeTab]||"overview";
 useEffect(()=>{
   let cancelled=false;
   const openView=()=>{
     if(cancelled)return;
     const buttons=document.querySelectorAll(".eb-route-shell .eb-tabs button");
     const button=buttons[VIEW_INDEX[view]];
     if(button&&!button.classList.contains("active"))button.click();
     else if(!button)window.requestAnimationFrame(openView);
   };
   window.requestAnimationFrame(openView);
   return()=>{cancelled=true};
 },[view]);
 return <div className="eb-route-shell"><EBelgeCenterPage {...props}/></div>;
}

function OutgoingDetail({id,onClose}){
 const[detail,setDetail]=useState(null),[error,setError]=useState("");
 useEffect(()=>{let live=true;setDetail(null);setError("");getEBelgeDetail(id).then(x=>{if(live)setDetail(x)}).catch(e=>{if(live)setError(e?.message||"Belge detayı alınamadı.")});return()=>{live=false}},[id]);
 if(!id)return null;
 return <div className="eb-route-drawer-bg" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><aside className="eb-route-drawer"><header><div><small>e-Belge Merkezi</small><h3>{detail?.document_no||"Belge detayı"}</h3></div><button type="button" onClick={onClose}>×</button></header><div className="eb-route-drawer-body">{error?<div className="storage-notice bad">{error}</div>:null}{!detail?<div className="eb-route-empty">Belge yükleniyor...</div>:<><div className="eb-route-detail-grid"><div><span>Firma / Cari</span><strong>{detail.party_name||"Eşleşmedi"}</strong><small>{detail.party_tax_no||"VKN yok"}</small></div><div><span>Tarih</span><strong>{dateText(detail.issue_date)}</strong><small>{detail.document_type||"-"}</small></div><div><span>Toplam</span><strong>{money(detail.payable_total,detail.currency)}</strong><small>KDV {money(detail.tax_total,detail.currency)}</small></div><div><span>Durum</span><strong>{statusLabel(detail.status)}</strong><small>{detail.source_type||"-"}</small></div></div><section><h4>Kalemler</h4><div className="eb-route-lines">{(detail.lines||[]).map(line=><div className="eb-route-line" key={line.id}><span><strong>{line.description||line.product_code||"Kalem"}</strong><small>{line.product_code||line.supplier_product_code||""}</small></span><span>{Number(line.quantity||0).toLocaleString("tr-TR")} {line.unit_code||""}</span><span>{money(line.line_total||0,detail.currency)}</span></div>)}{!(detail.lines||[]).length?<div className="eb-route-empty">Belge kalemi yok.</div>:null}</div></section><section><h4>Sorunlar / Kontroller</h4>{(detail.issues||[]).filter(x=>!x.is_resolved).map(issue=><div className="storage-notice bad" key={issue.id}><strong>{issue.issue_code}</strong> · {issue.message}</div>)}{!(detail.issues||[]).some(x=>!x.is_resolved)?<div className="storage-notice ok">Açık sorun yok.</div>:null}</section></>}</div></aside></div>;
}

function OutgoingList({activeTab,activeMainCompany}){
 const filter=filterFor(activeTab),title=titleFor(activeTab);
 const[pool,setPool]=useState({items:[],total:0}),[query,setQuery]=useState(""),[from,setFrom]=useState(sixtyDaysAgo()),[to,setTo]=useState(today()),[busy,setBusy]=useState(false),[error,setError]=useState(""),[selectedId,setSelectedId]=useState("");
 const params=useMemo(()=>({filter,q:query,from,to,page:1,pageSize:100}),[filter,query,from,to]);
 const load=useCallback(async()=>{setBusy(true);setError("");try{setPool(await getEBelgePool(params)||{items:[],total:0})}catch(e){setError(e?.message||"Belgeler alınamadı.")}finally{setBusy(false)}},[params]);
 useEffect(()=>{load()},[load,activeMainCompany?.slug,activeMainCompany?.id]);
 const rows=pool.items||[];
 return <section className="eb-page"><div className="eb-route-title"><div><span className="eb-kicker">e-Belge Merkezi</span><h2>{title}</h2><p>Sağlayıcıdan veya manuel yüklemeden gelen giden belgeler aynı kayıt yapısında izlenir.</p></div><button className="eb-route-secondary" type="button" onClick={load} disabled={busy}>{busy?"Yükleniyor...":"Yenile"}</button></div>{error?<div className="eb-error">{error}</div>:null}<div className="eb-route-filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Belge no, firma veya VKN ara"/><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input type="date" value={to} onChange={e=>setTo(e.target.value)}/><button className="eb-route-primary" type="button" onClick={load}>Filtrele</button></div><div className="eb-route-table-wrap"><table className="eb-route-table"><thead><tr><th>Belge No</th><th>Firma</th><th>Tarih</th><th>Toplam</th><th>Durum</th><th>Sorun</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} onClick={()=>setSelectedId(row.id)}><td><strong>{row.document_no||"-"}</strong></td><td>{row.party_name||"-"}</td><td>{dateText(row.issue_date)}</td><td>{money(row.payable_total,row.currency)}</td><td><span className={`eb-route-status ${row.status==="POSTED"?"ok":Number(row.issue_count||0)?"warn":""}`}>{statusLabel(row.status)}</span></td><td>{row.issue_count||0}</td></tr>)}</tbody></table>{!rows.length&&!busy?<div className="eb-route-empty">Bu filtrede belge bulunamadı.</div>:null}</div><OutgoingDetail id={selectedId} onClose={()=>setSelectedId("")}/></section>;
}

export default function IsnetPage({activeTab,activeMainCompany,openModule,moduleActionContext,...rest}){
 if(["e-belge-giden-faturalar","e-belge-giden-irsaliyeler"].includes(activeTab))return <OutgoingList activeTab={activeTab} activeMainCompany={activeMainCompany}/>;
 if(String(activeTab||"").startsWith("e-belge-"))return <RoutedCenter activeTab={activeTab} activeMainCompany={activeMainCompany} openModule={openModule} moduleActionContext={moduleActionContext}/>;
 return <LegacyIsnetPage activeTab={activeTab} activeMainCompany={activeMainCompany} openModule={openModule} moduleActionContext={moduleActionContext} {...rest}/>;
}
