import {useEffect,useState} from "react";
import {apiGet} from "../../../utils/api";
import {canonicalCompanySlug} from "../../../utils/companyIdentity";
const fmt=v=>v==null?"—":Number(v).toLocaleString("tr-TR");
const verified=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
export default function EBelgeRev3Overview({dashboard,openModule}){
 const [period,setPeriod]=useState("all");
 const [billing,setBilling]=useState(null);
 const slug=canonicalCompanySlug(dashboard.mainCompanySlug);
 useEffect(()=>{let live=true;setBilling(null);if(!slug)return;apiGet("/muhasebe/incoming-dispatches/billing",{mainCompanySlug:slug},{forceFresh:true}).then(v=>v?.data?.data??v?.data??v).then(v=>{if(live&&canonicalCompanySlug(v?.mainCompanySlug)===slug&&Array.isArray(v.rows))setBilling(v)}).catch(()=>{});return()=>{live=false}},[slug,dashboard]);
 const {metrics={},monthStart,today,summary={}}=dashboard;
 const data=metrics[period]||{},drafts=metrics.drafts||{};
 const nav=(tab,opts={})=>openModule?.("e-belge",{tabKey:tab,actionContext:{dashboardMetric:true,...opts}});
 const dateOpts=period==="month"?{from:monthStart,to:today}:{};
 const metric=(label,value,tab,opts=dateOpts,tone="",always=false)=>({label,value,tab,opts,tone,always});
 const customerRows=billing&&!billing.truncated?billing.rows.filter(row=>row.companyType==="CUSTOMER"&&(period!=="month"||(String(row.issueDate||"").slice(0,10)>=monthStart&&String(row.issueDate||"").slice(0,10)<=today))):null;
 const customerCount=predicate=>customerRows?customerRows.filter(predicate).length:null;
 const draft=(kind,label,tab)=>metric(label,drafts[kind]?.active,tab,{draftState:"ACTIVE"},"teal",true);
 const groups=[
  {title:"e-Fatura",items:[
   metric("Gelen faturalar",data.INCOMING_INVOICE,"gelen-faturalar"),
   metric("Giden faturalar",data.OUTGOING_EINVOICE,"giden-faturalar"),
   metric("Okunmamış",data.INCOMING_INVOICE_UNREAD,"okunmamis-faturalar",dateOpts,"blue",true),
   draft("INVOICE","Fatura taslakları","fatura-taslaklari")]},
  {title:"e-İrsaliye",items:[
   metric("Gelen irsaliyeler",data.INCOMING_DISPATCH,"gelen-irsaliyeler"),
   metric("Giden irsaliyeler",data.OUTGOING_DISPATCH,"giden-irsaliyeler"),
   metric("Okunmamış",data.INCOMING_DISPATCH_UNREAD,"okunmamis-irsaliyeler",dateOpts,"blue",true),
   draft("DISPATCH","İrsaliye taslakları","irsaliye-taslaklari"),
   metric("Sevk bağı bekleyen",customerCount(x=>x.dispatchLinkStatus==="DISPATCH_LINK_MISSING"),"gelen-irsaliyeler",{...dateOpts,billingFilter:"CUSTOMER_DISPATCH_MISSING"},"amber",true),
   metric("Fatura bağı bekleyen",customerCount(x=>x.status==="INVOICE_LINK_MISSING"),"gelen-irsaliyeler",{...dateOpts,billingFilter:"CUSTOMER_MISSING"},"amber",true)]},
  {title:"e-Arşiv",items:[
   metric("Giden e-Arşiv",data.OUTGOING_ARCHIVE,"earchive-out"),
   draft("ARCHIVE","e-Arşiv taslakları","earchive-drafts")]},
  {title:"KYERP Otomasyon Merkezi",items:[
   metric("Eşleştirme bekleyen",data.MATCHING_WAIT,"eslestirmeler",dateOpts,"blue"),
   metric("Muhasebe onayı bekleyen",data.APPROVAL_WAIT,"muhasebe-onayi",dateOpts,"blue"),
   metric("Eksik XML / PDF",data.MISSING_ORIGINAL,"eksik-orijinaller",dateOpts,"amber"),
   metric("Belge kontrolü",data.ISSUE,"onay-sorunlar",dateOpts,"amber")]}
 ];
 return <section className="eb-rev3-overview eb-rev3-compact">
  <div className="eb-rev3-filter"><label>Dönem <select value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">Tüm kayıtlar</option><option value="month">Bu ay</option></select></label><span>—: sayaç doğrulanmadı · Taslaklar tüm dönem</span></div>
  <div className="eb-rev3-dashboard">
   {groups.map(({title,items})=>{
    const available=items.filter(x=>verified(x.value)||x.always);
    if(!available.length)return null;
    return <section className="eb-rev3-panel" key={title}><header><h3>{title}</h3></header><div className="eb-rev3-metrics">{available.map(({label,value,tab,opts,tone})=><button key={label} type="button" className={"eb-rev3-metric "+tone} onClick={()=>nav(tab,opts)} title={verified(value)?"İlgili kayıtları aç":"Sayaç doğrulanmadı; ilgili çalışma ekranını aç"}><span>{label}</span><strong>{verified(value)?fmt(value):"—"}</strong></button>)}</div></section>
   })}
   {!groups.some(g=>g.items.some(x=>verified(x.value)))&&<p className="eb-rev3-wide" role="status">Belge sayaçları henüz doğrulanamadı. Kayıtlara ilgili menüden erişebilirsiniz.</p>}
  </div>
  <details className="eb-rev3-panel eb-rev3-period-details"><summary>Dönem karşılaştırması</summary><div className="eb-rev3-period"><span>Bu ay · {fmt(summary.monthTotal)} belge</span><span>Gelen tutar · {fmt(summary.monthIncomingAmount)}</span><span>Giden tutar · {fmt(summary.monthOutgoingAmount)}</span><span>Geçen ay · {fmt(summary.previousMonthTotal)} belge</span><span>Bugün alınan · {fmt(summary.todayTotal)}</span></div></details>
 </section>
}
