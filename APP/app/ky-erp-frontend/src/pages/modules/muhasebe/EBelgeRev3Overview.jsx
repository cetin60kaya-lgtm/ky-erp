import {useState} from "react";
const fmt=v=>v==null?"—":Number(v).toLocaleString("tr-TR");
const verified=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
export default function EBelgeRev3Overview({dashboard,openModule}){
 const [period,setPeriod]=useState("all");
 const {metrics={},monthStart,today,summary={}}=dashboard;
 const data=metrics[period]||{},drafts=metrics.drafts||{};
 const nav=(tab,opts={})=>openModule?.("e-belge",{tabKey:tab,actionContext:{dashboardMetric:true,...opts}});
 const dateOpts=period==="month"?{from:monthStart,to:today}:{};
 const metric=(label,value,tab,opts=dateOpts,tone="")=>({label,value,tab,opts,tone});
 const draft=(kind,label,tab)=>metric(label,drafts[kind]?.active,tab,{draftState:"ACTIVE"},"teal");
 const groups=[
  {title:"e-Fatura",items:[
   metric("Gelen faturalar",data.INCOMING_INVOICE,"gelen-faturalar"),
   metric("Giden faturalar",data.OUTGOING_EINVOICE,"giden-faturalar"),
   metric("Okunmamış",data.INCOMING_INVOICE_UNREAD,"okunmamis-faturalar",dateOpts,"blue"),
   draft("INVOICE","Fatura taslakları","fatura-taslaklari")]},
  {title:"e-İrsaliye",items:[
   metric("Gelen irsaliyeler",data.INCOMING_DISPATCH,"gelen-irsaliyeler"),
   metric("Giden irsaliyeler",data.OUTGOING_DISPATCH,"giden-irsaliyeler"),
   metric("Okunmamış",data.INCOMING_DISPATCH_UNREAD,"okunmamis-irsaliyeler",dateOpts,"blue"),
   draft("DISPATCH","İrsaliye taslakları","irsaliye-taslaklari")]},
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
  <div className="eb-rev3-filter"><label>Dönem <select value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">Tüm kayıtlar</option><option value="month">Bu ay</option></select></label><span>Yalnız doğrulanmış sayaçlar · Taslaklar tüm dönem</span></div>
  <div className="eb-rev3-dashboard">
   {groups.map(({title,items})=>{
    const available=items.filter(x=>verified(x.value));
    if(!available.length)return null;
    return <section className="eb-rev3-panel" key={title}><header><h3>{title}</h3></header><div className="eb-rev3-metrics">{available.map(({label,value,tab,opts,tone})=><button key={label} type="button" className={"eb-rev3-metric "+tone} onClick={()=>nav(tab,opts)} title="İlgili kayıtları aç"><span>{label}</span><strong>{fmt(value)}</strong></button>)}</div></section>
   })}
   {!groups.some(g=>g.items.some(x=>verified(x.value)))&&<p className="eb-rev3-wide" role="status">Belge sayaçları henüz doğrulanamadı. Kayıtlara ilgili menüden erişebilirsiniz.</p>}
  </div>
  <details className="eb-rev3-panel eb-rev3-period-details"><summary>Dönem karşılaştırması</summary><div className="eb-rev3-period"><span>Bu ay · {fmt(summary.monthTotal)} belge</span><span>Gelen tutar · {fmt(summary.monthIncomingAmount)}</span><span>Giden tutar · {fmt(summary.monthOutgoingAmount)}</span><span>Geçen ay · {fmt(summary.previousMonthTotal)} belge</span><span>Bugün alınan · {fmt(summary.todayTotal)}</span></div></details>
 </section>
}
